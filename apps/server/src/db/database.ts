import fs from "node:fs";
import path from "node:path";
import BetterSqlite3 from "better-sqlite3";

import { now } from "../lib/ids.js";

export type SqliteDatabase = BetterSqlite3.Database;

export class Database {
  readonly connection: SqliteDatabase;

  constructor(databasePath: string, private readonly migrationsDir: string) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.connection = new BetterSqlite3(databasePath);
    this.connection.pragma("foreign_keys = ON");
    this.connection.pragma("journal_mode = WAL");
    this.connection.pragma("busy_timeout = 5000");
    this.migrate();
  }

  close(): void {
    this.connection.close();
  }

  private migrate(): void {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT
    `);
    const applied = new Set(
      this.connection
        .prepare("SELECT version FROM schema_migrations")
        .all()
        .map((row) => (row as { version: number }).version),
    );
    const files = fs
      .readdirSync(this.migrationsDir)
      .filter((file) => /^\d+_.+\.sql$/.test(file))
      .sort();

    for (const file of files) {
      const version = Number.parseInt(file.split("_", 1)[0] ?? "", 10);
      if (applied.has(version)) continue;
      const sql = fs.readFileSync(path.join(this.migrationsDir, file), "utf8");
      this.connection.transaction(() => {
        this.connection.exec(sql);
        this.connection
          .prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)")
          .run(version, now());
      })();
    }
  }
}
