import { DailyPracticePlan } from "./components/DailyPracticePlan";
import { GameQualityProgress } from "./components/GameQualityProgress";
import { useEffect, useRef, useState } from "react";

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
  const [dailyPlanActive,setDailyPlanActive]=useState(false);
  const [build,setBuild]=useState<string|null>(null);
  useEffect(()=>{void get<{build?:string|null}>("/api/v1/health").then(result=>setBuild(result.build??null)).catch(()=>undefined);},[]);
  const [profileEpoch,setProfileEpoch]=useState(0);
  const [view, setView] = useState<AppView>(initialView);
  const [openingFocusActive, setOpeningFocusActive] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [gameReviewFocusToken, setGameReviewFocusToken] = useState(0);
  const [trainingRequest, setTrainingRequest] = useState<{ itemId: string; requestId: number } | null>(null);
  const [showGameImport, setShowGameImport] = useState(() => new URLSearchParams(window.location.hash.split("?")[1]).has("add"));
  const [manualPractice,setManualPractice]=useState(false);
  const [activeMode, setActiveMode] = useState("blunder_check");
  const [gameDays, setGameDays] = useState<number | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [sessionAdvancing, setSessionAdvancing] = useState(false);
  const sessionLoad = useRef<AbortController | null>(null);
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
    const controller = new AbortController(); sessionLoad.current = controller;
    void get<TrainingSessionResponse | null>("/api/v1/training/session/active", controller.signal)
      .then((activeSession) => {
        if (controller.signal.aborted) return;
        setSession(activeSession);
        if (activeSession?.currentItem) {
          setActiveMode(activeSession.currentItem.mode);
          setGameDays(activeSession.gameDays ?? null);
        }
      }).catch(() => undefined);
    void get<{status:string}>("/api/v1/practice/daily",controller.signal).then(plan=>{if(!controller.signal.aborted)setDailyPlanActive(plan.status==='active');}).catch(()=>undefined);
    return () => controller.abort();
  }, [profileEpoch]);

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
    setManualPractice(true);
    setSession(null);
    setTrainingRequest(null);
    setActiveMode(mode);
    navigate("today");
    requestAnimationFrame(() => document.getElementById("trainer")?.scrollIntoView({ behavior: "smooth" }));
  };
  const startSession = (nextSession: TrainingSessionResponse): void => {
    sessionLoad.current?.abort();
    if (!nextSession.id) return;
    setSession(nextSession); setSessionError("");
    setGameDays(nextSession.gameDays ?? null);
    setTrainingRequest(null);
    if (nextSession.currentItem) setActiveMode(nextSession.currentItem.mode);
    navigate("today");
    requestAnimationFrame(() => document.getElementById("trainer")?.scrollIntoView({ behavior: "smooth" }));
  };
  useEffect(() => {
    if (!session?.id || session.status === "completed") return;
    const sessionId = session.id;
    let controller: AbortController | null = null;
    const updateCount = (): void => {
      controller?.abort(); controller = new AbortController();
      const signal = controller.signal;
      void get<TrainingSessionResponse>(`/api/v1/training/sessions/${sessionId}`, signal).then(updated => {
        if (signal.aborted) return;
        // Refresh counts without moving the board away from the answer feedback.
        setSession(current => current?.id === sessionId ? { ...current,
          completedCount: updated.completedCount ?? 0,
          remainingCount: updated.remainingCount ?? updated.items.length - (updated.completedCount ?? 0),
          remainingMix: updated.remainingMix ?? updated.mix,
        } : current);
      }).catch(() => undefined);
    };
    window.addEventListener("training-completed", updateCount);
    return () => { controller?.abort(); window.removeEventListener("training-completed", updateCount); };
  }, [session?.id, session?.status]);
  const continueSession = async (): Promise<void> => {
    if (!session?.id || sessionAdvancing) return;
    setSessionAdvancing(true); setSessionError("");
    try {
      const updated = await get<TrainingSessionResponse>(`/api/v1/training/sessions/${session.id}`);
      setSession(updated);
      if (updated.currentItem) setActiveMode(updated.currentItem.mode);
      setRefreshToken((value) => value + 1);
    } catch (failure) { setSessionError(failure instanceof Error ? failure.message : "Could not continue your session"); }
    finally { setSessionAdvancing(false); }
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
              <div><DailyPracticePlan key={profileEpoch} refreshToken={refreshToken} gameDays={gameDays}
                  onOpening={()=>navigate("openings")} onThinking={startSession} onGames={()=>navigate("games")}
                  onBuild={()=>navigate("openings")} onStateChange={setDailyPlanActive}/>
                <p>Or choose your own practice below.</p>
                <div className="workflow-actions">
                  <button className="secondary" onClick={() => navigate("openings")}>Practise openings</button>
                  <button className="secondary" onClick={() => navigate("games")}>Review a game</button>
                </div>
              </div>
            </section>
            <Dashboard compact gameDays={gameDays} onGameDaysChanged={days => { setGameDays(days); setTrainingRequest(null); }} practiceActive={Boolean(session)} onChooseGames={() => navigate("games")} onImport={() => openGamesAt("import")} refreshToken={refreshToken} onChooseMode={chooseMode} onStartSession={startSession} onProfileChanged={() => {
              setSession(null); setDailyPlanActive(false); setTrainingRequest(null); setProfileEpoch(value=>value+1);setRefreshToken((value) => value + 1);
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
                  <span>{session.items.length - (session.completedCount ?? 0)} remaining · {session.completedCount ?? 0} completed</span>
                  <progress value={session.completedCount ?? 0} max={session.items.length} />
                  {Boolean(session.similarDeferredCount) && <span>{session.similarDeferredCount} similar tactical positions kept for later.</span>}
                </div>
              )}
              {(session || trainingRequest || manualPractice) && session?.status !== "completed" && activeMode === "what_changed" && <WhatChangedPanel gameDays={gameDays} refreshToken={refreshToken} requestedItemId={requestedItemId} sessionId={session?.id ?? undefined} onCompleted={() => void continueSession()} />}
              {(session || trainingRequest || manualPractice) && session?.status !== "completed" && activeMode === "candidate_generation" && <CandidateGenerationPanel gameDays={gameDays} refreshToken={refreshToken} requestedItemId={requestedItemId} sessionId={session?.id ?? undefined} onCompleted={() => void continueSession()} />}
              {(session || trainingRequest || manualPractice) && session?.status !== "completed" && activeMode === "blunder_check" && <TrainingPanel gameDays={gameDays} refreshToken={refreshToken} requestedItemId={requestedItemId} sessionId={session?.id ?? undefined} onCompleted={() => void continueSession()} />}
              {(session || trainingRequest || manualPractice) && session?.status !== "completed" && activeMode === "punish_blunder" && <PunishBlunderPanel gameDays={gameDays} refreshToken={refreshToken} requestedItemId={requestedItemId} sessionId={session?.id ?? undefined} onCompleted={() => void continueSession()} />}
              {(session || trainingRequest || manualPractice) && session?.status !== "completed" && activeMode === "quiet_position" && <QuietPositionPanel gameDays={gameDays} refreshToken={refreshToken} requestedItemId={requestedItemId} sessionId={session?.id ?? undefined} onCompleted={() => void continueSession()} />}
              {sessionError && <div className="panel" role="alert">{sessionError} <button onClick={() => void continueSession()}>Retry continuing session</button></div>}
              {sessionAdvancing && <p role="status">Updating your session…</p>}
              {session?.status === "completed" && <div className="panel session-complete"><h2>Session complete</h2><p>{session.message}</p><button onClick={() => setSession(null)}>Return to practice</button></div>}
            </section>
          </>
        )}

        {view === "openings" && dailyPlanActive && <div className="panel daily-plan-return"><span>Opening practice · part of your daily plan</span><button className="secondary" onClick={()=>{setRefreshToken(value=>value+1);navigate("today");}}>Back to daily plan</button></div>}
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
            <GameQualityProgress key={profileEpoch} refreshToken={refreshToken} onOpenGames={()=>navigate("games")}/>
            <section className="panel opening-progress-link" aria-label="Opening progress">
              <div><h3>Preparation gaps</h3>
                <p>Open a saved repertoire to inspect missing replies and choose what to prepare. The dashboard figures below cover thinking drills from your games.</p></div>
              <button className="secondary" onClick={() => navigate("openings")}>Open saved repertoires</button>
            </section>
            <OpeningLearningMeasures refreshToken={refreshToken} />
            <Dashboard gameDays={gameDays} onGameDaysChanged={days => { setGameDays(days); setTrainingRequest(null); }} practiceActive={Boolean(session)} onChooseGames={() => navigate("games")} onImport={() => openGamesAt("import")} refreshToken={refreshToken} onChooseMode={chooseMode} onStartSession={startSession} onProfileChanged={() => {
              setSession(null); setDailyPlanActive(false); setTrainingRequest(null); setProfileEpoch(value=>value+1);setRefreshToken((value) => value + 1);
            }} />
          </>
        )}
      </main>

      <footer>
        <span>Thinking Board v{APP_VERSION}{build&&` · build ${build.slice(0,7)}`}</span>
        <a href="/legal/index.html">Source &amp; licences</a>
      </footer>
    </>
  );
}
