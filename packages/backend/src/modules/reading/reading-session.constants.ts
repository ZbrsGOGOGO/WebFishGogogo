export const READING_SESSION_CLOCK = Symbol('READING_SESSION_CLOCK');

export interface ReadingSessionClock {
  now(): Date;
}

export const systemReadingSessionClock: ReadingSessionClock = {
  now: () => new Date(),
};

export const READING_HEARTBEAT_INTERVAL_SECONDS = 20;
export const READING_HEARTBEAT_MAX_CREDIT_SECONDS = 30;
export const READING_HEARTBEAT_STALE_SECONDS = 45;
export const READING_IDLE_TIMEOUT_SECONDS = 90;
export const READING_DAILY_GOAL_SECONDS = 600;
export const READING_DAILY_MAX_SECONDS = 7_200;
