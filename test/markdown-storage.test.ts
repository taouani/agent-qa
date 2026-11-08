import { describe, expect, it } from "vitest";
import { markdownToStorage, storageInline } from "../src/connectors/index.js";

describe("markdownToStorage (S4-5)", () => {
  it("turns headings, paragraphs, lists and quotes into storage format", () => {
    const md = ["# Title", "", "First line", "second line.", "", "## Scope", "", "- one", "* two", "", "1. first", "2. second", "", "> Not reviewed:", "> written unattended."].join("\n");
    expect(markdownToStorage(md)).toBe(
      "<h1>Title</h1><p>First line second line.</p><h2>Scope</h2><ul><li>one</li><li>two</li></ul><ol><li>first</li><li>second</li></ol><blockquote><p>Not reviewed: written unattended.</p></blockquote>",
    );
  });

  it("escapes everything, so no text becomes markup", () => {
    expect(markdownToStorage('<script>alert("x")</script> & <ac:link>')).toBe("<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;ac:link&gt;</p>");
    expect(storageInline("[a link](https://x.example) _em_ ]]>")).toBe("[a link](https://x.example) _em_ ]]&gt;");
  });

  it("keeps bold, code with any fence and backslash escapes", () => {
    expect(storageInline("**Expected:** `a<b`")).toBe("<strong>Expected:</strong> <code>a&lt;b</code>");
    expect(storageInline("``a ` b`` and ` x `")).toBe("<code>a ` b</code> and <code>x</code>");
    expect(storageInline("`open and \\| \\* \\\\")).toBe("`open and | * \\");
    expect(storageInline("** not bold")).toBe("** not bold");
  });

  it("builds tables, splitting only on pipes that aren't escaped or in code", () => {
    const md = ["| Field | Value | Note |", "| --- | :---: | --- |", "| a\\|b | `x | y` | **n** |", "| short |"].join("\n");
    expect(markdownToStorage(md)).toBe(
      "<table><tbody><tr><th>Field</th><th>Value</th><th>Note</th></tr><tr><td>a|b</td><td><code>x | y</code></td><td><strong>n</strong></td></tr><tr><td>short</td><td></td><td></td></tr></tbody></table>",
    );
    // A pipe line with no separator is a paragraph.
    expect(markdownToStorage("| a | b |")).toBe("<p>| a | b |</p>");
  });

  it("handles CRLF, blank input and lone markers", () => {
    expect(markdownToStorage("# A\r\n\r\ntext\r\n")).toBe("<h1>A</h1><p>text</p>");
    expect(markdownToStorage("")).toBe("");
    expect(markdownToStorage("#nospace")).toBe("<p>#nospace</p>");
  });
});
