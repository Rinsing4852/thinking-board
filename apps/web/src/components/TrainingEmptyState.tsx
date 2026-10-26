import { useEffect,useState } from "react";
import { get } from "../api";
import type { DashboardResponse, EmptyTrainingResponse } from "../../../../packages/contracts/src/api";

interface TrainingEmptyStateProps {
  empty: EmptyTrainingResponse;
  gameDays?: number | null;
  onChoosePool: (pool: string) => void;
  noItemsHelp: string;
}

export function TrainingEmptyState({ empty, onChoosePool, noItemsHelp, gameDays = null }: TrainingEmptyStateProps) {
  const [totals,setTotals]=useState<DashboardResponse["totals"]|null>(null);
  useEffect(()=>{if(empty.options.length || gameDays !== null)return;const controller=new AbortController();setTotals(null);
    void get<DashboardResponse>("/api/v1/dashboard",controller.signal).then(result=>{if(!controller.signal.aborted)setTotals(result.totals);}).catch(()=>undefined);
    return()=>controller.abort();},[empty, gameDays]);
  return (
    <div className="panel empty-training">
      <h3>{gameDays !== null && !empty.options.length ? "No exercises for this game filter." : empty.message}</h3>
      {empty.options.length > 0 ? (
        <>
          <p>Nothing is scheduled, but you can still practise:</p>
          <div className="fallback-actions">
            {empty.options.map((option) => (
              <button key={option.pool} className="secondary" onClick={() => onChoosePool(option.pool)}>
                {option.label} <span>{option.count}</span>
              </button>
            ))}
          </div>
        </>
      ) : gameDays !== null ? <p>Widen Practice games above to include older games. Games without a known date are included under All game dates.</p> : <><p>{totals?.games?totals.awaitingAnalysis?"You have saved games waiting for analysis. Choose which ones to analyse in My games.":"Your saved games have no exercises for this mode. You can review them or add another game.":noItemsHelp}</p>
        <a className="button secondary" href={totals?.games?"#games":"#games?add=1"}>{totals?.games?totals.awaitingAnalysis?"Choose saved games for analysis":"Review saved games":"Paste a game to find training positions"}</a></>}
    </div>
  );
}
