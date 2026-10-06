/** First-load failures must stay visible even before a board or exercise exists. */
export function ExerciseLoadState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return <div className="panel exercise-load-state" aria-busy={!error}>
    {error ? <><p className="error" role="alert">{error}</p><button className="secondary" onClick={onRetry}>Retry exercise</button></>
      : <p role="status">Loading your exercise…</p>}
  </div>;
}
