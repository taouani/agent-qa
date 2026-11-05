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

/**
 * What reads as "Lightning is still working", when it is on screen. A progress
 * bar or ring that shows a value (aria-valuenow) is a page element, not a wait.
 */
export const BUSY_SELECTOR = 'lightning-spinner:visible, .slds-spinner_container:visible, .slds-spinner:visible, [role="progressbar"]:not([aria-valuenow]):visible';
/** Lightning's toasts (not inline field errors, which also use role="alert"). */
export const TOAST_SELECTOR = ".forceToastMessage:visible, .slds-notify_toast:visible, lightning-toast:visible";
/** Options a lookup lists that aren't records. */
const NOT_A_RECORD = /^\s*(?:Show All Results|Show more results|Search\b|New\b|Recent\s)/i;

export interface WaitOptions {
  /** Most time to wait, in milliseconds. */
  timeout?: number;
}

/**
 * Waits until no spinner is visible, twice in a row 200 ms apart, because
 * Lightning often shows a second spinner right after the first.
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
 * Waits for a toast and returns its message. With `text`, waits for a toast
 * that holds it (a string matches part of the text, a RegExp is tested on it).
 */
export async function expectToast(page: Page, text?: string | RegExp, options: WaitOptions = {}): Promise<string> {
  const timeout = options.timeout ?? 10_000;
  const toasts = page.locator(TOAST_SELECTOR);
  const toast = (text === undefined ? toasts : toasts.filter({ hasText: text })).first();
  await toast.waitFor({ state: "visible", timeout });
  // The message, without the close button's label.
  const message = toast.locator(".toastMessage, .slds-notify__content, [data-aura-class='forceActionsText']").first();
  const raw = (await message.count()) ? await message.innerText() : await toast.innerText();
  return raw.replace(/\s+/g, " ").trim();
}

/** Closes every visible toast, so the next one can't be mistaken for it. */
export async function dismissToasts(page: Page): Promise<void> {
  const close = page.locator(TOAST_SELECTOR).getByRole("button", { name: /^close/i });
  // A toast can hide itself at any moment: each click is short, and a miss is fine.
  for (let i = 0; i < 10 && (await close.count()) > 0; i++) {
    await close
      .first()
      .click({ timeout: 2_000 })
      .catch(() => undefined);
    await page.waitForTimeout(100);
  }
}

/**
 * The open modal: the last visible modal dialog, since Lightning can stack
 * them. Popovers and hover cards also use role="dialog", so they are left out.
 */
export function modal(page: Page): Locator {
  return page.locator('[role="dialog"][aria-modal="true"]:visible, .slds-modal:visible [role="dialog"], section.slds-modal[role="dialog"]:visible, dialog[open]:visible').last();
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^$|()[\]{}\\]/g, "\\$&");

/** A field's accessible name as Lightning gives it: a required field's starts with "*". */
export function fieldName(label: string): RegExp {
  return new RegExp("^\\*?\\s*" + escapeRegExp(label) + "$");
}

/**
 * The list a combobox opened: the one it names in aria-controls or aria-owns
 * when there is one (other lists on the page, such as the Path, are listboxes
 * too), else every visible list. Lookup results can render outside the
 * field's shadow root, so the search is page-wide.
 */
async function listOf(page: Page, box: Locator): Promise<Locator> {
  const id = (await box.getAttribute("aria-controls")) ?? (await box.getAttribute("aria-owns"));
  if (id && /^[\w:.-]+$/.test(id)) {
    const own = page.locator(`[id="${id}"]`);
    if ((await own.count()) === 1) return own;
  }
  return page.locator('[role="listbox"]:visible');
}

/**
 * Picks a picklist value: opens the combobox labelled `label` and clicks the
 * option named `option` (exactly, when it is a string).
 */
export async function selectPicklist(scope: Page | Locator, label: string, option: string | RegExp, options: WaitOptions = {}): Promise<void> {
  const page = pageOf(scope);
  const timeout = options.timeout ?? 10_000;
  const box = scope.getByRole("combobox", { name: fieldName(label) }).first();
  await box.click({ timeout });
  const list = await listOf(page, box);
  await list.getByRole("option", { name: option, exact: typeof option === "string" }).first().click({ timeout });
  await waitForLightning(page, options);
}

