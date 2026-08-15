import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const args = process.argv.slice(2);
const force = args.includes("--force");
const paths = args.filter((argument) => argument !== "--force");
const sourcePath = path.resolve(paths[0] ?? "");
const targetPath = path.resolve(paths[1] ?? process.env.DB_PATH ?? "data/trainer.sqlite3");

if (!paths[0]) {
  throw new Error("Usage: npm run restore -- <backup.sqlite3> [target.sqlite3] [--force]");
}
if (!fs.existsSync(sourcePath)) throw new Error(`Backup not found: ${sourcePath}`);
if (sourcePath === targetPath) throw new Error("Backup and restore target must be different files");
if (fs.existsSync(targetPath) && !force) {
  throw new Error(`Target already exists: ${targetPath}. Stop the app and pass --force to replace it safely.`);
}

const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
try {
  const check = source.pragma("quick_check", { simple: true });
  if (check !== "ok") throw new Error(`Backup integrity check failed: ${String(check)}`);
} finally {
  source.close();
}

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
const stamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
const temporaryPath = `${targetPath}.restore-${process.pid}`;
let safetyBackup = null;

try {
  const backup = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    await backup.backup(temporaryPath);
  } finally {
    backup.close();
  }

  if (fs.existsSync(targetPath)) {
    safetyBackup = `${targetPath}.before-restore-${stamp}`;
    const existing = new Database(targetPath, { readonly: true, fileMustExist: true });
    try {
      await existing.backup(safetyBackup);
    } finally {
      existing.close();
    }
    fs.rmSync(targetPath, { force: true });
  }
  fs.rmSync(`${targetPath}-wal`, { force: true });
  fs.rmSync(`${targetPath}-shm`, { force: true });
  fs.renameSync(temporaryPath, targetPath);
  console.log(JSON.stringify({ restored: targetPath, safetyBackup }));
} finally {
  fs.rmSync(temporaryPath, { force: true });
}
