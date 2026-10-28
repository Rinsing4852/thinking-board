import { useEffect, useRef, useState } from "react";

import type { DashboardResponse, SkillMetric, TrainingSessionResponse } from "../../../../packages/contracts/src/api";
import { get, post } from "../api";

interface DashboardProps {
  refreshToken: number;
  onChooseMode: (mode: string) => void;
  onStartSession: (session: TrainingSessionResponse) => void;
  onProfileChanged: () => void;
  onImport: () => void;
  compact?: boolean;
  onChooseGames?:()=>void;
  gameDays: number | null;
  onGameDaysChanged: (days: number | null) => void;
  practiceActive: boolean;
}

function progressLabel(skill: SkillMetric): string {
  if (skill.attempts === 0) return "Not trained";
  if (skill.attempts < 3) return "Learning";
  return `${Math.round((skill.successRate ?? 0) * 100)}%`;
}

function progressNote(skill: SkillMetric): string {
  if (skill.attempts === 0) return "from your games";
  if (skill.attempts < 3) return `${skill.attempts} practice attempt${skill.attempts === 1 ? "" : "s"}`;
  return skill.recentTrend;
}

export function Dashboard({ refreshToken, onChooseMode, onStartSession, onProfileChanged, onImport, onChooseGames, gameDays, onGameDaysChanged, practiceActive, compact = false }: DashboardProps) {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [session, setSession] = useState<TrainingSessionResponse | null>(null);
  const [error, setError] = useState("");
  const [profiles, setProfiles] = useState<Array<{ id: string; displayName: string }>>([]);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const loadRequest = useRef<AbortController | null>(null);

  const load = (): void => {
    loadRequest.current?.abort();
    const controller = new AbortController(); loadRequest.current = controller;
    setLoading(true); setError("");
    void get<DashboardResponse>(`/api/v1/dashboard${gameDays === null ? "" : `?gameDays=${gameDays}`}`, controller.signal).then(value => {
      if (!controller.signal.aborted) setDashboard(value);
    }).catch((loadError: unknown) => {
      if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Could not load progress");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    void get<TrainingSessionResponse | null>("/api/v1/training/session/active", controller.signal)
      .then(value => { if (!controller.signal.aborted) setSession(value); }).catch(() => undefined);
    void get<{ activeProfileId: string | null; profiles: Array<{ id: string; displayName: string }> }>("/api/v1/profiles", controller.signal)
      .then((result) => { if (!controller.signal.aborted) { setProfiles(result.profiles); setActiveProfile(result.activeProfileId); } })
      .catch(() => undefined);
  };
  useEffect(() => {
    load();
    window.addEventListener("training-completed", load);
    return () => { window.removeEventListener("training-completed", load); loadRequest.current?.abort(); };
  }, [refreshToken, gameDays]);

  const createSession = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await post<TrainingSessionResponse>("/api/v1/training/session", { size: 15, gameDays });
      if (result.id) { setSession(result); onStartSession(result); }
      else { setSession(null); load(); }
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : "Could not build a session");
    } finally { setBusy(false); }
  };

  if (compact && !dashboard?.profile && !loading && !error) return null;
  if (!dashboard?.profile) return <section className="panel dashboard-state" aria-label="Training progress" aria-busy={loading}>
    {error ? <><p className="error" role="alert">{error}</p><button className="secondary" onClick={load}>Retry progress</button></>
      : <><p role="status">{loading ? "Loading your progress…" : "Import a game to start tracking your thinking habits."}</p>
        {!loading && <button onClick={onImport}>Import a game to begin</button>}</>}
  </section>;
  if(compact&&dashboard.totals.trainingItems===0&&dashboard.totals.games>0)return <section className="panel" aria-label="Next step for saved games">
    <h2>{dashboard.totals.awaitingAnalysis?`${dashboard.totals.awaitingAnalysis} saved games awaiting analysis`:"Your saved games are ready to review"}</h2>
    <p>{dashboard.totals.awaitingAnalysis?"Choose the games you want the engine to analyse. You can start, resume or retry analysis in My games.":"No thinking exercises were found for this practice pool. You can still replay your games and review your preparation."}</p>
    <button onClick={onChooseGames??onImport}>{dashboard.totals.awaitingAnalysis?"Choose games to analyse":"Review saved games"}</button>
    {error&&<p role="alert">{error}</p>}
  </section>;
  if (compact && dashboard.totals.trainingItems === 0) return error
    ? <div className="panel"><p className="error" role="alert">{error}</p><button onClick={load}>Retry progress</button></div>
    : null;
  const available = dashboard.practice?.available ?? dashboard.totals.due;
  const remaining = session ? session.remainingCount ?? session.items.length - (session.completedCount ?? 0) : 0;
  return (
    <section className={`dashboard-section${compact ? " dashboard-compact" : ""}`} id="progress" aria-busy={loading}>
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{compact ? "Ready to practise" : "What to train next"}</span>
          <h2>{compact ? "Your thinking practice" : `${dashboard.profile.displayName}’s training profile`}</h2>
        </div>
        <div className="dashboard-actions">
          <label>Player
            <select disabled={busy || loading || profiles.length < 2} value={activeProfile ?? dashboard.profile.id} onChange={async (event) => {
              const profileId = event.target.value;
              setBusy(true); setError("");
              try {
                await post<void>(`/api/v1/profiles/${profileId}/activate`);
                setActiveProfile(profileId); setSession(null); onProfileChanged();
              } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not change player"); }
              finally { setBusy(false); }
            }}>{(profiles.length ? profiles : [dashboard.profile]).map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}</select>
          </label>
          <label>Practice games
            <select value={gameDays ?? "all"} disabled={busy || loading || practiceActive || Boolean(session)}
              onChange={event => onGameDaysChanged(event.target.value === "all" ? null : Number(event.target.value))}>
              <option value="all">All game dates</option>
              {[1, 2, 7, 30, 90].map(days => <option key={days} value={days}>Last {days} {days === 1 ? "day" : "days"}</option>)}
            </select>
          </label>
          <button className={compact ? "secondary" : undefined} disabled={busy || loading || (dashboard.totals.trainingItems > 0 && !session && (available === 0 || practiceActive))} onClick={() => dashboard.totals.trainingItems === 0 ? onImport() : session ? onStartSession(session) : void createSession()}>
            {busy ? "Please wait…" : dashboard.totals.trainingItems === 0 ? "Import a game to begin" : session ? `Continue session · ${remaining} remaining` : practiceActive ? "Finish session below" : available > 0 ? `Start practice · ${Math.min(15, available)} exercises` : "Nothing due now"}
          </button>
        </div>
      </div>
      <p className="panel-help" aria-live="polite">{available} exercises due now{gameDays === null ? "" : ` from games played in the last ${gameDays} ${gameDays === 1 ? "day" : "days"}`} · {dashboard.totals.trainingItems} saved in your library.</p>
      {gameDays !== null && <p className="panel-help">Uses when each game was played. Games without a known date appear only under All game dates.</p>}
      {(practiceActive || session) && <p className="panel-help">Finish your current session before changing its game filter.</p>}
      {available === 0 && <p className="panel-help">{dashboard.practice?.nextDueAt ? `Next review: ${new Date(dashboard.practice.nextDueAt).toLocaleString()}.` : "No exercises are due for this game filter. Try a wider time range."} Missed or revealed answers return after 10 minutes. Successful answers return later.</p>}
      {!compact && <>
      <div className="dashboard-totals">
        <div><strong>{dashboard.totals.games}</strong><span>games</span></div>
        <div><strong>{dashboard.totals.trainingItems}</strong><span>exercises</span></div>
        <div><strong>{dashboard.totals.due}</strong><span>due now</span></div>
        <div><strong>{dashboard.totals.attempts}</strong><span>attempts</span></div>
      </div>
      {dashboard.totals.trainingItems === 0 && <p className="panel-help">Your progress starts with a game. Import its PGN, choose your name, then request analysis for the games you want to practise.</p>}
      <div className="dashboard-grid">
        <div className="panel weakness-panel">
          <span className="eyebrow">Training priorities</span>
          {dashboard.recurringProblems.length === 0 ? (
            <p>Complete a few drills and your recurring misses will appear here.</p>
          ) : dashboard.recurringProblems.map((skill) => (
            <div className="skill-row" key={skill.conceptId}>
              <div><strong>{skill.label}</strong><small>{skill.realGameOccurrences} real-game occurrence{skill.realGameOccurrences === 1 ? "" : "s"}</small></div>
              <div className="skill-score">
                <strong>{progressLabel(skill)}</strong>
                <small>{progressNote(skill)}</small>
              </div>
            </div>
          ))}
        </div>
        <div className="panel session-panel">
          <span className="eyebrow">Today’s practice mix</span>
          <h3>{session?.message ?? "A weakness-weighted session"}</h3>
          {(session?.remainingMix ?? session?.mix ?? dashboard.recommendedSession).map((entry) => session ? (
            <div key={entry.mode} className="session-row">
              <span>{entry.label}</span><strong>{entry.count}</strong>
            </div>
          ) : (
            <button key={entry.mode} className="session-row" onClick={() => onChooseMode(entry.mode)}>
              <span>{entry.label}</span><strong>{entry.count}</strong>
            </button>
          ))}
          {!session && <p>Recent failures, slow answers, due reviews, and repeated game mistakes get priority.</p>}
        </div>
      </div>
      </>}
      {error && <p className="error" role="alert">{error} <button className="text-button" onClick={load}>Retry progress</button></p>}
    </section>
  );
}
