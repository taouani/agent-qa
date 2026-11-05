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
  /**
   * Repo method names that do the same job, best first: a method matching an
   * earlier pattern wins over one matching a later one. Empty when only the
   * pack's helper fits (it returns a Locator, and a repo method's return type
   * isn't known).
   */
  sameAs: readonly RegExp[];
  /** Helpers that take one of a few names (flowNavigate's buttons): a repo method per name, `{name}` in the pattern. */
  each?: readonly string[];
}

export const SALESFORCE_PACK_VERSION = 1;

export const LIGHTNING_RULES: readonly PackRule[] = [
  { id: "shadow-dom", rule: "Lightning renders inside shadow roots. Playwright's role, label, text and CSS locators reach into open shadow roots; XPath does not, so never use XPath. Prefer getByRole and getByLabel over CSS." },
  { id: "no-aura-ids", rule: "Never select by generated ids or Aura attributes (`#input-123`, `data-aura-rendered-by`, `globalId`): they change on every page load." },
  { id: "spinners", rule: "After an action that saves, opens a record or changes the page, wait for Lightning to finish (spinners gone) before the next step. Never use a fixed waitForTimeout as the wait." },
  { id: "toasts", rule: "A save is confirmed by a toast: wait for the toast with the expected text, then close it before checking the next one, so an old toast isn't read as the new one. A red message under a field is a field error, not a toast." },
  { id: "lookups", rule: "A lookup field is a combobox: type a search term, wait for the results, then click the record. Typing alone never sets the value, and the list's \"Show All Results\" and \"New\" entries are not records." },
  { id: "picklists", rule: "A picklist is a combobox button: click it, then click the option by role and exact name. Don't fill it." },
  { id: "required-labels", rule: "A required field's accessible name starts with \"*\" (\"*Stage\"): match labels with a pattern that allows it, not exact text." },
  { id: "record-by-url", rule: "Open records and list views by URL (/lightning/r/{Object}/{Id}/view, /lightning/o/{Object}/list) when the case doesn't test the navigation itself: it's faster and steadier than clicking through the app." },
  { id: "related-lists", rule: "Find a related list by its card's heading, then look inside that card: the same column names appear in several related lists." },
  { id: "modals", rule: "New and Edit forms open in a modal dialog: scope the form's locators to it, since the record page behind it has fields with the same labels. Popovers and hover cards are dialogs too, so pick the modal, not any dialog." },
  { id: "hidden-pages", rule: "Lightning keeps pages it showed before in the DOM, hidden: when a locator can match an earlier page, limit it to visible elements." },
  { id: "flows", rule: "Screen Flows: wait for the flow screen, fill it, then press Next or Finish and wait for the next screen before reading it." },
  { id: "exact-names", rule: "Lightning repeats words (Save, Save & New, New, New Contact): pass exact: true when a name is a prefix of another." },
  { id: "record-data", rule: "Never hard-code record ids or names from a sandbox: create the record in the test (or take it from the test data), and use made-up values from the test data or faker." },
];

/** Locator forms in the order a Lightning page supports best. XPath is left out: it can't reach into shadow roots. */
export const LIGHTNING_LOCATOR_ORDER: readonly LocatorForm[] = ["getByRole", "getByLabel", "getByText", "getByTestId", "getByPlaceholder", "getByTitle", "getByAltText", "css"];

const WAIT = "(?:waitFor|wait|expect|verify|assert|check)";
export const LIGHTNING_HELPERS: readonly PackHelper[] = [
  {
    name: "waitForLightning",
    signature: "waitForLightning(page, { timeout? })",
    does: "Waits until no spinner shows, twice in a row.",
    sameAs: [/^waitFor(?:Loading)?Spinners?(?:ToDisappear|ToHide|Gone)?$/i, /^waitFor(?:Lightning|Lightning(?:Page)?Load|Loading)$/i, /^waitFor(?:Page|Record)(?:To)?Load(?:ed)?$/i],
  },
  { name: "expectToast", signature: "expectToast(page, text?, { timeout? }): Promise<string>", does: "Waits for a toast (with the text, if given) and returns its message.", sameAs: [new RegExp(`^${WAIT}(?:Success|Error)?Toast(?:Message)?$`, "i")] },
  { name: "dismissToasts", signature: "dismissToasts(page)", does: "Closes every visible toast.", sameAs: [/^(?:dismiss|close)(?:All)?Toasts?$/i] },
  { name: "modal", signature: "modal(page): Locator", does: "The open modal, to scope a form's locators.", sameAs: [] },
  { name: "selectPicklist", signature: "selectPicklist(scope, label, option, { timeout? })", does: "Opens a picklist and picks an option.", sameAs: [/^select(?:Lightning)?(?:Picklist|Combobox)(?:Value|Option)?$/i] },
  { name: "fillLookup", signature: "fillLookup(scope, label, search, option?, { timeout? })", does: "Types in a lookup and clicks the matching record.", sameAs: [/^(?:fill|select|set|choose)(?:Lightning)?Lookup(?:Value|Field|Record)?$/i] },
  { name: "openRecord", signature: "openRecord(page, objectApiName, recordId, mode?, { timeout? })", does: "Opens a record page by URL and waits for it.", sameAs: [/^(?:open|goTo|navigateTo)Record(?:Page|ById)?$/i] },
  { name: "openObject", signature: "openObject(page, objectApiName, 'list' | 'home' | 'new', { filterName?, timeout? })", does: "Opens an object's list view, home or new-record page by URL.", sameAs: [/^(?:open|goTo|navigateTo)(?:Object|ObjectList|ListView|ObjectHome)$/i] },
  { name: "relatedList", signature: "relatedList(page, title): Locator", does: "A related list card on a record page, by its title.", sameAs: [] },
  { name: "fieldValue", signature: "fieldValue(page, label): Locator", does: "The value shown next to a field label on a record page.", sameAs: [] },
  { name: "waitForFlowScreen", signature: "waitForFlowScreen(page, { timeout? })", does: "Waits for a Flow screen to show.", sameAs: [/^waitFor(?:Flow|FlowScreen)(?:ToLoad|Loaded)?$/i] },
  {
    name: "flowNavigate",
    signature: "flowNavigate(page, 'Next' | 'Previous' | 'Finish' | 'Pause')",
    does: "Clicks a Flow button and waits for the next screen.",
    sameAs: [/^(?:click|press)(?:Flow)?{name}(?:Button)?$/i],
    each: ["Next", "Previous", "Finish", "Pause"],
  },
];

