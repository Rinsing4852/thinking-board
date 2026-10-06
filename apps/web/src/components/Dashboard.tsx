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

export function Dashboard({ refreshToken, onChooseMode, onStartSession, onProfileChanged, onImport, compact = false }: DashboardProps) {
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
    void get<DashboardResponse>("/api/v1/dashboard", controller.signal).then(value => {
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
  }, [refreshToken]);

  const createSession = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await post<TrainingSessionResponse>("/api/v1/training/session", { size: 15 });
      setSession(result);
      onStartSession(result);
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
  if (compact && dashboard.totals.trainingItems === 0) return error
    ? <div className="panel"><p className="error" role="alert">{error}</p><button onClick={load}>Retry progress</button></div>
    : null;
  return (
    <section className={`dashboard-section${compact ? " dashboard-compact" : ""}`} id="progress" aria-busy={loading}>
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{compact ? "Ready to practise" : "What to train next"}</span>
          <h2>{compact ? "Your thinking practice" : `${dashboard.profile.displayName}’s training profile`}</h2>
        </div>
        <div className="dashboard-actions">
          {profiles.length > 1 && <label>Player
            <select disabled={busy || loading} value={activeProfile ?? ""} onChange={async (event) => {
              const profileId = event.target.value;
              setBusy(true); setError("");
              try {
                await post<void>(`/api/v1/profiles/${profileId}/activate`);
                setActiveProfile(profileId); setSession(null); onProfileChanged();
              } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not change player"); }
              finally { setBusy(false); }
            }}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}</select>
          </label>}
          <button disabled={busy} onClick={() => dashboard.totals.trainingItems === 0 ? onImport() : session ? onStartSession(session) : void createSession()}>
            {busy ? "Please wait…" : dashboard.totals.trainingItems === 0 ? "Import a game to begin" : session ? `Continue session · ${session.completedCount ?? 0}/${session.items.length}` : "Start a 15-exercise session"}
          </button>
        </div>
      </div>
      {compact ? <p className="panel-help">{dashboard.totals.due} exercises due · {dashboard.totals.trainingItems} available. Detailed results are in Progress.</p> : <>
      <div className="dashboard-totals">
        <div><strong>{dashboard.totals.games}</strong><span>games</span></div>
        <div><strong>{dashboard.totals.trainingItems}</strong><span>exercises</span></div>
        <div><strong>{dashboard.totals.due}</strong><span>due now</span></div>
        <div><strong>{dashboard.totals.attempts}</strong><span>attempts</span></div>
      </div>
      {dashboard.totals.trainingItems === 0 && <p className="panel-help">Your progress starts with a game. Import its PGN, choose your name, then practise the positions found in analysis.</p>}
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
          {(session?.mix ?? dashboard.recommendedSession).map((entry) => session ? (
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
