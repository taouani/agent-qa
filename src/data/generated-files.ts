/**
 * Which repo paths generated code may never create or replace (S2-6, S2-7):
 * the project's own setup, Agent-QA's files, secrets and tooling folders.
 * The scripts checks refuse them, and the write refuses them again.
 */
const PROTECTED_FILE = /(^|\/)(package(-lock)?\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig[^/]*\.json|playwright\.config\.[cm]?[jt]s|agent-qa\.ya?ml|agent-qa\.profile\.json|\.env[^/]*|\.gitignore|\.npmrc)$/i;
// Tool files at the project's root run code when a tool starts (eslint, vitest, pnpm, yarn): never created either.
const PROTECTED_ROOT = /^(\.pnpmfile\.cjs|\.yarnrc(\.yml)?|[^/]*\.config\.[cm]?[jt]s|\.[^/]*rc(\.[cm]?[jt]s|\.json|\.ya?ml)?)$/i;
const PROTECTED_DIR = /(^|\/)(node_modules|\.git|\.agent-qa|\.github|\.vscode|\.husky)(\/|$)/i;

export const isProtectedPath = (path: string): boolean => {
  const p = path.replace(/\\/g, "/");
  return PROTECTED_FILE.test(p) || PROTECTED_DIR.test(p) || PROTECTED_ROOT.test(p);
};

/**
 * A path a generated file may have: relative, forward slashes, inside its
 * folder, no control characters, and a name every system writes as given:
 * none of <>:"|?* (":" is an NTFS stream), no part ending in a dot or a
 * space, no Windows device name (CON, AUX, COM1...).
 */
export const isPlainRelativePath = (path: string): boolean =>
  path.length > 0 &&
  !/\\|^\/|(^|\/)\.\.?(\/|$)|\/\/|[\u0000-\u001f<>:"|?*]/.test(path) &&
  path.split("/").every((part) => !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com\d|lpt\d|conin\$|conout\$)(\..*)?$/i.test(part));

/** A masking token (<PERSON_1>): generated code never carries one, in a path or in its content. */
export const hasToken = (text: string): boolean => /<[A-Z][A-Z0-9_]*_\d+>/.test(text.replace(/\s+/g, ""));
