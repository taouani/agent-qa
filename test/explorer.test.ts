import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ExplorerBrowser, loadPlaywright, type ActionResult, type BrowserAction, type PageSnapshot } from "../src/connectors/index.js";
import { assertGrant, configSchema, MemoryAuditSink, Policy, PolicyDenied, RunStore, type WriteGrant } from "../src/core/index.js";
import { DataAccess, isSalesforceSandbox, maskAriaSnapshot, maskTitle, MAX_SNAPSHOT_CHARS, type BrowserLike, type OpenBrowser } from "../src/data/index.js";
import { MemoryVaultStorage, Vault } from "../src/masking/index.js";

const ARIA = `- 'heading "Approval: request" [level=1]'
- navigation:
  - link "Jane Doe":
    - /url: /lightning/r/Account/001ABC/view?x=jane@x.com
- text: Account Name
- textbox "Account Name": Acme Corp
- combobox "Status":
  - option "Draft" [selected]
- table:
  - rowgroup:
    - row "Name Email":
      - columnheader "Name"
      - columnheader "Email"
    - row "John Smith john@acme.com":
      - cell "John Smith":
        - link "John Smith":
          - /url: /r/1
      - cell "john@acme.com"
- paragraph: "Hello: \\"quoted\\" it's"
- button "Save" [disabled]
- combobox "Account": Acme Corp
- slider "Pct": "42"
- listitem: "- leading dash"`;

describe("maskAriaSnapshot", () => {
  const tokens = new Map<string, string>();
  const masker = {
    detect: (t: string) => t.replace(/[\w.]+@[\w.]+/g, "<EMAIL_1>").replace(/Jane Doe/g, "<PERSON_1>"),
    token: (v: string) => {
      if (!tokens.has(v)) tokens.set(v, `<VALUE_${tokens.size + 1}>`);
      return tokens.get(v)!;
    },
  };

  it("keeps roles and labels, and turns typed values and record values into tokens", () => {
    const { text, truncated } = maskAriaSnapshot(ARIA, masker);
    expect(truncated).toBe(false);
    expect(text).toContain('- heading "Approval: request" [level=1]');
    expect(text).toContain('- link "<PERSON_1>":');
    expect(text).toContain("- /url: /lightning/r/Account/001ABC/view");
    expect(text).toContain('- textbox "Account Name": <VALUE_1>');
    expect(text).toContain('- option "Draft" [selected]');
    expect(text).toContain('- row "Name Email":');
    expect(text).toContain('- columnheader "Email"');
    expect(text).toMatch(/- row "<VALUE_\d+>":/);
    expect(text).toMatch(/- cell "<VALUE_\d+>":\n {8}- link "<VALUE_\d+>":/);
    expect(text).toContain('- cell "<EMAIL_1>"');
    expect(text).toContain('- paragraph: "Hello: \\"quoted\\" it\'s"');
    // Lookups, picklists and sliders hold a picked value: a token too.
    expect(text).toMatch(/- combobox "Account": <VALUE_\d+>/);
    expect(text).toMatch(/- slider "Pct": <VALUE_\d+>/);
    expect(text).toContain('- listitem: "- leading dash"');
    expect(text).toContain('- button "Save" [disabled]');
    for (const real of ["Acme Corp", "John Smith", "Jane Doe", "jane@x.com", "john@acme.com"]) expect(text).not.toContain(real);
    // The same value, the same token: the cell and its link name the same record.
    const cell = /- cell "(<VALUE_\d+>)":\n {8}- link "(<VALUE_\d+>)"/.exec(text)!;
    expect(cell[1]).toBe(cell[2]);
  });

  it("tokenizes a record page's name heading and the record parts of a title", () => {
    const record = maskAriaSnapshot('- heading "Acme Corp" [level=1]\n- heading "Details" [level=2]', masker, { recordPage: true }).text;
    expect(record).toMatch(/^- heading "<VALUE_\d+>" \[level=1\]\n- heading "Details" \[level=2\]$/);
    expect(maskAriaSnapshot('- heading "Requests" [level=1]', masker).text).toBe('- heading "Requests" [level=1]');
    expect(maskTitle("Acme Corp | Account | Salesforce", masker)).toMatch(/^<VALUE_\d+> \| <VALUE_\d+> \| Salesforce$/);
    expect(maskTitle("Requests", masker)).toBe("Requests");
  });

  it("masks a line it can't read as text, and cuts a huge page", () => {
    expect(maskAriaSnapshot("- ??? Jane Doe ???", masker).text).toBe("- ??? <PERSON_1> ???");
    const big = Array.from({ length: 5000 }, (_, i) => `- button "Button number ${i}"`).join("\n");
    const cut = maskAriaSnapshot(big, masker);
    expect(cut.truncated).toBe(true);
    expect(cut.text.length).toBeLessThan(MAX_SNAPSHOT_CHARS + 100);
    expect(cut.text).toMatch(/snapshot cut/);
  });
});

