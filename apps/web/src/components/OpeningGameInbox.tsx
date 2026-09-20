import { useState } from "react";

import type {
  GameOpeningInboxGroup,
  GameOpeningInboxResponse,
  OpeningSurprisePreparationResponse,
} from "../../../../packages/contracts/src/api";
import { OpeningSurprisePrep } from "./OpeningSurprisePrep";

interface OpeningGameInboxProps {
  inbox: GameOpeningInboxResponse | null;
  busyKey: string | null;
  practiceBusy: boolean;
  onInspect: (gameId: string) => void;
  onPractice: (gameId: string) => void;
  onMarkReviewed: (groupKey: string) => void;
  onPrepared: (response: OpeningSurprisePreparationResponse) => void;
}

function moveLabel(group: GameOpeningInboxGroup): string {
  const departure = group.opening.departure;
  if (!departure) return "the opening";
  return departure.moverColor === "white"
    ? `${departure.moveNumber}.${departure.moveSan}`
    : `${departure.moveNumber}...${departure.moveSan}`;
}

function heading(group: GameOpeningInboxGroup): string {
  if (group.opening.status === "player_deviation" && group.opening.expectedMove) {
    return `Recall ${group.opening.expectedMove.moveSan} instead of ${group.opening.departure?.moveSan}`;
  }
  if (group.opening.status === "opponent_deviation") {
    return `Your opponent surprised you with ${moveLabel(group)}`;
  }
  return `Your prepared material ended at ${moveLabel(group)}`;
}

function statusLabel(group: GameOpeningInboxGroup): string {
  if (group.opening.status === "player_deviation") return "Repertoire miss";
  if (group.opening.status === "opponent_deviation") return "Opponent surprise";
  return "Coverage gap";
}

function occurrenceLabel(group: GameOpeningInboxGroup): string {
  const seen = group.occurrenceCount === 1 ? "Seen once" : `Seen in ${group.occurrenceCount} games`;
  if (group.unreviewedCount === 0) return `${seen} · reviewed`;
  return `${seen} · ${group.unreviewedCount} new`;
}

export function OpeningGameInbox({
  inbox,
  busyKey,
  practiceBusy,
  onInspect,
  onPractice,
  onMarkReviewed,
  onPrepared,
}: OpeningGameInboxProps) {
  const [showReviewed, setShowReviewed] = useState(false);
  const [preparingKey, setPreparingKey] = useState<string | null>(null);
  if (!inbox) return <p className="opening-inbox-loading">Comparing games with your repertoire…</p>;

  const visibleGroups = showReviewed
    ? inbox.groups
    : inbox.groups.filter((group) => group.unreviewedCount > 0);

  if (inbox.totalGroups === 0) {
    return (
      <div className="opening-inbox-clear">
        <strong>No opening follow-ups waiting</strong>
        <p>Your imported games either stayed in repertoire or did not match one of your current repertoires.</p>
      </div>
    );
  }

  return (
    <div className="opening-inbox">
      <div className="opening-inbox-summary">
        <div><strong>{inbox.unreviewedGroups}</strong><span>to review</span></div>
        <div><strong>{inbox.repeatedGroups}</strong><span>repeated patterns</span></div>
        <button className="text-button" onClick={() => setShowReviewed((value) => !value)}>
          {showReviewed ? "Hide reviewed" : `Show all ${inbox.totalGroups}`}
        </button>
      </div>

      {visibleGroups.length === 0 ? (
        <div className="opening-inbox-clear compact">
          <strong>Inbox cleared</strong>
          <p>Reviewed patterns remain available under “Show all”.</p>
        </div>
      ) : (
        <div className="opening-inbox-list">
          {visibleGroups.map((group) => {
            const latest = group.occurrences[0]!.game;
            const reviewed = group.unreviewedCount === 0;
            const departure = group.opening.departure;
            const canPrepare = Boolean(
              departure
              && ["opponent_deviation", "repertoire_ended"].includes(group.opening.status)
              && departure.moverColor !== group.opening.repertoire.learnerColor,
            );
            return (
              <article key={group.key} className={`opening-inbox-item ${group.opening.status}${reviewed ? " reviewed" : ""}${preparingKey === group.key ? " preparing" : ""}`}>
                <div className="opening-inbox-item-heading">
                  <div>
                    <span className="eyebrow">{statusLabel(group)}</span>
                    <h3>{heading(group)}</h3>
                  </div>
                  <span className="opening-inbox-frequency">{occurrenceLabel(group)}</span>
                </div>
                <p>{group.opening.repertoire.name} · latest in {latest.white} – {latest.black}</p>
                {group.opening.status === "player_deviation" && group.opening.expectedMove && (
                  <p className="opening-inbox-why"><strong>Why:</strong> {group.opening.expectedMove.explanation.summary}</p>
                )}
                {group.opening.status === "opponent_deviation" && (
                  <p className="opening-inbox-why">You followed your repertoire. Inspect the position before deciding whether this reply deserves preparation.</p>
                )}
                {group.opening.status === "repertoire_ended" && (
                  <p className="opening-inbox-why">This is a content gap, not necessarily a mistake. Inspect the game before expanding the line.</p>
                )}
                <div className="opening-inbox-actions">
                  <button className="secondary" onClick={() => onInspect(group.latestGameId)}>Inspect latest game</button>
                  {group.opening.practiceAvailable && (
                    <button disabled={practiceBusy} onClick={() => onPractice(group.latestGameId)}>
                      {practiceBusy ? "Starting…" : `Practise ${group.opening.expectedMove?.moveSan ?? "this position"}`}
                    </button>
                  )}
                  {canPrepare && (
                    <button onClick={() => setPreparingKey((key) => key === group.key ? null : group.key)}>
                      {preparingKey === group.key ? "Close preparation" : `Prepare for ${departure?.moveSan}`}
                    </button>
                  )}
                  {!reviewed && (
                    <button className="text-button" disabled={busyKey === group.key} onClick={() => onMarkReviewed(group.key)}>
                      {busyKey === group.key ? "Saving…" : group.occurrenceCount > 1 ? "Mark these reviewed" : "Mark reviewed"}
                    </button>
                  )}
                </div>
                {preparingKey === group.key && (
                  <OpeningSurprisePrep
                    group={group}
                    onCancel={() => setPreparingKey(null)}
                    onSaved={(response) => {
                      setPreparingKey(null);
                      onPrepared(response);
                    }}
                  />
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
