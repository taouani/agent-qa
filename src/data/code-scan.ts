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
  "system-access": "reads files, the environment or other programs (fs, process, require, eval, attach): test code uses the repo's fixtures and config only",
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
  if (!ast) return { parsed: false, syntaxErrors: 0, findings: [], tests: [], stepLines: [], checks: [], checkedNames: [], branches: 0 };
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
  const nameOf = (n: Node): string | undefined => (n.type === "Identifier" ? n.name : memberName(n));
  walkAst(ast, (n) => {
    if (BRANCHES.has(n.type)) branches++;
    // Reading files, the environment or other programs.
    if (n.type === "ImportDeclaration" && SYSTEM_MODULES.test(n.source.value)) add(n, "system-access");
    if (n.type === "Identifier" && ["process", "require", "eval", "Function"].includes(n.name)) {
      const parent = parents.get(n);
      const isKey = parent && (((parent.type === "MemberExpression" || parent.type === "OptionalMemberExpression") && parent.property === n && !parent.computed) || (parent.type === "ObjectProperty" && parent.key === n && !parent.computed));
      if (!isKey) add(n, "system-access");
    }
    if (n.type === "Import") add(n, "system-access");
    if ((n.type === "MemberExpression" || n.type === "OptionalMemberExpression") && n.object.type === "MetaProperty") add(n, "system-access");
    // Checks that can't fail: a local expect, a changed expect.
    if ((n.type === "VariableDeclarator" || n.type === "FunctionDeclaration" || n.type === "ClassDeclaration") && n.id?.type === "Identifier" && n.id.name === "expect") add(n, "hidden-check");
    if ((n.type === "ArrowFunctionExpression" || n.type === "FunctionExpression" || n.type === "FunctionDeclaration" || n.type === "ObjectMethod" || n.type === "ClassMethod") && n.params.some((p) => p.type === "Identifier" && p.name === "expect")) add(n, "hidden-check");
    if (n.type === "MemberExpression" || n.type === "OptionalMemberExpression") {
      const name = memberName(n);
      if (n.object.type === "Identifier" && n.object.name === "expect" && (name === "extend" || name === "configure")) add(n, "hidden-check");
      if (n.object.type === "Identifier" && n.object.name === "Promise" && (name === "allSettled" || name === "any" || name === "race")) add(n, "hidden-check");
      if (name === "attach") add(n, "system-access");
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
  return { parsed: true, syntaxErrors: errors.length, findings: findings.sort((a, b) => a.line - b.line), tests, stepLines, checks: checks.sort(), checkedNames: [...checkedNames].sort(), branches };
}
