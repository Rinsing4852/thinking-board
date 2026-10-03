import type { OpeningBoardAnnotation } from "../../../../packages/contracts/src/api";
import { hasOpeningReason, meaningfulOpeningText } from "../opening-explanation";

interface OpeningExplanationData {
  summary?: string;
  sourceSummary?: string;
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
  const changes = explanation.changes.map(meaningfulOpeningText).filter((text): text is string => Boolean(text));
  const plan = meaningfulOpeningText(explanation.resultingPlan);
  const warning = meaningfulOpeningText(explanation.tacticalWarning);
  const mistake = meaningfulOpeningText(explanation.commonMistake);
  return (
    <div className="opening-explanation">
      {showSummary && (hasOpeningReason(explanation.summary)
        ? <><strong>{explanation.sourceSummary ? "Your explanation" : "Why this move"}</strong><p>{explanation.summary}</p></>
        : <p className="opening-missing-reason">No reason written yet. Add a short note about what this move achieves when you know it.</p>)}
      {explanation.sourceSummary && hasOpeningReason(explanation.sourceSummary) && <details><summary>Original source note</summary><p>{explanation.sourceSummary}</p></details>}
      {changes.length > 0 && <><strong>{changesLabel}</strong><ul>{changes.map(change => <li key={change}>{change}</li>)}</ul></>}
      {plan && <><strong>What comes next</strong><p>{plan}</p></>}
      {warning && <><strong>Be careful</strong><p>{warning}</p></>}
      {mistake && <><strong>Common mistake</strong><p>{mistake}</p></>}
      {Boolean(explanation.boardAnnotations?.length) && <details>
        <summary>Source arrows and highlights</summary>
        <p>{explanation.boardAnnotations!.map(mark => `${mark.color} ${mark.from === mark.to ? `highlight on ${mark.from}` : `arrow from ${mark.from} to ${mark.to}`}`).join("; ")}.</p>
      </details>}
      {showPersonalComment && explanation.personalComment && <><strong>Your learning comment</strong><p>{explanation.personalComment}</p></>}
    </div>
  );
}