describe("isSalesforceSandbox", () => {
  it("knows sandboxes, scratch orgs and legacy sandbox domains from production", () => {
    for (const host of ["acme--uat.sandbox.my.salesforce.com", "acme--uat.sandbox.lightning.force.com", "x.scratch.my.salesforce.com", "acme--uat.my.salesforce.com"]) expect(isSalesforceSandbox(host)).toBe(true);
    for (const host of ["acme.my.salesforce.com", "acme.lightning.force.com", "evil.example", "acme--uat.sandbox.my.salesforce.com.evil.example"]) expect(isSalesforceSandbox(host)).toBe(false);
  });
});

/** A fake browser: one record list page, real values in it, and a log of what it was asked to do. */
function fakeBrowser() {
  const log: string[] = [];
  let url = "about:blank";
  let opened = 0;
  let typed = "";
  const open: OpenBrowser = async (grant, options) => {
    assertGrant(grant, "commands");
    opened++;
    log.push(`open ${options.headed ? "headed" : "headless"}`);
    const browser: BrowserLike = {
      async newCase() {
        log.push("newCase");
        url = "about:blank";
      },
      async goto(to: string) {
        log.push(`goto ${to}`);
        url = to.includes("frontdoor") ? "https://acme--uat.sandbox.lightning.force.com/lightning/page/home" : to;
        return { settledMs: 5, busy: false };
      },
      url: () => url,
      async snapshot(): Promise<PageSnapshot> {
        return { url: `${url}?q=jane.doe@example.com`, title: "Jane Doe | Salesforce", aria: `- row "Jane Doe jane.doe@example.com":\n  - cell "Jane Doe"\n- textbox "Comments": call Jane Doe${typed ? `\n- status: Request "${typed}" was created.` : ""}`, settledMs: 5, busy: false };
      },
      async act(action: BrowserAction): Promise<ActionResult> {
        log.push(`act ${JSON.stringify(action)}`);
        if (action.type === "fill") typed = action.value;
        if (action.type === "goto") url = action.path;
        return { outcome: "ok", matches: 1, settledMs: 5, busy: false, url };
      },
      async close() {
        log.push("close");
      },
    };
    return browser;
  };
  return { log, open, opened: () => opened };
}

