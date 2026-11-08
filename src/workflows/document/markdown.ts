/** Markdown helpers shared by the document types. */

/** One line: whitespace runs, newlines included, become one space. */
export const one = (s: string) => s.replace(/\s+/g, " ").trim();

/** A table cell: one line, with pipes escaped. */
export const cell = (s: string) => one(s).replace(/\|/g, "\\|") || " ";

export function table(head: string[], rows: string[][]): string[] {
  return [`| ${head.map(cell).join(" | ")} |`, `|${head.map(() => " --- ").join("|")}|`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)];
}

/** A bullet list, or `none` when empty. */
export function bullets(items: readonly string[], none = "None."): string[] {
  return items.length ? items.map((i) => `- ${one(i)}`) : [none];
}

export function section(title: string, body: string[]): string[] {
  return ["", `## ${title}`, "", ...body];
}

/** Text clipped to `max` characters, saying how much was cut. */
export const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)} [cut: ${text.length - max} more characters]` : text);

/** Inline code that survives backticks in the text: a longer fence, padded. */
export function code(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((t) => t.length));
  const fence = "`".repeat(longest + 1);
  return longest ? `${fence} ${text} ${fence}` : `${fence}${text}${fence}`;
}
