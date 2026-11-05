import type { FrameworkProfile, LocatorForm } from "../../data/index.js";
import { LIGHTNING_HELPERS_SOURCE } from "./lightning-source.js";

/**
 * The Salesforce pack (S2-5): what script generation needs to know about
 * Lightning, as data. The rules and the locator order go into the generate
 * step's context; the helpers are a real file (packs/salesforce/lightning.ts)
 * that generated code imports when the repo has nothing that does the same.
 */

export interface PackRule {
  id: string;
  /** One instruction, for a model writing Playwright code. */
  rule: string;
}

export interface PackHelper {
  /** The function's name in lightning.ts. */
  name: string;
  signature: string;
  does: string;
  /** Method names that do the same job in a repo's page objects (tested on the name, case ignored). */
  sameAs: RegExp;
}

export const SALESFORCE_PACK_VERSION = 1;

export const LIGHTNING_RULES: readonly PackRule[] = [
  { id: "shadow-dom", rule: "Lightning renders inside shadow roots. Playwright locators reach into open shadow roots, so use getByRole, getByLabel and getByText; never write CSS that crosses a shadow boundary (`>>>`, `::shadow`) or XPath, which does not." },
  { id: "no-aura-ids", rule: "Never select by generated ids or Aura attributes (`#input-123`, `data-aura-rendered-by`, `globalId`): they change on every page load." },
  { id: "spinners", rule: "After an action that saves, opens a record or changes the page, wait for Lightning to finish (spinners gone) before the next step. Never use a fixed waitForTimeout as the wait." },
  { id: "toasts", rule: "A save is confirmed by a toast: wait for the toast with the expected text, then close it or let it go before checking the next one, so an old toast isn't read as the new one." },
  { id: "lookups", rule: "A lookup field is a combobox: type a search term, wait for the options, then click the option. Typing alone never sets the value." },
  { id: "picklists", rule: "A picklist is a combobox button: click it, then click the option by role and exact name. Don't fill it." },
  { id: "record-by-url", rule: "Open records and list views by URL (/lightning/r/{Object}/{Id}/view, /lightning/o/{Object}/list) when the case doesn't test the navigation itself: it's faster and steadier than clicking through the app." },
  { id: "related-lists", rule: "Find a related list by its card's heading, then look inside that card: the same column names appear in several related lists." },
  { id: "modals", rule: "New and Edit forms open in a dialog: scope the form's locators to the dialog (getByRole('dialog')), since the record page behind it has fields with the same labels." },
  { id: "flows", rule: "Screen Flows: wait for the flow screen, fill it, then press Next or Finish and wait for the next screen before reading it." },
  { id: "exact-names", rule: "Lightning repeats words (Save, Save & New, New, New Contact): pass exact: true when a name is a prefix of another." },
  { id: "record-data", rule: "Never hard-code record ids or names from a sandbox: create the record in the test (or take it from the test data), and use made-up values from the test data or faker." },
];

/** Locator forms in the order a Lightning page supports best: what the explorer used, then the rest. */
export const LIGHTNING_LOCATOR_ORDER: readonly LocatorForm[] = ["getByRole", "getByLabel", "getByText", "getByTestId", "getByPlaceholder", "getByTitle", "getByAltText", "css", "xpath"];

