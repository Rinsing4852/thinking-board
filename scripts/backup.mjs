import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const source = process.env.DB_PATH ?? path.resolve("data/trainer.sqlite3");
const stamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
const destination = path.resolve(process.argv[2] ?? `backups/trainer-${stamp}.sqlite3`);

fs.mkdirSync(path.dirname(destination), { recursive: true });
const database = new Database(source, { readonly: true, fileMustExist: true });
try {
  await database.backup(destination);
  console.log(destination);
} finally {
  database.close();
}
