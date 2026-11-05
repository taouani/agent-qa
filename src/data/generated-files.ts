/**
 * Which repo paths generated code may never create or replace (S2-6, S2-7):
 * the project's own setup, Agent-QA's files, secrets and tooling folders.
 * The scripts checks refuse them, and the write refuses them again.
 */
const PROTECTED_FILE = /(^|\/)(package(-lock)?\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig[^/]*\.json|playwright\.config\.[cm]?[jt]s|agent-qa\.ya?ml|agent-qa\.profile\.json|\.env[^/]*|\.gitignore|\.npmrc)$/i;
const PROTECTED_DIR = /(^|\/)(node_modules|\.git|\.agent-qa|\.github|\.vscode|\.husky)(\/|$)/i;

export const isProtectedPath = (path: string): boolean => PROTECTED_FILE.test(path.replace(/\\/g, "/")) || PROTECTED_DIR.test(path.replace(/\\/g, "/"));

/** A path a generated file may have: relative, forward slashes, inside its folder, no control characters. */
export const isPlainRelativePath = (path: string): boolean => !/\\|^\/|^[A-Za-z]:|(^|\/)\.\.?(\/|$)|\/\/|[\u0000-\u001f]/.test(path) && path.length > 0;
