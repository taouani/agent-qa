import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * The paths git tracks, read from its index file (`.git/index`, versions 2
 * to 4) without running git: doctor uses it to see whether a vault file was
 * committed before `.gitignore` covered it. Paths are relative to the work
 * tree, with `/`; a sparse index's folder entries end with `/` (everything
 * under them is tracked). No index means nothing is tracked. Returns undefined for
 * an index this reader doesn't understand (doctor then says it couldn't check).
 */
export async function trackedPaths(gitDir: string): Promise<string[] | undefined> {
  let buf: Buffer;
  try {
    // A SHA-256 repository has longer object ids: not read. A linked worktree's config is in the common folder.
    const common = (await readFile(join(gitDir, "commondir"), "utf8").catch(() => "")).trim();
    const config = await readFile(join(common ? resolve(gitDir, common) : gitDir, "config"), "utf8").catch(() => "");
    if (/objectformat\s*=\s*sha256/i.test(config)) return undefined;
    buf = await readFile(join(gitDir, "index"));
  } catch (error) {
    // No index yet (nothing ever added): nothing is tracked.
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? [] : undefined;
  }
  return parseGitIndex(buf);
}

export function parseGitIndex(buf: Buffer): string[] | undefined {
  if (buf.length < 12 || buf.toString("latin1", 0, 4) !== "DIRC") return undefined;
  const version = buf.readUInt32BE(4);
  if (version < 2 || version > 4) return undefined;
  const count = buf.readUInt32BE(8);
  const paths: string[] = [];
  let at = 12;
  let previous: Buffer = Buffer.alloc(0);
  for (let i = 0; i < count; i++) {
    const start = at;
    // ctime, mtime, dev, ino, mode, uid, gid, size (10 × 4 bytes), the object id (20 bytes for SHA-1), flags (2).
    const flagsAt = start + 40 + 20;
    if (flagsAt + 2 > buf.length) return undefined;
    const flags = buf.readUInt16BE(flagsAt);
    // A sparse index (git sparse-checkout --sparse-index) keeps whole folders as one entry, mode 040000.
    const folder = (buf.readUInt32BE(start + 24) & 0o170000) === 0o040000;
    at = flagsAt + 2;
    // Version 3+: an extended flag adds two more bytes of flags.
    if (version >= 3 && flags & 0x4000) at += 2;
    let path: Buffer;
    if (version === 4) {
      // The path is the end of the previous one, less N bytes (a varint), plus a NUL-ended suffix.
      let strip = 0;
      let byte: number;
      let first = true;
      do {
        if (at >= buf.length) return undefined;
        byte = buf[at++]!;
        strip = first ? byte & 0x7f : ((strip + 1) << 7) | (byte & 0x7f);
        first = false;
      } while (byte & 0x80);
      const end = buf.indexOf(0, at);
      if (end < 0 || strip > previous.length) return undefined;
      path = Buffer.concat([previous.subarray(0, previous.length - strip), buf.subarray(at, end)]);
      at = end + 1;
    } else {
      const end = buf.indexOf(0, at);
      if (end < 0) return undefined;
      path = buf.subarray(at, end);
      // Entries are padded with NULs to a multiple of 8 bytes, at least one.
      at = start + Math.ceil((end - start + 1) / 8) * 8;
    }
    previous = path;
    const name = path.toString("utf8");
    paths.push(folder && !name.endsWith("/") ? `${name}/` : name);
  }
  // Extensions follow the entries, then a 20-byte checksum. A split index ("link") keeps most
  // entries in a shared index file: not read, so the caller says it couldn't check.
  while (at + 8 <= buf.length - 20) {
    const signature = buf.toString("latin1", at, at + 4);
    if (signature === "link") return undefined;
    at += 8 + buf.readUInt32BE(at + 4);
  }
  return paths;
}
