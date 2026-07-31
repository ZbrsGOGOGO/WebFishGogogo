import type { ReadingHeartbeatState } from '../../../database/entities/reading-session.entity';

export interface StartReadingSessionDto {
  documentId?: unknown;
  clientSessionId?: unknown;
}

export interface ReadingHeartbeatDto {
  state?: unknown;
  sequence?: unknown;
  chapterIdx?: unknown;
  charOffset?: unknown;
}

export interface ParsedReadingHeartbeat {
  state: ReadingHeartbeatState;
  sequence: number;
  chapterIdx: number | null;
  charOffset: number | null;
}
