/**
 * Lightning helpers for Playwright tests, from the Agent-QA Salesforce pack.
 *
 * Agent-QA copies this file into your repo (through the same diff review as
 * generated tests) when your page objects have no helper for the same job.
 * It is yours from then on: edit it as you like. It needs Playwright 1.49 or
 * later and nothing else, and works in CommonJS and ESM projects.
 *
 * Playwright locators already reach into open shadow roots, so nothing here
 * uses Lightning's internal class names when a role or a label will do.
 */
import type { Locator, Page } from "@playwright/test";

/** What reads as "Lightning is still working", when it is on screen. */
export const BUSY_SELECTOR = 'lightning-spinner:visible, .slds-spinner_container:visible, [role="progressbar"]:visible, [aria-busy="true"]:visible';
/** Lightning's toast container, plus the alert role it gives each toast. */
export const TOAST_SELECTOR = 'div.forceToastMessage, lightning-toast, .slds-notify_toast, div[role="alert"]';

export interface WaitOptions {
  /** Most time to wait, in milliseconds. */
  timeout?: number;
}

/**
 * Waits until no spinner or busy marker is visible, twice in a row 200 ms
 * apart, because Lightning often shows a second spinner right after the first.
 */
export async function waitForLightning(page: Page, options: WaitOptions = {}): Promise<void> {
  const timeout = options.timeout ?? 30_000;
  const busy = page.locator(BUSY_SELECTOR);
  const end = Date.now() + timeout;
  let quiet = 0;
  while (quiet < 2) {
    if (Date.now() > end) throw new Error(`Lightning was still busy after ${timeout} ms`);
    quiet = (await busy.count()) === 0 ? quiet + 1 : 0;
    if (quiet < 2) await page.waitForTimeout(200);
  }
}

/**
 * Waits for a toast and returns its text. With `text`, waits for a toast that
 * holds it (a string matches part of the text, a RegExp is tested on it).
 */
export async function expectToast(page: Page, text?: string | RegExp, options: WaitOptions = {}): Promise<string> {
  const timeout = options.timeout ?? 10_000;
  const toasts = page.locator(TOAST_SELECTOR);
  const toast = (text === undefined ? toasts : toasts.filter({ hasText: text })).first();
  await toast.waitFor({ state: "visible", timeout });
  return ((await toast.innerText()) || "").replace(/\s+/g, " ").trim();
}

/** Closes every visible toast, so the next one can't be mistaken for it. */
export async function dismissToasts(page: Page): Promise<void> {
  const close = page.locator(TOAST_SELECTOR).getByRole("button", { name: /^close/i });
  for (let i = await close.count(); i > 0; i--) {
    const button = close.first();
    if (!(await button.isVisible())) break;
    await button.click();
  }
}

/** The open modal: the last visible dialog, since Lightning can stack them. */
export function modal(page: Page): Locator {
  return page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible, dialog[open]:visible').last();
}

/**
 * Picks a picklist value: opens the combobox labelled `label` and clicks the
 * option named `option` (exactly, when it is a string).
 */
export async function selectPicklist(scope: Page | Locator, label: string, option: string | RegExp, options: WaitOptions = {}): Promise<void> {
  const page = pageOf(scope);
  const box = scope.getByRole("combobox", { name: label, exact: true });
  await box.click({ timeout: options.timeout ?? 10_000 });
  await page.getByRole("option", { name: option, exact: typeof option === "string" }).first().click({ timeout: options.timeout ?? 10_000 });
  await waitForLightning(page, options);
}

/**
 * Fills a lookup: types `search` in the field labelled `label`, waits for the
 * results, and clicks the one named `option` (by default the first one that
 * contains `search`).
 */
export async function fillLookup(scope: Page | Locator, label: string, search: string, option?: string | RegExp, options: WaitOptions = {}): Promise<void> {
  const page = pageOf(scope);
  const timeout = options.timeout ?? 15_000;
  const field = scope.getByRole("combobox", { name: label }).or(scope.getByLabel(label, { exact: true })).first();
  await field.fill(search, { timeout });
  const results = page.getByRole("option");
  const match = option === undefined ? results.filter({ hasText: search }) : results.filter({ hasText: option });
  await match.first().click({ timeout });
  await waitForLightning(page, options);
}

export type RecordMode = "view" | "edit";

/** Opens a record page by URL (quicker and steadier than searching for it). */
export async function openRecord(page: Page, objectApiName: string, recordId: string, mode: RecordMode = "view", options: WaitOptions = {}): Promise<void> {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(objectApiName)) throw new Error(`not an object API name: ${objectApiName}`);
  if (!/^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/.test(recordId)) throw new Error("not a record id");
  await page.goto(`/lightning/r/${objectApiName}/${recordId}/${mode}`);
  await waitForLightning(page, options);
}

/** Opens a list view or a tab of an object by URL, e.g. openObject(page, "Account"). */
export async function openObject(page: Page, objectApiName: string, view = "list", options: WaitOptions = {}): Promise<void> {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(objectApiName)) throw new Error(`not an object API name: ${objectApiName}`);
  await page.goto(`/lightning/o/${objectApiName}/${encodeURIComponent(view)}`);
  await waitForLightning(page, options);
}

/** A related list on a record page, found by its title (e.g. "Contacts"). */
export function relatedList(page: Page, title: string | RegExp): Locator {
  return page.locator("article").filter({ has: page.getByRole("heading", { name: title }) }).first();
}

/**
 * The value shown next to a field label on a record page. Lightning lays a
 * field out as its label followed by its value in one layout item.
 */
export function fieldValue(page: Page, label: string): Locator {
  return page
    .locator("records-record-layout-item, .slds-form-element")
    .filter({ has: page.getByText(label, { exact: true }) })
    .first()
    .locator(".slds-form-element__control, lightning-formatted-text, lightning-formatted-name")
    .first();
}

/** Waits for a Flow screen to show its controls. */
export async function waitForFlowScreen(page: Page, options: WaitOptions = {}): Promise<void> {
  await page.locator('flowruntime-flow, div[class*="flowRuntime"], .flow-runtime-container').first().waitFor({ state: "visible", timeout: options.timeout ?? 30_000 });
  await waitForLightning(page, options);
}

/** Clicks a Flow navigation button (Next, Previous, Finish) and waits for the next screen. */
export async function flowNavigate(page: Page, button: "Next" | "Previous" | "Finish" | "Pause", options: WaitOptions = {}): Promise<void> {
  await page.getByRole("button", { name: button, exact: true }).click({ timeout: options.timeout ?? 10_000 });
  await waitForLightning(page, options);
}

function pageOf(scope: Page | Locator): Page {
  return "page" in scope && typeof scope.page === "function" ? scope.page() : (scope as Page);
}