export const LIGHTNING_HELPERS: readonly PackHelper[] = [
  { name: "waitForLightning", signature: "waitForLightning(page, { timeout? })", does: "Waits until no spinner or busy marker shows, twice in a row.", sameAs: /^wait(?:For)?(?:Spinner|SpinnerToDisappear|PageLoad|RecordLoad|Lightning|Loading)s?$/i },
  { name: "expectToast", signature: "expectToast(page, text?, { timeout? }): Promise<string>", does: "Waits for a toast (with the text, if given) and returns its text.", sameAs: /^(?:waitFor|expect|get|check)Toast(?:Message)?$/i },
  { name: "dismissToasts", signature: "dismissToasts(page)", does: "Closes every visible toast.", sameAs: /^(?:dismiss|close)Toasts?$/i },
  { name: "modal", signature: "modal(page): Locator", does: "The open dialog, to scope a form's locators.", sameAs: /^(?:get|waitFor)?(?:Modal|Dialog)$/i },
  { name: "selectPicklist", signature: "selectPicklist(scope, label, option, { timeout? })", does: "Opens a picklist and picks an option.", sameAs: /^select(?:Lightning)?(?:Combobox|Picklist|Option)$/i },
  { name: "fillLookup", signature: "fillLookup(scope, label, search, option?, { timeout? })", does: "Types in a lookup and clicks the matching result.", sameAs: /^(?:fill|select|set)(?:Lightning)?Lookup$/i },
  { name: "openRecord", signature: "openRecord(page, objectApiName, recordId, mode?, { timeout? })", does: "Opens a record page by URL and waits for it.", sameAs: /^(?:open|goTo|navigateTo)Record(?:Page|ById)?$/i },
  { name: "openObject", signature: "openObject(page, objectApiName, view?, { timeout? })", does: "Opens an object's list view by URL.", sameAs: /^(?:open|goTo|navigateTo)(?:Object|ListView)$/i },
  { name: "relatedList", signature: "relatedList(page, title): Locator", does: "A related list card on a record page, by its title.", sameAs: /^(?:get)?RelatedList$/i },
  { name: "fieldValue", signature: "fieldValue(page, label): Locator", does: "The value shown next to a field label on a record page.", sameAs: /^(?:get)?(?:Field|Detail)(?:Value|Text)$/i },
  { name: "waitForFlowScreen", signature: "waitForFlowScreen(page, { timeout? })", does: "Waits for a Flow screen to show.", sameAs: /^waitFor(?:Flow|FlowScreen)$/i },
  { name: "flowNavigate", signature: "flowNavigate(page, 'Next' | 'Previous' | 'Finish' | 'Pause')", does: "Clicks a Flow navigation button and waits for the next screen.", sameAs: /^(?:click(?:Next|Previous|Finish)|flowNavigate|navigateFlow)$/i },
];

/** Where the helper file goes when the repo has no better place: next to the page objects, else under the test folder. */
export const HELPERS_FILE_NAME = "lightning.ts";

/** For each helper, a repo method that does the same job (reuse it) or the pack's own. */
export type HelperChoice = { helper: PackHelper; use: { kind: "repo"; page: string; method: string; file: string } | { kind: "pack" } };

export function helperPlan(profile: Pick<FrameworkProfile, "pages">): HelperChoice[] {
  return LIGHTNING_HELPERS.map((helper) => {
    // A base class first: every page object inherits it.
    const pages = [...profile.pages].sort((a, b) => Number(/base/i.test(b.name)) - Number(/base/i.test(a.name)));
    for (const page of pages) {
      const method = page.methods.find((m) => helper.sameAs.test(m));
      if (method) return { helper, use: { kind: "repo", page: page.name, method, file: page.file } };
    }
    return { helper, use: { kind: "pack" } };
  });
}

/** Where to put lightning.ts: beside the folder most page objects live in, or `fallback`. */
export function helpersPath(profile: Pick<FrameworkProfile, "pages">, fallback = "tests/support"): string {
  const dirs = new Map<string, number>();
  for (const p of profile.pages) {
    const dir = p.file.split("/").slice(0, -1);
    // The parent of a pages folder, e.g. src/pages/base/x.ts → src/support.
    const at = dir.findIndex((d) => /^pages?$/i.test(d));
    const root = at >= 0 ? dir.slice(0, at).join("/") : dir.join("/");
    dirs.set(root, (dirs.get(root) ?? 0) + 1);
  }
  const best = [...dirs.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  return `${best !== undefined ? (best ? `${best}/support` : "support") : fallback}/${HELPERS_FILE_NAME}`;
}

/** The pack as the generate step shows it: rules, locator order, and which helper to call for each job. */
export function renderPack(profile: Pick<FrameworkProfile, "pages" | "locatorRanking">): string {
  const plan = helperPlan(profile);
  const order = [...profile.locatorRanking.filter((f) => f !== "css" && f !== "xpath"), ...LIGHTNING_LOCATOR_ORDER.filter((f) => !profile.locatorRanking.includes(f) || f === "css" || f === "xpath")];
  const needsFile = plan.some((c) => c.use.kind === "pack");
  return [
    "## Salesforce Lightning rules",
    ...LIGHTNING_RULES.map((r) => `- ${r.rule}`),
    "",
    `## Locators, in order of preference`,
    [...new Set(order)].join(", "),
    "",
    "## Helpers: call these, never write the wait again",
    "| Job | Use |",
    "|---|---|",
    ...plan.map(({ helper, use }) => `| ${helper.does} | ${use.kind === "repo" ? `\`${use.page}.${use.method}\` (${use.file}), the repo's own` : `\`${helper.signature}\` from ${helpersPath(profile)}`} |`),
    ...(needsFile ? ["", `${helpersPath(profile)} is added to the repo with the generated code. Import only the helpers you use from it.`] : []),
  ].join("\n");
}

/** The helper file's text, as copied into a repo. */
export const lightningHelpersSource = (): string => LIGHTNING_HELPERS_SOURCE;
