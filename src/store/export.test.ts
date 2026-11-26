import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ExportTargetExistsError, exportUnencrypted } from "./index";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "finanzen-export-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const document = { schemaVersion: 1, note: "Girokonto 1.234,56 €" };

describe("unencrypted export", () => {
  it("writes the document as readable JSON", async () => {
    const target = join(dir, "export.json");
    await exportUnencrypted(target, document);

    const text = await readFile(target, "utf8");
    expect(text).toContain("Girokonto 1.234,56 €");
    expect(JSON.parse(text)).toEqual(document);
  });

  it("never overwrites an existing file", async () => {
    const target = join(dir, "export.json");
    await writeFile(target, "wichtig");

    await expect(exportUnencrypted(target, document)).rejects.toBeInstanceOf(ExportTargetExistsError);
    expect(await readFile(target, "utf8")).toBe("wichtig");
  });
});
