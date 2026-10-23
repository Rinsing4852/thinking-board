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
import { OpeningLearningMeasures } from "./components/OpeningLearningMeasures";
import { OpeningPractice } from "./components/OpeningPractice";

type AppView = "today" | "openings" | "games" | "progress";

function initialView(): AppView {
  const hash = window.location.hash.slice(1).split("?")[0];
  return hash === "openings" || hash === "games" || hash === "progress" ? hash : "today";
}

export function App() {
  const [view, setView] = useState<AppView>(initialView);
  const [openingFocusActive, setOpeningFocusActive] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [gameReviewFocusToken, setGameReviewFocusToken] = useState(0);
  const [trainingRequest, setTrainingRequest] = useState<{ itemId: string; requestId: number } | null>(null);
  const [showGameImport, setShowGameImport] = useState(() => new URLSearchParams(window.location.hash.split("?")[1]).has("add"));
  const [activeMode, setActiveMode] = useState("blunder_check");
  const [session, setSession] = useState<TrainingSessionResponse | null>(null);

  const navigate = (nextView: AppView): void => {
    setView(nextView);
    if (view !== nextView) window.history.pushState(null, "", `#${nextView}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const onHashChange = (): void => {
      const nextView = initialView(); setView(nextView);
      if (nextView === "games" && new URLSearchParams(window.location.hash.split("?")[1]).has("add")) setShowGameImport(true);
      if (nextView !== "openings") setOpeningFocusActive(false);
    };
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("popstate", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("popstate", onHashChange);
    };
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
  const refreshAfterGameAnalysis = (): void => {
    refresh();
    setGameReviewFocusToken((value) => value + 1);
  };
  const openGamesAt = (targetId: "import" | "opening-inbox"): void => {
    setView("games");
    if (targetId === "import") setShowGameImport(true);
    window.history.pushState(null, "", "#games");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
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
      <a className="skip-link" href="#main-content" onClick={event => {
        event.preventDefault(); document.getElementById("main-content")?.focus();
      }}>Skip to main content</a>
      <header className={`site-header${openingFocusActive ? " practice-hidden" : ""}`}>
        <a className="brand" href="#today" onClick={event => { event.preventDefault(); navigate("today"); }}>
          <span className="brand-mark">♞</span>
          <span>Thinking Board</span>
        </a>
        <nav className="site-nav" aria-label="Main navigation">
          {([[
            "today", "Today",
          ], ["openings", "Openings"], ["games", "My games"], ["progress", "Progress"]] as Array<[AppView, string]>).map(([target, label]) => (
            <button className={view === target ? "active" : ""} aria-current={view === target ? "page" : undefined} key={target} onClick={() => navigate(target)}>{label}</button>
          ))}
        </nav>

      </header>

      <main id="main-content" tabIndex={-1} className={`app-view app-view-${view}${openingFocusActive ? " app-view-practice-focus" : ""}`}>
        {view === "today" && (
          <>
            <section className="hero hero-compact">
              <div><h1>What would you like to practise?</h1><p>Choose your openings, review a game, or work on a thinking exercise below.</p>
                <div className="workflow-actions">
                  <button onClick={() => navigate("openings")}>Practise openings</button>
                  <button className="secondary" onClick={() => navigate("games")}>Review a game</button>
                </div>
              </div>
            </section>
            <Dashboard compact onImport={() => openGamesAt("import")} refreshToken={refreshToken} onChooseMode={chooseMode} onStartSession={startSession} onProfileChanged={() => {
              setSession(null); setTrainingRequest(null); setRefreshToken((value) => value + 1);
            }} />
            <section className="trainer-hub" id="trainer">
              <details className="panel workflow-disclosure thinking-mode-picker"><summary>Choose a thinking exercise</summary>
              <p>Start with blunder check, or choose a specific skill to practise.</p>
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
              </details>
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

        {view === "openings" && <OpeningPractice
          refreshToken={refreshToken}
          onOpenGames={() => openGamesAt("opening-inbox")}
          onReviewPlayedGame={() => navigate("games")}
          onAnalyzeGame={() => openGamesAt("import")}
          onOpenGame={gameId => {
            setView("games"); window.history.pushState(null, "", `#games?game=${encodeURIComponent(gameId)}`);
            setGameReviewFocusToken(value => value + 1);
          }}
          onFocusChange={setOpeningFocusActive}
        />}

        {view === "games" && (
          <>
            <div className="page-heading">
              <span className="eyebrow">Your games</span>
              <h1>My games</h1>
              <p>Choose a saved game to replay it and practise the moves you missed.</p>
            </div>
            <ImportPanel refreshToken={refreshToken} onAnalyzed={refreshAfterGameAnalysis} expanded={showGameImport} onExpandedChange={setShowGameImport} />
            <GameReview
              refreshToken={refreshToken}
              focusToken={gameReviewFocusToken}
              onTrain={trainItem}
              onOpeningPracticeStarted={openStartedOpeningPractice}
            />
          </>
        )}

        {view === "progress" && (
          <>
            <div className="page-heading">
              <span className="eyebrow">Patterns over time</span>
              <h1>Your progress</h1>
              <p>Use your real-game occurrences and practice results to choose the next thinking habit to strengthen.</p>
            </div>
            <section className="panel opening-progress-link" aria-label="Opening progress">
              <div><h3>Preparation gaps</h3>
                <p>Open a saved repertoire to inspect missing replies and choose what to prepare. The dashboard figures below cover thinking drills from your games.</p></div>
              <button className="secondary" onClick={() => navigate("openings")}>Open saved repertoires</button>
            </section>
            <OpeningLearningMeasures />
            <Dashboard onImport={() => openGamesAt("import")} refreshToken={refreshToken} onChooseMode={chooseMode} onStartSession={startSession} onProfileChanged={() => {
              setSession(null); setTrainingRequest(null); setRefreshToken((value) => value + 1);
            }} />
          </>
        )}
      </main>

      <footer>
        <span>Thinking Board v{APP_VERSION}</span>
        <a href="/legal/index.html">Source &amp; licences</a>
      </footer>
    </>
  );
}
