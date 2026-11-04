import { resolve as resolvePath } from "node:path";
import type { Config, Policy } from "../core/index.js";
import { ExplorerBrowser, loadPlaywright, type ActionOutcome, type ActionResult, type BrowserAction, type BrowserTarget, type PageSnapshot, type SalesforceSession } from "../connectors/index.js";
import type { RunVault } from "../masking/index.js";
import type { MaskedDataService } from "./requirements.js";
import { maskAriaSnapshot, maskTitle } from "./snapshot.js";

/**
 * The explorer's browser, behind masking (S2-4). The model only ever sees a
 * masked page and names elements with the tokens it saw; this layer puts the
 * real values back to act, and masks what comes out. Real values reach the
 * browser and nothing else: not a file, not the run state, not a model.
 *
 * The browser's state is a function of the run's accepted actions: `sync`
 * applies the ones not applied yet, and after a restart it replays the open
 * case from its start, so an action is never performed twice.
 */

/** What the workflow tells the browser where to go. Every string holds tokens, never real values. */
export interface ExploreSetup {
  /** The run whose vault holds the cases' tokens (the requirements run of the test cases). */
  tokensRun: string;
  /** The salesforce.users role to sign in as. Needed when agent-qa.yaml has a salesforce section. */
  role?: string;
  /** Where each case starts: a path on the org (or on playwright.baseUrl), e.g. /lightning/n/Approval_App. */
  start: string;
  headed?: boolean;
}

/** An action as the model gives it: target names and values may hold tokens. */
export type MaskedAction = BrowserAction;

export interface MaskedResult {
  outcome: ActionOutcome | "unknown-token";
  matches?: number;
  recovery?: "enter" | "dispatch";
  settledMs: number;
  busy: boolean;
  /** The page's path afterwards, masked. */
  page: string;
  reason?: string;
  dialogs?: string[];
}

export interface MaskedPage {
  /** Path only, masked: no origin, query or fragment. */
  path: string;
  title: string;
  aria: string;
  truncated: boolean;
  /** The page is a sign-in page: the session ended. */
  signedOut: boolean;
  settledMs: number;
  busy: boolean;
}

export interface ExplorerTarget {
  kind: "salesforce" | "web";
  /** The org's or app's host. */
  host: string;
  role?: string;
}

/** The browser as the explorer uses it (ExplorerBrowser, or a fake in tests). */
export interface BrowserLike {
  newCase(): Promise<void>;
  goto(url: string): Promise<{ settledMs: number; busy: boolean }>;
  url(): string;
  snapshot(): Promise<PageSnapshot>;
  act(action: BrowserAction): Promise<ActionResult>;
  close(): Promise<void>;
}

export type OpenBrowser = (grant: Parameters<typeof loadPlaywright>[0], options: { folder: string; headed: boolean }) => Promise<BrowserLike>;

export const openRepoBrowser: OpenBrowser = async (grant, { folder, headed }) => ExplorerBrowser.open(grant, { playwright: loadPlaywright(grant, folder), headed });

export interface ExplorerDeps {
  root: string;
  loadConfig(): Promise<Config>;
  policy(config: Config): Policy;
  run(runId: string): Promise<{ vault: RunVault; service: MaskedDataService }>;
  salesforceSession(role: string): Promise<SalesforceSession>;
  /** The folder whose node_modules hold Playwright: the reviewed profile's. */
  playwrightFolder(): Promise<string>;
  openBrowser?: OpenBrowser;
}

const TOKEN = /<[A-Z][A-Z0-9_]*_\d+>/g;
/** Browsers kept open at once, one per run. */
const MAX_BROWSERS = 4;

/**
 * A sandbox, scratch org or legacy sandbox (`name--sandbox.my.salesforce.com`).
 * The explorer performs test steps, which create and change records: never on production.
 */
export function isSalesforceSandbox(host: string): boolean {
  const h = host.toLowerCase();
  return /\.(sandbox|scratch)\.my\.salesforce\.com$/.test(h) || /\.(sandbox|scratch)\.lightning\.force\.com$/.test(h) || /^[a-z0-9-]+--[a-z0-9]+\.(my\.salesforce\.com|lightning\.force\.com)$/.test(h);
}

const SIGN_IN_HOSTS = new Set(["login.salesforce.com", "test.salesforce.com"]);

interface Session {
  browser: BrowserLike;
  /** The case open in the browser, and how many of its actions were applied. */
  caseId?: string;
  results: MaskedResult[];
  origin?: string;
}

