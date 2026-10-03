import type { OpeningBoardAnnotation } from "../../../../packages/contracts/src/api";

interface OpeningExplanationData {
  summary?: string;
  changes: string[];
  resultingPlan: string | null;
  tacticalWarning: string | null;
  commonMistake: string | null;
  personalComment?: string | null;
  boardAnnotations?: OpeningBoardAnnotation[];
}

interface OpeningExplanationProps {
  explanation: OpeningExplanationData;
  showSummary?: boolean;
  changesLabel?: string;
  showPersonalComment?: boolean;
}

export function OpeningExplanation({
  explanation,
  showSummary = true,
  changesLabel = "What it changes",
  showPersonalComment = true,
}: OpeningExplanationProps) {
  return (
    <div className="opening-explanation">
      {showSummary && explanation.summary && <><strong>Why this move</strong><p>{explanation.summary}</p></>}
      <strong>{changesLabel}</strong>
      <ul>{explanation.changes.map((change) => <li key={change}>{change}</li>)}</ul>
      {explanation.resultingPlan && <><strong>What comes next</strong><p>{explanation.resultingPlan}</p></>}
      {explanation.tacticalWarning && <><strong>Be careful</strong><p>{explanation.tacticalWarning}</p></>}
      {explanation.commonMistake && <><strong>Common mistake</strong><p>{explanation.commonMistake}</p></>}
      {Boolean(explanation.boardAnnotations?.length) && <details>
        <summary>Source arrows and highlights</summary>
        <p>{explanation.boardAnnotations!.map(mark => `${mark.color} ${mark.from === mark.to ? `highlight on ${mark.from}` : `arrow from ${mark.from} to ${mark.to}`}`).join("; ")}.</p>
      </details>}
      {showPersonalComment && explanation.personalComment && <><strong>Your learning comment</strong><p>{explanation.personalComment}</p></>}
    </div>
  );
}
