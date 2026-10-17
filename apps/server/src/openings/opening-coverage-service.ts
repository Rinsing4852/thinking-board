import { repertoireGoal } from "./opening-repertoire-goal.js";
import { firstPreparationTask, openingTask, rankedOpeningTasks } from "../../../../packages/contracts/src/opening-tasks.js";
import { qualityPreferences } from "./opening-quality-preferences.js";
import { Chess } from "chess.js";
import type { OpeningCoverageBranch, OpeningCoverageGap, OpeningCoveragePosition, OpeningCoverageResponse,
  OpeningExplorerPositionResponse } from "../../../../packages/contracts/src/api.js";
import type { SqliteDatabase } from "../db/database.js";
import { ensureActiveProfile } from "../training/profile.js";
import { now } from "../lib/ids.js";
import { openingPositionKey } from "./opening-content.js";
import { OpeningExplorerService } from "./opening-explorer-service.js";
import type { OpeningPreparationService } from "./opening-preparation-service.js";
import { EXPLORER_SPEEDS, PREPARATION_MIN_SAMPLE } from "./opening-preparation-policy.js";
import { moveRecall } from "./opening-recall.js";
import { coverageScope, modelCoverage, roundedModel, type CoverageEdge } from "./opening-coverage-model.js";
import type { OpeningGameService } from "./opening-game-service.js";

interface GraphRow extends CoverageEdge {
  fen: string; afterFen: string; lineId: string; lineTitle: string; chapterTitle: string;
  ply: number; kind: string; practiceEnabled: number;
}
const RATINGS = new Set([0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500]);
const SCAN_BATCH = 2; // Two concurrent 8-second calls, inside the client timeout.

export class OpeningCoverageService {
  constructor(private readonly db: SqliteDatabase, private readonly apiToken?: string,
    private readonly explorer = new OpeningExplorerService(db, apiToken),
    private readonly preparation?: OpeningPreparationService, private readonly games?: OpeningGameService) {}

  private graph(repertoireId: string, profileId: string): GraphRow[] {
    return this.db.prepare(`SELECT m.id, m.from_position_id AS "from", m.to_position_id AS "to",
      m.move_uci AS uci, m.move_san AS san, m.role, m.move_kind AS kind,
      p.fen, after.fen AS afterFen, l.id AS lineId, l.title AS lineTitle, c.title AS chapterTitle,
      membership.ply AS ply, COALESCE(practice.enabled, 1) AS practiceEnabled
      FROM opening_line_moves membership JOIN opening_moves m ON m.id = membership.move_id AND m.active = 1
      JOIN opening_positions p ON p.id = m.from_position_id JOIN opening_positions after ON after.id = m.to_position_id
      JOIN opening_lines l ON l.id = membership.line_id AND l.active = 1
      JOIN opening_chapters c ON c.id = l.chapter_id AND c.active = 1
      LEFT JOIN opening_line_preferences preference ON preference.line_id = l.id AND preference.profile_id = ?
      LEFT JOIN opening_line_practice_preferences practice ON practice.line_id = l.id AND practice.profile_id = ?
      WHERE m.repertoire_id = ? AND preference.archived_at IS NULL
      ORDER BY c.sort_order, l.priority, l.id, membership.ply`).all(profileId, profileId, repertoireId) as GraphRow[];
  }

