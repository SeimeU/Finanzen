import { mkdtemp, readFile, readdir, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WrongPasswordError, load, save } from "./index";

// Simulates a write that dies midway: while set, writing a file's contents fails.
let failWrites = false;
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args);
      if (!failWrites) return handle;
      return {
        writeFile: async () => {
          throw new Error("disk died");
        },
        sync: () => handle.sync(),
        close: () => handle.close(),
      };
    },
  };
});

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "finanzen-store-"));
  file = join(dir, "vermoegen.dat");
});

afterEach(async () => {
  failWrites = false;
  await rm(dir, { recursive: true, force: true });
});

const document = { schemaVersion: 1, note: "Geheimnis Girokonto 1.234,56 €" };

describe("encrypted file store", () => {
  it("loads what was saved, with the same password", async () => {
    await save(file, "richtig", document);
    expect(await load(file, "richtig")).toEqual(document);
  });

  it("rejects a wrong password with a distinct error and leaves every file unchanged", async () => {
    await save(file, "richtig", document);
    const before = await readFile(file);
    const listingBefore = await readdir(dir);

    await expect(load(file, "falsch")).rejects.toBeInstanceOf(WrongPasswordError);

    expect(await readFile(file)).toEqual(before);
    expect(await readdir(dir)).toEqual(listingBefore);
  });

  it("writes no plaintext to the file", async () => {
    await save(file, "richtig", document);
    const bytes = await readFile(file);
    expect(bytes.includes(Buffer.from("Geheimnis"))).toBe(false);
    expect(bytes.includes(Buffer.from("schemaVersion"))).toBe(false);
  });

  it("uses a fresh salt and nonce on every write", async () => {
    await save(file, "richtig", document);
    const first = await readFile(file);
    await save(file, "richtig", document);
    const second = await readFile(file);
    expect(second.equals(first)).toBe(false);
    expect(await load(file, "richtig")).toEqual(document);
  });

  it("keeps the previous file intact when a write is interrupted", async () => {
    await save(file, "richtig", document);
    const before = await readFile(file);
    failWrites = true;

    await expect(save(file, "richtig", { schemaVersion: 1, note: "neu" })).rejects.toThrow();
    failWrites = false;

    expect(await readFile(file)).toEqual(before);
    expect(await load(file, "richtig")).toEqual(document);
  });

  it("lets several saves to the same file run at once without clashing", async () => {
    const values = Array.from({ length: 10 }, (_, i) => ({ schemaVersion: 1, note: `Stand ${i}` }));

    await Promise.all(values.map((value) => save(file, "richtig", value)));

    expect(values).toContainEqual(await load(file, "richtig"));
    expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("ignores a half-written temporary file left behind by a crash", async () => {
    await save(file, "richtig", document);
    await writeFile(`${file}.tmp`, "abgebrochen");

    expect(await load(file, "richtig")).toEqual(document);
    await save(file, "richtig", { schemaVersion: 1, note: "neu" });
    expect(await load(file, "richtig")).toEqual({ schemaVersion: 1, note: "neu" });
  });
});
