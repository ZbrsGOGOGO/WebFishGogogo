import { drawingStatus, OFFICE_DRAWING_DURATION, settleDrawing, updateDrawing, type DrawingLifecycle } from './office-drawing.rules';

const strokes = [{ color: '#334155', width: 4, points: [{ x: 0, y: 0 }, { x: 30, y: 50 }] }];
const draft = (): DrawingLifecycle => ({ startedAt: 1_000_000, published: false, strokes: [], revision: 0 });
describe('Persistent office drawing lifecycle', () => {
    it('saves a validated versioned draft without publishing or extending its deadline', () => {
        const d = draft(); updateDrawing(d, { strokes, expectedRevision: 0 }, d.startedAt + 5, false);
        expect(d).toMatchObject({ strokes, revision: 1, savedAt: 1_000_005, published: false, startedAt: 1_000_000 });
        expect(drawingStatus(d)).toBe('draft');
    });
    it('rejects a stale tab and leaves its newer saved strokes unchanged', () => {
        const d = draft(); updateDrawing(d, { strokes, expectedRevision: 0 }, d.startedAt + 5, false);
        const before = JSON.stringify(d);
        expect(() => updateDrawing(d, { strokes: [], expectedRevision: 0 }, d.startedAt + 8, false)).toThrow();
        expect(JSON.stringify(d)).toBe(before);
    });
    it.each([undefined, -1, 0.5, '0', NaN, Infinity])('rejects invalid save revision %s', expectedRevision => {
        const d = draft(); expect(() => updateDrawing(d, { strokes, expectedRevision }, d.startedAt, false)).toThrow();
        expect(d.revision).toBe(0);
    });
    it('persists undo-to-empty but never allows a blank manual publication', () => {
        const d = draft(); updateDrawing(d, { strokes, expectedRevision: 0 }, d.startedAt, false);
        updateDrawing(d, { strokes: [], expectedRevision: 1 }, d.startedAt + 1, false);
        expect(d.strokes).toEqual([]);
        expect(() => updateDrawing(d, { strokes: [], expectedRevision: 2 }, d.startedAt + 2, true)).toThrow();
    });
    it('settles exactly at the server deadline once and never changes the accepted artwork', () => {
        const d = draft(); updateDrawing(d, { strokes, expectedRevision: 0 }, d.startedAt, false);
        expect(settleDrawing(d, d.startedAt + OFFICE_DRAWING_DURATION - 1)).toBe(false);
        expect(settleDrawing(d, d.startedAt + OFFICE_DRAWING_DURATION)).toBe(true);
        expect(d).toMatchObject({ published: true, submission: 'automatic', submittedAt: 1_120_000, revision: 2, strokes });
        const before = JSON.stringify(d);
        expect(settleDrawing(d, d.startedAt + 900_000)).toBe(false);
        expect(() => updateDrawing(d, { strokes: [], expectedRevision: 2 }, d.startedAt + 900_000, false)).toThrow();
        expect(JSON.stringify(d)).toBe(before);
    });
    it('retains a terminal empty result instead of publishing an empty image', () => {
        const d = draft(); expect(settleDrawing(d, d.startedAt + OFFICE_DRAWING_DURATION)).toBe(true);
        expect(drawingStatus(d)).toBe('expired_empty'); expect(d.published).toBe(false);
        expect(settleDrawing(d, d.startedAt + 900_000)).toBe(false);
    });
    it('manual submission wins before deadline and cannot be counted by the sweep again', () => {
        const d = draft(); updateDrawing(d, { strokes }, d.startedAt + OFFICE_DRAWING_DURATION - 1, true);
        expect(d.submission).toBe('manual'); expect(drawingStatus(d)).toBe('published');
        expect(settleDrawing(d, d.startedAt + OFFICE_DRAWING_DURATION)).toBe(false);
    });
    it('rejects legacy revision omission after any persistent save, without changing the saved draft', () => {
        const d = draft(); updateDrawing(d, { strokes, expectedRevision: 0 }, d.startedAt, false);
        const before = JSON.stringify(d);
        expect(() => updateDrawing(d, { strokes: [{ ...strokes[0], color: '#2563eb' }] }, d.startedAt + 2, true)).toThrow(expect.objectContaining({ response: { code: 'OFFICE_DRAWING_VERSION_CONFLICT' } }));
        expect(JSON.stringify(d)).toBe(before);
    });
    it('rejects edits exactly on the deadline, including forged late snapshots', () => {
        const d = draft();
        expect(() => updateDrawing(d, { strokes, expectedRevision: 0 }, d.startedAt + OFFICE_DRAWING_DURATION, false)).toThrow();
        expect(d.strokes).toEqual([]);
    });
    it('supports legacy persisted drafts without revision fields', () => {
        const d: DrawingLifecycle = { startedAt: 100, published: false, strokes };
        expect(settleDrawing(d, 500_000)).toBe(true); expect(d.revision).toBe(1);
    });
    it('never accepts hostile SVG stroke payloads in autosave', () => {
        const d = draft(); expect(() => updateDrawing(d, { expectedRevision: 0, strokes: [{ ...strokes[0], color: 'url(https://evil.invalid)' }] }, d.startedAt, false)).toThrow();
        expect(d.strokes).toEqual([]);
    });
});
