import type { Node } from "@babel/types";
import { literalString, parseCode, walkAst } from "./profile-scan.js";

/**
 * What generated test code must not do (S2-6), found in its syntax tree, so
 * comments and identifiers that merely mention a rule don't count and
 * spellings such as page["waitForTimeout"] or a setTimeout promise do.
 */

export interface CodeFinding {
  line: number;
  rule: "fixed-wait" | "pause" | "focus-or-skip" | "xpath" | "generated-id" | "record-id" | "org-url";
  message: string;
}

export interface CodeScan {
  /** False when the text isn't code at all. */
  parsed: boolean;
  /** Syntax errors the parser recovered from. */
  syntaxErrors: number;
  findings: CodeFinding[];
}

const MESSAGES: Record<CodeFinding["rule"], string> = {
  "fixed-wait": "uses a fixed wait (waitForTimeout or setTimeout): wait for Lightning or for the element instead",
  pause: "leaves page.pause() in",
  "focus-or-skip": "uses .only, .skip or .fixme, which would run some tests and not others",
  xpath: "uses XPath, which can't reach into Lightning's shadow roots: use getByRole or getByLabel",
  "generated-id": "selects by a generated Lightning id (data-aura-rendered-by, input-123, globalId), which changes on every load",
  "record-id": "hard-codes a record id: create the record in the test or take it from the test data",
  "org-url": "hard-codes an org URL: use the baseURL from the Playwright config",
};

const memberName = (n: Node): string | undefined => {
  if (n.type !== "MemberExpression" && n.type !== "OptionalMemberExpression") return undefined;
  if (!n.computed && n.property.type === "Identifier") return n.property.name;
  return literalString(n.property as Node);
};

const XPATH = /^\s*(?:xpath=|\(?\/\/|\.\.\s*$)/;
const GENERATED_ID = /data-aura-rendered-by|(?:^|[#"'=\s[])input-\d+\b|\bglobalId\b/;
const RECORD_URL = /\/lightning\/r\/(?:\w+\/)?[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?(?:[/?#]|$)/;
/** A bare record id: 15 or 18 letters and digits, a key prefix, a digit in the 4th place (the pod). */
const RECORD_ID = /^(?=[^]*\d[^]*\d)(?=[^]*[A-Za-z])[a-zA-Z0-9]{3}\d[a-zA-Z0-9]{11}(?:[a-zA-Z0-9]{3})?$/;
const ORG_URL = /https?:\/\/[^/'"\s]*\.(?:salesforce|force|site|salesforce-sites|cloudforce|visualforce)\.com/i;
const FOCUS = new Set(["only", "skip", "fixme"]);
const TEST_OBJECTS = new Set(["test", "describe", "it", "context"]);

export function scanGeneratedCode(text: string, file: string): CodeScan {
  const ast = parseCode(text, file);
  if (!ast) return { parsed: false, syntaxErrors: 0, findings: [] };
  const findings: CodeFinding[] = [];
  const add = (n: Node, rule: CodeFinding["rule"]) => findings.push({ line: n.loc?.start.line ?? 0, rule, message: MESSAGES[rule] });
  walkAst(ast, (n) => {
    if (n.type === "CallExpression" || n.type === "OptionalCallExpression") {
      const callee = n.callee as Node;
      const name = callee.type === "Identifier" ? callee.name : memberName(callee);
      if (name === "waitForTimeout" || name === "setTimeout") add(n, "fixed-wait");
      if (name === "pause" && n.arguments.length === 0) add(n, "pause");
      if (name && FOCUS.has(name) && (callee.type === "MemberExpression" || callee.type === "OptionalMemberExpression")) {
        const obj = callee.object;
        const objName = obj.type === "Identifier" ? obj.name : memberName(obj as Node);
        if (objName && TEST_OBJECTS.has(objName)) add(n, "focus-or-skip");
      }
      for (const arg of n.arguments) {
        const s = literalString(arg as Node);
        if (s !== undefined && XPATH.test(s)) add(arg as Node, "xpath");
      }
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
  return { parsed: true, syntaxErrors: errors.length, findings: findings.sort((a, b) => a.line - b.line) };
}
