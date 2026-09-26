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
import { OpeningPractice } from "./components/OpeningPractice";

type AppView = "today" | "openings" | "games" | "progress";

function initialView(): AppView {
  const hash = window.location.hash.slice(1);
  return hash === "openings" || hash === "games" || hash === "progress" ? hash : "today";
}

export function App() {
  const [view, setView] = useState<AppView>(initialView);
  const [openingFocusActive, setOpeningFocusActive] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [trainingRequest, setTrainingRequest] = useState<{ itemId: string; requestId: number } | null>(null);
  const [activeMode, setActiveMode] = useState("blunder_check");
  const [session, setSession] = useState<TrainingSessionResponse | null>(null);

  const navigate = (nextView: AppView): void => {
    setView(nextView);
    window.history.replaceState(null, "", nextView === "today" ? "#today" : `#${nextView}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const onHashChange = (): void => setView(initialView());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

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
    navigate("today");
    requestAnimationFrame(() => document.getElementById("trainer")?.scrollIntoView({ behavior: "smooth" }));
  };
  const openStartedOpeningPractice = (): void => {
    setRefreshToken((value) => value + 1);
    navigate("openings");
  };
  const chooseMode = (mode: string): void => {
    setSession(null);
    setTrainingRequest(null);
    setActiveMode(mode);
    navigate("today");
    requestAnimationFrame(() => document.getElementById("trainer")?.scrollIntoView({ behavior: "smooth" }));
  };
  const startSession = (nextSession: TrainingSessionResponse): void => {
    setSession(nextSession);
    setTrainingRequest(null);
    if (nextSession.currentItem) setActiveMode(nextSession.currentItem.mode);
    navigate("today");
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
      <header className={`site-header${openingFocusActive ? " practice-hidden" : ""}`}>
        <a className="brand" href="#today" onClick={() => navigate("today")}>
          <span className="brand-mark">♞</span>
          <span>Thinking Board</span>
        </a>
        <nav className="site-nav" aria-label="Main navigation">
          {([[
            "today", "Today",
          ], ["openings", "Openings"], ["games", "My games"], ["progress", "Progress"]] as Array<[AppView, string]>).map(([target, label]) => (
            <button className={view === target ? "active" : ""} key={target} onClick={() => navigate(target)}>{label}</button>
          ))}
        </nav>
        <span className="local-badge">Local engine · no cloud</span>
      </header>

      <main className={`app-view app-view-${view}${openingFocusActive ? " app-view-practice-focus" : ""}`}>
        {view === "today" && (
          <>
            <section className="hero hero-compact">
              <div>
                <span className="eyebrow">Train the pause before the move</span>
                <h1>See it. Choose. Check.</h1>
                <p>Practise the thinking habit that failed in your own games, one focused position at a time.</p>
              </div>
              <div className="hero-checklist">
                <span>Before I move…</span>
                <strong>Can they check?</strong>
                <strong>Can they capture?</strong>
                <strong>Can they threaten?</strong>
              </div>
            </section>
            <GettingStarted refreshToken={refreshToken} onNavigate={navigate} />
            <Dashboard refreshToken={refreshToken} onChooseMode={chooseMode} onStartSession={startSession} onProfileChanged={() => {
              setSession(null); setTrainingRequest(null); setRefreshToken((value) => value + 1);
            }} />
            <section className="trainer-hub" id="trainer">
              <div className="mode-tabs" aria-label="Training modes">
                {([[
                  "what_changed", "1 · What changed",
                ], ["candidate_generation", "2 · Candidates"], ["blunder_check", "3 · Blunder check"], ["punish_blunder", "4 · Punish"], ["quiet_position", "5 · Quiet plan"]] as Array<[string, string]>).map(([mode, label]) => (
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
          </>
        )}

        {view === "openings" && <OpeningPractice refreshToken={refreshToken} onOpenGames={() => setView("games")} onFocusChange={setOpeningFocusActive} />}

        {view === "games" && (
          <>
            <div className="page-heading">
              <span className="eyebrow">Your games</span>
              <h1>Import. Analyse. Learn.</h1>
              <p>Compare your latest games with your repertoire, practise the first missed decision, then review important thinking mistakes.</p>
            </div>
            <GameReview
              refreshToken={refreshToken}
              onTrain={trainItem}
              onOpeningPracticeStarted={openStartedOpeningPractice}
            />
            <ImportPanel refreshToken={refreshToken} onAnalyzed={refresh} />
          </>
        )}

        {view === "progress" && (
          <>
            <div className="page-heading">
              <span className="eyebrow">Patterns over time</span>
              <h1>What do I repeatedly miss?</h1>
              <p>Use your real-game occurrences and practice results to choose the next thinking habit to strengthen.</p>
            </div>
            <Dashboard refreshToken={refreshToken} onChooseMode={chooseMode} onStartSession={startSession} onProfileChanged={() => {
              setSession(null); setTrainingRequest(null); setRefreshToken((value) => value + 1);
            }} />
          </>
        )}
      </main>

      <footer>
        <span>Thinking Board v{APP_VERSION} · Self-hosted · SQLite · Local Stockfish</span>
        <span>SEE → CANDIDATES → CHECK</span>
      </footer>
    </>
  );
}
