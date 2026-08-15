import { useEffect, useState } from "react";

import type { DashboardResponse, TrainingSessionResponse } from "../../../../packages/contracts/src/api";
import { get, post } from "../api";

interface DashboardProps {
  refreshToken: number;
  onChooseMode: (mode: string) => void;
  onStartSession: (session: TrainingSessionResponse) => void;
  onProfileChanged: () => void;
}

export function Dashboard({ refreshToken, onChooseMode, onStartSession, onProfileChanged }: DashboardProps) {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [session, setSession] = useState<TrainingSessionResponse | null>(null);
  const [error, setError] = useState("");
  const [profiles, setProfiles] = useState<Array<{ id: string; displayName: string }>>([]);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);

  const load = (): void => {
    void get<DashboardResponse>("/api/v1/dashboard").then(setDashboard).catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : "Could not load progress");
    });
    void get<TrainingSessionResponse | null>("/api/v1/training/session/active").then(setSession).catch(() => undefined);
    void get<{ activeProfileId: string | null; profiles: Array<{ id: string; displayName: string }> }>("/api/v1/profiles")
      .then((result) => { setProfiles(result.profiles); setActiveProfile(result.activeProfileId); })
      .catch(() => undefined);
  };
  useEffect(() => {
    load();
    window.addEventListener("training-completed", load);
    return () => window.removeEventListener("training-completed", load);
  }, [refreshToken]);

  const createSession = async (): Promise<void> => {
    setError("");
    try {
      const result = await post<TrainingSessionResponse>("/api/v1/training/session", { size: 15 });
      setSession(result);
      onStartSession(result);
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : "Could not build a session");
    }
  };

  if (!dashboard?.profile) return null;
  return (
    <section className="dashboard-section" id="progress">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">What you repeatedly fail to see</span>
          <h2>{dashboard.profile.displayName}’s thinking profile</h2>
        </div>
        <div className="dashboard-actions">
          {profiles.length > 1 && <label>Player
            <select value={activeProfile ?? ""} onChange={async (event) => {
              await post<void>(`/api/v1/profiles/${event.target.value}/activate`);
              setActiveProfile(event.target.value); setSession(null); onProfileChanged();
            }}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}</select>
          </label>}
          <button onClick={() => session ? onStartSession(session) : void createSession()}>
            {session ? `Continue ${session.completedCount ?? 0}/${session.items.length}` : "Build today’s 15"}
          </button>
        </div>
      </div>
      <div className="dashboard-totals">
        <div><strong>{dashboard.totals.games}</strong><span>games</span></div>
        <div><strong>{dashboard.totals.trainingItems}</strong><span>exercises</span></div>
        <div><strong>{dashboard.totals.due}</strong><span>due now</span></div>
        <div><strong>{dashboard.totals.attempts}</strong><span>attempts</span></div>
      </div>
      <div className="dashboard-grid">
        <div className="panel weakness-panel">
          <span className="eyebrow">Recurring problems</span>
          {dashboard.recurringProblems.length === 0 ? (
            <p>Complete a few drills and your recurring misses will appear here.</p>
          ) : dashboard.recurringProblems.map((skill) => (
            <div className="skill-row" key={skill.conceptId}>
              <div><strong>{skill.label}</strong><small>{skill.realGameOccurrences} real-game occurrence{skill.realGameOccurrences === 1 ? "" : "s"}</small></div>
              <div className="skill-score">
                <strong>{skill.successRate === null ? "New" : `${Math.round(skill.successRate * 100)}%`}</strong>
                <small>{skill.recentTrend}</small>
              </div>
            </div>
          ))}
        </div>
        <div className="panel session-panel">
          <span className="eyebrow">Recommended allocation</span>
          <h3>{session?.message ?? "A weakness-weighted session"}</h3>
          {(session?.mix ?? dashboard.recommendedSession).map((entry) => (
            <button
              key={entry.mode}
              className="session-row"
              onClick={() => onChooseMode(entry.mode)}
            >
              <span>{entry.label}</span><strong>{entry.count}</strong>
            </button>
          ))}
          {!session && <p>Recent failures, slow answers, due reviews, and repeated game mistakes get priority.</p>}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
