import type { SqliteDatabase } from "../db/database.js";
import { now } from "../lib/ids.js";
import { AnalysisService } from "../analysis/analysis-service.js";

interface JobRow {
  id: string;
  kind: string;
  payload_json: string;
}

export class JobWorker {
  private timer: NodeJS.Timeout | null = null;
  private activeJob: Promise<void> | null = null;

  constructor(private readonly db: SqliteDatabase, private readonly analysis: AnalysisService) {}

  start(): void {
    this.db.prepare("UPDATE jobs SET status = 'queued', started_at = NULL WHERE status = 'running'").run();
    this.timer = setInterval(() => this.schedule(), 250);
    this.schedule();
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.activeJob;
    await this.analysis.close();
  }

  private schedule(): void {
    if (this.activeJob) return;
    this.activeJob = this.tick().finally(() => {
      this.activeJob = null;
    });
  }

  private async tick(): Promise<void> {
    const job = this.db.prepare(`
      SELECT id, kind, payload_json FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1
    `).get() as JobRow | undefined;
    if (!job) return;
    this.db.prepare(`
      UPDATE jobs SET status = 'running', started_at = ?, error_message = NULL WHERE id = ?
    `).run(now(), job.id);
    try {
      if (job.kind !== "analyze_games") throw new Error(`Unknown job kind: ${job.kind}`);
      const payload = JSON.parse(job.payload_json) as { gameIds?: unknown };
      if (!Array.isArray(payload.gameIds) || !payload.gameIds.every((value) => typeof value === "string")) {
        throw new Error("Analysis job has an invalid game list");
      }
      const result = await this.analysis.analyzeGames(payload.gameIds, (progress) => {
        this.db.prepare("UPDATE jobs SET progress_current = ? WHERE id = ?").run(progress, job.id);
      });
      this.db.prepare(`
        UPDATE jobs SET status = 'completed', result_json = ?, completed_at = ? WHERE id = ?
      `).run(JSON.stringify(result), now(), job.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Analysis failed";
      this.db.prepare(`
        UPDATE jobs SET status = 'failed', error_message = ?, completed_at = ? WHERE id = ?
      `).run(message, now(), job.id);
      console.error(`Job ${job.id} failed`, error);
    }
  }
}
