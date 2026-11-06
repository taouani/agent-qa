import type { Node } from "@babel/types";
import { literalString, parseCode, walkAst } from "./profile-scan.js";

/**
 * What generated test code must not do (S2-6), found in its syntax tree, so
 * comments and identifiers that merely mention a rule don't count and
 * spellings such as page["waitForTimeout"] or a setTimeout promise do.
 */

export interface CodeFinding {
  line: number;
  rule: "fixed-wait" | "pause" | "focus-or-skip" | "xpath" | "generated-id" | "record-id" | "org-url" | "system-access" | "hidden-check";
  message: string;
}

export interface CodeScan {
  /** False when the text isn't code at all. */
  parsed: boolean;
  /** Syntax errors the parser recovered from. */
  syntaxErrors: number;
  findings: CodeFinding[];
  /** test(...) and test.describe(...) calls with a literal title, by line range. */
  tests: Array<{ title: string; start: number; end: number }>;
  /** The lines where a test.step(...) call starts. */
  stepLines: number[];
  /**
   * Every check, as `expect[.soft|.poll][.not].matcher(expected)`: what a fix
   * may never remove or change (S2-8). The element checked (expect's own
   * argument) and a timeout option are left out, so a selector or a wait can change.
   */
  checks: string[];
  /** Every check whole, with the element it checks (`expect(page.getByRole('status')).toHaveText('Submitted')`), timeout options left out: what a review fix may never change. */
  checkSources: string[];
  /** Names read inside the expected values of checks (testData.expectedStatus → expectedStatus): data a fix can't change. */
  checkedNames: string[];
  /** Branches, returns, loops and try/catch: a fix adds none, so no check is skipped on some path. */
  branches: number;
}

const MESSAGES: Record<CodeFinding["rule"], string> = {
  "fixed-wait": "uses a fixed wait (waitForTimeout or setTimeout): wait for Lightning or for the element instead",
  pause: "leaves page.pause() in",
  "focus-or-skip": "uses .only, .skip or .fixme (a conditional test.skip too), which would run some tests and not others: leave the test in and say in the notes what it needs",
  xpath: "uses XPath, which can't reach into Lightning's shadow roots: use getByRole or getByLabel",
  "generated-id": "selects by a generated Lightning id (data-aura-rendered-by, input-123, globalId), which changes on every load",
  "record-id": "hard-codes a record id: create the record in the test or take it from the test data",
  "org-url": "hard-codes an org URL: use the baseURL from the Playwright config",
  "system-access": "reads files, the environment, the sign-in or other programs (fs, process, require, module, eval, attach, cookies, storageState, file: URLs): test code uses the repo's fixtures and config only",
  "hidden-check": "changes how checks work (expect.extend, expect.configure, a local expect, a .catch or .then on a check, Promise.allSettled): a failed check must fail the test",
};

const memberName = (n: Node): string | undefined => {
  if (n.type !== "MemberExpression" && n.type !== "OptionalMemberExpression") return undefined;
  if (!n.computed && n.property.type === "Identifier") return n.property.name;
  return literalString(n.property as Node);
};

