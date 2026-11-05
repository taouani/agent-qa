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
    { name: "BasePage", file: "src/pages/base/base-page.ts", methods: ["waitForPageLoad", "waitForSpinner", "waitForToast", "selectLightningCombobox", "closeModal"] },
    { name: "BaseFlowScreen", file: "src/pages/base/base-flow-screen.ts", extends: "BasePage", methods: ["waitForFlowScreen", "clickNext", "clickFinish"] },
  ],
};

describe("Salesforce pack", () => {
  it("ships the helper file as it is in packs/ (run npm run packs after editing it)", async () => {
    const file = await readFile(new URL("../packs/salesforce/lightning.ts", import.meta.url), "utf8");
    expect(lightningHelpersSource()).toBe(file.replace(/\r\n/g, "\n"));
    // Every helper the pack lists is exported by the file.
    for (const h of LIGHTNING_HELPERS) expect(file).toMatch(new RegExp(`export (?:async )?function ${h.name}\\(`));
  });

  it("reuses the repo's own helpers, base classes first, and the pack's for the rest", () => {
    const plan = Object.fromEntries(helperPlan(profile).map((c) => [c.helper.name, c.use.kind === "repo" ? `${c.use.page}.${c.use.method}` : "pack"]));
    expect(plan).toMatchObject({
      waitForLightning: "BasePage.waitForPageLoad",
      expectToast: "BasePage.waitForToast",
      selectPicklist: "BasePage.selectLightningCombobox",
      waitForFlowScreen: "BaseFlowScreen.waitForFlowScreen",
      flowNavigate: "BaseFlowScreen.clickNext",
      fillLookup: "pack",
      openRecord: "pack",
    });
    expect(helpersPath(profile)).toBe("src/support/lightning.ts");
    expect(helpersPath({ pages: [] })).toBe("tests/support/lightning.ts");
  });

  it("renders rules, the locator order and a helper table for the generate step", () => {
    const text = renderPack(profile);
    expect(text).toContain("## Salesforce Lightning rules");
    expect(text).toContain("getByRole, getByLabel, getByText");
    expect(text.indexOf("css")).toBeGreaterThan(text.indexOf("getByAltText"));
    expect(text).toContain("`BasePage.waitForPageLoad` (src/pages/base/base-page.ts), the repo's own");
    expect(text).toContain("`openRecord(page, objectApiName, recordId, mode?, { timeout? })` from src/support/lightning.ts");
    expect(renderPack({ ...profile, pages: profile.pages.map((p) => ({ ...p, methods: [...p.methods, "fillLookup", "openRecord", "openObject", "dismissToasts", "modal", "relatedList", "fieldValue"] })) })).not.toContain("is added to the repo");
  });
});

// The helpers on a real browser, against a stand-in page built the way Lightning builds its own: shadow roots, late spinners.
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

