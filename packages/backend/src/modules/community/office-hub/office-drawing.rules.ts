import { BadRequestException, ConflictException } from '@nestjs/common';
import type { OfficeDrawing, OfficeStroke } from '@stealth-reader/shared';
import { officeStrokes } from './office-hub.rules';

export const OFFICE_DRAWING_DURATION = 120_000;
export const OFFICE_DRAWING_DAILY_LIMIT = 3;
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
