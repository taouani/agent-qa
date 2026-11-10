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
/**
 * Entries a lookup lists that aren't records: Lightning marks its actions
 * ("Show All Results", "New Account") with a data-value starting "action".
 * The text check covers lists that don't.
 */
const LOOKUP_RECORD = '[role="option"]:not([data-value^="action"])';
const NOT_A_RECORD = /^\s*Show (?:All|more) Results\b/i;

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
  let raw = (await message.count()) ? await message.innerText() : await toast.innerText();
  // No message markup: the buttons' labels (Close) come last in the text, and only there are they cut.
  if (!(await message.count())) for (const label of (await toast.getByRole("button").allInnerTexts()).reverse()) if (label.trim()) raw = raw.replace(new RegExp(`\\s*${escapeRegExp(label.trim())}\\s*$`), "");
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
  // A date picker or popover inside a modal is a dialog too: never the modal itself.
  const not = ":not(.slds-datepicker):not(.slds-popover)";
  return page.locator([`[role="dialog"][aria-modal="true"]${not}:visible`, `.slds-modal:visible > [role="dialog"]${not}`, `.slds-modal__container[role="dialog"]${not}:visible`, `section.slds-modal[role="dialog"]${not}:visible`, `dialog[open]${not}:visible`].join(", ")).last();
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
  // Chosen by what exists, not what shows: lists open a moment after the click. The visible form is returned, and the click waits for it.
  const id = (await box.getAttribute("aria-controls")) ?? (await box.getAttribute("aria-owns"));
  if (id && /^[\w:.-]+$/.test(id) && (await page.locator(`[id="${id}"]`).count()) > 0) return page.locator(`[id="${id}"]:visible`);
  // Then a list in the field's own form element (XPath stays inside the field's shadow root, which is what's wanted here).
  const form = box.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " slds-form-element ")][1]');
  if ((await form.locator('[role="listbox"]').count()) > 0) return form.locator('[role="listbox"]:visible');
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
 * whose name contains `search`; "Show All Results" and "New …" are skipped).
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
  // The first record whose name holds the option (or the search), never one of Lightning's actions.
  const records = list
    .locator(LOOKUP_RECORD)
    .filter({ hasNotText: NOT_A_RECORD })
    .filter({ hasText: option ?? search });
  // The results redraw a moment after typing, and the last search's can still show: a
  // click while they redraw is lost, and an entry redrawn in place can become another.
  // So the click goes to the record that is still the first match 400 ms later.
  const end = Date.now() + timeout;
  const left = () => Math.max(1_000, end - Date.now());
  let clickError = "";
  for (;;) {
    const record = await records.first().elementHandle({ timeout: left() });
    try {
      if (record) {
        const text = await record.innerText();
        await page.waitForTimeout(400);
        const same = await records
          .first()
          .evaluate((el, h) => el === h, record, { timeout: 1_000 })
          .catch(() => false);
        if (same && (await record.innerText().catch(() => "")) === text) {
          const clicked = await record.click({ timeout: left() }).then(
            () => true,
            (error: unknown) => ((clickError = error instanceof Error ? error.message.split("\n")[0]! : String(error)), false),
          );
          if (clicked) break;
        }
      }
    } finally {
      await record?.dispose();
    }
    if (Date.now() > end) throw new Error(clickError ? `the result for ${search} couldn't be clicked: ${clickError}` : `the results for ${search} kept changing for ${timeout} ms`);
  }
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