const XPATH = /^\s*(?:xpath=|\(?\/\/|\.\.\s*$)/;
/** Methods whose string arguments are selectors. */
const SELECTOR_METHODS = new Set(["locator", "frameLocator", "$", "$$", "$eval", "$$eval", "waitForSelector", "click", "dblclick", "fill", "type", "press", "check", "uncheck", "hover", "focus", "tap", "selectOption", "setInputFiles", "textContent", "innerText", "innerHTML", "inputValue", "getAttribute", "isVisible", "isHidden", "isEnabled", "isDisabled", "isChecked", "isEditable", "dispatchEvent", "dragAndDrop", "querySelector", "querySelectorAll", "evaluateHandle"]);
const GLOBALS = new Set(["globalThis", "window", "self", "global"]);
const GENERATED_ID = /data-aura-rendered-by|(?:^|[#"'=\s[])input-\d+\b|\bglobalId\b/;
const RECORD_URL = /\/lightning\/r\/(?:\w+\/)?[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?(?:[/?#]|$)/;
/** A bare record id: 15 or 18 letters and digits, a key prefix, a digit in the 4th place (the pod). */
const RECORD_ID = /^(?=[^]*\d[^]*\d)(?=[^]*[A-Za-z])[a-zA-Z0-9]{3}\d[a-zA-Z0-9]{11}(?:[a-zA-Z0-9]{3})?$/;
const ORG_URL = /https?:\/\/[^/'"\s]*\.(?:salesforce|force|site|salesforce-sites|cloudforce|visualforce)\.com/i;
const FOCUS = new Set(["only", "skip", "fixme", "fail", "slow"]);
const TEST_OBJECTS = new Set(["test", "describe", "it", "context", "testInfo", "info"]);
/** Modules test code has no use for: reading files, starting programs, opening sockets. */
const SYSTEM_MODULES = /^(?:node:)?(?:fs|fs\/promises|child_process|worker_threads|vm|net|tls|http|https|http2|dgram|cluster|os|process|inspector|module)$/;
const BRANCHES = new Set(["IfStatement", "ConditionalExpression", "LogicalExpression", "TryStatement", "CatchClause", "ReturnStatement", "SwitchStatement", "ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement", "DoWhileStatement", "ThrowStatement", "BreakStatement", "ContinueStatement", "OptionalCallExpression", "OptionalMemberExpression"]);

/** The identifier a member or call chain starts from: test in test.describe.serial.skip, testInfo in testInfo.skip(), test in test.info().skip(). */
function chainRoot(n: Node): Node {
  let x = n;
  for (;;) {
    if (x.type === "MemberExpression" || x.type === "OptionalMemberExpression") x = x.object as Node;
    else if (x.type === "CallExpression" || x.type === "OptionalCallExpression") x = x.callee as Node;
    else if (x.type === "AwaitExpression") x = x.argument as Node;
    else if (x.type === "TSNonNullExpression" || x.type === "ParenthesizedExpression") x = x.expression as Node;
    else return x;
  }
}

export function scanGeneratedCode(text: string, file: string): CodeScan {
  const ast = parseCode(text, file);
  if (!ast) return { parsed: false, syntaxErrors: 0, findings: [], tests: [], stepLines: [], checks: [], checkSources: [], checkedNames: [], branches: 0 };
  const parents = new Map<Node, Node>();
  walkAst(ast, (n) => {
    for (const v of Object.values(n)) {
      if (Array.isArray(v)) for (const c of v) if (c && typeof c === "object" && typeof (c as Node).type === "string") parents.set(c as Node, n);
      if (v && typeof v === "object" && !Array.isArray(v) && typeof (v as Node).type === "string") parents.set(v as Node, n);
    }
  });
  const findings: CodeFinding[] = [];
  const add = (n: Node, rule: CodeFinding["rule"]) => {
    const line = n.loc?.start.line ?? 0;
    if (!findings.some((f) => f.line === line && f.rule === rule)) findings.push({ line, rule, message: MESSAGES[rule] });
  };
  const tests: CodeScan["tests"] = [];
  const stepLines: number[] = [];
  const checks: string[] = [];
  const checkSources: string[] = [];
  const checkedNames = new Set<string>();
  let branches = 0;
  const source = (n: Node) => text.slice(n.start ?? 0, n.end ?? 0).replace(/\s+/g, " ").trim();
  const isTimeoutOption = (n: Node) => n.type === "ObjectExpression" && n.properties.length > 0 && n.properties.every((p) => p.type === "ObjectProperty" && ["timeout", "intervals"].includes(p.key.type === "Identifier" ? p.key.name : (literalString(p.key as Node) ?? "")));
  /** expect(x), expect.soft(x), expect.poll(fn): the call a matcher hangs off, and its kind. */
  const expectCall = (n: Node): string | undefined => {
    if (n.type !== "CallExpression" && n.type !== "OptionalCallExpression") return undefined;
    const c = n.callee as Node;
    if (c.type === "Identifier" && c.name === "expect") return "expect";
    if ((c.type === "MemberExpression" || c.type === "OptionalMemberExpression") && c.object.type === "Identifier" && c.object.name === "expect") {
      const m = memberName(c);
      if (m === "soft" || m === "poll") return `expect.${m}`;
    }
    return undefined;
  };
  const soleReturns = new Set<Node>();
  walkAst(ast, (n) => {
    if ((n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression" || n.type === "ClassMethod" || n.type === "ClassPrivateMethod" || n.type === "ObjectMethod") && n.body.type === "BlockStatement" && n.body.body.length === 1 && n.body.body[0]!.type === "ReturnStatement") {
      // Not when it hands back a function: a check inside one never runs.
      let fn = false;
      walkAst(n.body.body[0] as Node, (x) => {
        if (x.type === "ArrowFunctionExpression" || x.type === "FunctionExpression") fn = true;
      });
      if (!fn) soleReturns.add(n.body.body[0] as Node);
    }
  });
  const nameOf = (n: Node): string | undefined => (n.type === "Identifier" ? n.name : memberName(n));
  walkAst(ast, (n) => {
    // A function whose body is one return (a getter, `submit() { return …click(); }`) skips nothing.
    if (BRANCHES.has(n.type) && !(n.type === "ReturnStatement" && soleReturns.has(n))) branches++;
    // Reading files, the environment or other programs.
    if (n.type === "ImportDeclaration" && SYSTEM_MODULES.test(n.source.value)) add(n, "system-access");
    if (n.type === "Identifier" && ["process", "require", "eval", "Function"].includes(n.name)) {
      const parent = parents.get(n);
      const isKey = parent && (((parent.type === "MemberExpression" || parent.type === "OptionalMemberExpression") && parent.property === n && !parent.computed) || (parent.type === "ObjectProperty" && parent.key === n && !parent.computed));
      if (!isKey) add(n, "system-access");
    }
    if (n.type === "Import") add(n, "system-access");
    if (n.type === "Identifier" && n.name === "module") {
      const parent = parents.get(n);
      const isKey = parent && (((parent.type === "MemberExpression" || parent.type === "OptionalMemberExpression") && parent.property === n && !parent.computed) || (parent.type === "ObjectProperty" && parent.key === n && !parent.computed));
      if (!isKey) add(n, "system-access");
    }
    // A file: URL opens a local file in the browser.
    if ((n.type === "StringLiteral" && /^\s*file:/i.test(n.value)) || (n.type === "TemplateElement" && /^\s*file:/i.test(n.value.cooked ?? n.value.raw))) add(n, "system-access");
    if ((n.type === "MemberExpression" || n.type === "OptionalMemberExpression") && n.object.type === "MetaProperty") add(n, "system-access");
    // Checks that can't fail: a local expect, a changed expect.
    if ((n.type === "VariableDeclarator" || n.type === "FunctionDeclaration" || n.type === "ClassDeclaration") && n.id?.type === "Identifier" && n.id.name === "expect") add(n, "hidden-check");
    if ((n.type === "ArrowFunctionExpression" || n.type === "FunctionExpression" || n.type === "FunctionDeclaration" || n.type === "ObjectMethod" || n.type === "ClassMethod") && n.params.some((p) => p.type === "Identifier" && p.name === "expect")) add(n, "hidden-check");
    if (n.type === "MemberExpression" || n.type === "OptionalMemberExpression") {
      const name = memberName(n);
      if (n.object.type === "Identifier" && n.object.name === "expect" && (name === "extend" || name === "configure")) add(n, "hidden-check");
      if (n.object.type === "Identifier" && n.object.name === "Promise" && (name === "allSettled" || name === "any" || name === "race")) add(n, "hidden-check");
      // Attachments name files to read; cookies and the saved session hold the sign-in; globalThis.process and module reach the system.
      if (name === "attach" || name === "attachments" || name === "cookies" || name === "storageState" || name === "addCookies") add(n, "system-access");
      if ((name === "process" || name === "require" || name === "module" || name === "eval" || name === "Function") && n.object.type === "Identifier" && GLOBALS.has(n.object.name)) add(n, "system-access");
      // page.waitForTimeout(...), page['waitForTimeout'], page.waitForTimeout.bind(page)
      if (name === "waitForTimeout") add(n, "fixed-wait");
      // globalThis.setTimeout, not test.setTimeout (Playwright's per-test timeout)
      if (name === "setTimeout" && n.object.type === "Identifier" && GLOBALS.has(n.object.name)) add(n, "fixed-wait");
    }
    if ((n.type === "Identifier" && n.name === "setTimeout") || (n.type === "Identifier" && n.name === "waitForTimeout")) {
      // Only a reference, not a property key or a member name (those are handled above).
      const parent = parents.get(n);
      const isKey = parent && (((parent.type === "MemberExpression" || parent.type === "OptionalMemberExpression") && parent.property === n && !parent.computed) || (parent.type === "ObjectProperty" && parent.key === n && !parent.computed) || parent.type === "ObjectMethod" || parent.type === "ClassMethod");
      if (!isKey) add(n, "fixed-wait");
    }
    if (n.type === "CallExpression" || n.type === "OptionalCallExpression") {
      const callee = n.callee as Node;
      const name = nameOf(callee);
      if (name === "pause" && n.arguments.length === 0) add(n, "pause");
      const isMember = callee.type === "MemberExpression" || callee.type === "OptionalMemberExpression";
      const objName = isMember ? nameOf(callee.object as Node) : undefined;
      const root = isMember ? chainRoot(callee) : undefined;
      if (name && FOCUS.has(name) && ((objName && TEST_OBJECTS.has(objName)) || (root?.type === "Identifier" && TEST_OBJECTS.has(root.name)))) add(n, "focus-or-skip");
      // A matcher: expect(x).not.toHaveText('y'), and what is expected.
      if (isMember && name) {
        let base = callee.object as Node;
        let not = false;
        if ((base.type === "MemberExpression" || base.type === "OptionalMemberExpression") && memberName(base) === "not") {
          not = true;
          base = base.object as Node;
        }
        if ((base.type === "MemberExpression" || base.type === "OptionalMemberExpression") && (memberName(base) === "resolves" || memberName(base) === "rejects")) base = base.object as Node;
        const kind = expectCall(base);
        if (kind) {
          const args = n.arguments.filter((a) => !isTimeoutOption(a as Node)).map((a) => source(a as Node));
          checks.push(`${kind}${not ? ".not" : ""}.${name}(${args.join(", ")})`);
          checkSources.push(`${source(base)}${not ? ".not" : ""}.${name}(${args.join(", ")})`);
          for (const a of n.arguments) walkAst(a as Node, (x) => {
            if ((x.type === "MemberExpression" || x.type === "OptionalMemberExpression") && memberName(x)) checkedNames.add(memberName(x)!);
            if (x.type === "Identifier") checkedNames.add(x.name);
          });
        }
      }
      // expect(...).toBeVisible().catch(...): a check whose failure is swallowed.
      if (isMember && (name === "catch" || name === "then" || name === "finally")) {
        let hasCheck = false;
        walkAst(callee.object as Node, (x) => {
          if (expectCall(x)) hasCheck = true;
        });
        if (hasCheck) add(n, "hidden-check");
      }
      if (name && SELECTOR_METHODS.has(name)) {
        for (const arg of n.arguments) {
          const s = literalString(arg as Node);
          if (s !== undefined && XPATH.test(s)) add(arg as Node, "xpath");
        }
      }
      const title = n.arguments[0] ? literalString(n.arguments[0] as Node) : undefined;
      const start = n.loc?.start.line ?? 0;
      const end = n.loc?.end.line ?? 0;
      if (title !== undefined && ((callee.type === "Identifier" && callee.name === "test") || (objName === "test" && name === "describe"))) tests.push({ title, start, end });
      if (objName === "test" && name === "step") stepLines.push(start);
    }
    // const { waitForTimeout: wait } = page
    if (n.type === "ObjectPattern") {
      for (const p of n.properties) if (p.type === "ObjectProperty" && ((p.key.type === "Identifier" && p.key.name === "waitForTimeout") || literalString(p.key as Node) === "waitForTimeout")) add(p as Node, "fixed-wait");
    }
    if (n.type === "StringLiteral" || n.type === "TemplateLiteral") {
      const s = n.type === "StringLiteral" ? n.value : n.quasis.map((q) => q.value.cooked ?? q.value.raw).join("${}");
      if (GENERATED_ID.test(s)) add(n, "generated-id");
      if (RECORD_URL.test(s) || RECORD_ID.test(s.trim())) add(n, "record-id");
      if (ORG_URL.test(s)) add(n, "org-url");
    }
  });
  const errors = (ast as unknown as { errors?: unknown[] }).errors ?? [];
  return { parsed: true, syntaxErrors: errors.length, findings: findings.sort((a, b) => a.line - b.line), tests, stepLines, checks: checks.sort(), checkSources: checkSources.sort(), checkedNames: [...checkedNames].sort(), branches };
}

/** Calls that pick an element: their arguments are what a selector fix changes. */
const LOCATOR_METHODS = new Set(["getByRole", "getByLabel", "getByText", "getByTestId", "getByPlaceholder", "getByTitle", "getByAltText", "locator", "frameLocator", "filter", "nth", "first", "last", "and", "or", "contentFrame"]);
/** Waits a timing fix may add: they check that an element or the page is ready, never what it says. */
const WAIT_MATCHERS = new Set(["toBeVisible", "toBeHidden", "toBeEnabled", "toBeAttached", "toBeEditable", "toBeDisabled"]);
const SKIP_KEYS = new Set(["loc", "start", "end", "leadingComments", "trailingComments", "innerComments", "extra", "range", "errors", "comments", "tokens"]);

export interface FixSkeleton {
  /** The code as a token list, with every element picked (a locator chain) as LOC and timeout options left out. */
  tokens: Array<{ t: string; wait: boolean }>;
  /** The variables the locators read (not property names or object keys). */
  locatorNames: string[];
  /** Every variable the file reads anywhere: a locator may read only these. */
  names: string[];
  /** Code inside a locator or a wait that isn't a plain value or a locator (a call, a function, an assignment), and checks that check nothing: their source text. */
  locatorCode: string[];
}

/** Inside a locator only values and locators: anything that runs code is listed. */
const RUNS_CODE = new Set(["FunctionExpression", "ArrowFunctionExpression", "AssignmentExpression", "UpdateExpression", "AwaitExpression", "NewExpression", "SequenceExpression", "YieldExpression", "ClassExpression", "TaggedTemplateExpression", "ImportExpression", "ConditionalExpression", "LogicalExpression"]);

/** The variables an expression reads: member property names and object keys are not variables. */
function readNames(n: Node, into: Set<string>): void {
  if (n.type === "Identifier") {
    into.add(n.name);
    return;
  }
  if ((n.type === "MemberExpression" || n.type === "OptionalMemberExpression") && !n.computed) return readNames(n.object as Node, into);
  if ((n.type === "ObjectProperty" || n.type === "ObjectMethod") && !n.computed && n.type === "ObjectProperty") return readNames(n.value as Node, into);
  const rec = n as unknown as Record<string, unknown>;
  for (const k of Object.keys(rec)) {
    if (SKIP_KEYS.has(k)) continue;
    const v = rec[k];
    if (Array.isArray(v)) for (const c of v) if (c && typeof c === "object" && typeof (c as Node).type === "string") readNames(c as Node, into);
    if (v && typeof v === "object" && !Array.isArray(v) && typeof (v as Node).type === "string") readNames(v as Node, into);
  }
}

/** a.b, a["b"], this.b: the path an expression reads, or undefined when it isn't one. */
function pathOfExpr (n: Node): string | undefined {
  if (n.type === "Identifier") return n.name;
  if (n.type === "ThisExpression") return "this";
  if (n.type === "TSNonNullExpression" || n.type === "TSAsExpression") return pathOfExpr(n.expression as Node);
  if (n.type === "MemberExpression" || n.type === "OptionalMemberExpression") {
    const o = pathOfExpr(n.object as Node);
    const k = !n.computed && n.property.type === "Identifier" ? n.property.name : literalString(n.property as Node);
    return o !== undefined && k !== undefined ? `${o}.${k}` : undefined;
  }
  return undefined;
}

const isLocatorCallNode = (n: Node) => (n.type === "CallExpression" || n.type === "OptionalCallExpression") && LOCATOR_METHODS.has(memberName(n.callee as Node) ?? (n.callee.type === "Identifier" ? n.callee.name : ""));
const isTimeoutOptionNode = (n: Node) => n.type === "ObjectExpression" && n.properties.length > 0 && n.properties.every((p) => p.type === "ObjectProperty" && ["timeout", "intervals"].includes(p.key.type === "Identifier" ? p.key.name : (literalString(p.key as Node) ?? "")));

/** A locator's matchers that check the element itself (toHaveCount: how many there are). */
const PRESENCE_MATCHERS = new Set(["toBeVisible", "toBeHidden", "toBeAttached", "toBeEnabled", "toBeDisabled", "toBeChecked", "toBeEditable", "toBeEmpty", "toBeFocused", "toBeInViewport", "toHaveCount"]);
/** What a test does to an element: a wait before one of these on the same element is a wait, not a check. */
const ACTIONS = "click|dblclick|fill|press|pressSequentially|type|check|uncheck|setChecked|selectOption|setInputFiles|hover|focus|tap|dragTo|clear|selectText|scrollIntoViewIfNeeded|dispatchEvent|blur";

/**
 * The subject of a check whose element is what it checks: expect(x).toBeVisible()
 * (any matcher without an expected value), expect(x).toHaveCount(n), and the
 * same with .not or expect.soft.
 */
function presenceSubject(x: Node): Node | undefined {
  if (x.type !== "CallExpression" || (x.callee.type !== "MemberExpression" && x.callee.type !== "OptionalMemberExpression")) return undefined;
  const matcher = memberName(x.callee as Node) ?? "";
  if (!PRESENCE_MATCHERS.has(matcher)) return undefined;
  if (matcher !== "toHaveCount" && (x.arguments as Node[]).some((a) => !isTimeoutOptionNode(a))) return undefined;
  let base = x.callee.object as Node;
  if ((base.type === "MemberExpression" || base.type === "OptionalMemberExpression") && memberName(base) === "not") base = base.object as Node;
  if (base.type !== "CallExpression" || !base.arguments[0]) return undefined;
  const fn = base.callee as Node;
  const isExpect = (fn.type === "Identifier" && fn.name === "expect") || ((fn.type === "MemberExpression" || fn.type === "OptionalMemberExpression") && (fn.object as Node).type === "Identifier" && (fn.object as { name: string }).name === "expect" && memberName(fn) === "soft");
  return isExpect ? (base.arguments[0] as Node) : undefined;
}

/**
 * The fields a file checks by presence on another object, such as toast in
 * expect(pages.loginPage.toast).toBeVisible(): a fix may not change the
 * locator a page object keeps in that field (fixSkeleton's pinnedFields).
 */
export function presenceCheckedFields(text: string, file: string): string[] {
  const ast = parseCode(text, file);
  if (!ast) return [];
  const out = new Set<string>();
  walkAst(ast, (x) => {
    const subject = presenceSubject(x);
    const path = subject ? pathOfExpr(subject) : undefined;
    if (path?.includes(".")) out.add(path.slice(path.lastIndexOf(".") + 1));
  });
  return [...out].sort();
}

/**
 * The shape of a file for comparing a fix with the code before it (S2-8): a
 * fix may change which element is picked (LOC) and add waits, and nothing
 * else. Every other value, call, branch and check stays as it was, so an
 * expected value passed to a page object, a removed check or a new return is
 * a different skeleton.
 */
export function fixSkeleton(text: string, file: string, pinnedFields: ReadonlySet<string> = new Set()): FixSkeleton | undefined {
  const ast = parseCode(text, file);
  if (!ast || ((ast as unknown as { errors?: unknown[] }).errors ?? []).length) return undefined;
  const tokens: FixSkeleton["tokens"] = [];
  const locatorNames = new Set<string>();
  const locatorCode = new Set<string>();
  const isLocatorCall = isLocatorCallNode;
  const isTimeoutOption = isTimeoutOptionNode;
  const pathOf = pathOfExpr;
  const flat = (n: Node): string => {
    const out: string[] = [];
    emit(n, (t) => out.push(t.t));
    return out.join(" ");
  };
  /** An added statement that only waits: await expect(LOC).toBeVisible(), await LOC.waitFor(), await page.waitForLoadState(), await waitForX(page). */
  const isWait = (s: Node): boolean => {
    if (s.type !== "ExpressionStatement" || s.expression.type !== "AwaitExpression") return false;
    const c = s.expression.argument as Node;
    if (c.type !== "CallExpression") return false;
    const name = memberName(c.callee as Node) ?? (c.callee.type === "Identifier" ? c.callee.name : undefined);
    if (!name) return false;
    if (c.callee.type === "Identifier") return /^waitFor[A-Z]/.test(name);
    const obj = (c.callee as { object: Node }).object;
    if (name === "waitFor") return isLocatorCall(obj);
    if (name === "waitForLoadState" || name === "waitForURL") return true;
    if (WAIT_MATCHERS.has(name)) {
      let base = obj;
      if ((base.type === "MemberExpression" || base.type === "OptionalMemberExpression") && memberName(base) === "not") base = base.object as Node;
      return base.type === "CallExpression" && base.callee.type === "Identifier" && base.callee.name === "expect" && base.arguments.length === 1 && isLocatorCall(base.arguments[0] as Node);
    }
    return false;
  };
  const src = (x: Node) => (typeof x.start === "number" && typeof x.end === "number" ? text.slice(x.start, x.end) : "");
  /** Code in a locator's or a wait's arguments: anything but plain values and locators runs code. */
  const plainOnly = (n: Node) => {
    readNames(n, locatorNames);
    walkAst(n, (x) => {
      const call = (x.type === "CallExpression" || x.type === "OptionalCallExpression") && !isLocatorCall(x);
      if (call || RUNS_CODE.has(x.type)) locatorCode.add(src(x));
    });
  };
  /** A wait's own arguments (and a waiting matcher's): they are plain values too. */
  const waitArgs = (s: Node) => {
    const c = (s as { expression: { argument: Node } }).expression.argument as Node & { arguments: Node[] };
    for (const a of c.arguments) plainOnly(a);
  };
  // Locators held in a variable or a field: const label = page.getByText(s); this.label = page.getByText(s).
  const held = new Map<string, Node>();
  /** Every locator held under a name: a name declared twice (in two tests) pins both. */
  const heldAll = new Map<string, Node[]>();
  walkAst(ast, (x) => {
    const keep = (name: string | undefined, init: Node | null | undefined) => {
      if (!name || !init || !isLocatorCall(init)) return;
      held.set(name, init);
      heldAll.set(name, [...(heldAll.get(name) ?? []), init]);
    };
    if (x.type === "VariableDeclarator" && x.id.type === "Identifier") keep(x.id.name, x.init as Node | null);
    if (x.type === "AssignmentExpression") keep(pathOf(x.left as Node), x.right as Node);
    if ((x.type === "ClassProperty" || x.type === "ClassPrivateProperty") && x.key.type === "Identifier") keep(`this.${x.key.name}`, x.value as Node | null);
  });
  /** expect(locator).toHaveText(value) with the locator picking by that same value checks nothing. */
  const checksItself = (n: Node) => {
    if (n.type !== "CallExpression" || (n.callee.type !== "MemberExpression" && n.callee.type !== "OptionalMemberExpression")) return;
    let base = n.callee.object as Node;
    if ((base.type === "MemberExpression" || base.type === "OptionalMemberExpression") && memberName(base) === "not") base = base.object as Node;
    if (base.type !== "CallExpression" || base.callee.type !== "Identifier" || base.callee.name !== "expect" || !base.arguments[0]) return;
    const subject = base.arguments[0] as Node;
    const picked = isLocatorCall(subject) ? subject : held.get(pathOf(subject) ?? "");
    if (!picked) return;
    const paths = new Set<string>();
    const texts: string[] = [];
    const patterns: RegExp[] = [];
    walkAst(picked, (x) => {
      const p = pathOf(x);
      if (p !== undefined) paths.add(p);
      const t = literalString(x);
      if (t !== undefined && t.trim()) texts.push(t.trim());
      if (x.type === "RegExpLiteral") {
        try {
          patterns.push(new RegExp(x.pattern, x.flags.replace(/[gy]/g, "")));
        } catch {
          // not a pattern JavaScript runs
        }
      }
    });
    for (const a of n.arguments as Node[]) {
      if (isTimeoutOption(a)) continue;
      const p = pathOf(a);
      const v = literalString(a)?.trim();
      const same = (p !== undefined && paths.has(p)) || (v !== undefined && v !== "" && (texts.some((t) => v.includes(t) || t.includes(v)) || patterns.some((r) => r.test(v))));
      if (same) locatorCode.add(`${src(n)} (the element is picked by the value it is checked against)`);
    }
  };
  // expect(locator).toBeVisible(): with no expected value, the element picked is what the check checks, so its locator stays
  // exactly as it was: every text, variable and option. A wait for an element the next statements act on isn't such a check.
  const norm = (x: Node) => src(x).replace(/\s+/g, " ");
  const waitsForAction = new Set<Node>();
  walkAst(ast, (x) => {
    for (const k of ["body", "consequent"]) {
      const body = (x as unknown as Record<string, unknown>)[k];
      if (!Array.isArray(body)) continue;
      body.forEach((st: Node, i: number) => {
        if (!st || typeof st !== "object" || !isWait(st)) return;
        const call = (st as { expression: { argument: Node } }).expression.argument;
        const subject = presenceSubject(call);
        if (!subject) return;
        const later = (body.slice(i + 1) as Node[]).map(norm).join("\n");
        const path = pathOf(subject);
        // Acted on: a later statement calls an action on that same element (an inline copy of the locator, or the variable holding it).
        const element = path !== undefined && !isLocatorCall(subject) ? `(^|[^\\w$.])${path.replace(/[.$]/g, "\\$&")}` : norm(subject).replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
        const used = new RegExp(`${element}\\s*\\.\\s*(?:${ACTIONS})\\s*\\(`).test(later);
        if (used) waitsForAction.add(call);
      });
    }
  });
  const checkedByPresence = new Set<Node>();
  walkAst(ast, (x) => {
    const subject = presenceSubject(x);
    if (!subject || waitsForAction.has(x)) return;
    if (isLocatorCall(subject)) return void checkedByPresence.add(subject);
    for (const n of heldAll.get(pathOf(subject) ?? "") ?? []) checkedByPresence.add(n);
  });
  // A page object's field another file checks by presence.
  for (const [name, nodes] of heldAll) if (name.startsWith("this.") && pinnedFields.has(name.slice(5))) for (const n of nodes) checkedByPresence.add(n);
  function emit(n: Node, push: (t: { t: string; wait: boolean }) => void): void {
    checksItself(n);
    if (isLocatorCall(n)) {
      plainOnly(n);
      push({ t: checkedByPresence.has(n) ? `LOC ${norm(n)}` : "LOC", wait: false });
      return;
    }
    const rec = n as unknown as Record<string, unknown>;
    const scalars = Object.keys(rec)
      // Scalars, and plain values such as a template's text ({ raw, cooked }).
      .filter((k) => !SKIP_KEYS.has(k) && k !== "type" && (rec[k] === null || typeof rec[k] !== "object" || (!Array.isArray(rec[k]) && typeof (rec[k] as { type?: unknown }).type !== "string")))
      .sort()
      .map((k) => `${k}=${JSON.stringify(rec[k])}`);
    push({ t: `(${n.type}${scalars.length ? ` ${scalars.join(",")}` : ""}`, wait: false });
    for (const k of Object.keys(rec).sort()) {
      if (SKIP_KEYS.has(k)) continue;
      const v = rec[k];
      if (Array.isArray(v)) {
        push({ t: `[${k}`, wait: false });
        for (const c of v) {
          if (!c || typeof c !== "object" || typeof (c as Node).type !== "string") continue;
          const child = c as Node;
          if ((n.type === "CallExpression" || n.type === "OptionalCallExpression") && k === "arguments" && isTimeoutOption(child)) continue;
          // A statement that only waits is one token, which a fix may add.
          if ((k === "body" || k === "consequent") && isWait(child)) {
            waitArgs(child);
            push({ t: `WAIT ${flat(child)}`, wait: true });
          }
          else emit(child, push);
        }
        push({ t: "]", wait: false });
      } else if (v && typeof v === "object" && typeof (v as Node).type === "string") {
        push({ t: `<${k}`, wait: false });
        emit(v as Node, push);
      }
    }
    push({ t: ")", wait: false });
  }
  emit(ast, (t) => tokens.push(t));
  const names = new Set<string>();
  readNames(ast, names);
  return { tokens, locatorNames: [...locatorNames].sort(), names: [...names].sort(), locatorCode: [...locatorCode].sort() };
}

/** Whether `after` is `before` with only waits added (and locators changed: LOC is LOC). */
export function onlyWaitsAdded(before: FixSkeleton, after: FixSkeleton): boolean {
  let j = 0;
  for (const t of after.tokens) {
    if (j < before.tokens.length && before.tokens[j]!.t === t.t) j++;
    else if (!t.wait) return false;
  }
  return j === before.tokens.length;
}

/**
 * What a file's checks depend on (S3-4): the names they read (the element
 * and the expected value, `toast` in expect(toast) and `expected` in
 * toHaveText(expected)), widened through the declarations of those names
 * (const toast = page.getByText(MESSAGE) adds MESSAGE), and those
 * declarations' source. A review fix leaves every one as it was, or the
 * check checks something else while reading the same. `seed` adds names
 * other files' checks read (a page object's field a spec checks); with
 * `expand: false` the names are taken as given.
 */
export function checkDependencies(text: string, file: string, seed: Iterable<string> = [], expand = true): { names: string[]; declarations: string[] } {
  const ast = parseCode(text, file);
  if (!ast) return { names: [...seed].sort(), declarations: [] };
  // A fixed wait taken out of a method a check calls changes nothing the check checks: the waits are left out of the source compared.
  const waits: Array<[number, number]> = [];
  walkAst(ast, (n) => {
    if (n.type !== "ExpressionStatement") return;
    const e = (n.expression.type === "AwaitExpression" ? n.expression.argument : n.expression) as Node;
    if (e.type === "CallExpression" && memberName(e.callee as Node) === "waitForTimeout") waits.push([n.start ?? 0, n.end ?? 0]);
  });
  const source = (n: Node) => {
    let out = "";
    let at = n.start ?? 0;
    for (const [a, b] of waits)
      if (a >= at && b <= (n.end ?? 0)) {
        out += text.slice(at, a);
        at = b;
      }
    return (out + text.slice(at, n.end ?? 0)).replace(/\s+/g, " ").trim();
  };
  const reads = (n: Node | null | undefined, into: Set<string>) => {
    if (!n) return;
    const keys = new Set<Node>();
    walkAst(n, (x) => {
      // An option's key ({ name: 'Details' }) is no name the check reads: only its value is.
      if ((x.type === "ObjectProperty" || x.type === "ObjectMethod") && !x.computed) keys.add(x.key as Node);
      if (keys.has(x)) return;
      if (x.type === "Identifier") into.add(x.name);
      else if ((x.type === "MemberExpression" || x.type === "OptionalMemberExpression") && memberName(x)) into.add(memberName(x)!);
    });
  };
  const keyName = (k: Node) => (k.type === "Identifier" ? k.name : k.type === "PrivateName" ? k.id.name : literalString(k));
  const decls = new Map<string, Array<{ source: string; reads: Set<string> }>>();
  const declare = (name: string | undefined, n: Node, value: Node | null | undefined) => {
    if (!name) return;
    const r = new Set<string>();
    reads(value, r);
    decls.set(name, [...(decls.get(name) ?? []), { source: source(n), reads: r }]);
  };
  const names = new Set<string>(seed);
  walkAst(ast, (n) => {
    if (n.type === "VariableDeclarator") {
      if (n.id.type === "Identifier") declare(n.id.name, n, n.init);
      else
        walkAst(n.id as Node, (x) => {
          if (x.type === "Identifier") declare(x.name, n, n.init);
        });
    } else if (n.type === "ClassProperty" || n.type === "ClassPrivateProperty" || n.type === "ClassAccessorProperty") declare(keyName(n.key as Node), n, n.value as Node | null);
    else if (n.type === "ClassMethod" || n.type === "ClassPrivateMethod" || n.type === "ObjectMethod") declare(keyName(n.key as Node), n, n.body);
    else if (n.type === "FunctionDeclaration" && n.id) declare(n.id.name, n, n.body);
    // { page } (a fixture parameter, a shorthand) only passes a name on: no declaration of it.
    else if (n.type === "ObjectProperty" && !n.shorthand) declare(keyName(n.key as Node), n, n.value as Node);
    else if (n.type === "AssignmentExpression") declare(n.left.type === "Identifier" ? n.left.name : memberName(n.left as Node), n, n.right);
    else if (expand && n.type === "CallExpression" && (n.callee.type === "MemberExpression" || n.callee.type === "OptionalMemberExpression")) {
      // A matcher hanging off expect(...): what the check reads.
      let base = n.callee.object as Node;
      if ((base.type === "MemberExpression" || base.type === "OptionalMemberExpression") && ["not", "resolves", "rejects"].includes(memberName(base) ?? "")) base = base.object as Node;
      if ((base.type === "MemberExpression" || base.type === "OptionalMemberExpression") && memberName(base) === "not") base = base.object as Node;
      if (base.type !== "CallExpression") return;
      const c = base.callee as Node;
      const isExpect = (c.type === "Identifier" && c.name === "expect") || ((c.type === "MemberExpression" || c.type === "OptionalMemberExpression") && c.object.type === "Identifier" && c.object.name === "expect");
      if (!isExpect) return;
      for (const a of [...base.arguments, ...n.arguments]) reads(a as Node, names);
    }
  });
  if (expand) {
    const queue = [...names];
    while (queue.length)
      for (const d of decls.get(queue.pop()!) ?? [])
        for (const r of d.reads)
          if (!names.has(r)) {
            names.add(r);
            queue.push(r);
          }
  }
  const declarations = [...names].flatMap((name) => (decls.get(name) ?? []).map((d) => `${name}\u0000${d.source}`)).sort();
  return { names: [...names].sort(), declarations };
}

/**
 * The string and number values a file's code holds (S3-6), template text
 * included, module paths left out: a refactor moves code and renames it, but
 * adds no value the folder didn't hold (an expected text, a selector, a
 * timeout).
 */
export function codeLiterals(text: string, file: string): string[] | undefined {
  const ast = parseCode(text, file);
  if (!ast) return undefined;
  const modulePaths = new Set<Node>();
  const out: string[] = [];
  walkAst(ast, (n) => {
    if ((n.type === "ImportDeclaration" || n.type === "ExportAllDeclaration" || n.type === "ExportNamedDeclaration") && n.source) modulePaths.add(n.source as Node);
    if (n.type === "CallExpression" && ((n.callee.type === "Identifier" && n.callee.name === "require") || n.callee.type === "Import") && n.arguments[0]) modulePaths.add(n.arguments[0] as Node);
    if (n.type === "TSImportType" || n.type === "TSExternalModuleReference") walkAst(n as Node, (x) => x.type === "StringLiteral" && modulePaths.add(x));
    if (modulePaths.has(n)) return;
    if (n.type === "StringLiteral") out.push(`s:${n.value}`);
    else if (n.type === "NumericLiteral") out.push(`n:${n.value}`);
    else if (n.type === "TemplateElement") out.push(`s:${n.value.cooked ?? n.value.raw}`);
  });
  return out.sort();
}

/** The most calls and values a test's reach lists in order, and the most nodes it visits: past either, the test is too large to check. */
export const MAX_REACH = 20_000;
const MAX_REACH_VISITS = 300_000;
const TYPE_KEYS = new Set(["typeAnnotation", "returnType", "typeParameters", "typeArguments", "superTypeParameters", "implements", "decorators"]);
const FUNCTIONS = new Set(["ArrowFunctionExpression", "FunctionExpression", "FunctionDeclaration", "ClassMethod", "ClassPrivateMethod", "ObjectMethod"]);

interface Env {
  vars: Map<string, { node: Node; env: Env }>;
  parent?: Env;
}

/**
 * What each test reaches (S3-6), by its title: the names of the calls its
 * body makes (`a:` for each call awaited) and the values it holds, in the
 * order they run. A name declared in the test (or a function it is in)
 * stands for its own value; a called function's or method's parameters
 * stand for the call's arguments, read where the parameter is read; any
 * other name (a page object's method, a helper, a constant in another file)
 * expands every declaration of it across the files, each text once, in the
 * order of their text. A beforeEach of the test's describe block, or of its
 * file, comes first. A function written in the test but not called reaches
 * nothing; a locator declared reaches nothing until it is read.
 *
 * A refactor may move what a test does into a page object, a helper, a
 * fixture or a beforeEach, never leave out an action, an await or a value,
 * nor change their order: the test's list before is a subsequence of its
 * list after. `complete` is false when the test was too large to follow.
 */
export function testReach(files: ReadonlyArray<{ path: string; content: string }>): Map<string, { reach: Set<string>; order: string[]; complete: boolean }> {
  /** By name: the node a read reaches, and the function (params and body) a call runs. */
  const decls = new Map<string, Array<{ text: string; node: Node; fn?: Node; getter?: boolean }>>();
  const tests: Array<{ title: string; at: number; file: string; body: Node[] }> = [];
  const hooks: Array<{ file: string; from: number; to: number; fn: Node }> = [];
  for (const f of files) {
    const ast = parseCode(f.content, f.path);
    if (!ast) continue;
    const textOf = (n: Node) => f.content.slice(n.start ?? 0, n.end ?? 0);
    const declare = (name: string | undefined, node: Node | null | undefined, whole?: Node) => {
      if (!name || !node) return;
      const fn = FUNCTIONS.has(node.type) ? node : undefined;
      decls.set(name, [...(decls.get(name) ?? []), { text: textOf(whole ?? node), node, ...(fn ? { fn } : {}), ...(whole?.type === "ClassMethod" && whole.kind === "get" ? { getter: true } : {}) }]);
    };
    const keyName = (k: Node) => (k.type === "Identifier" ? k.name : k.type === "PrivateName" ? k.id.name : literalString(k));
    const describes: Array<[number, number]> = [];
    const found: Array<{ at: number; fn: Node }> = [];
    walkAst(ast, (n) => {
      if (n.type === "VariableDeclarator" && n.id.type === "Identifier") declare(n.id.name, n.init);
      else if (n.type === "ClassProperty" || n.type === "ClassPrivateProperty" || n.type === "ClassAccessorProperty") declare(keyName(n.key as Node), n.value as Node | null);
      else if (n.type === "ClassMethod" || n.type === "ClassPrivateMethod" || n.type === "ObjectMethod") declare(keyName(n.key as Node), n, n);
      else if (n.type === "FunctionDeclaration" && n.id) declare(n.id.name, n);
      else if (n.type === "ObjectProperty" && !n.shorthand) declare(keyName(n.key as Node), n.value as Node);
      else if (n.type === "AssignmentExpression") declare(n.left.type === "Identifier" ? n.left.name : memberName(n.left as Node), n.right);
      else if (n.type === "CallExpression") {
        const callee = n.callee as Node;
        const isMember = callee.type === "MemberExpression" || callee.type === "OptionalMemberExpression";
        const name = callee.type === "Identifier" ? callee.name : memberName(callee);
        const objName = isMember ? (callee.object.type === "Identifier" ? callee.object.name : memberName(callee.object as Node)) : undefined;
        const title = n.arguments[0] ? literalString(n.arguments[0] as Node) : undefined;
        if (title !== undefined && ((callee.type === "Identifier" && callee.name === "test") || (objName === "test" && name === "describe"))) {
          tests.push({ title, at: n.start ?? 0, file: f.path, body: n.arguments.slice(1) as Node[] });
          if (objName === "test" && name === "describe") describes.push([n.start ?? 0, n.end ?? 0]);
        }
        // beforeEach runs before each test of its describe block (of the file, at the top). beforeAll runs once: nothing moves into it.
        if (objName === "test" && name === "beforeEach") for (const a of n.arguments) if (a.type === "ArrowFunctionExpression" || a.type === "FunctionExpression") found.push({ at: n.start ?? 0, fn: a as Node });
      }
    });
    for (const h of found) {
      const inside = describes.filter(([a, b]) => a < h.at && h.at < b).sort((x, y) => x[1] - x[0] - (y[1] - y[0]))[0];
      hooks.push({ file: f.path, from: inside?.[0] ?? 0, to: inside?.[1] ?? Infinity, fn: h.fn });
    }
  }
  for (const [name, d] of decls) {
    const seen = new Set<string>();
    decls.set(name, d.filter((x) => !seen.has(x.text) && seen.add(x.text)).sort((x, y) => (x.text < y.text ? -1 : x.text > y.text ? 1 : 0)));
  }
  const callName = (n: Node): string | undefined => {
    if (n.type !== "CallExpression" && n.type !== "OptionalCallExpression" && n.type !== "NewExpression") return undefined;
    const c = n.callee as Node;
    return c.type === "Identifier" ? c.name : memberName(c);
  };
  const out = new Map<string, { reach: Set<string>; order: string[]; complete: boolean }>();
  for (const t of tests) {
    const order: string[] = [];
    let visits = 0;
    const running = new Set<Node>();
    const full = () => order.length >= MAX_REACH || visits >= MAX_REACH_VISITS;
    const root: Env = { vars: new Map() };
    const lookup = (env: Env | undefined, name: string): { node: Node; env: Env } | undefined => {
      for (let e = env; e; e = e.parent) if (e.vars.has(name)) return e.vars.get(name);
      return undefined;
    };
    /** Runs a function: its parameters stand for the arguments, read in the caller's scope. */
    const call = (fn: Node, args: readonly Node[], caller: Env, outer: Env) => {
      if (running.has(fn) || full()) return;
      running.add(fn);
      const env: Env = { vars: new Map(), parent: outer };
      const params = (fn as unknown as { params?: Node[] }).params ?? [];
      params.forEach((p, i) => {
        const id = p.type === "AssignmentPattern" ? (p.left as Node) : p.type === "TSParameterProperty" ? (p.parameter as Node) : p;
        const arg = args[i] as Node | undefined;
        if (id.type === "Identifier" && arg) env.vars.set(id.name, { node: arg, env: caller });
        else if (id.type === "AssignmentPattern" && id.left.type === "Identifier" && arg) env.vars.set(id.left.name, { node: arg, env: caller });
      });
      const body = (fn as unknown as { body: Node }).body;
      visit(body, env, false);
      running.delete(fn);
    };
    /** A name read by a call (with its arguments) or not (args undefined). */
    const reach = (name: string, env: Env, args: readonly Node[] | undefined, runs: boolean, local: boolean) => {
      if (full()) return;
      const b = local ? lookup(env, name) : undefined;
      if (b) {
        if (running.has(b.node)) return;
        if (FUNCTIONS.has(b.node.type)) {
          if (args) call(b.node, args, env, b.env);
          else if (runs) visit(b.node, b.env, true);
          return;
        }
        running.add(b.node);
        visit(b.node, b.env, runs);
        running.delete(b.node);
        return;
      }
      for (const d of decls.get(name) ?? []) {
        if (d.fn) {
          if (args) call(d.fn, args, env, root);
          else if (d.getter || runs) call(d.fn, [], env, root);
        } else if (!running.has(d.node)) {
          running.add(d.node);
          visit(d.node, root, runs);
          running.delete(d.node);
        }
      }
    };
    const visit = (n: Node, env: Env, runs: boolean): void => {
      if (full()) return;
      visits++;
      if (n.type === "ArrowFunctionExpression" || n.type === "FunctionExpression") {
        // A function that is neither passed to a call nor called by name never runs here; one that does sees the scope it was written in.
        if (!runs) return;
        const inner: Env = { vars: new Map(), parent: env };
        return visit(n.body as Node, inner, false);
      }
      if (n.type === "ClassBody" || n.type === "ClassMethod" || n.type === "ClassPrivateMethod" || n.type === "FunctionDeclaration") return;
      if (n.type === "VariableDeclarator") {
        if (n.id.type === "Identifier" && n.init) env.vars.set(n.id.name, { node: n.init as Node, env });
        else if (n.init) walkAst(n.id as Node, (x) => x.type === "Identifier" && env.vars.set(x.name, { node: n.init as Node, env }));
        // A value declared is reached where it is read (a locator built does nothing); one awaited, or a wait started early, runs here too.
        if (n.init && (n.init.type === "AwaitExpression" || /^waitFor/.test(callName(n.init as Node) ?? ""))) visit(n.init as Node, env, false);
        return;
      }
      if (n.type === "AwaitExpression") {
        const name = callName(n.argument as Node);
        if (name) order.push(`a:${name}`);
        return visit(n.argument as Node, env, false);
      }
      if (n.type === "CallExpression" || n.type === "OptionalCallExpression" || n.type === "NewExpression") {
        const name = callName(n);
        if (name) order.push(`c:${name}`);
        const c = n.callee as Node;
        const args = n.arguments as Node[];
        if (c.type === "Identifier") reach(c.name, env, args, true, true);
        else if (c.type === "MemberExpression" || c.type === "OptionalMemberExpression") {
          visit(c.object as Node, env, false);
          if (c.computed) visit(c.property as Node, env, false);
          const m = memberName(c);
          if (m) reach(m, env, args, true, false);
        } else visit(c, env, false);
        // The arguments as written too, so a value passed but never read is still reached.
        for (const a of args) visit(a, env, true);
        return;
      }
      if (n.type === "Identifier") return reach(n.name, env, undefined, runs, true);
      if (n.type === "MemberExpression" || n.type === "OptionalMemberExpression") {
        visit(n.object as Node, env, false);
        if (n.computed) visit(n.property as Node, env, false);
        const m = memberName(n);
        if (m) reach(m, env, undefined, runs, false);
        return;
      }
      if ((n.type === "ObjectProperty" || n.type === "ObjectMethod") && !n.computed) {
        if (n.type === "ObjectProperty") visit(n.value as Node, env, false);
        return;
      }
      if (n.type === "StringLiteral") return void order.push(`s:${n.value}`);
      if (n.type === "NumericLiteral") return void order.push(`n:${n.value}`);
      if (n.type === "TemplateElement") return void order.push(`s:${n.value.cooked ?? n.value.raw}`);
      const rec = n as unknown as Record<string, unknown>;
      for (const k of Object.keys(rec)) {
        if (SKIP_KEYS.has(k) || TYPE_KEYS.has(k)) continue;
        const v = rec[k];
        if (Array.isArray(v)) {
          for (const c of v) if (c && typeof c === "object" && typeof (c as Node).type === "string") visit(c as Node, env, false);
        } else if (v && typeof v === "object" && typeof (v as Node).type === "string") visit(v as Node, env, false);
      }
    };
    for (const h of hooks) if (h.file === t.file && h.from < t.at && t.at < h.to) visit(h.fn, root, true);
    for (const b of t.body) visit(b, root, true);
    const prev = out.get(t.title);
    const all = [...(prev?.order ?? []), ...order];
    out.set(t.title, { reach: new Set(all), order: all, complete: (prev?.complete ?? true) && !full() });
  }
  return out;
}
