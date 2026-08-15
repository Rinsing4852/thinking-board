import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import BetterSqlite3 from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { Database } from "./database.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("backup restore", () => {
  it("validates, restores, and keeps a rollback copy of the replaced database", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "thinking-board-restore-"));
    tempDirectories.push(directory);
    const backupPath = path.join(directory, "backup.sqlite3");
    const targetPath = path.join(directory, "target.sqlite3");

    const source = new Database(path.join(directory, "source.sqlite3"), path.resolve("migrations"));
    source.connection.prepare("INSERT INTO player_profiles(id, display_name, created_at) VALUES ('restored', 'Restored player', '2026-01-01')").run();
    await source.connection.backup(backupPath);
    source.close();

    const target = new Database(targetPath, path.resolve("migrations"));
    target.connection.prepare("INSERT INTO player_profiles(id, display_name, created_at) VALUES ('old', 'Old player', '2026-01-01')").run();
    target.close();

    const output = execFileSync(process.execPath, ["scripts/restore.mjs", backupPath, targetPath, "--force"], {
      cwd: path.resolve("."),
      encoding: "utf8",
    });
    const result = JSON.parse(output) as { restored: string; safetyBackup: string };
    expect(result.restored).toBe(targetPath);
    expect(fs.existsSync(result.safetyBackup)).toBe(true);

    const restored = new BetterSqlite3(targetPath, { readonly: true });
    expect(restored.prepare("SELECT display_name FROM player_profiles").pluck().all()).toEqual(["Restored player"]);
    expect(restored.pragma("quick_check", { simple: true })).toBe("ok");
    restored.close();

    const rollback = new BetterSqlite3(result.safetyBackup, { readonly: true });
    expect(rollback.prepare("SELECT display_name FROM player_profiles").pluck().all()).toEqual(["Old player"]);
    rollback.close();
  });
});
