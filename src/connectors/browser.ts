import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import { assertGrant, type WriteGrant } from "../core/index.js";

/**
 * A browser for the explorer (S2-4), driven with the Playwright library from
 * the user's own repo, so its version and browsers are the ones their tests
 * use. Agent-QA ships no Playwright of its own.
 *
 * The connector sees real values (a record name to click, a value to type):
 * everything it returns is for the data layer, which masks it before a model
 * or a file sees it. Errors never carry Playwright's message, which quotes
 * the selector and so the value.
 */

/** Oldest Playwright with `locator.ariaSnapshot()`. */
export const MIN_PLAYWRIGHT = [1, 49] as const;
const ACTION_TIMEOUT_MS = 15_000;
const SETTLE_MAX_MS = 10_000;
const SETTLE_POLL_MS = 250;
/** Polls in a row with the same tree before the page counts as settled: about a second, so a slow click isn't taken for no effect (and clicked again). */
const STABLE_POLLS = 4;
/** What reads as "the page is still working" on Lightning and most apps. */
const BUSY = '[role="progressbar"]:visible, [aria-busy="true"]:visible, .slds-spinner_container:visible, lightning-spinner:visible';
export const KEY = /^(?:[A-Za-z0-9]|F\d{1,2}|Enter|Tab|Escape|Space|Backspace|Delete|Arrow(?:Up|Down|Left|Right)|Home|End|PageUp|PageDown)(?:\+(?:[A-Za-z0-9]|Enter|Tab))?$|^(?:Control|Shift|Alt|Meta)\+[A-Za-z0-9]$/;

/** An element as a function run in the page sees it (no DOM types in this package). */
interface PageElement {
  __agentQaClicks?: number;
  addEventListener(type: string, listener: () => void, options?: { capture?: boolean }): void;
}

// The slice of Playwright's API used here, typed structurally: no dependency on its types.
interface PwLocator {
  count(): Promise<number>;
  nth(index: number): PwLocator;
  first(): PwLocator;
  click(options?: { timeout?: number }): Promise<void>;
  fill(value: string, options?: { timeout?: number }): Promise<void>;
  selectOption(value: { label: string } | string, options?: { timeout?: number }): Promise<unknown>;
  check(options?: { timeout?: number }): Promise<void>;
  uncheck(options?: { timeout?: number }): Promise<void>;
  press(key: string, options?: { timeout?: number }): Promise<void>;
  focus(options?: { timeout?: number }): Promise<void>;
  dispatchEvent(type: string): Promise<void>;
  evaluate<R>(fn: (el: PageElement) => R): Promise<R>;
  waitFor(options?: { state?: "attached" | "visible" | "hidden"; timeout?: number }): Promise<void>;
  isVisible(): Promise<boolean>;
  innerText(options?: { timeout?: number }): Promise<string>;
  ariaSnapshot(options?: { timeout?: number }): Promise<string>;
  getByRole(role: string, options?: { name?: string; exact?: boolean }): PwLocator;
  getByLabel(text: string, options?: { exact?: boolean }): PwLocator;
  getByText(text: string, options?: { exact?: boolean }): PwLocator;
  getByTestId(id: string): PwLocator;
  getByPlaceholder(text: string, options?: { exact?: boolean }): PwLocator;
}
interface PwPage extends Pick<PwLocator, "getByRole" | "getByLabel" | "getByText" | "getByTestId" | "getByPlaceholder"> {
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  url(): string;
  title(): Promise<string>;
  locator(selector: string): PwLocator;
  keyboard: { press(key: string): Promise<void> };
  waitForTimeout(ms: number): Promise<void>;
  setDefaultTimeout(ms: number): void;
  on(event: "dialog", handler: (dialog: { type(): string; dismiss(): Promise<void> }) => void): void;
}
interface PwContext {
  newPage(): Promise<PwPage>;
  close(): Promise<void>;
}
interface PwBrowser {
  newContext(options?: Record<string, unknown>): Promise<PwContext>;
  close(): Promise<void>;
}
interface PwChromium {
  launch(options?: { headless?: boolean }): Promise<PwBrowser>;
}

export class BrowserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserError";
  }
}

/** Playwright as found in the user's repo. */
export interface LoadedPlaywright {
  chromium: PwChromium;
  version: string;
  /** The package it came from: @playwright/test or playwright. */
  from: string;
}

