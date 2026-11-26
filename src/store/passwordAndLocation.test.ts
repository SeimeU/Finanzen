import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  TargetExistsError,
  WrongPasswordError,
  changePassword,
  listBackups,
  load,
  moveDataFile,
  restoreBackup,
  save,
} from "./index";

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "finanzen-store-pw-"));
  file = join(dir, "vermoegen.dat");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Saves "Stand 1".."Stand n" in turn: the data file holds the last, the backups the earlier ones. */
async function saveStates(dataFile: string, password: string, count: number) {
  for (let i = 1; i <= count; i++) await save(dataFile, password, { schemaVersion: 1, note: `Stand ${i}` });
}

/** The note of every backup, oldest first. Restoring writes, so call this last in a test. */
async function backupNotes(dataFile: string, password: string): Promise<string[]> {
  const notes: string[] = [];
  for (const backup of (await listBackups(dataFile)).reverse()) {
    notes.push(((await restoreBackup(dataFile, password, backup.id)) as { note: string }).note);
  }
  return notes;
}

async function snapshotTree(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    result[relative(root, path)] = (await readFile(path)).toString("base64");
  }
  return result;
}

describe("password change", () => {
  it("re-encrypts the data file and every backup; the old password fails on all of them", async () => {
    await saveStates(file, "alt", 3);
    const backupsBefore = await listBackups(file);
    expect(backupsBefore).toHaveLength(2);

    await changePassword(file, "alt", "neu");

    expect(await load(file, "neu")).toEqual({ schemaVersion: 1, note: "Stand 3" });
    await expect(load(file, "alt")).rejects.toBeInstanceOf(WrongPasswordError);
    expect(await listBackups(file)).toEqual(backupsBefore);
    for (const backup of backupsBefore) {
      await expect(restoreBackup(file, "alt", backup.id)).rejects.toBeInstanceOf(WrongPasswordError);
    }
    expect(await backupNotes(file, "neu")).toEqual(["Stand 1", "Stand 2"]);
  });

  it("rejects a wrong current password and leaves every file unchanged", async () => {
    await saveStates(file, "alt", 2);
    const before = await snapshotTree(dir);

    await expect(changePassword(file, "falsch", "neu")).rejects.toBeInstanceOf(WrongPasswordError);

    expect(await snapshotTree(dir)).toEqual(before);
  });
});

describe("moving the data file", () => {
  it("moves the data file and its backups to the new location, still readable with the password", async () => {
    await saveStates(file, "pw", 3);
    const target = join(dir, "neuer Ordner", "unterordner", "meine.dat");

    await moveDataFile(file, target);

    expect(await load(target, "pw")).toEqual({ schemaVersion: 1, note: "Stand 3" });
    expect(await listBackups(target)).toHaveLength(2);
    expect(await backupNotes(target, "pw")).toEqual(["Stand 1", "Stand 2"]);
    expect(await listBackups(file)).toEqual([]);
    expect(await readdir(dir)).toEqual(["neuer Ordner"]);
  });

  it("refuses to overwrite an existing file at the target and moves nothing", async () => {
    await saveStates(file, "pw", 2);
    const target = join(dir, "anderer", "vermoegen.dat");
    await mkdir(join(dir, "anderer"));
    await save(target, "x", { schemaVersion: 1, note: "fremd" });
    const before = await snapshotTree(dir);

    await expect(moveDataFile(file, target)).rejects.toBeInstanceOf(TargetExistsError);

    expect(await snapshotTree(dir)).toEqual(before);
  });
});
