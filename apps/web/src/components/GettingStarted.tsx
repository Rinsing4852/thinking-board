import { useEffect, useState } from "react";

import type { DashboardResponse } from "../../../../packages/contracts/src/api";
import { get } from "../api";

interface GettingStartedProps {
  refreshToken: number;
  onNavigate: (destination: "today" | "games") => void;
}

export function GettingStarted({ refreshToken, onNavigate }: GettingStartedProps) {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);

  useEffect(() => {
    const load = (): void => { void get<DashboardResponse>("/api/v1/dashboard").then(setDashboard).catch(() => undefined); };
    load();
    window.addEventListener("training-completed", load);
    return () => window.removeEventListener("training-completed", load);
  }, [refreshToken]);

  if (!dashboard || dashboard.totals.gameAttempts > 0) return null;
  const activeStep = dashboard.totals.games === 0 ? 1 : dashboard.totals.trainingItems === 0 ? 2 : 3;
  const heading = activeStep === 1
    ? "Start with one of your games"
    : activeStep === 2
      ? "Your game is becoming exercises"
      : "Your first exercise is ready";

  return (
    <section className="panel getting-started" aria-labelledby="getting-started-heading">
      <div>
        <span className="eyebrow">First time here?</span>
        <h2 id="getting-started-heading">{heading}</h2>
        <p>You do not need an opening book or chess notation. The app will show one position and one question at a time.</p>
      </div>
      <ol aria-label="Getting started steps">
        <li className={activeStep === 1 ? "active" : activeStep > 1 ? "complete" : ""}>
          <span>1</span><div><strong>Paste a game</strong><small>Copy its PGN text and choose your name.</small></div>
        </li>
        <li className={activeStep === 2 ? "active" : activeStep > 2 ? "complete" : ""}>
          <span>2</span><div><strong>Let Stockfish analyse it</strong><small>You can refresh or close the page; progress is saved.</small></div>
        </li>
        <li className={activeStep === 3 ? "active" : ""}>
          <span>3</span><div><strong>Practise the missed thinking step</strong><small>Read the feedback, then try the pattern again later.</small></div>
        </li>
      </ol>
      {activeStep !== 2 && (activeStep === 1
        ? <button className="onboarding-action" onClick={() => onNavigate("games")}>Paste my first game</button>
        : <a className="onboarding-action" href="#trainer" onClick={() => onNavigate("today")}>Go to my first exercise</a>)}
    </section>
  );
}