  /** Preparation recommendations are independent of the chosen memory session.
   * First compare local game evidence; only the selected repertoire can fetch
   * the next bounded Lichess sample batch. */
  async recommended(ratingGroup = 1600, local = true, preferredId?: string): Promise<OpeningCoverageResponse | null> {
    if (!RATINGS.has(ratingGroup)) throw new Error("Choose a supported Lichess rating group");
    const profileId = ensureActiveProfile(this.db);
    const repertoires = this.db.prepare(`SELECT r.id FROM opening_repertoires r
      LEFT JOIN opening_repertoire_preferences preference ON preference.repertoire_id = r.id AND preference.profile_id = ?
      WHERE preference.archived_at IS NULL AND EXISTS (SELECT 1 FROM opening_chapters chapter
        JOIN opening_lines line ON line.chapter_id = chapter.id AND line.active = 1
        WHERE chapter.repertoire_id = r.id AND chapter.active = 1)
      ORDER BY (SELECT COUNT(*) FROM games game WHERE game.profile_id = ? AND game.player_color = r.learner_color) DESC,
        CASE WHEN r.id = ? THEN 0 ELSE 1 END, r.name`)
      .all(profileId, profileId, preferredId ?? "") as Array<{ id: string }>;
    let best: OpeningCoverageResponse | null = null;
    let bestScore = -1;
    for (const repertoire of repertoires) {
      let result;
      try { result = await this.coverage(repertoire.id, ratingGroup, { local: true, skipGameMatching: true }); }
      catch { continue; }
      const gap = firstPreparationTask(result.gaps);
      const score = gap ? openingTask(gap).priority : -1;
      if (!best || score > bestScore || score === bestScore && result.repertoireId === preferredId) {
        best = result; bestScore = score;
      }
    }
    if (best && !local && this.apiToken) return this.coverage(best.repertoireId, ratingGroup);
    return best;
  }

  async chooseTask(repertoireId: string, taskId: string, action: "later" | "skip" | "restore"): Promise<{ message: string }> {
    const profileId = ensureActiveProfile(this.db);
    if (!["later", "skip", "restore"].includes(action)) throw new Error("Choose postpone, skip or restore");
    const result = await this.coverage(repertoireId, 1600, { local: true, throughMove: 30 });
    const task = [...result.gaps, ...(result.taskHistory ?? [])].find(gap => gap.task?.id === taskId);
    // A shared response can belong to another route. Validate against active
    // saved graph positions as well, without accepting arbitrary task IDs.
    const valid = task || this.graph(repertoireId, profileId).some(row => {
      if (taskId === `practice:${row.id}` && row.role === "learner") return true;
      if (!["prepare", "idea"].some(kind => taskId.startsWith(`${kind}:${row.from}:`))) return false;
      const uci = taskId.slice(taskId.lastIndexOf(":") + 1);
      return new Chess(row.fen).moves({ verbose: true }).some(move => `${move.from}${move.to}${move.promotion ?? ""}` === uci);
    });
    if (!valid) throw new Error("This task has changed. Refresh your next steps.");
    if (action === "restore") this.db.prepare("DELETE FROM opening_task_choices WHERE profile_id = ? AND repertoire_id = ? AND task_id = ?").run(profileId, repertoireId, taskId);
    else this.db.prepare(`INSERT INTO opening_task_choices(profile_id,repertoire_id,task_id,choice,until_at,updated_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(profile_id,repertoire_id,task_id) DO UPDATE SET choice=excluded.choice,until_at=excluded.until_at,updated_at=excluded.updated_at`)
      .run(profileId, repertoireId, taskId, action, action === "later" ? new Date(Date.now() + 7 * 86400000).toISOString() : null, now());
    return { message: action === "later" ? "Postponed for seven days." : action === "skip" ? "Skipped from suggestions. Saved moves and memory are unchanged." : "Suggestion restored." };
  }

  boundary(repertoireId: string, positionId: string, preparedEnough: boolean): { message: string } {
    const profileId = ensureActiveProfile(this.db);
    const graph = this.graph(repertoireId, profileId);
    const repertoire = this.db.prepare("SELECT learner_color FROM opening_repertoires WHERE id = ?").get(repertoireId) as { learner_color: string } | undefined;
    const position = this.db.prepare("SELECT side_to_move FROM opening_positions WHERE id = ?").get(positionId) as { side_to_move: string } | undefined;
    if (!graph.some(row => row.from === positionId || row.to === positionId) || !position || position.side_to_move === repertoire?.learner_color) {
      throw new Error("Choose a position in an active saved line");
    }
    if (preparedEnough) this.db.prepare(`INSERT OR IGNORE INTO opening_coverage_boundaries
      (profile_id, repertoire_id, position_id, created_at) VALUES (?, ?, ?, ?)`).run(profileId, repertoireId, positionId, now());
    else this.db.prepare(`DELETE FROM opening_coverage_boundaries
      WHERE profile_id = ? AND repertoire_id = ? AND position_id = ?`).run(profileId, repertoireId, positionId);
    return { message: preparedEnough ? "Preparation stops here. Saved moves and practice are unchanged."
      : "This position is included in coverage again." };
  }

