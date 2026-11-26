import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BackupNotFoundError, WrongPasswordError, listBackups, load, restoreBackup, save } from "./index";

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "finanzen-backups-"));
  file = join(dir, "vermoegen.dat");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const version = (n: number) => ({ schemaVersion: 1, note: `Stand ${n}` });

describe("backups", () => {
  it("restoring a backup brings back the previous state and backs up the state it replaces", async () => {
    await save(file, "richtig", version(1));
    await save(file, "richtig", version(2));

    const [previous] = await listBackups(file);
    expect(await restoreBackup(file, "richtig", previous.id)).toEqual(version(1));

    expect(await load(file, "richtig")).toEqual(version(1));
    const [newest] = await listBackups(file);
    expect(await restoreBackup(file, "richtig", newest.id)).toEqual(version(2));
  });

  it("the first save keeps no backup", async () => {
    await save(file, "richtig", version(1));
    expect(await listBackups(file)).toEqual([]);
  });

  it("lists backups newest first with their creation time", async () => {
    const before = new Date().toISOString();
    for (let n = 1; n <= 3; n++) await save(file, "richtig", version(n));
    const after = new Date().toISOString();

    const backups = await listBackups(file);
    expect(backups).toHaveLength(2);
    expect(backups[0].createdAt >= backups[1].createdAt).toBe(true);
    for (const { createdAt } of backups) {
      expect(createdAt >= before && createdAt <= after).toBe(true);
    }
    expect(await restoreBackup(file, "richtig", backups[1].id)).toEqual(version(1));
  });

  it("keeps the 30 most recent backups, rotating the oldest out", { timeout: 30_000 }, async () => {
    for (let n = 1; n <= 32; n++) await save(file, "richtig", version(n));

    const backups = await listBackups(file);
    expect(backups).toHaveLength(30);
    // Version 32 is the data file; 31 … 2 are backed up; 1 was rotated out.
    expect(await restoreBackup(file, "richtig", backups.at(-1)!.id)).toEqual(version(2));
    expect(await restoreBackup(file, "richtig", backups[0].id)).toEqual(version(31));
  });

  it("encrypts backups with the same password", async () => {
    await save(file, "richtig", version(1));
    await save(file, "richtig", version(2));

    for (const path of await allFiles(dir)) {
      const bytes = await readFile(path);
      expect(bytes.includes(Buffer.from("Stand")), path).toBe(false);
    }
    const [backup] = await listBackups(file);
    await expect(restoreBackup(file, "falsch", backup.id)).rejects.toBeInstanceOf(WrongPasswordError);
    expect(await load(file, "richtig")).toEqual(version(2));
    expect(await listBackups(file)).toHaveLength(1);
  });

  it("rejects an unknown backup id, including paths outside the backups", async () => {
    await save(file, "richtig", version(1));
    await save(file, "richtig", version(2));
    for (const id of ["gibt-es-nicht.dat", "../vermoegen.dat"]) {
      await expect(restoreBackup(file, "richtig", id)).rejects.toBeInstanceOf(BackupNotFoundError);
    }
  });
});

async function allFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}
