import type { GameReviewProgress } from '../../../../packages/contracts/src/api.js';

export interface ReviewEvent { checkpoint_id: string; result: string }
export const REVIEWED_RESULTS = new Set(['shown', 'recalled', 'after_retry', 'marked_reviewed']);

/** A review checklist is independent of recall success, practice rounds and FSRS. */
export function gameReviewProgress(pointIds: string[], events: ReviewEvent[]): GameReviewProgress & { reviewedIds: string[] } {
  const points = new Set(pointIds), reviewed = new Set<string>();
  let explicit: GameReviewProgress['status'] | undefined;
  for (const event of events) {
    if (event.result === 'game_complete') {
      pointIds.forEach(id => reviewed.add(id)); explicit = 'complete';
    } else if (event.result === 'game_not_started') {
      reviewed.clear(); explicit = 'not_started';
    } else if (event.result === 'game_partial') explicit = 'in_progress';
    else if (points.has(event.checkpoint_id) && REVIEWED_RESULTS.has(event.result)) {
      reviewed.add(event.checkpoint_id); explicit = undefined;
    } else if (points.has(event.checkpoint_id) && event.result === 'marked_unreviewed') {
      reviewed.delete(event.checkpoint_id); explicit = undefined;
    }
  }
  return { status: explicit ?? (reviewed.size === 0 ? 'not_started' : reviewed.size === points.size ? 'complete' : 'in_progress'),
    reviewedCount: reviewed.size, totalCount: points.size, reviewedIds: [...reviewed] };
}