describe("DataAccess explorer", () => {
  let dir: string;
  const vaults = new MemoryVaultStorage();
  const key = Buffer.alloc(32, 9);
  const INSTANCE = "https://acme--uat.sandbox.my.salesforce.com";
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-explorer-"));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  function data(browser: OpenBrowser, over: { baseUrl?: string; commands?: "allow" | "ask" | "deny"; audit?: MemoryAuditSink } = {}) {
    const config = configSchema.parse({
      version: 1,
      policy: { writes: { commands: over.commands ?? "ask" } },
      salesforce: { baseUrl: over.baseUrl ?? INSTANCE, clientId: "k", privateKey: "${env:SF_KEY}", users: { "StoreManager-FRA": "sm@acme.com.uat" } },
    });
    const access = new DataAccess({
      root: dir,
      store: new RunStore(join(dir, "runs")),
      config,
      vault: new Vault({ storage: vaults, keys: { description: "t", getKey: async () => key } }),
      audit: over.audit ?? new MemoryAuditSink(),
      browser,
    });
    // Sign-in is tested in salesforce.test.ts; here it hands out a frontdoor URL.
    (access as unknown as { salesforceSession: (role: string) => Promise<unknown> }).salesforceSession = async () => ({ instanceUrl: INSTANCE, frontdoorUrl: `${INSTANCE}/secur/frontdoor.jsp?otp=SECRET` });
    return access;
  }
  const setup = { tokensRun: "tokens-run", role: "StoreManager-FRA", start: "/lightning/n/Approval_App" };

  it("refuses production orgs and unknown roles, and says where it goes", async () => {
    const fake = fakeBrowser();
    await expect(data(fake.open, { baseUrl: "https://acme.my.salesforce.com" }).explorerTarget("StoreManager-FRA")).rejects.toThrow(/not a sandbox/);
    await expect(data(fake.open).explorerTarget("Admin")).rejects.toThrow(/no Salesforce user for the role "Admin"/);
    expect(await data(fake.open).explorerTarget("StoreManager-FRA")).toEqual({ kind: "salesforce", host: "acme--uat.sandbox.my.salesforce.com", role: "StoreManager-FRA" });
  });

  it("opens nothing without approval or against a deny rule", async () => {
    const fake = fakeBrowser();
    await expect(data(fake.open).explorerSync("run-1", setup, "TC-A-1-001", [], false)).rejects.toThrow(/wasn't approved/);
    await expect(data(fake.open, { commands: "deny" }).explorerSync("run-1", setup, "TC-A-1-001", [], true)).rejects.toBeInstanceOf(PolicyDenied);
    expect(fake.opened()).toBe(0);
  });

  it("signs in per case, acts with real values, returns only masked pages, and applies each action once", async () => {
    const fake = fakeBrowser();
    const audit = new MemoryAuditSink();
    const access = data(fake.open, { audit });
    const first = await access.explorerSync("run-1", setup, "TC-A-1-001", [], true);
    expect(audit.entries.length).toBeGreaterThan(0);
    for (const entry of audit.entries) expect(entry).toMatchObject({ target: "commands", summary: expect.stringContaining("signed in as StoreManager-FRA on acme--uat.sandbox.my.salesforce.com") });
    expect(JSON.stringify(audit.entries)).not.toContain("SECRET");
    expect(fake.log.slice(0, 4)).toEqual(["open headless", "newCase", `goto ${INSTANCE}/secur/frontdoor.jsp?otp=SECRET`, "goto https://acme--uat.sandbox.lightning.force.com/lightning/n/Approval_App"]);
    const page = JSON.stringify(first.page);
    for (const real of ["Jane Doe", "jane.doe@example.com", "SECRET", "frontdoor", "?q="]) expect(page).not.toContain(real);
    expect(first.page.path).toBe("/lightning/n/Approval_App");
    expect(first.page.title).toMatch(/^<[A-Z]+_\d+> \| Salesforce$/);
    expect(first.page.aria).toMatch(/- cell "<[A-Z]+_\d+>"/);
    // The model names the record by its token; the browser gets the real name.
    const token = /- cell "(<[A-Z]+_\d+>)"/.exec(first.page.aria)![1]!;
    const actions: BrowserAction[] = [{ type: "click", target: { role: "link", name: token } }];
    const second = await access.explorerSync("run-1", setup, "TC-A-1-001", actions, true);
    expect(second.results).toEqual([expect.objectContaining({ outcome: "ok", page: "/lightning/n/Approval_App" })]);
    expect(fake.log.filter((l) => l.startsWith("act"))).toEqual(['act {"type":"click","target":{"role":"link","name":"Jane Doe"}}']);
    // Rendering the same step again changes nothing in the browser.
    await access.explorerSync("run-1", setup, "TC-A-1-001", actions, true);
    expect(fake.log.filter((l) => l.startsWith("act"))).toHaveLength(1);
    // An unknown token is refused without touching the browser.
    const third = await access.explorerSync("run-1", setup, "TC-A-1-001", [...actions, { type: "fill", target: { label: "Comments" }, value: "<PERSON_99>" }], true);
    expect(third.results[1]).toMatchObject({ outcome: "unknown-token", reason: expect.stringContaining("<PERSON_99>") });
    expect(fake.log.filter((l) => l.startsWith("act"))).toHaveLength(1);
    // A goto must stay on the site.
    const third2: BrowserAction[] = [...actions, { type: "fill", target: { label: "Comments" }, value: "<PERSON_99>" }];
    const fourth = await access.explorerSync("run-1", setup, "TC-A-1-001", [...third2, { type: "goto", path: "https://evil.example/" }, { type: "goto", path: `/lightning/r/${token}/view` }], true);
    expect(fourth.results[2]).toMatchObject({ outcome: "refused" });
    // A path with a token would come back as the page's path, with the real value in it.
    expect(fourth.results[3]).toMatchObject({ outcome: "refused", reason: expect.stringContaining("without tokens") });
    expect(fake.log.filter((l) => l.startsWith("act"))).toHaveLength(1);
  });

  it("puts a value the explorer typed back as its token when the page echoes it", async () => {
    const fake = fakeBrowser();
    const access = data(fake.open);
    const { page } = await access.explorerSync("run-3", setup, "TC-A-1-001", [], true);
    const token = /- cell "(<[A-Z]+_\d+>)"/.exec(page.aria)![1]!;
    // The model types the record's name (a token) into a field; the app echoes it in a toast.
    const after = await access.explorerSync("run-3", setup, "TC-A-1-001", [{ type: "fill", target: { label: "Comments" }, value: `About ${token}` }], true);
    expect(fake.log.at(-1)).toContain('"value":"About Jane Doe"');
    expect(after.page.aria).toContain(`- status: Request "About ${token}" was created.`);
    expect(JSON.stringify(after)).not.toContain("Jane Doe");
    expect(fake.opened()).toBe(1);
  });

  it("starts a fresh context for the next case, and replays the open case after a restart", async () => {
    const fake = fakeBrowser();
    const actions: BrowserAction[] = [{ type: "click", target: { role: "button", name: "New" } }];
    await data(fake.open).explorerSync("run-2", setup, "TC-A-1-001", actions, true);
    // A new DataAccess is a restarted server: it opens a browser and replays the case once.
    const restarted = data(fake.open);
    await restarted.explorerSync("run-2", setup, "TC-A-1-001", actions, true);
    expect(fake.opened()).toBe(2);
    expect(fake.log.filter((l) => l.startsWith("act"))).toHaveLength(2);
    await restarted.explorerSync("run-2", setup, "TC-A-1-002", [], true);
    expect(fake.log.filter((l) => l === "newCase")).toHaveLength(3);
    await restarted.explorerClose("run-2");
    expect(fake.log.at(-1)).toBe("close");
  });

  it("says when it replayed a case, and starts again cleanly after a failed start", async () => {
    const fake = fakeBrowser();
    const actions: BrowserAction[] = [{ type: "click", target: { role: "button", name: "New" } }];
    const first = data(fake.open);
    expect((await first.explorerSync("run-4", setup, "TC-A-1-001", [], true)).page.replayed).toBeUndefined();
    expect((await first.explorerSync("run-4", setup, "TC-A-1-001", actions, true)).page.replayed).toBeUndefined();
    const restarted = data(fake.open);
    expect((await restarted.explorerSync("run-4", setup, "TC-A-1-001", actions, true)).page.replayed).toBe(true);
    // Said on every later sync of that case, and not on the next case.
    expect((await restarted.explorerSync("run-4", setup, "TC-A-1-001", [...actions, ...actions], true)).page.replayed).toBe(true);
    expect((await restarted.explorerSync("run-4", setup, "TC-A-1-002", [], true)).page.replayed).toBeUndefined();
    // A failed sign-in for the next case: the old case's actions no longer count.
    const flaky = data(fake.open);
    await flaky.explorerSync("run-5", setup, "TC-A-1-001", actions, true);
    const real = (flaky as unknown as { salesforceSession: unknown }).salesforceSession;
    (flaky as unknown as { salesforceSession: () => Promise<never> }).salesforceSession = async () => {
      throw new Error("down");
    };
    await expect(flaky.explorerSync("run-5", setup, "TC-A-1-002", [], true)).rejects.toThrow("down");
    (flaky as unknown as { salesforceSession: unknown }).salesforceSession = real;
    const acts = fake.log.filter((l) => l.startsWith("act")).length;
    await flaky.explorerSync("run-5", setup, "TC-A-1-001", actions, true);
    expect(fake.log.filter((l) => l.startsWith("act")).length).toBe(acts + 1);
  });

  it("drives a web app only on this machine", async () => {
    const fake = fakeBrowser();
    const web = (baseUrl: string) =>
      new DataAccess({ root: dir, store: new RunStore(join(dir, "runs")), config: configSchema.parse({ version: 1, playwright: { baseUrl } }), audit: new MemoryAuditSink(), browser: fake.open });
    await expect(web("https://intranet.example").explorerTarget()).rejects.toThrow(/isn't on this machine/);
    expect(await web("http://localhost:4173").explorerTarget()).toEqual({ kind: "web", host: "localhost:4173" });
  });
});

describe("loadPlaywright", () => {
  it("takes a copy hoisted to the project root, never one above it", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-qa-hoist-"));
    try {
      const pkg = join(root, "node_modules", "@playwright", "test");
      await mkdir(join(root, "e2e"), { recursive: true });
      await mkdir(pkg, { recursive: true });
      await writeFile(join(pkg, "package.json"), JSON.stringify({ name: "@playwright/test", version: "1.58.0", main: "index.js" }));
      await writeFile(join(pkg, "index.js"), "exports.chromium = { launch: async () => { throw new Error('no'); } };\n");
      const policy = new Policy({ rules: configSchema.parse({ version: 1, policy: { writes: { commands: "allow" } } }).policy.writes, mode: "ide", audit: new MemoryAuditSink() });
      const load = (boundary?: string) => policy.guard({ target: "commands", summary: "x" }, async (grant) => loadPlaywright(grant, join(root, "e2e"), boundary));
      expect(await load(root)).toMatchObject({ status: "done", value: { version: "1.58.0", from: "@playwright/test" } });
      await expect(load()).rejects.toThrow(/isn't installed/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

// The real browser: Playwright from a folder's node_modules, as from the user's repo.
const playwrightFolder = (() => {
  for (const from of [process.cwd(), "/opt/node-tools"]) {
    try {
      return dirname(dirname(createRequire(join(from, "package.json")).resolve("playwright/package.json")));
    } catch {
      // Not there.
    }
  }
  return undefined;
})();

describe.skipIf(!playwrightFolder)("ExplorerBrowser (real Chromium)", () => {
  let browser: ExplorerBrowser;
  let page: string;
  const policy = new Policy({ rules: configSchema.parse({ version: 1, policy: { writes: { commands: "allow" } } }).policy.writes, mode: "ide", audit: new MemoryAuditSink() });
  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-qa-browser-"));
    page = join(dir, "app.html");
    await writeFile(
      page,
      `<h1>Requests</h1>
      <button id="lazy">Slow save</button><button id="slower">Slower save</button><div id="out"></div>
      <custom-btn></custom-btn>
      <label>Comment <input id="c"></label>
      <button>Twin</button><button>Twin</button>
      <script>
        window.saves = 0; window.slow = 0;
        document.getElementById("lazy").addEventListener("click", () => setTimeout(() => { window.saves++; document.getElementById("out").innerHTML = "<p>Saved</p>"; }, 300));
        document.getElementById("slower").addEventListener("click", () => setTimeout(() => { window.slow++; document.getElementById("out").innerHTML = "<p>saved " + window.slow + "</p>"; }, 1500));
        customElements.define("custom-btn", class extends HTMLElement { constructor() { super(); const r = this.attachShadow({ mode: "open" }); r.innerHTML = "<button>Shadow</button>"; r.querySelector("button").addEventListener("click", () => document.getElementById("out").innerHTML = "<p>Shadow clicked</p>"); } });
      </script>`,
    );
    const outcome = await policy.guard({ target: "commands", summary: "test" }, async (grant) => ExplorerBrowser.open(grant, { playwright: loadPlaywright(grant, playwrightFolder!), settleMaxMs: 4_000 }));
    if (outcome.status !== "done") throw new Error("no grant");
    browser = outcome.value;
    await browser.newCase();
  }, 60_000);
  afterAll(() => browser?.close());

  it("needs a commands grant to load or start Playwright", async () => {
    expect(() => loadPlaywright(undefined as unknown as WriteGrant, playwrightFolder!)).toThrow(PolicyDenied);
    const outcome = await policy.guard({ target: "commands", summary: "x" }, async (grant) => loadPlaywright(grant, playwrightFolder!));
    expect(outcome.status === "done" && outcome.value.version).toMatch(/^1\.\d+/);
  });

  it("snapshots through shadow DOM, waits for a slow click, and reports ambiguity and absence", async () => {
    await browser.goto(`file://${page}`);
    const snap = await browser.snapshot();
    expect(snap.aria).toContain('button "Shadow"');
    const slow = await browser.act({ type: "click", target: { role: "button", name: "Slow save" } });
    expect(slow).toMatchObject({ outcome: "ok" });
    expect(slow.recovery).toBeUndefined();
    expect((await browser.snapshot()).aria).toContain("Saved");
    // An effect later than the settle window: the click reached the button, so it is never sent again.
    expect(await browser.act({ type: "click", target: { role: "button", name: "Slower save" } })).toMatchObject({ outcome: "no-effect", reason: expect.stringContaining("reached the element") });
    expect((await browser.snapshot()).aria).toContain("saved 1");
    expect(await browser.act({ type: "click", target: { role: "button", name: "Shadow" } })).toMatchObject({ outcome: "ok" });
    expect(await browser.act({ type: "click", target: { role: "button", name: "Twin" } })).toMatchObject({ outcome: "ambiguous", matches: 2 });
    expect(await browser.act({ type: "click", target: { role: "button", name: "Twin", nth: 1 } })).toMatchObject({ outcome: "no-effect" });
    expect(await browser.act({ type: "click", target: { role: "button", name: "Missing" } })).toMatchObject({ outcome: "not-found", matches: 0 });
    expect(await browser.act({ type: "fill", target: { label: "Comment" }, value: "hello" })).toMatchObject({ outcome: "ok" });
    expect(await browser.act({ type: "verify", target: { role: "heading", name: "Requests" }, text: "requests" })).toMatchObject({ outcome: "ok" });
    expect(await browser.act({ type: "verify", target: { role: "heading", name: "Requests" }, text: "nope" })).toMatchObject({ outcome: "mismatch" });
    expect(await browser.act({ type: "press", key: "rm -rf" })).toMatchObject({ outcome: "refused" });
  }, 60_000);
});