const atLeast = (version: string, [major, minor]: readonly [number, number]) => {
  const [a = 0, b = 0] = version.split(".").map((n) => Number.parseInt(n, 10));
  return a > major || (a === major && b >= minor);
};

/** Loads Playwright from `folder`'s node_modules. Runs the repo's own copy of Playwright: needs a commands grant. */
export function loadPlaywright(grant: WriteGrant, folder: string): LoadedPlaywright {
  assertGrant(grant, "commands");
  const load = createRequire(join(folder, "package.json"));
  const root = realpathSync(folder);
  for (const from of ["@playwright/test", "playwright"]) {
    let version: string;
    try {
      // Only the repo's own copy: Node would also look in every folder above it (~/node_modules).
      const rel = relative(root, realpathSync(load.resolve(`${from}/package.json`)));
      if (rel.split(/[\\/]/)[0] === ".." || isAbsolute(rel)) continue;
      version = (load(`${from}/package.json`) as { version: string }).version;
    } catch {
      continue;
    }
    if (!atLeast(version, MIN_PLAYWRIGHT)) throw new BrowserError(`${from} ${version} in the repo is too old: the explorer needs ${MIN_PLAYWRIGHT.join(".")} or later`);
    const chromium = (load(from) as { chromium?: PwChromium }).chromium;
    if (!chromium) throw new BrowserError(`${from} in the repo has no chromium launcher`);
    return { chromium, version, from };
  }
  throw new BrowserError("Playwright isn't installed in the repo: run npm install there (the explorer uses the repo's own @playwright/test)");
}

/** How the explorer names an element: by role and name first, as generated code will. */
export interface BrowserTarget {
  role?: string;
  name?: string;
  label?: string;
  text?: string;
  testId?: string;
  placeholder?: string;
  /** Default true: the name or text must match whole. */
  exact?: boolean;
  /** Which match, from 0, when several match. */
  nth?: number;
  /** Look only inside this element, e.g. a dialog or a row. */
  within?: { role: string; name?: string };
}

export type BrowserAction =
  | { type: "click"; target: BrowserTarget }
  | { type: "fill"; target: BrowserTarget; value: string }
  | { type: "select"; target: BrowserTarget; value: string }
  | { type: "check"; target: BrowserTarget }
  | { type: "uncheck"; target: BrowserTarget }
  | { type: "press"; key: string; target?: BrowserTarget }
  | { type: "goto"; path: string }
  /** The expected result: the target is visible (and holds `text`, when given). */
  | { type: "verify"; target: BrowserTarget; text?: string };

export type ActionOutcome =
  | "ok"
  /** Nothing changed, even after the fallbacks. */
  | "no-effect"
  | "not-found"
  /** Several elements match: give nth or within. */
  | "ambiguous"
  /** verify: the element is there but doesn't hold the text, or isn't visible. */
  | "mismatch"
  | "timeout"
  | "refused"
  | "error";

export interface ActionResult {
  outcome: ActionOutcome;
  /** How many elements matched the target. */
  matches?: number;
  /** A fallback that made a click work: press Enter on it, or a click event sent by script. */
  recovery?: "enter" | "dispatch";
  /** ms the page took to settle after the action. */
  settledMs: number;
  /** A busy indicator (spinner, progress bar) was seen while settling. */
  busy: boolean;
  /** The page's URL after the action. Real: the data layer masks it. */
  url: string;
  /** Why it was refused, or the error's class. Never Playwright's message. */
  reason?: string;
  /** Native dialogs (alert, confirm) dismissed during the action. */
  dialogs?: string[];
}

export interface PageSnapshot {
  url: string;
  title: string;
  /** Playwright's accessibility snapshot of the page (YAML). Real values: the data layer masks it. */
  aria: string;
  settledMs: number;
  busy: boolean;
}

export interface OpenBrowserOptions {
  playwright: LoadedPlaywright;
  headed?: boolean;
  /** For tests. */
  settleMaxMs?: number;
  actionTimeoutMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One browser for one run. Each test case gets a fresh context (no cookies
 * carried over), opened with `newCase`.
 */
export class ExplorerBrowser {
  private context: PwContext | undefined;
  private page: PwPage | undefined;
  private dialogs: string[] = [];

  private constructor(
    private readonly browser: PwBrowser,
    private readonly settleMaxMs: number,
    private readonly actionTimeoutMs: number,
  ) {}

