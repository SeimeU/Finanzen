import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  TargetExistsError,
  WrongPasswordError,
  changePassword,
  listBackupFiles,
  load,
  moveDataFile,
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

// Backups are created by ticket 06's save path; here they are arranged by hand
// at the location listBackupFiles reports, with the same encryption.
async function arrangeBackups(dataFile: string, password: string, count: number) {
  for (let i = 1; i <= count; i++) {
    await save(`${dataFile}.backup-${i}`, password, { schemaVersion: 1, note: `Stand ${i}` });
  }
}

describe("password change", () => {
  it("re-encrypts the data file and every backup; the old password fails on all of them", async () => {
    await save(file, "alt", { schemaVersion: 1, note: "aktuell" });
    await arrangeBackups(file, "alt", 2);
    const backups = await listBackupFiles(file);
    expect(backups).toHaveLength(2);

    await changePassword(file, "alt", "neu");

    expect(await load(file, "neu")).toEqual({ schemaVersion: 1, note: "aktuell" });
    await expect(load(file, "alt")).rejects.toBeInstanceOf(WrongPasswordError);
    for (const backup of backups) {
      await expect(load(backup, "alt")).rejects.toBeInstanceOf(WrongPasswordError);
    }
    const notes = await Promise.all(backups.map(async (b) => ((await load(b, "neu")) as { note: string }).note));
    expect(notes.sort()).toEqual(["Stand 1", "Stand 2"]);
  });

  it("rejects a wrong current password and leaves every file unchanged", async () => {
    await save(file, "alt", { schemaVersion: 1, note: "aktuell" });
    await arrangeBackups(file, "alt", 1);
    const before = await snapshotDir();

    await expect(changePassword(file, "falsch", "neu")).rejects.toBeInstanceOf(WrongPasswordError);

    expect(await snapshotDir()).toEqual(before);
  });
});

describe("moving the data file", () => {
  it("moves the data file and its backups to the new location, still readable with the password", async () => {
    await save(file, "pw", { schemaVersion: 1, note: "aktuell" });
    await arrangeBackups(file, "pw", 2);
    const target = join(dir, "neuer Ordner", "unterordner", "meine.dat");

    await moveDataFile(file, target);

    expect(await load(target, "pw")).toEqual({ schemaVersion: 1, note: "aktuell" });
    const moved = await listBackupFiles(target);
    expect(moved).toHaveLength(2);
    expect(((await load(moved[0], "pw")) as { note: string }).note).toBe("Stand 1");
    expect(await listBackupFiles(file)).toEqual([]);
    expect(await readdir(dir)).toEqual(["neuer Ordner"]);
  });

  it("refuses to overwrite an existing file at the target and moves nothing", async () => {
    await save(file, "pw", { schemaVersion: 1, note: "aktuell" });
    const target = join(dir, "anderer", "vermoegen.dat");
    await mkdir(join(dir, "anderer"));
    await save(target, "x", { schemaVersion: 1, note: "fremd" });

    await expect(moveDataFile(file, target)).rejects.toBeInstanceOf(TargetExistsError);

    expect(await load(file, "pw")).toEqual({ schemaVersion: 1, note: "aktuell" });
    expect(await load(target, "x")).toEqual({ schemaVersion: 1, note: "fremd" });
  });
});

async function snapshotDir(): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const name of await readdir(dir)) result[name] = (await readFile(join(dir, name))).toString("base64");
  return result;
}
