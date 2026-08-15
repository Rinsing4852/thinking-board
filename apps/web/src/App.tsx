import { useEffect, useState } from "react";

import type { TrainingSessionResponse } from "../../../packages/contracts/src/api";
import { APP_VERSION } from "../../../packages/contracts/src/version";
import { get } from "./api";

import { GameReview } from "./components/GameReview";
import { ImportPanel } from "./components/ImportPanel";
import { TrainingPanel } from "./components/TrainingPanel";
import { WhatChangedPanel } from "./components/WhatChangedPanel";
import { CandidateGenerationPanel } from "./components/CandidateGenerationPanel";
import { Dashboard } from "./components/Dashboard";
import { PunishBlunderPanel } from "./components/PunishBlunderPanel";
import { QuietPositionPanel } from "./components/QuietPositionPanel";
import { GettingStarted } from "./components/GettingStarted";

export function App() {
  const [refreshToken, setRefreshToken] = useState(0);
  const [trainingRequest, setTrainingRequest] = useState<{ itemId: string; requestId: number } | null>(null);
  const [activeMode, setActiveMode] = useState("blunder_check");
  const [session, setSession] = useState<TrainingSessionResponse | null>(null);
  useEffect(() => {
    void get<TrainingSessionResponse | null>("/api/v1/training/session/active")
      .then((activeSession) => {
        setSession(activeSession);
        if (activeSession?.currentItem) setActiveMode(activeSession.currentItem.mode);
      })
      .catch(() => setSession(null));
  }, [refreshToken]);
  const refresh = (): void => {
    setTrainingRequest(null);
    setRefreshToken((value) => value + 1);
  };
  const trainItem = (itemId: string): void => {
    setSession(null);
    setActiveMode("blunder_check");
    setTrainingRequest((current) => ({ itemId, requestId: (current?.requestId ?? 0) + 1 }));
    requestAnimationFrame(() => document.getElementById("trainer")?.scrollIntoView({ behavior: "smooth" }));
  };
  const chooseMode = (mode: string): void => {
    setSession(null);
    setTrainingRequest(null);
    setActiveMode(mode);
    requestAnimationFrame(() => document.getElementById("trainer")?.scrollIntoView({ behavior: "smooth" }));
  };
  const startSession = (nextSession: TrainingSessionResponse): void => {
    setSession(nextSession);
    setTrainingRequest(null);
    if (nextSession.currentItem) setActiveMode(nextSession.currentItem.mode);
    requestAnimationFrame(() => document.getElementById("trainer")?.scrollIntoView({ behavior: "smooth" }));
  };
  const continueSession = async (): Promise<void> => {
    if (!session?.id) return;
    const updated = await get<TrainingSessionResponse>(`/api/v1/training/sessions/${session.id}`);
    setSession(updated);
    if (updated.currentItem) setActiveMode(updated.currentItem.mode);
    setRefreshToken((value) => value + 1);
  };
  const requestedItemId = session?.currentItem?.itemId
    ?? (activeMode === "blunder_check" ? trainingRequest?.itemId : undefined);

  return (
    <>
      <header className="site-header">
        <a className="brand" href="/">
          <span className="brand-mark">♞</span>
          <span>Thinking Board</span>
        </a>
        <div className="loop" aria-label="Training checklist">
          <span><b>1</b> SEE</span>
          <i>→</i>
          <span><b>2</b> CANDIDATES</span>
          <i>→</i>
          <span><b>3</b> CHECK</span>
        </div>
        <span className="local-badge">Local engine · no cloud</span>
      </header>

      <main>
        <section className="hero">
          <div>
            <span className="eyebrow">Train the pause before the move</span>
            <h1>Stop fixing blunders.<br /><em>Start preventing them.</em></h1>
            <p>Your own games become short drills for the thinking habit that failed—not another hunt for Stockfish’s one best move.</p>
          </div>
          <div className="hero-checklist">
            <span>Before I move…</span>
            <strong>Can they check?</strong>
            <strong>Can they capture?</strong>
            <strong>Can they threaten?</strong>
          </div>
        </section>

        <GettingStarted refreshToken={refreshToken} />
        <ImportPanel refreshToken={refreshToken} onAnalyzed={refresh} />
        <Dashboard refreshToken={refreshToken} onChooseMode={chooseMode} onStartSession={startSession} onProfileChanged={() => {
          setSession(null); setTrainingRequest(null); setRefreshToken((value) => value + 1);
        }} />
        <section className="trainer-hub" id="trainer">
          <div className="mode-tabs" aria-label="Training modes">
            {([
              ["what_changed", "1 · What changed"],
              ["candidate_generation", "2 · Candidates"],
              ["blunder_check", "3 · Blunder check"],
              ["punish_blunder", "4 · Punish"],
              ["quiet_position", "5 · Quiet plan"],
            ] as Array<[string, string]>).map(([mode, label]) => (
              <button
                key={mode}
                className={activeMode === mode ? "mode-tab active" : "mode-tab"}
                onClick={() => chooseMode(mode)}
                disabled={Boolean(session)}
              >{label}</button>
            ))}
          </div>
          {session && session.status !== "completed" && (
            <div className="session-progress" aria-live="polite">
              <strong>Today’s session</strong>
              <span>Exercise {(session.completedCount ?? 0) + 1} of {session.items.length}</span>
              <progress value={session.completedCount ?? 0} max={session.items.length} />
            </div>
          )}
          {session?.status !== "completed" && activeMode === "what_changed" && <WhatChangedPanel refreshToken={refreshToken} requestedItemId={requestedItemId} sessionId={session?.id ?? undefined} onCompleted={() => void continueSession()} />}
          {session?.status !== "completed" && activeMode === "candidate_generation" && <CandidateGenerationPanel refreshToken={refreshToken} requestedItemId={requestedItemId} sessionId={session?.id ?? undefined} onCompleted={() => void continueSession()} />}
          {session?.status !== "completed" && activeMode === "blunder_check" && <TrainingPanel refreshToken={refreshToken} requestedItemId={requestedItemId} sessionId={session?.id ?? undefined} onCompleted={() => void continueSession()} />}
          {session?.status !== "completed" && activeMode === "punish_blunder" && <PunishBlunderPanel refreshToken={refreshToken} requestedItemId={requestedItemId} sessionId={session?.id ?? undefined} onCompleted={() => void continueSession()} />}
          {session?.status !== "completed" && activeMode === "quiet_position" && <QuietPositionPanel refreshToken={refreshToken} requestedItemId={requestedItemId} sessionId={session?.id ?? undefined} onCompleted={() => void continueSession()} />}
          {session?.status === "completed" && <div className="panel session-complete"><h2>Session complete</h2><p>{session.message}</p><button onClick={() => setSession(null)}>Return to practice</button></div>}
        </section>
        <GameReview refreshToken={refreshToken} onTrain={trainItem} />
      </main>

      <footer>
        <span>Thinking Board v{APP_VERSION} · Self-hosted · SQLite · Local Stockfish</span>
        <span>SEE → CANDIDATES → CHECK</span>
      </footer>
    </>
  );
}