export class Explorer {
  private readonly sessions = new Map<string, Promise<Session>>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly deps: ExplorerDeps) {}

  /** Where exploring goes. Throws for a production org: exploring writes records. */
  async target(role?: string): Promise<ExplorerTarget> {
    const config = await this.deps.loadConfig();
    const sf = config.salesforce;
    if (sf) {
      const host = new URL(sf.baseUrl).hostname;
      if (!isSalesforceSandbox(host)) throw new Error(`salesforce.baseUrl is not a sandbox (${host}): the explorer performs test steps, which create and change records, so it only runs on a sandbox or scratch org`);
      if (!role) throw new Error(`name the Salesforce role to explore as; the roles are ${Object.keys(sf.users).join(", ")}`);
      if (!Object.hasOwn(sf.users, role)) throw new Error(`agent-qa.yaml has no Salesforce user for the role ${JSON.stringify(role.slice(0, 60))}; the roles are ${Object.keys(sf.users).join(", ")}`);
      return { kind: "salesforce", host, role };
    }
    const base = config.playwright?.baseUrl;
    if (!base) throw new Error("agent-qa.yaml has no salesforce section and no playwright.baseUrl: nothing to explore");
    return { kind: "web", host: new URL(base).host };
  }

  /**
   * Brings the browser to the end of `actions` on case `caseId` and returns
   * each action's result and the page as it is now, masked. Applies only
   * actions not applied yet; a new case (or a restart) starts a fresh context,
   * signs in, opens the start page and replays. `approved` is the person's yes
   * to exploring: without it, no browser opens.
   */
  sync(runId: string, setup: ExploreSetup, caseId: string, actions: MaskedAction[], approved: boolean): Promise<{ results: MaskedResult[]; page: MaskedPage }> {
    return this.queued(runId, async () => {
      if (!approved) throw new Error("exploring wasn't approved: the browser stays closed");
      const session = await this.session(runId, setup);
      const { vault, service } = await this.deps.run(setup.tokensRun);
      if (session.caseId !== caseId || session.results.length > actions.length) {
        await this.startCase(session, setup);
        session.caseId = caseId;
        session.results = [];
      }
      for (let i = session.results.length; i < actions.length; i++) {
        session.results.push(await this.apply(session, actions[i]!, vault, service));
      }
      const page = await this.page(session, vault, service);
      await service.saveVault();
      return { results: [...session.results], page };
    });
  }

  async close(runId: string): Promise<void> {
    const session = this.sessions.get(runId);
    this.sessions.delete(runId);
    await (await session?.catch(() => undefined))?.browser.close();
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.close(id)));
  }

  private queued<T>(runId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(runId) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const settled = run.catch(() => undefined);
    this.queues.set(runId, settled);
    void settled.then(() => {
      if (this.queues.get(runId) === settled) this.queues.delete(runId);
    });
    return run;
  }

  private session(runId: string, setup: ExploreSetup): Promise<Session> {
    let session = this.sessions.get(runId);
    if (session) return session;
    session = (async () => {
      const config = await this.deps.loadConfig();
      const target = await this.target(setup.role);
      const folder = resolvePath(this.deps.root, await this.deps.playwrightFolder());
      const open = this.deps.openBrowser ?? openRepoBrowser;
      const summary = `Open a browser with the repo's Playwright, ${target.kind === "salesforce" ? `signed in as ${target.role} on ${target.host}` : `on ${target.host}`}, to explore test cases`;
      const outcome = await this.deps.policy(config).guard({ target: "commands", summary, runId }, (grant) => open(grant, { folder, headed: setup.headed ?? false }));
      if (outcome.status !== "done") throw new Error("the write policy refused to open a browser (policy.writes.commands)");
      return { browser: outcome.value, results: [] };
    })();
    session.catch(() => {
      if (this.sessions.get(runId) === session) this.sessions.delete(runId);
    });
    this.sessions.set(runId, session);
    if (this.sessions.size > MAX_BROWSERS) void this.close(this.sessions.keys().next().value!);
    return session;
  }

  /** A fresh context, signed in, on the start page. */
  private async startCase(session: Session, setup: ExploreSetup): Promise<void> {
    if (!setup.start.startsWith("/") || setup.start.startsWith("//")) throw new Error("the start page must be a path on the org, such as /lightning/n/Approval_App");
    const config = await this.deps.loadConfig();
    await session.browser.newCase();
    if (config.salesforce) {
      const signIn = await this.deps.salesforceSession(setup.role!);
      // The single-use URL goes to the browser and nowhere else.
      await session.browser.goto(signIn.frontdoorUrl);
      session.origin = new URL(session.browser.url()).origin;
      if (this.signedOut(session.browser.url())) throw new Error("Salesforce didn't open a session for the frontdoor URL: check the app's OAuth scopes (web or full)");
    } else {
      session.origin = new URL(config.playwright!.baseUrl).origin;
    }
    await session.browser.goto(new URL(setup.start, session.origin).href);
  }

  private async apply(session: Session, action: MaskedAction, vault: RunVault, service: MaskedDataService): Promise<MaskedResult> {
    const missing: string[] = [];
    const real = (text: string) => text.replace(TOKEN, (t) => vault.valueOf(t) ?? (missing.push(t), t));
    const target = (t: BrowserTarget): BrowserTarget => ({
      ...t,
      ...(t.name !== undefined ? { name: real(t.name) } : {}),
      ...(t.label !== undefined ? { label: real(t.label) } : {}),
      ...(t.text !== undefined ? { text: real(t.text) } : {}),
      ...(t.testId !== undefined ? { testId: real(t.testId) } : {}),
      ...(t.placeholder !== undefined ? { placeholder: real(t.placeholder) } : {}),
      ...(t.within ? { within: { role: t.within.role, ...(t.within.name !== undefined ? { name: real(t.within.name) } : {}) } } : {}),
    });
    let unmasked: BrowserAction;
    if (action.type === "goto") {
      if (!action.path.startsWith("/") || action.path.startsWith("//")) return this.refused(session, service, "goto takes a path on the same site");
      unmasked = { type: "goto", path: new URL(real(action.path), session.origin).href };
    } else if (action.type === "press") {
      unmasked = { type: "press", key: action.key, ...(action.target ? { target: target(action.target) } : {}) };
    } else if (action.type === "fill" || action.type === "select") {
      unmasked = { type: action.type, target: target(action.target), value: real(action.value) };
    } else if (action.type === "verify") {
      unmasked = { type: "verify", target: target(action.target), ...(action.text !== undefined ? { text: real(action.text) } : {}) };
    } else {
      unmasked = { type: action.type, target: target(action.target) };
    }
    if (missing.length) return this.refused(session, service, `the vault has no value for ${[...new Set(missing)].join(", ")}`, "unknown-token");
    const r = await session.browser.act(unmasked);
    return {
      outcome: r.outcome,
      ...(r.matches !== undefined ? { matches: r.matches } : {}),
      ...(r.recovery ? { recovery: r.recovery } : {}),
      settledMs: r.settledMs,
      busy: r.busy,
      page: this.path(r.url, service),
      // Reasons are fixed texts from the connector, or an error class name.
      ...(r.reason ? { reason: service.maskText(r.reason, "browser.reason") } : {}),
      ...(r.dialogs ? { dialogs: r.dialogs } : {}),
    };
  }

  private refused(session: Session, service: MaskedDataService, reason: string, outcome: MaskedResult["outcome"] = "refused"): MaskedResult {
    return { outcome, settledMs: 0, busy: false, page: this.path(session.browser.url(), service), reason };
  }

  private async page(session: Session, vault: RunVault, service: MaskedDataService): Promise<MaskedPage> {
    const snap = await session.browser.snapshot();
    const masker = { detect: (t: string) => service.maskText(t, "browser.snapshot"), token: (v: string) => vault.tokenFor("VALUE", v) };
    const path = this.path(snap.url, service);
    const masked = maskAriaSnapshot(snap.aria, masker, { recordPage: path.startsWith("/lightning/r/") });
    return {
      path,
      title: maskTitle(snap.title, masker),
      aria: masked.text,
      truncated: masked.truncated,
      signedOut: this.signedOut(snap.url),
      settledMs: snap.settledMs,
      busy: snap.busy,
    };
  }

  private path(url: string, service: MaskedDataService): string {
    try {
      return service.maskText(new URL(url).pathname, "browser.path");
    } catch {
      return "(no page)";
    }
  }

  private signedOut(url: string): boolean {
    try {
      const u = new URL(url);
      return SIGN_IN_HOSTS.has(u.hostname) || u.pathname.startsWith("/secur/") || /^\/(login|signin)\b/i.test(u.pathname);
    } catch {
      return false;
    }
  }
}