  static async open(grant: WriteGrant, options: OpenBrowserOptions): Promise<ExplorerBrowser> {
    assertGrant(grant, "commands");
    let browser: PwBrowser;
    try {
      browser = await options.playwright.chromium.launch({ headless: !options.headed });
    } catch (error) {
      throw new BrowserError(`the browser didn't start (${(error as Error).name}): run npx playwright install chromium in the repo`);
    }
    return new ExplorerBrowser(browser, options.settleMaxMs ?? SETTLE_MAX_MS, options.actionTimeoutMs ?? ACTION_TIMEOUT_MS);
  }

  /** A fresh context and page: nothing from the previous case. */
  async newCase(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    this.context = await this.browser.newContext({ acceptDownloads: false, viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.actionTimeoutMs);
    this.page.on("dialog", (dialog) => {
      this.dialogs.push(dialog.type());
      void dialog.dismiss().catch(() => undefined);
    });
  }

  private get current(): PwPage {
    if (!this.page) throw new BrowserError("no page open: start a case first");
    return this.page;
  }

  /** Opens `url` (any URL: the data layer decides which). The URL never appears in an error. */
  async goto(url: string): Promise<{ settledMs: number; busy: boolean }> {
    try {
      await this.current.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    } catch (error) {
      throw new BrowserError(`the page didn't load (${(error as Error).name})`);
    }
    return this.settle();
  }

  url(): string {
    return this.current.url();
  }

  async snapshot(): Promise<PageSnapshot> {
    const { settledMs, busy } = await this.settle();
    const page = this.current;
    return { url: page.url(), title: await page.title().catch(() => ""), aria: await this.aria(), settledMs, busy };
  }

  private async aria(): Promise<string> {
    return this.current
      .locator("body")
      .ariaSnapshot({ timeout: 5_000 })
      .catch(() => "");
  }

  /**
   * Waits until no busy indicator shows and the accessibility tree stops
   * changing, up to settleMaxMs. Never a fixed wait: this is what the pack's
   * waits will express in generated code.
   */
  private async settle(): Promise<{ settledMs: number; busy: boolean }> {
    const started = Date.now();
    let previous: string | undefined;
    let stable = 0;
    let busy = false;
    while (Date.now() - started < this.settleMaxMs) {
      const spinning = (await this.current.locator(BUSY).count().catch(() => 0)) > 0;
      busy ||= spinning;
      const now = await this.aria();
      stable = !spinning && now === previous ? stable + 1 : 0;
      if (stable >= STABLE_POLLS - 1) break;
      previous = now;
      await sleep(SETTLE_POLL_MS);
    }
    return { settledMs: Date.now() - started, busy };
  }

  private locate(target: BrowserTarget): { locator?: PwLocator; scope?: PwLocator } {
    const page = this.current;
    const exact = target.exact ?? true;
    const scope = target.within ? page.getByRole(target.within.role, { ...(target.within.name !== undefined ? { name: target.within.name, exact: true } : {}) }) : undefined;
    const from = scope ?? page;
    const locator = target.role
      ? from.getByRole(target.role, { ...(target.name !== undefined ? { name: target.name, exact } : {}) })
      : target.label !== undefined
        ? from.getByLabel(target.label, { exact })
        : target.text !== undefined
          ? from.getByText(target.text, { exact })
          : target.testId !== undefined
            ? from.getByTestId(target.testId)
            : target.placeholder !== undefined
              ? from.getByPlaceholder(target.placeholder, { exact })
              : undefined;
    return { ...(locator ? { locator } : {}), ...(scope ? { scope } : {}) };
  }

  /** The one element `target` names, or why there isn't one. Waits a little for it to appear. */
  private async resolve(target: BrowserTarget): Promise<{ element?: PwLocator; outcome?: ActionOutcome; matches: number }> {
    const { locator, scope } = this.locate(target);
    if (!locator) return { outcome: "refused", matches: 0 };
    if (scope) {
      await scope.first().waitFor({ state: "attached", timeout: 5_000 }).catch(() => undefined);
      const scopes = await scope.count();
      if (scopes !== 1) return { outcome: scopes === 0 ? "not-found" : "ambiguous", matches: scopes };
    }
    await locator.first().waitFor({ state: "attached", timeout: 5_000 }).catch(() => undefined);
    const matches = await locator.count();
    if (matches === 0) return { outcome: "not-found", matches };
    if (target.nth !== undefined) return target.nth < matches ? { element: locator.nth(target.nth), matches } : { outcome: "not-found", matches };
    if (matches > 1) return { outcome: "ambiguous", matches };
    return { element: locator, matches };
  }

  async act(action: BrowserAction): Promise<ActionResult> {
    this.dialogs = [];
    const page = this.current;
    const done = async (outcome: ActionOutcome, extra: Partial<ActionResult> = {}): Promise<ActionResult> => {
      const settled = extra.settledMs === undefined ? await this.settle() : { settledMs: extra.settledMs, busy: extra.busy ?? false };
      return { outcome, ...extra, ...settled, url: page.url(), ...(this.dialogs.length ? { dialogs: [...this.dialogs] } : {}) };
    };
    try {
      if (action.type === "goto") return done("ok", await this.goto(action.path));
      if (action.type === "press" && !KEY.test(action.key)) return done("refused", { reason: "not a key name" });
      if (action.type === "press" && !action.target) {
        await page.keyboard.press(action.key);
        return done("ok");
      }
      const { element, outcome, matches } = await this.resolve(action.target!);
      if (!element) return done(outcome!, { matches, ...(outcome === "refused" ? { reason: "the target names no element" } : {}) });
      const timeout = this.actionTimeoutMs;
      switch (action.type) {
        case "click": {
          const before = await this.signature();
          // Counts clicks that reach the element (or anything inside it), so a click is never sent twice.
          const counting = await element
            .evaluate((el) => {
              el.__agentQaClicks = 0;
              el.addEventListener("click", () => (el.__agentQaClicks = (el.__agentQaClicks ?? 0) + 1), { capture: true });
              return true;
            })
            .catch(() => false);
          await element.click({ timeout });
          let settled = await this.settle();
          if ((await this.signature()) !== before) return done("ok", { matches, ...settled });
          const reached = counting ? await element.evaluate((el) => (el.__agentQaClicks ?? 0) > 0).catch(() => true) : true;
          // The click arrived, but nothing changed yet: the effect may be slow or out of the tree's sight
          // (a popup, a download, an iframe). Clicking again could submit twice, so the model decides.
          if (reached) return done("no-effect", { matches, reason: "the click reached the element, but the page didn't change", ...settled });
          // The click never reached it (Lightning's custom elements sometimes swallow one): v1's fallbacks.
          await element.focus({ timeout }).catch(() => undefined);
          await element.press("Enter", { timeout }).catch(() => undefined);
          settled = await this.settle();
          if ((await this.signature()) !== before) return done("ok", { matches, recovery: "enter", ...settled });
          await element.dispatchEvent("click").catch(() => undefined);
          settled = await this.settle();
          if ((await this.signature()) !== before) return done("ok", { matches, recovery: "dispatch", ...settled });
          return done("no-effect", { matches, ...settled });
        }
        case "fill":
          await element.fill(action.value, { timeout });
          return done("ok", { matches });
        case "select":
          await element.selectOption({ label: action.value }, { timeout: 3_000 }).catch(() => element.selectOption(action.value, { timeout }));
          return done("ok", { matches });
        case "check":
          await element.check({ timeout });
          return done("ok", { matches });
        case "uncheck":
          await element.uncheck({ timeout });
          return done("ok", { matches });
        case "press":
          await element.press(action.key, { timeout });
          return done("ok", { matches });
        case "verify": {
          await element.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
          if (!(await element.isVisible())) return done("mismatch", { matches, reason: "not visible" });
          if (action.text !== undefined) {
            const text = await element.innerText({ timeout: 5_000 }).catch(() => "");
            if (!normalize(text).includes(normalize(action.text))) return done("mismatch", { matches, reason: "doesn't hold the text" });
          }
          return done("ok", { matches });
        }
      }
    } catch (error) {
      const name = (error as Error)?.name ?? "Error";
      return done(name === "TimeoutError" ? "timeout" : "error", { reason: name === "TimeoutError" ? "timed out" : name === "BrowserError" ? (error as Error).message : name });
    }
  }

  /** What an action must change to count: the URL or the accessibility tree. */
  private async signature(): Promise<string> {
    return `${this.current.url()}\n${await this.aria()}`;
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    await this.browser.close().catch(() => undefined);
    this.context = undefined;
    this.page = undefined;
  }
}

const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