const APP = `<!doctype html><title>Acme | Account | Salesforce</title>
<div id="busy"><lightning-spinner role="status" style="display:block">Loading</lightning-spinner></div>
<sf-picklist></sf-picklist>
<sf-lookup></sf-lookup>
<div id="toasts"></div>
<article><h2>Contacts</h2><table><tr><td>Ann</td></tr></table></article>
<article><h2>Opportunities</h2><table><tr><td>Big deal</td></tr></table></article>
<records-record-layout-item><span>Phone</span><div class="slds-form-element__control">555-0100</div></records-record-layout-item>
<div role="dialog" aria-label="New Account" style="display:none" id="old"><p>hidden</p></div>
<div role="dialog" aria-label="Edit Account"><button>Save</button></div>
<button id="save">Save</button>
<script>
  // A spinner, gone, then back for a moment: Lightning's double spin.
  setTimeout(() => { busy.innerHTML = ""; setTimeout(() => { busy.innerHTML = '<div class="slds-spinner_container" style="width:20px;height:20px"></div>'; setTimeout(() => (busy.innerHTML = ""), 300); }, 100); }, 400);
  window.picked = ""; window.looked = "";
  customElements.define("sf-picklist", class extends HTMLElement { constructor() { super(); const r = this.attachShadow({ mode: "open" });
    r.innerHTML = '<label id="l">Stage</label><button role="combobox" aria-labelledby="l" aria-expanded="false">--None--</button><div role="listbox" hidden><div role="option">Closed Won</div><div role="option">Closed</div></div>';
    const box = r.querySelector("[role=listbox]");
    r.querySelector("button").onclick = () => (box.hidden = false);
    r.querySelectorAll("[role=option]").forEach((o) => (o.onclick = () => { window.picked = o.textContent; box.hidden = true; }));
  } });
  customElements.define("sf-lookup", class extends HTMLElement { constructor() { super(); const r = this.attachShadow({ mode: "open" });
    r.innerHTML = '<input role="combobox" aria-label="Account Name"><div role="listbox"></div>';
    const list = r.querySelector("[role=listbox]");
    r.querySelector("input").oninput = (e) => { const v = e.target.value; setTimeout(() => {
      list.innerHTML = ["Acme Corp", "Acme Ltd", "Globex"].filter((n) => n.includes(v)).map((n) => '<div role="option">' + n + "</div>").join("");
      list.querySelectorAll("[role=option]").forEach((o) => (o.onclick = () => (window.looked = o.textContent)));
    }, 300); };
  } });
  save.onclick = () => setTimeout(() => {
    const t = document.createElement("div"); t.className = "forceToastMessage"; t.setAttribute("role", "alert");
    t.innerHTML = 'Account "Acme" was created. <button aria-label="Close">x</button>';
    t.querySelector("button").onclick = () => t.remove();
    toasts.append(t);
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
  });
  afterAll(async () => {
    await browser?.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("type-checks against Playwright's own types", async () => {
    const tsc = join(process.cwd(), "node_modules", "typescript", "bin", "tsc");
    const config = {
      compilerOptions: { strict: true, noEmit: true, target: "ES2020", module: "commonjs", moduleResolution: "node", skipLibCheck: true, types: [], lib: ["ES2020", "DOM"], baseUrl: ".", paths: { "@playwright/test": [join(playwrightFolder!, "playwright", "test.d.ts")] } },
      files: ["lightning.ts"],
    };
    await writeFile(join(dir, "tsconfig.json"), JSON.stringify(config));
    await expect(promisify(execFile)(process.execPath, [tsc, "-p", join(dir, "tsconfig.json")])).resolves.toBeDefined();
  }, 60_000);

  it("opens a record by URL, waits out a double spinner, and reads the page", async () => {
    const t0 = Date.now();
    await h.openRecord!(page, "Account", "001000000000001AAA");
    expect(Date.now() - t0).toBeGreaterThanOrEqual(700);
    expect(page.url()).toBe("https://acme--uat.sandbox.lightning.force.com/lightning/r/Account/001000000000001AAA/view");
    expect(await page.locator("lightning-spinner, .slds-spinner_container").count()).toBe(0);
    expect(await h.relatedList!(page, "Opportunities").innerText()).toContain("Big deal");
    expect(await h.fieldValue!(page, "Phone").innerText()).toBe("555-0100");
    expect(await h.modal!(page).getAttribute("aria-label")).toBe("Edit Account");
    await expect(h.openRecord!(page, "Account", "not-an-id")).rejects.toThrow("not a record id");
    await expect(h.openObject!(page, "Account; drop")).rejects.toThrow();
  }, 30_000);

  it("picks a picklist value and a lookup result inside shadow roots", async () => {
    await h.selectPicklist!(page, "Stage", "Closed");
    expect(await page.evaluate(() => (globalThis as unknown as { picked: string }).picked)).toBe("Closed");
    await h.fillLookup!(page, "Account Name", "Acme", "Acme Ltd");
    expect(await page.evaluate(() => (globalThis as unknown as { looked: string }).looked)).toBe("Acme Ltd");
  }, 30_000);

  it("waits for a toast's text and closes it", async () => {
    await page.locator("#save").click();
    expect(await h.expectToast!(page, "was created")).toBe('Account "Acme" was created. x');
    await h.dismissToasts!(page);
    expect(await page.locator(".forceToastMessage").count()).toBe(0);
    await expect(h.expectToast!(page, "never", { timeout: 300 })).rejects.toThrow();
  }, 30_000);
});