  async wholeRepertoire(repertoireId: string, ratingGroup = 1600,
    options: {local?: boolean; offset?: number; refresh?: boolean; maxPlies?: number} = {}) {
    const profileId=ensureActiveProfile(this.db), quality=qualityPreferences(this.db,profileId);
    if(!RATINGS.has(ratingGroup)) throw new Error("Choose a supported Lichess rating group");
    const offset=options.offset??0, maxPlies=options.maxPlies??60;
    if(!Number.isInteger(offset)||offset<0||!Number.isInteger(maxPlies)||maxPlies<2||maxPlies>120) throw new Error("Choose a checking limit from 2 to 120 plies and a valid scan offset");
    const repertoire=this.db.prepare("SELECT learner_color FROM opening_repertoires WHERE id=?").get(repertoireId) as {learner_color:"white"|"black"}|undefined;
    if(!repertoire) throw new Error("Opening repertoire is not available");
    if(this.db.prepare("SELECT 1 FROM opening_repertoire_preferences WHERE repertoire_id=? AND profile_id=? AND archived_at IS NOT NULL").get(repertoireId,profileId)) throw new Error("Restore this repertoire before checking coverage");
    const rows=this.graph(repertoireId,profileId);
    const boundaries=new Set(this.db.prepare("SELECT position_id FROM opening_coverage_boundaries WHERE repertoire_id=? AND profile_id=?").pluck().all(repertoireId,profileId) as string[]);
    const positions=new Map<string,string>();
    for(const row of rows) {
      if(row.role==="opponent") positions.set(row.from,row.fen);
      else positions.set(row.to,row.afterFen);
    }
    const roots=new Map<string,typeof rows[number]>();
    for(const row of rows) if(!roots.has(row.lineId)||row.ply<roots.get(row.lineId)!.ply) roots.set(row.lineId,row);
    const outgoing=new Map<string,typeof rows>();
    for(const row of rows) outgoing.set(row.from,[...(outgoing.get(row.from)??[]),row]);
    const reachable=new Map<string,number>(), queue=[...roots.values()].map(row=>({id:row.from,depth:0}));
    for(let index=0;index<queue.length;index++) {
      const current=queue[index]!;if(reachable.has(current.id)) continue;
      reachable.set(current.id,current.depth);
      if(boundaries.has(current.id)||current.depth>=maxPlies) continue;
      for(const edge of outgoing.get(current.id)??[]) queue.push({id:edge.to,depth:current.depth+1});
    }
    const ordered=[...positions].filter(([id,fen])=>{
      if(!reachable.has(id)||reachable.get(id)!>=maxPlies||boundaries.has(id)) return false;
      const board=new Chess(fen);return !board.isCheckmate()&&!board.isStalemate()&&!board.isInsufficientMaterial();
    }).sort(([a],[b])=>(reachable.get(a)!-reachable.get(b)!)||a.localeCompare(b));
    const samples=new Map(ordered.map(([id,fen])=>[id,this.explorer.cachedPosition(fen,ratingGroup,quality.explorerSpeeds.join(","))]));
    const pending=ordered.map(([id,fen],index)=>({id,fen,index})).filter(position=>!boundaries.has(position.id)
      && (options.refresh || !samples.get(position.id) || samples.get(position.id)?.stale));
    // One explicit click schedules at most two remote requests, regardless of plan count.
    const batch=this.apiToken&&!options.local?pending.filter(position=>position.index>=offset).slice(0,SCAN_BATCH):[];
    let failed=0;
    await Promise.all(batch.map(async position=>{
      try {
        const sample=await this.explorer.position(position.fen,ratingGroup,options.refresh,quality.explorerSpeeds.join(","));
        samples.set(position.id,sample);if(sample.stale) failed++;
      } catch {failed++; /* A failed batch remains unknown and available for explicit retry. */ }
    }));
    const decisions=new Map<string,"idea"|"unprepared"|"line">();
    const keys=new Map(ordered.map(([id,fen])=>[openingPositionKey(fen),id]));
    for(const choice of this.db.prepare("SELECT position_key,opponent_move_uci,choice FROM opening_preparation_decisions WHERE repertoire_id=? AND profile_id=?").all(repertoireId,profileId) as Array<{position_key:string;opponent_move_uci:string;choice:"idea"|"unprepared"|"line"}>) {
      const id=keys.get(choice.position_key);if(id) decisions.set(`${id}:${choice.opponent_move_uci}`,choice.choice);
    }
    const result=repertoireGoal({repertoireId,rows,learnerColor:repertoire.learner_color,games:quality.coverageGoalGames,maxPlies,
      samples,boundaries,decisions,ratingGroup,speeds:quality.explorerSpeeds});
    const last=batch.at(-1)?.index??(offset-1);
    const remaining=options.refresh ? pending.filter(position=>position.index>last)
      : pending.filter(position=>!samples.get(position.id)||samples.get(position.id)?.stale);
    result.scan={checked:batch.length,remaining:remaining.length,nextOffset:remaining.find(position=>position.index>last)?.index??remaining[0]?.index??null,
      available:ordered.filter(([id])=>samples.has(id)&&samples.get(id)!==null).length,failed,mode:options.refresh?"refresh":"missing"};
    return result;
  }

