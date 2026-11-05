import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FrameworkProfile } from "../src/data/index.js";
import { helperPlan, helpersPath, LIGHTNING_HELPERS, lightningHelpersSource, renderPack } from "../src/workflows/index.js";

const profile: Pick<FrameworkProfile, "pages" | "locatorRanking"> = {
  locatorRanking: ["getByRole", "css", "getByLabel"],
  pages: [
    { name: "ApprovalAppMainPage", file: "src/pages/approval-app-main-page.ts", extends: "BaseLightningPage", methods: ["navigateToNewForm", "waitForToast"] },
    { name: "BasePage", file: "src/pages/base/base-page.ts", methods: ["getToastMessage", "waitForPageLoad", "waitForSpinner", "waitForToast", "waitForModal", "closeModal", "selectLightningCombobox"] },
    { name: "BaseObjectPage", file: "src/pages/base/base-object-page.ts", extends: "BasePage", methods: ["goToObjectList", "getFieldValue"] },
    { name: "BaseFlowScreen", file: "src/pages/base/base-flow-screen.ts", extends: "BasePage", methods: ["waitForFlowScreen", "clickNext", "clickPrevious", "clickFinish"] },
  ],
};

describe("Salesforce pack", () => {
  it("ships the helper file as it is in packs/ (run npm run packs after editing it)", async () => {
    const file = await readFile(new URL("../packs/salesforce/lightning.ts", import.meta.url), "utf8");
    expect(lightningHelpersSource()).toBe(file.replace(/\r\n/g, "\n"));
    // Every helper the pack lists is exported by the file.
    for (const h of LIGHTNING_HELPERS) expect(file).toMatch(new RegExp(`export (?:async )?function ${h.name}\\(`));
  });

  it("reuses the repo's own helpers, best match and base classes first, and the pack's for the rest", () => {
    const plan = Object.fromEntries(helperPlan(profile).map((c) => [c.helper.name, [...c.repo.map((r) => `${r.for ? `${r.for}=` : ""}${r.page}.${r.method}`), ...(c.pack ? ["pack"] : [])].join(" ")]));
    expect(plan).toEqual({
      // waitForSpinner beats waitForPageLoad, and the base class beats a page that has the same name.
      waitForLightning: "BasePage.waitForSpinner",
      // getToastMessage reads without waiting: never taken for the wait.
      expectToast: "BasePage.waitForToast",
      dismissToasts: "pack",
      // Helpers that return a Locator are always the pack's.
      modal: "pack",
      selectPicklist: "BasePage.selectLightningCombobox",
      fillLookup: "pack",
      openRecord: "pack",
      openObject: "BaseObjectPage.goToObjectList",
      relatedList: "pack",
      fieldValue: "pack",
      waitForFlowScreen: "BaseFlowScreen.waitForFlowScreen",
      flowNavigate: "Next=BaseFlowScreen.clickNext Previous=BaseFlowScreen.clickPrevious Finish=BaseFlowScreen.clickFinish",
    });
    // Without Finish, the pack's flowNavigate is needed too.
    const noFinish = { pages: profile.pages.map((p) => ({ ...p, methods: p.methods.filter((m) => m !== "clickFinish") })) };
    expect(helperPlan(noFinish).find((c) => c.helper.name === "flowNavigate")).toMatchObject({ pack: true });
    // Names that look alike but do something else.
    const odd = helperPlan({ pages: [{ name: "DatabasePage", file: "src/pages/db.ts", methods: ["selectOption", "getToastMessage", "waitForModal", "getFieldValue"] }] });
    expect(odd.every((c) => c.repo.length === 0)).toBe(true);
  });

  it("puts the helper file in a support folder beside the page objects", () => {
    expect(helpersPath(profile)).toBe("src/support/lightning.ts");
    expect(helpersPath({ pages: [] })).toBe("tests/support/lightning.ts");
    const at = (...files: string[]) => helpersPath({ pages: files.map((file) => ({ name: "P", file, methods: [] })) });
    expect(at("src\\pages\\base\\x.ts")).toBe("src/support/lightning.ts");
    expect(at("e2e/page-objects/x.ts", "e2e/pom/y.ts")).toBe("e2e/support/lightning.ts");
    expect(at("tests/pages/x.ts")).toBe("tests/support/lightning.ts");
    // Not in a pages folder, or at the root: the default.
    expect(at("BasePage.ts", "tests/step-definitions/login-page.ts")).toBe("tests/support/lightning.ts");
  });

  it("renders rules, the locator order and a helper table for the generate step", () => {
    const text = renderPack(profile);
    expect(text).toContain("## Salesforce Lightning rules");
    expect(text).toContain("getByRole, getByLabel, getByText, getByTestId, getByPlaceholder, getByTitle, getByAltText, css\n");
    expect(text).not.toContain("xpath");
    expect(text).toContain("`waitForSpinner` on page objects extending BasePage (src/pages/base/base-page.ts)");
    expect(text).toContain("Next: `clickNext` on page objects extending BaseFlowScreen");
    expect(text).toContain("`openRecord(page, objectApiName, recordId, mode?, { timeout? })` from src/support/lightning.ts");
    expect(text).toContain("src/support/lightning.ts is added to the repo");
  });

  it("type-checks against Playwright 1.49's types, as CommonJS ES2020 (like the reference repo)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-qa-pack-tsc-"));
    try {
      await writeFile(join(dir, "lightning.ts"), lightningHelpersSource());
      const types = join(process.cwd(), "node_modules", "@playwright", "test", "index.d.ts");
      const config = {
        compilerOptions: { strict: true, noEmit: true, target: "ES2020", module: "commonjs", moduleResolution: "node", skipLibCheck: true, types: [], lib: ["ES2020", "DOM"], baseUrl: ".", paths: { "@playwright/test": [types] } },
        files: ["lightning.ts"],
      };
      await writeFile(join(dir, "tsconfig.json"), JSON.stringify(config));
      const tsc = join(process.cwd(), "node_modules", "typescript", "bin", "tsc");
      await expect(promisify(execFile)(process.execPath, [tsc, "-p", join(dir, "tsconfig.json")])).resolves.toBeDefined();
      expect(JSON.parse(await readFile(join(process.cwd(), "node_modules", "@playwright", "test", "package.json"), "utf8")).version).toMatch(/^1\.49\./);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

// The helpers on a real browser, against a stand-in page built the way Lightning builds its own: shadow roots, late spinners.
const playwrightFolder = (() => {
  // Not this repo's own @playwright/test (1.49, types only, no browser): a folder with a browser to match.
  for (const from of [process.env.AGENT_QA_PLAYWRIGHT_DIR, "/opt/node-tools"].filter((x): x is string => !!x)) {
    try {
      return dirname(dirname(createRequire(join(from, "package.json")).resolve("playwright/package.json")));
    } catch {
      // Not there.
    }
  }
  return undefined;
})();

const APP = `<!doctype html><title>Acme | Account | Salesforce</title>
<div id="busy"><lightning-spinner role="status" style="display:block">Loading</lightning-spinner></div>
<div class="slds-progress-bar" role="progressbar" aria-valuenow="40" style="width:100px;height:4px;background:#ccc"></div>
<ul role="listbox" aria-label="Path"><li role="option">Prospecting</li><li role="option">Closed</li></ul>
<sf-picklist></sf-picklist>
<button role="combobox" aria-label="Account Type">--None--</button>
<sf-lookup></sf-lookup>
<div id="portal"></div>
<div role="alert" class="slds-form-element__help">Complete this field.</div>
<div id="toasts"></div>
<article><h2>Related</h2>
  <article><h2>Contacts</h2><table><tr><td>Ann</td></tr></table></article>
  <article><h2>Opportunities</h2><table><tr><td>Big deal</td></tr></table></article>
</article>
<div style="display:none"><records-record-layout-item><span>Phone</span><div class="slds-form-element__control">OLD-111</div></records-record-layout-item></div>
<records-record-layout-item><span>Phone</span><div class="slds-form-element__control">NEW-222</div></records-record-layout-item>
<section role="dialog" aria-modal="true" class="slds-modal" aria-label="Edit Account"><button>Save</button></section>
<section role="dialog" class="slds-popover" aria-label="Hover card"><p>Ann</p></section>
<button id="save">Save</button>
<script>
  // A spinner, gone, then back for a moment: Lightning's double spin.
  setTimeout(() => { busy.innerHTML = ""; setTimeout(() => { busy.innerHTML = '<div class="slds-spinner_container" style="width:20px;height:20px"></div>'; setTimeout(() => (busy.innerHTML = ""), 300); }, 100); }, 400);
  window.picked = ""; window.looked = "";
  customElements.define("sf-picklist", class extends HTMLElement { constructor() { super(); const r = this.attachShadow({ mode: "open" });
    // A required field: the star is part of the label.
    r.innerHTML = '<label id="l"><abbr title="required">*</abbr>Stage</label><button role="combobox" aria-labelledby="l" aria-controls="stage-list">--None--</button><div role="listbox" id="stage-list" hidden><div role="option">Closed Won</div><div role="option">Closed</div></div>';
    const box = r.querySelector("[role=listbox]");
    r.querySelector("button").onclick = () => (box.hidden = false);
    r.querySelectorAll("[role=option]").forEach((o) => (o.onclick = () => { window.picked = o.textContent; box.hidden = true; }));
  } });
  // A lookup whose results render outside its shadow root, with the entries that aren't records.
  customElements.define("sf-lookup", class extends HTMLElement { constructor() { super(); const r = this.attachShadow({ mode: "open" });
    r.innerHTML = '<input role="combobox" aria-label="Account">';
    r.querySelector("input").oninput = (e) => { const v = e.target.value; setTimeout(() => {
      const names = ['Show All Results for "' + v + '"', ...["Acme Corp", "Acme Ltd", "Globex"].filter((n) => n.includes(v)), "+ New Account"];
      portal.innerHTML = '<div role="listbox">' + names.map((n) => '<div role="option">' + n + "</div>").join("") + "</div>";
      portal.querySelectorAll("[role=option]").forEach((o) => (o.onclick = () => (window.looked = o.textContent)));
    }, 300); };
  } });
  save.onclick = () => setTimeout(() => {
    for (const text of ['Account "Acme" was created.', "Sharing recalculated."]) {
      const t = document.createElement("div"); t.className = "forceToastMessage"; t.setAttribute("role", "alert");
      t.innerHTML = '<span class="toastMessage">' + text + '</span><button aria-label="Close">x</button>';
      // Hidden first, removed later: Lightning's fade.
      t.querySelector("button").onclick = () => { t.style.display = "none"; setTimeout(() => t.remove(), 500); };
      toasts.append(t);
    }
  }, 500);
</script>`;

describe.skipIf(!playwrightFolder)("Salesforce pack helpers (real Chromium)", () => {
  let dir: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pw: any, browser: any, page: any, h: Record<string, (...args: any[]) => Promise<any> | any>;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "agent-qa-pack-"));
    // The file exactly as a repo gets it.
    await writeFile(join(dir, "lightning.ts"), lightningHelpersSource());
    h = await import(/* @vite-ignore */ pathToFileURL(join(dir, "lightning.ts")).href);
    pw = createRequire(join(playwrightFolder!, "package.json"))("playwright");
    browser = await pw.chromium.launch();
    const context = await browser.newContext({ baseURL: "https://acme--uat.sandbox.lightning.force.com" });
    await context.route("**/*", (route: { fulfill: (r: object) => Promise<void> }) => route.fulfill({ contentType: "text/html", body: APP }));
    page = await context.newPage();
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("opens a record by URL, waits out a double spinner (not a progress bar), and reads the visible page", async () => {
    const t0 = Date.now();
    await h.openRecord!(page, "Account", "001000000000001AAA");
    expect(Date.now() - t0).toBeGreaterThanOrEqual(700);
    expect(Date.now() - t0).toBeLessThan(5_000);
    expect(page.url()).toBe("https://acme--uat.sandbox.lightning.force.com/lightning/r/Account/001000000000001AAA/view");
    expect(await page.locator("lightning-spinner, .slds-spinner_container").count()).toBe(0);
    const opportunities = await h.relatedList!(page, "Opportunities").innerText();
    expect(opportunities).toContain("Big deal");
    expect(opportunities).not.toContain("Ann");
    expect(await h.fieldValue!(page, "Phone").innerText()).toBe("NEW-222");
    expect(await h.modal!(page).getAttribute("aria-label")).toBe("Edit Account");
    await expect(h.openRecord!(page, "Account", "not-an-id")).rejects.toThrow("not a record id");
    await expect(h.openObject!(page, "Account; drop")).rejects.toThrow();
    await h.openObject!(page, "Account", "list", { filterName: "AllAccounts" });
    expect(page.url()).toBe("https://acme--uat.sandbox.lightning.force.com/lightning/o/Account/list?filterName=AllAccounts");
  }, 30_000);

  it("picks a required picklist's own option, and a lookup's record, not Show All Results", async () => {
    await h.selectPicklist!(page, "Stage", "Closed");
    expect(await page.evaluate(() => (globalThis as unknown as { picked: string }).picked)).toBe("Closed");
    // "Account Type" is a picklist button ahead of the "Account" lookup.
    await h.fillLookup!(page, "Account", "Acme");
    expect(await page.evaluate(() => (globalThis as unknown as { looked: string }).looked)).toBe("Acme Corp");
    await h.fillLookup!(page, "Account", "Acme", "Acme Ltd");
    expect(await page.evaluate(() => (globalThis as unknown as { looked: string }).looked)).toBe("Acme Ltd");
  }, 30_000);

  it("waits for a toast's message (not a field error) and closes every toast", async () => {
    await page.locator("#save").click();
    expect(await h.expectToast!(page)).toBe('Account "Acme" was created.');
    expect(await h.expectToast!(page, /recalculated/)).toBe("Sharing recalculated.");
    await h.dismissToasts!(page);
    expect(await page.locator(".forceToastMessage:visible").count()).toBe(0);
    await expect(h.expectToast!(page, "never", { timeout: 300 })).rejects.toThrow();
  }, 30_000);
});