/** Where the helper file goes when the repo has no better place: next to the page objects, else under the test folder. */
export const HELPERS_FILE_NAME = "lightning.ts";

/** A repo method that does a helper's job. */
export interface RepoMethod {
  page: string;
  method: string;
  file: string;
  /** For a helper with `each`: the name this method covers. */
  for?: string;
}

/** For each helper, the repo's methods that do the same job (reuse them), and whether the pack's helper is still needed. */
export type HelperChoice = { helper: PackHelper; repo: RepoMethod[]; pack: boolean };

const isBase = (name: string) => /^Base[A-Z]/.test(name) || /^Base$/.test(name);

function findMethod(pages: FrameworkProfile["pages"], patterns: readonly RegExp[]): RepoMethod | undefined {
  // The best pattern first, then base classes (every page object inherits them).
  for (const pattern of patterns) {
    for (const page of pages) {
      const method = page.methods.find((m) => pattern.test(m));
      if (method) return { page: page.name, method, file: page.file };
    }
  }
  return undefined;
}

export function helperPlan(profile: Pick<FrameworkProfile, "pages">): HelperChoice[] {
  const pages = [...profile.pages].sort((a, b) => Number(isBase(b.name)) - Number(isBase(a.name)));
  return LIGHTNING_HELPERS.map((helper) => {
    if (!helper.each) {
      const found = findMethod(pages, helper.sameAs);
      return { helper, repo: found ? [found] : [], pack: !found };
    }
    const repo = helper.each.flatMap((name) => {
      const found = findMethod(pages, helper.sameAs.map((p) => new RegExp(p.source.replace("{name}", name), p.flags)));
      return found ? [{ ...found, for: name }] : [];
    });
    // Pause is rare: the repo's own buttons are enough when the common ones are there.
    const common = helper.each.filter((n) => n !== "Pause");
    return { helper, repo, pack: !common.every((n) => repo.some((r) => r.for === n)) };
  });
}

/** Folder names that hold page objects (as the profile scan reads them). */
const PAGE_DIRS = /^(?:pages?|page-?objects?|pom|po)$/i;

/** Where to put lightning.ts: a support folder beside the folder most page objects live in, or `fallback`. */
export function helpersPath(profile: Pick<FrameworkProfile, "pages">, fallback = "tests/support"): string {
  const dirs = new Map<string, number>();
  for (const p of profile.pages) {
    const dir = p.file.replace(/\\/g, "/").split("/").slice(0, -1);
    // The parent of a pages folder, e.g. src/pages/base/x.ts → src.
    const at = dir.findIndex((d) => PAGE_DIRS.test(d));
    if (at <= 0) continue;
    const root = dir.slice(0, at).join("/");
    dirs.set(root, (dirs.get(root) ?? 0) + 1);
  }
  const best = [...dirs.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  return `${best !== undefined ? `${best}/support` : fallback}/${HELPERS_FILE_NAME}`;
}

const describeRepo = (r: RepoMethod) => `\`${r.method}\` on page objects extending ${r.page} (${r.file})`;

/** The pack as the generate step shows it: rules, locator order, and which helper to call for each job. */
export function renderPack(profile: Pick<FrameworkProfile, "pages" | "locatorRanking">): string {
  const plan = helperPlan(profile);
  const path = helpersPath(profile);
  // The repo's own order first, then the rest; CSS last, XPath never.
  const order = [...new Set([...profile.locatorRanking.filter((f) => f !== "css" && f !== "xpath"), ...LIGHTNING_LOCATOR_ORDER])];
  const needsFile = plan.some((c) => c.pack);
  const use = ({ helper, repo, pack }: HelperChoice) => {
    const own = repo.map((r) => (r.for ? `${r.for}: ${describeRepo(r)}` : describeRepo(r)));
    const packs = pack ? [`${own.length ? "otherwise " : ""}\`${helper.signature}\` from ${path}`] : [];
    return [...own, ...packs].join("; ");
  };
  return [
    "## Salesforce Lightning rules",
    ...LIGHTNING_RULES.map((r) => `- ${r.rule}`),
    "",
    "## Locators, in order of preference",
    order.join(", "),
    "",
    "## Helpers: call these, never write the wait again",
    "The repo's own methods come first.",
    "",
    "| Job | Use |",
    "|---|---|",
    ...plan.map((c) => `| ${c.helper.does} | ${use(c)} |`),
    ...(needsFile ? ["", `${path} is added to the repo with the generated code. Import only the helpers you use from it.`] : []),
  ].join("\n");
}

/** The helper file's text, as copied into a repo. */
export const lightningHelpersSource = (): string => LIGHTNING_HELPERS_SOURCE;