  async coverage(repertoireId: string, ratingGroup = 1600,
    options: { offset?: number; throughMove?: number; lineId?: string; refresh?: boolean; local?: boolean; skipGameMatching?: boolean } = {}): Promise<OpeningCoverageResponse> {
    const profileId = ensureActiveProfile(this.db);
    const quality = qualityPreferences(this.db, profileId);
    const speeds = quality.explorerSpeeds.join(",");
    if (!RATINGS.has(ratingGroup)) throw new Error("Choose a supported Lichess rating group");
    const repertoire = this.db.prepare("SELECT learner_color FROM opening_repertoires WHERE id = ?").get(repertoireId) as { learner_color: string } | undefined;
    if (!repertoire) throw new Error("Opening repertoire is not available");
    if (this.db.prepare(`SELECT 1 FROM opening_repertoire_preferences
      WHERE profile_id = ? AND repertoire_id = ? AND archived_at IS NOT NULL`).get(profileId, repertoireId)) {
      throw new Error("Restore this repertoire before checking coverage");
    }
    let throughMove = options.throughMove ?? 10;
    const offset = options.offset ?? 0;
    if (!Number.isInteger(throughMove) || throughMove < 1 || throughMove > 30
      || !Number.isInteger(offset) || offset < 0) throw new Error("Choose a move depth from 1 to 30 and a valid scan offset");
    const rows = this.graph(repertoireId, profileId);
    const route = rows.filter(row => row.lineId === (options.lineId ?? rows[0]?.lineId));
    if (!route.length) throw new Error("Choose an active saved line for the coverage route");
    const unique = new Map(rows.map(row => [row.id, row]));
    const outgoing = new Map<string, GraphRow[]>();
    for (const row of unique.values()) outgoing.set(row.from, [...(outgoing.get(row.from) ?? []), row]);
    const knownPositions = new Map(rows.flatMap(row => [[openingPositionKey(row.fen), row.from], [openingPositionKey(row.afterFen), row.to]]));
    const modelEdges: CoverageEdge[] = [...unique.values()];
    const ownPolicy = new Map<string, GraphRow>();
    for (const row of [...unique.values()].sort((a, b) => Number(a.kind !== "primary") - Number(b.kind !== "primary"))) {
      if (row.role === "learner" && !ownPolicy.has(row.from)) ownPolicy.set(row.from, row);
    }
    for (const row of route) if (row.role === "learner") ownPolicy.set(row.from, row);
    const boundaries = new Set(this.db.prepare(`SELECT position_id FROM opening_coverage_boundaries
      WHERE profile_id = ? AND repertoire_id = ?`).pluck().all(profileId, repertoireId) as string[]);
    const absolutePly = (fen: string) => { const fields = fen.split(" "); return (Number(fields[5]) - 1) * 2 + Number(fields[1] === "b"); };
    const minimumMove = Math.floor((absolutePly(route[0]!.fen) + Number(repertoire.learner_color === "white")) / 2) + 1;
    if (options.throughMove === undefined) throughMove = Math.max(throughMove, minimumMove);
    if (throughMove < minimumMove || throughMove > 30) throw new Error(`Choose a depth at or after your move ${minimumMove} (up to 30)`);
    const targetPly = 2 * throughMove - (repertoire.learner_color === "white" ? 1 : 0);
    const candidates = new Map<string, GraphRow>();
    for (const row of rows) {
      const position = row.role === "opponent" ? row : { ...row, from: row.to, fen: row.afterFen, ply: row.ply + 1 };
      if (absolutePly(position.fen) < targetPly && !candidates.has(position.from)) candidates.set(position.from, position);
    }
    const positions = [...candidates.values()].sort((a, b) => absolutePly(a.fen) - absolutePly(b.fen) || a.from.localeCompare(b.from));
    const samples = new Map<string, OpeningExplorerPositionResponse | null>();
    for (const position of positions) samples.set(position.from, this.explorer.cachedPosition(position.fen, ratingGroup, speeds));
    const pending = positions.map((position, index) => ({ position, index })).filter(({ position, index }) => index >= offset
      && !boundaries.has(position.from) && (options.refresh || !samples.get(position.from) || samples.get(position.from)?.stale));
    const batch = this.apiToken && !options.local ? pending.slice(0, SCAN_BATCH) : [];
    await Promise.all(batch.map(async ({ position }) => {
      try { samples.set(position.from, await this.explorer.position(position.fen, ratingGroup, options.refresh, speeds)); }
      catch { /* Keep cached evidence; missing/old samples remain visible. */ }
    }));
    const recall = moveRecall(this.db, profileId);
    const decisions = new Map<string, "idea" | "unprepared" | "line">();
    const decisionRows = this.db.prepare(`SELECT position_key, opponent_move_uci, choice FROM opening_preparation_decisions
      WHERE profile_id = ? AND repertoire_id = ?`).all(profileId, repertoireId) as Array<{
        position_key: string; opponent_move_uci: string; choice: "idea" | "unprepared" | "line";
      }>;
    const personalReplies = new Map<string, Map<string, string>>();
    const personalSamples = new Map<string, { total: number; moves: Map<string, number> }>();
    const visitedGamePositions = new Set<string>();
    const gameReplies = this.db.prepare(`WITH recent AS (SELECT id FROM games WHERE profile_id = ? AND player_color = ?
      ORDER BY COALESCE(played_at, created_at) DESC, created_at DESC LIMIT 100)
      SELECT move.uci, move.san, move.ply, move.game_id AS gameId, before.fen FROM recent JOIN moves move ON move.game_id = recent.id
      JOIN positions before ON before.id = move.from_position_id WHERE move.mover_color <> ? ORDER BY move.game_id, move.ply`)
      .all(profileId, repertoire.learner_color, repertoire.learner_color) as Array<{ uci: string; san: string; fen: string; gameId: string; ply: number }>;
    for (const move of gameReplies) {
      const key = openingPositionKey(move.fen);
      const visit = `${move.gameId}:${key}`;
      if (visitedGamePositions.has(visit)) continue;
      visitedGamePositions.add(visit);
      const personalSample = personalSamples.get(key) ?? { total: 0, moves: new Map<string, number>() };
      personalSample.total += 1;
      personalSample.moves.set(move.uci, (personalSample.moves.get(move.uci) ?? 0) + 1);
      personalSamples.set(key, personalSample);
      if (!personalReplies.has(key)) personalReplies.set(key, new Map());
      personalReplies.get(key)!.set(move.uci, move.san);
    }
    const evidence: OpeningCoveragePosition[] = [];
    let coveredGames = 0; let totalGames = 0;
    for (const position of positions) {
      const sample = samples.get(position.from);
      const saved = (outgoing.get(position.from) ?? []).filter(row => row.role === "opponent");
      const legal = new Map(new Chess(position.fen).moves({ verbose: true }).map(move => [`${move.from}${move.to}${move.promotion ?? ""}`, move.san]));
      const replies = new Map(sample?.replies.filter(reply => legal.has(reply.moveUci)).map(reply => [reply.moveUci, reply]) ?? []);
      for (const edge of saved) if (!replies.has(edge.uci)) replies.set(edge.uci, { moveUci: edge.uci, moveSan: edge.san,
        games: 0, frequencyPercent: 0, whiteWins: 0, draws: 0, blackWins: 0 });
      for (const [uci, san] of personalReplies.get(openingPositionKey(position.fen)) ?? []) {
        if (legal.has(uci) && !replies.has(uci)) replies.set(uci, { moveUci: uci, moveSan: san, games: 0,
          frequencyPercent: 0, whiteWins: 0, draws: 0, blackWins: 0 });
      }
      for (const decision of decisionRows) if (decision.position_key === openingPositionKey(position.fen)) {
        decisions.set(`${position.from}:${decision.opponent_move_uci}`, decision.choice);
        if (legal.has(decision.opponent_move_uci) && !replies.has(decision.opponent_move_uci)) replies.set(decision.opponent_move_uci,
          { moveUci: decision.opponent_move_uci, moveSan: legal.get(decision.opponent_move_uci)!, games: 0, frequencyPercent: 0,
            whiteWins: 0, draws: 0, blackWins: 0 });
      }
      const fresh = Boolean(sample && !sample.stale);
      const reliablePosition = fresh && sample!.totalGames >= PREPARATION_MIN_SAMPLE;
      const branches: OpeningCoverageBranch[] = [...replies.values()].map(reply => {
        const edge = saved.find(row => row.uci === reply.moveUci);
        const after = new Chess(position.fen);
        after.move({ from: reply.moveUci.slice(0, 2), to: reply.moveUci.slice(2, 4),
          ...(reply.moveUci.length === 5 ? { promotion: reply.moveUci[4] } : {}) });
        const destination = edge?.to ?? knownPositions.get(openingPositionKey(after.fen()));
        const response = destination ? ownPolicy.get(destination) : undefined;
        if (!edge && destination && response) modelEdges.push({ id: `transposition:${position.from}:${reply.moveUci}`,
          from: position.from, to: destination, uci: reply.moveUci, san: reply.moveSan, role: "opponent" });
        const memory = response ? recall.get(response.id) : undefined;
        const choice = decisions.get(`${position.from}:${reply.moveUci}`);
        const reliable = reliablePosition && reply.games >= 5;
        const personalSample = personalSamples.get(openingPositionKey(position.fen));
        const personalGames = personalSample?.moves.get(reply.moveUci) ?? 0;
        const status = response ? memory && memory.attempts >= 3 && memory.percent >= 80 ? "prepared" : "needs_practice"
          : choice === "idea" ? "idea_only" : choice === "unprepared" ? "unprepared" : reliable || personalGames > 0 ? "missing_response" : "unknown";
        const preparation = this.preparation?.cached({ fen: position.fen, opponentMoveUci: reply.moveUci,
          learnerColor: repertoire.learner_color as "white" | "black", repertoireId }, { ratingGroup, useExplorer: true });
        return { positionId: position.from, fen: position.fen, lineId: position.lineId, lineTitle: position.lineTitle,
          chapterTitle: position.chapterTitle, moveUci: reply.moveUci, moveSan: reply.moveSan,
          games: reply.games, frequencyPercent: reply.frequencyPercent, status,
          sourceGames: gameReplies.filter(move => move.uci === reply.moveUci && openingPositionKey(move.fen) === openingPositionKey(position.fen))
            .filter((move, index, all) => all.findIndex(other => other.gameId === move.gameId) === index).slice(0, 3).map(move => ({ id: move.gameId, ply: move.ply })),
          personalFrequency: { games: personalGames, positionGames: personalSample?.total ?? 0,
            percent: personalSample?.total ? Math.round(1000 * personalGames / personalSample.total) / 10 : null }, ...(preparation ? { preparation } : {}),
          responseSan: response?.san ?? null, responseMoveId: response?.id ?? null,
          responseLineId: response?.lineId ?? null,
          recallPercent: memory?.percent ?? null, recallAttempts: memory?.attempts ?? 0,
          sampledGames: sample?.totalGames ?? 0, fresh, reliable, boundary: boundaries.has(position.from),
          practiceEnabled: response ? rows.some(row => row.id === response.id && row.practiceEnabled === 1) : false,
        };
      });
      if (reliablePosition && !boundaries.has(position.from)) {
        totalGames += sample!.totalGames;
        coveredGames += branches.filter(branch => branch.responseSan !== null).reduce((sum, branch) => sum + branch.games, 0);
      }
      evidence.push({ positionId: position.from, fen: position.fen, lineId: position.lineId, lineTitle: position.lineTitle,
        chapterTitle: position.chapterTitle, ply: position.ply,
        pathSan: rows.filter(row => row.lineId === position.lineId && row.ply < position.ply).map(row => row.san).join(" "),
        boundary: boundaries.has(position.from),
        sampleStatus: !sample ? "missing" : sample.stale ? "stale" : sample.totalGames < PREPARATION_MIN_SAMPLE ? "small_sample" : "fresh",
        sampledGames: sample?.totalGames ?? 0, fetchedAt: sample?.fetchedAt ?? null, branches });
    }
    const model = modelCoverage({ root: route[0]!.from, plies: Math.max(0, targetPly - absolutePly(route[0]!.fen)),
      edges: modelEdges, ownPolicy, boundaries, decisions,
      samples: new Map(evidence.map(position => [position.positionId, { reliable: position.sampleStatus === "fresh",
        replies: position.branches.filter(branch => branch.games > 0).map(branch => ({ uci: branch.moveUci,
          probability: branch.games / position.sampledGames, reliable: branch.reliable })) }])) });
    const scope = coverageScope(route[0]!.from, Math.max(0, targetPly - absolutePly(route[0]!.fen)), modelEdges, ownPolicy, boundaries);
    for (const position of evidence) position.inScope = scope.has(position.positionId);
    for (const position of evidence) for (const branch of position.branches) {
      const reach = model.reach.get(`${position.positionId}:${branch.moveUci}`);
      branch.reachPercent = reach === undefined ? null : Math.round(reach * 1000) / 10;
    }
    const gaps: OpeningCoverageGap[] = evidence.filter(position => position.inScope && !position.boundary).flatMap(position => position.branches)
      .filter(branch => branch.status !== "prepared");
    const choices = this.db.prepare(`SELECT task_id, choice, until_at FROM opening_task_choices WHERE profile_id = ? AND repertoire_id = ?`)
      .all(profileId, repertoireId) as Array<{ task_id: string; choice: "later" | "skip"; until_at: string | null }>;
    for (const gap of gaps) {
      gap.task = openingTask(gap);
      const choice = choices.find(choice => choice.task_id === gap.task!.id && (choice.choice === "skip" || choice.until_at! > now()));
      if (choice) gap.taskChoice = { choice: choice.choice, untilAt: choice.until_at };
    }
    const tasks = rankedOpeningTasks(gaps);
    const unscanned = positions.map((position, index) => ({ position, index })).filter(({ position }) =>
      !boundaries.has(position.from) && (!samples.get(position.from) || samples.get(position.from)?.stale));
    const last = batch.at(-1)?.index;
    const nextOffset = options.refresh ? pending[batch.length]?.index ?? null
      : unscanned.find(row => last === undefined || row.index > last)?.index ?? null;
    const remainingPositions = options.refresh ? Math.max(0, pending.length - batch.length) : unscanned.length;
    const count = (status: OpeningCoveragePosition["sampleStatus"]) => evidence.filter(position => !position.boundary && position.sampleStatus === status).length;
    const recentGames = this.db.prepare(`SELECT id FROM games WHERE profile_id = ? AND player_color = ?
      ORDER BY COALESCE(played_at, created_at) DESC, created_at DESC LIMIT 100`).pluck().all(profileId, repertoire.learner_color) as string[];
    if (!options.skipGameMatching) for (const gameId of recentGames) this.games?.matchGame(gameId, profileId);
    const matched = new Map((this.db.prepare(`SELECT status, COUNT(*) AS count FROM game_opening_matches
      WHERE repertoire_id = ? AND profile_id = ? AND matched_plies > 0
        AND game_id IN (SELECT id FROM games WHERE profile_id = ? AND player_color = ?
          ORDER BY COALESCE(played_at, created_at) DESC, created_at DESC LIMIT 100)
      GROUP BY status`).all(repertoireId, profileId, profileId, repertoire.learner_color) as Array<{ status: string; count: number }>)
      .map(row => [row.status, row.count]));
    const personalBranches = evidence.flatMap(position => position.branches).filter(branch => (branch.personalFrequency?.games ?? 0) > 0);
    const replyOccurrences = personalBranches.reduce((sum, branch) => sum + branch.personalFrequency!.games, 0);
    const preparedReplyOccurrences = personalBranches.filter(branch => branch.responseSan !== null)
      .reduce((sum, branch) => sum + branch.personalFrequency!.games, 0);
    return { repertoireId, ratingGroup, speeds: quality.explorerSpeeds, positionsChecked: batch.length,
      positionsAvailable: evidence.filter(position => position.sampledGames > 0).length,
      // Compatibility only: local-response sample ratio, not a whole-repertoire forecast.
      coveragePercent: totalGames ? Math.round(1000 * coveredGames / totalGames) / 10 : null, coveredGames, totalGames,
      gaps: [...tasks, ...gaps.filter(gap => gap.status === "unknown" && !gap.taskChoice && !tasks.some(task => task.task?.id === gap.task?.id))], taskHistory: gaps.filter(gap => gap.taskChoice),
      scope: { personal: `Up to 100 recent ${repertoire.learner_color} games, across saved branches through move ${throughMove}.`,
        lichess: `Selected line: ${route[0]!.lineTitle}; ${ratingGroup} rating band; ${quality.explorerSpeeds.join(" / ")}; through move ${throughMove}.` },
      goal: { games: quality.coverageGoalGames, thresholdPercent: 100 / quality.coverageGoalGames,
        relevantMissing: gaps.filter(gap => !gap.responseMoveId && (model.reach.get(`${gap.positionId}:${gap.moveUci}`) ?? 0) + 1e-12 >= 1 / quality.coverageGoalGames).length,
        uncertain: evidence.filter(position => position.inScope && !position.boundary && (position.sampleStatus !== "fresh" || position.branches.some(branch => branch.games > 0 && !branch.reliable))).length,
        met: model.outcomes.unknown <= 1e-12 && !gaps.some(gap => !gap.responseMoveId && (model.reach.get(`${gap.positionId}:${gap.moveUci}`) ?? 0) + 1e-12 >= 1 / quality.coverageGoalGames) },
      positions: evidence, incomplete: unscanned.length > 0 || count("small_sample") > 0,
      personal: { replyOccurrences, preparedReplyOccurrences,
        preparedPercent: replyOccurrences ? Math.round(1000 * preparedReplyOccurrences / replyOccurrences) / 10 : null,
        gamesChecked: recentGames.length, gamesMatched: [...matched.values()].reduce((sum, count) => sum + count, 0),
        playerDeviations: matched.get("player_deviation") ?? 0, opponentDeviations: matched.get("opponent_deviation") ?? 0,
        repertoireEnded: matched.get("repertoire_ended") ?? 0, stayedIn: matched.get("in_repertoire") ?? 0 },
      evidence: { totalPositions: positions.length, freshPositions: count("fresh"), stalePositions: count("stale"),
        smallSamplePositions: count("small_sample"), missingPositions: count("missing"), remainingPositions, nextOffset,
        scanMode: options.refresh ? "refresh" : "missing" },
      model: { throughMove, routeLineId: route[0]!.lineId, routeTitle: route[0]!.lineTitle, ...roundedModel(model.outcomes),
        assumptions: "Estimate from this line's starting position. Uses this line's own moves; elsewhere the first saved primary response. Opponent frequencies are conditional Lichess samples, not a forecast. Ideas and deliberate omissions stay separate. Small, missing or old samples are unknown. Paused practice lines still count as saved content." },
      message: !this.apiToken ? "Local preparation and recall work offline. Set LICHESS_API_TOKEN to load practical samples."
        : unscanned.length ? "Continue scanning to check more positions. Unknown evidence is not a rare move or a covered response."
        : "All in-scope positions have been sampled. Small samples remain uncertain; preparation is not proof of recall." };
  }
}
