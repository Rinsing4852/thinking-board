import type { EmptyTrainingResponse } from "../../../../packages/contracts/src/api";

interface TrainingEmptyStateProps {
  empty: EmptyTrainingResponse;
  onChoosePool: (pool: string) => void;
  noItemsHelp: string;
}

export function TrainingEmptyState({ empty, onChoosePool, noItemsHelp }: TrainingEmptyStateProps) {
  return (
    <div className="panel empty-training">
      <h3>{empty.message}</h3>
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
      ) : <p>{noItemsHelp}</p>}
    </div>
  );
}