/**
 * Fills a lookup: types `search` in the field labelled `label`, waits for the
 * results, and clicks the one named `option` (by default the first record
 * whose name contains `search`; "Show All Results" and "New" are skipped).
 */
export async function fillLookup(scope: Page | Locator, label: string, search: string, option?: string | RegExp, options: WaitOptions = {}): Promise<void> {
  const page = pageOf(scope);
  const timeout = options.timeout ?? 15_000;
  // A text field: a picklist with a longer label that starts the same ("Account Type") is a button.
  const field = scope
    .getByRole("combobox", { name: fieldName(label) })
    .and(scope.locator("input"))
    .or(scope.getByLabel(fieldName(label)).and(scope.locator("input")))
    .first();
  await field.fill(search, { timeout });
  const list = await listOf(page, field);
  const records = list.getByRole("option").filter({ hasNotText: NOT_A_RECORD });
  await records
    .filter({ hasText: option ?? search })
    .first()
    .click({ timeout });
  await waitForLightning(page, options);
}

export type RecordMode = "view" | "edit";

const OBJECT_API_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Opens a record page by URL (quicker and steadier than searching for it). */
export async function openRecord(page: Page, objectApiName: string, recordId: string, mode: RecordMode = "view", options: WaitOptions = {}): Promise<void> {
  if (!OBJECT_API_NAME.test(objectApiName)) throw new Error(`not an object API name: ${objectApiName}`);
  if (!/^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/.test(recordId)) throw new Error("not a record id");
  await page.goto(`/lightning/r/${objectApiName}/${recordId}/${mode}`);
  await waitForLightning(page, options);
}

export interface OpenObjectOptions extends WaitOptions {
  /** A list view's API name, e.g. "AllAccounts" (list only). */
  filterName?: string;
}

/** Opens an object's list view, home or new-record page by URL, e.g. openObject(page, "Account"). */
export async function openObject(page: Page, objectApiName: string, view: "list" | "home" | "new" = "list", options: OpenObjectOptions = {}): Promise<void> {
  if (!OBJECT_API_NAME.test(objectApiName)) throw new Error(`not an object API name: ${objectApiName}`);
  const filter = view === "list" && options.filterName ? `?filterName=${encodeURIComponent(options.filterName)}` : "";
  await page.goto(`/lightning/o/${objectApiName}/${view}${filter}`);
  await waitForLightning(page, options);
}

/** A related list on a record page, found by its title (e.g. "Contacts"): the innermost card with that heading. */
export function relatedList(page: Page, title: string | RegExp): Locator {
  return page.locator("article:visible").filter({ has: page.getByRole("heading", { name: title }) }).last();
}

/**
 * The value shown next to a field label on a record page. Lightning lays a
 * field out as its label followed by its value in one layout item, and keeps
 * pages it showed before in the DOM, hidden: only visible items count.
 */
export function fieldValue(page: Page, label: string): Locator {
  return page
    .locator("records-record-layout-item:visible, .slds-form-element:visible")
    .filter({ has: page.getByText(fieldName(label)) })
    .last()
    .locator(".slds-form-element__control, lightning-formatted-text, lightning-formatted-name")
    .first();
}

/** Waits for a Flow screen to show its controls. */
export async function waitForFlowScreen(page: Page, options: WaitOptions = {}): Promise<void> {
  await page.locator('flowruntime-flow, div[class*="flowRuntime"], .flow-runtime-container').first().waitFor({ state: "visible", timeout: options.timeout ?? 30_000 });
  await waitForLightning(page, options);
}

/** Clicks a Flow navigation button (Next, Previous, Finish, Pause) and waits for the next screen. */
export async function flowNavigate(page: Page, button: "Next" | "Previous" | "Finish" | "Pause", options: WaitOptions = {}): Promise<void> {
  await page.getByRole("button", { name: button, exact: true }).click({ timeout: options.timeout ?? 10_000 });
  await waitForLightning(page, options);
}

function pageOf(scope: Page | Locator): Page {
  return "page" in scope && typeof scope.page === "function" ? scope.page() : (scope as Page);
}
