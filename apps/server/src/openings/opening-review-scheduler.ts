import {
  createEmptyCard,
  fsrs,
  FSRSVersion,
  Rating,
  type Card,
  type Grade,
} from "ts-fsrs";

export const OPENING_SCHEDULER_VERSION = `ts-fsrs:${FSRSVersion}`;

export interface StoredOpeningReviewCard {
  state: number;
  due_at: string;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  learning_steps: number;
  repetitions: number;
  lapses: number;
  last_reviewed_at: string | null;
}

export interface ScheduledOpeningReview {
  rating: Grade;
  result: "again" | "hard" | "good";
  card: {
    state: number;
    dueAt: string;
    stability: number;
    difficulty: number;
    scheduledDays: number;
    learningSteps: number;
    repetitions: number;
    lapses: number;
    lastReviewedAt: string;
  };
}

const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 365,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ["10m", "1d"],
  relearning_steps: ["10m"],
});

function toCard(stored: StoredOpeningReviewCard, reviewedAt: Date): Card {
  if (stored.state === 0 && stored.repetitions === 0) return createEmptyCard(reviewedAt);
  return {
    state: stored.state,
    due: new Date(stored.due_at),
    stability: stored.stability,
    difficulty: stored.difficulty,
    scheduled_days: stored.scheduled_days,
    learning_steps: stored.learning_steps,
    reps: stored.repetitions,
    lapses: stored.lapses,
    ...(stored.last_reviewed_at ? { last_review: new Date(stored.last_reviewed_at) } : {}),
    elapsed_days: 0,
  } as Card;
}

export function scheduleOpeningReview(
  stored: StoredOpeningReviewCard,
  correct: boolean,
  reviewedAt: string,
  responseMs = 0,
): ScheduledOpeningReview {
  const reviewDate = new Date(reviewedAt);
  const rating = !correct
    ? Rating.Again
    : responseMs >= 60_000 ? Rating.Hard : Rating.Good;
  const next = scheduler.next(toCard(stored, reviewDate), reviewDate, rating);
  return {
    rating,
    result: !correct ? "again" : rating === Rating.Hard ? "hard" : "good",
    card: {
      state: next.card.state,
      dueAt: next.card.due.toISOString(),
      stability: next.card.stability,
      difficulty: next.card.difficulty,
      scheduledDays: next.card.scheduled_days,
      learningSteps: next.card.learning_steps,
      repetitions: next.card.reps,
      lapses: next.card.lapses,
      lastReviewedAt: next.card.last_review?.toISOString() ?? reviewedAt,
    },
  };
}
