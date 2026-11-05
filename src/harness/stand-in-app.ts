import { createServer, type Server } from "node:http";
import type { Seed } from "./cases.js";

/**
 * The stand-in app (S2-10): a few Lightning-like pages served on this
 * machine, so the explorer can be checked in CI without Salesforce. Its
 * records hold the case's seeded personal data in the places a real org
 * shows it: list view cells, a record page's name heading and title, detail
 * fields outside any table, a related person in a sentence, a toast that
 * echoes what was typed. Components render in shadow DOM and saves show a
 * spinner first, as Lightning's do.
 *
 * It holds no state on the server: each page builds itself from the seeds.
 *
 * With `defect`, it carries a seeded product bug (S2-10): Submit for Approval
 * says the request was submitted, but its status turns to "Rejected". A
 * generated test that checks the status must fail, and the run must report a
 * defect, never change the test to pass.
 */

export interface StandInOptions {
  /** The seeded product bug: a submitted request shows as Rejected. */
  defect?: boolean;
}

export interface StandInApp {
  /** http://127.0.0.1:<port> */
  url: string;
  /** Where a case starts: the list view. */
  start: string;
  close(): Promise<void>;
}

export interface StandInRecord {
  id: string;
  name: string;
  fields: Array<{ label: string; value: string }>;
  /** Another person, named in a sentence on the page. */
  contact?: string;
}

const OBJECT = "Approval_Request__c";
export const STAND_IN_START = `/lightning/o/${OBJECT}/list`;

/** One record per seeded name. The first, which the tour opens, shows every other seed in its details. */
export function standInRecords(seeds: readonly Seed[]): StandInRecord[] {
  const names = seeds.filter((s) => s.kind === "name").map((s) => s.value);
  const people = names.length ? names : ["Request owner"];
  const rest = seeds.filter((s) => s.kind !== "name");
  const label: Record<Seed["kind"], string> = { name: "Name", email: "Email", phone: "Phone", iban: "Bank account", card: "Card", "national-id": "National ID", address: "Address", ip: "Last login from" };
  return people.map((name, i) => ({
    // Salesforce ids are 18 characters; these are made up.
    id: `a0B5g0000${String(i + 1).padStart(6, "0")}AAA`,
    name,
    fields: [{ label: "Status", value: "Draft" }, ...(i === 0 ? rest.map((s) => ({ label: label[s.kind], value: s.value })) : [])],
    ...(people.length > 1 ? { contact: people[(i + 1) % people.length]! } : {}),
  }));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Lightning-like base components: shadow DOM, as the explorer meets them on Salesforce. */
const COMPONENTS = `
customElements.define("lightning-textarea", class extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    const id = "f" + Math.random().toString(36).slice(2);
    root.innerHTML = '<label for="' + id + '">' + this.getAttribute("label") + '</label><textarea id="' + id + '"></textarea>';
  }
  get value() { return this.shadowRoot.querySelector("textarea").value; }
});
customElements.define("lightning-formatted-text", class extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }).textContent = this.getAttribute("value"); }
});
function toast(text) {
  const t = document.createElement("div");
  t.className = "slds-notify_toast";
  t.setAttribute("role", "status");
  t.textContent = text;
  document.getElementById("toasts").replaceChildren(t);
}
function busy(ms, then) {
  const s = document.createElement("div");
  s.className = "slds-spinner_container";
  s.innerHTML = '<div role="status" class="slds-spinner" aria-busy="true"><span class="slds-assistive-text">Loading</span></div>';
  document.body.appendChild(s);
  setTimeout(() => { s.remove(); then(); }, ms);
}
`;

function page(title: string, body: string, script = ""): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)} | Salesforce</title></head><body>
<header><nav aria-label="Global"><a href="${STAND_IN_START}">Approval Requests</a></nav></header>
<main>${body}</main><div id="toasts" aria-live="polite"></div>
<script>${COMPONENTS}${script}</script></body></html>`;
}

function listView(records: readonly StandInRecord[]): string {
  const cols = ["Email", "Phone", "Status"];
  const cell = (r: StandInRecord, label: string) => esc(r.fields.find((f) => f.label === label)?.value ?? "");
  return page(
    "Approval Requests",
    `<h1>Approval Requests</h1><button type="button" onclick="location.href='/lightning/o/${OBJECT}/new'">New</button>
<table><thead><tr><th scope="col">Requested by</th>${cols.map((c) => `<th scope="col">${c}</th>`).join("")}</tr></thead><tbody>
${records.map((r) => `<tr><th scope="row"><a href="/lightning/r/${OBJECT}/${r.id}/view">${esc(r.name)}</a></th>${cols.map((c) => `<td>${cell(r, c)}</td>`).join("")}</tr>`).join("\n")}
</tbody></table>`,
  );
}

function recordPage(r: StandInRecord, defect: boolean): string {
  const fields = r.fields
    .map((f) => `<div class="slds-form-element"><span class="slds-form-element__label">${esc(f.label)}</span> <lightning-formatted-text${f.label === "Status" ? ' id="status"' : ""} value="${esc(f.value)}"></lightning-formatted-text></div>`)
    .join("\n");
  return page(
    r.name,
    `<div class="slds-page-header"><p>Approval Request</p><h1>${esc(r.name)}</h1></div>
<section aria-label="Details">${fields}</section>
${r.contact ? `<p>Backup approver: ${esc(r.contact)}</p>` : ""}
<lightning-textarea label="Comments"></lightning-textarea>
<button type="button" id="save">Save</button> <button type="button" id="submit">Submit for Approval</button>`,
    `
document.getElementById("save").addEventListener("click", () => {
  const text = document.querySelector("lightning-textarea").value;
  busy(400, () => toast('Request "' + text + '" was saved.'));
});
document.getElementById("submit").addEventListener("click", () => busy(400, () => {
  document.getElementById("status").shadowRoot.textContent = ${JSON.stringify(defect ? "Rejected" : "Submitted")};
  toast("The request was submitted for approval.");
}));`,
  );
}

function newForm(): string {
  return page(
    "New Approval Request",
    `<section role="dialog" aria-label="New Approval Request"><h2>New Approval Request</h2>
<lightning-textarea label="Reason"></lightning-textarea>
<button type="button" id="save">Save</button></section>`,
    `
document.getElementById("save").addEventListener("click", () => busy(400, () => toast('Request "' + document.querySelector("lightning-textarea").value + '" was created.')));`,
  );
}

/** Starts the app on a free port of 127.0.0.1. */
export async function startStandInApp(seeds: readonly Seed[], options: StandInOptions = {}): Promise<StandInApp> {
  const records = standInRecords(seeds);
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://stand-in").pathname;
    const record = /^\/lightning\/r\/[A-Za-z_]+\/([A-Za-z0-9]+)\/view$/.exec(path);
    const r = record ? records.find((x) => x.id === record[1]) : undefined;
    const html = path === STAND_IN_START ? listView(records) : path === `/lightning/o/${OBJECT}/new` ? newForm() : r ? recordPage(r, options.defect === true) : undefined;
    res.writeHead(html ? 200 : 404, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(html ?? page("Page not found", "<h1>Page not found</h1>"));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("the stand-in app didn't get a port");
  return {
    url: `http://127.0.0.1:${address.port}`,
    start: STAND_IN_START,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        // A browser left open keeps its connections: never wait on them.
        server.closeAllConnections();
      }),
  };
}
