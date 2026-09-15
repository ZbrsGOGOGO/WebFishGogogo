import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { OfficeDrawing, OfficeStroke } from '@stealth-reader/shared';
import { officeStrokes } from './office-hub.rules';

export const OFFICE_DRAWING_DURATION = 120_000;
export const OFFICE_DRAWING_STORAGE_LIMIT = 1000;
export const OFFICE_DRAWING_GLOBAL_STORAGE_LIMIT = 5000;
export const OFFICE_DRAWING_PARTICIPANT_LIMIT = 1000;
/** At most 1.28GB raw JSON for the global wall, before indexes/WAL/backups. */
export const OFFICE_DRAWING_STATE_MAX_BYTES = 256_000;
/** Existing asynchronous drawings use stable numeric IDs from the shared word bank. */
export const OFFICE_DRAWING_FIRST_WORD_INDEX = 8;
export const OFFICE_DRAWING_REPEAT_WINDOW = 12;
export function chooseDrawingWordIndex(wordCount: number, recent: readonly number[], randomIndex: (max: number) => number): number {
    if (!Number.isSafeInteger(wordCount) || wordCount <= OFFICE_DRAWING_FIRST_WORD_INDEX)
        throw new Error('No asynchronous drawing words are available');
    const all = Array.from({ length: wordCount - OFFICE_DRAWING_FIRST_WORD_INDEX }, (_, offset) => OFFICE_DRAWING_FIRST_WORD_INDEX + offset);
    const seen = new Set(recent.slice(0, OFFICE_DRAWING_REPEAT_WINDOW));
    const unused = all.filter(index => !seen.has(index));
    const candidates = unused.length ? unused : all;
    const picked = randomIndex(candidates.length);
    if (!Number.isSafeInteger(picked) || picked < 0 || picked >= candidates.length)
        throw new Error('Invalid asynchronous drawing word selection');
    return candidates[picked];
}
export interface DrawingLifecycle {
    startedAt: number;
    strokes: OfficeStroke[];
    published: boolean;
    revision?: number;
    savedAt?: number | null;
    submittedAt?: number | null;
    submission?: 'manual' | 'automatic';
    expiredEmpty?: boolean;
}
export interface DrawingParticipation {
    guesses: Record<string, { attempts: number; solved: boolean }>;
    ratings?: Record<string, number>;
    published: boolean;
    hidden: boolean;
}
export function drawingRatingSummary(d: Pick<DrawingParticipation, 'ratings'>, userId: string): { score: number | null; ratings: number; myRating: number | null } {
    const entries = Object.entries(d.ratings ?? {}).filter(([, value]) => Number.isInteger(value) && value >= 1 && value <= 5);
    return { score: entries.length ? entries.reduce((sum, [, value]) => sum + value, 0) / entries.length : null,
        ratings: entries.length, myRating: entries.find(([id]) => id === userId)?.[1] ?? null };
}
export function canRateDrawing(d: DrawingParticipation, owner: boolean, userId: string): boolean {
    return !owner && d.published && !d.hidden && (d.guesses[userId]?.attempts ?? 0) >= 1;
}
export function rateDrawing(d: DrawingParticipation, owner: boolean, userId: string, rating: unknown): void {
    if (!Number.isInteger(rating) || Number(rating) < 1 || Number(rating) > 5)
        throw new BadRequestException({ code: 'OFFICE_DRAWING_RATING_INVALID' });
    if (owner) throw new ForbiddenException({ code: 'OFFICE_SELF_RATE' });
    if (!canRateDrawing(d, false, userId)) throw new ForbiddenException({ code: 'OFFICE_DRAWING_RATE_PARTICIPATION_REQUIRED' });
    if (!Object.prototype.hasOwnProperty.call(d.ratings ?? {}, userId) && Object.keys(d.ratings ?? {}).length >= OFFICE_DRAWING_PARTICIPANT_LIMIT)
        throw new ConflictException({ code: 'OFFICE_DRAWING_PARTICIPANT_CAPACITY' });
    d.ratings ??= {};
    d.ratings[userId] = Number(rating);
}
export function drawingStatus(d: DrawingLifecycle): NonNullable<OfficeDrawing['status']> {
    return d.published ? 'published' : d.expiredEmpty ? 'expired_empty' : 'draft';
}
/** Pure, repeatable settlement: late payloads never replace the last accepted draft. */
export function settleDrawing(d: DrawingLifecycle, now: number): boolean {
    if (drawingStatus(d) !== 'draft' || now < d.startedAt + OFFICE_DRAWING_DURATION) return false;
    d.submittedAt = d.startedAt + OFFICE_DRAWING_DURATION;
    d.submission = 'automatic';
    if (d.strokes.length) d.published = true;
    else d.expiredEmpty = true;
    d.revision = (d.revision ?? 0) + 1;
    return true;
}
export function updateDrawing(d: DrawingLifecycle, input: { strokes: unknown; expectedRevision?: unknown }, now: number, publish: boolean): void {
    if (drawingStatus(d) !== 'draft' || now >= d.startedAt + OFFICE_DRAWING_DURATION)
        throw new ConflictException({ code: 'OFFICE_DRAWING_EXPIRED' });
    if ((!publish || input.expectedRevision !== undefined) && (!Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0))
        throw new BadRequestException({ code: 'OFFICE_DRAWING_REVISION_INVALID' });
    // Legacy clients may publish only untouched revision-zero drafts. Once a
    // persistent save exists, omitting the revision must not bypass concurrency.
    if (input.expectedRevision === undefined && (d.revision ?? 0) > 0 || input.expectedRevision !== undefined && input.expectedRevision !== (d.revision ?? 0))
        throw new ConflictException({ code: 'OFFICE_DRAWING_VERSION_CONFLICT' });
    d.strokes = !publish && Array.isArray(input.strokes) && input.strokes.length === 0 ? [] : officeStrokes(input.strokes);
    d.savedAt = now;
    d.revision = (d.revision ?? 0) + 1;
    if (publish) { d.published = true; d.submittedAt = now; d.submission = 'manual'; }
}
