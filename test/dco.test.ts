import { describe, expect, it } from "vitest";
import { dcoProblems, signOffs } from "../scripts/dco.mjs";

const commit = (over: Partial<{ sha: string; authorName: string; authorEmail: string; parents: number; body: string; cleanMerge: boolean }> = {}) => ({
  sha: "0123456789abcdef",
  authorName: "Ada Lovelace",
  authorEmail: "ada@example.com",
  parents: 1,
  body: "Fix the thing\n\nSigned-off-by: Ada Lovelace <ada@example.com>\n",
  ...over,
});
const outside = { maintainerPullRequest: false };
const maintainer = { maintainerPullRequest: true };

describe("DCO check", () => {
  it("passes a commit signed off by its author, in any case", () => {
    expect(dcoProblems([commit()], outside)).toEqual([]);
    expect(dcoProblems([commit({ body: "x\n\nsigned-off-by: Ada <ADA@example.com>" })], outside)).toEqual([]);
    expect(dcoProblems([commit({ body: "x\r\n\r\nCo-Authored-By: B <b@x.io>\r\nSigned-off-by: Ada <ada@example.com>\r\n" })], outside)).toEqual([]);
  });

  it("fails a commit with no sign-off, or signed off by someone else", () => {
    expect(dcoProblems([commit({ body: "Fix the thing" })], outside)[0]).toContain("no Signed-off-by line");
    expect(dcoProblems([commit({ body: "x\n\nSigned-off-by: Bob <bob@example.com>" })], outside)[0]).toContain("not as its author");
  });

  it("takes sign-offs only from the trailer block, on one line", () => {
    expect(dcoProblems([commit({ body: "Mention Signed-off-by: Ada <ada@example.com> in docs" })], outside)[0]).toContain("no Signed-off-by");
    expect(dcoProblems([commit({ body: "x\n\nSigned-off-by: Ada <ada@example.com>\n\nMore text after it" })], outside)[0]).toContain("no Signed-off-by");
    expect(signOffs("x\n\nSigned-off-by:\nAda <ada@example.com>")).toEqual([]);
  });

  it("skips a clean merge, and checks a merge with changes of its own", () => {
    expect(dcoProblems([commit({ parents: 2, cleanMerge: true, body: "Merge branch 'master'" })], outside)).toEqual([]);
    expect(dcoProblems([commit({ parents: 2, cleanMerge: false, body: "Merge branch 'master'" })], outside)[0]).toContain("merge commit with changes of its own");
  });

  it("checks bot-looking authors like anyone else", () => {
    expect(dcoProblems([commit({ authorEmail: "x[bot]@users.noreply.github.com", body: "Version packages" })], outside)).toHaveLength(1);
  });

  it("passes agent commits only on a maintainer's pull request", () => {
    const agent = commit({ authorName: "Claude", authorEmail: "noreply@anthropic.com", body: "Change\n\nCo-Authored-By: Claude <noreply@anthropic.com>" });
    expect(dcoProblems([agent], maintainer)).toEqual([]);
    expect(dcoProblems([agent], outside)[0]).toContain("AI agent");
  });

  it("still checks people's commits on a maintainer's pull request", () => {
    expect(dcoProblems([commit({ body: "No sign-off" })], maintainer)).toHaveLength(1);
  });

  it("lists every sign-off of the trailer block", () => {
    expect(signOffs("a\n\nSigned-off-by: A <a@x.io>\nSigned-off-by: B <B@x.io>\n")).toEqual(["a@x.io", "b@x.io"]);
  });
});
