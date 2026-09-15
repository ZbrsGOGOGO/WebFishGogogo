import { canRateDrawing, chooseDrawingWordIndex, drawingRatingSummary, drawingStatus, OFFICE_DRAWING_DURATION, OFFICE_DRAWING_FIRST_WORD_INDEX, OFFICE_DRAWING_PARTICIPANT_LIMIT, OFFICE_DRAWING_REPEAT_WINDOW, OFFICE_DRAWING_STATE_MAX_BYTES, rateDrawing, settleDrawing, updateDrawing, type DrawingLifecycle, type DrawingParticipation } from './office-drawing.rules';
import { DRAW_WORDS } from '../play/engines/word-bank';

const strokes = [{ color: '#334155', width: 4, points: [{ x: 0, y: 0 }, { x: 30, y: 50 }] }];
const draft = (): DrawingLifecycle => ({ startedAt: 1_000_000, published: false, strokes: [], revision: 0 });
describe('Persistent office drawing lifecycle', () => {
    it('selects from every existing asynchronous word without changing saved numeric IDs', () => {
        const choices = new Set<number>();
        for (let position = 0; position < DRAW_WORDS.length - OFFICE_DRAWING_FIRST_WORD_INDEX; position += 1)
            choices.add(chooseDrawingWordIndex(DRAW_WORDS.length, [], () => position));
        expect(choices.size).toBe(DRAW_WORDS.length - OFFICE_DRAWING_FIRST_WORD_INDEX);
        expect(Math.min(...choices)).toBe(8);
        expect(Math.max(...choices)).toBe(DRAW_WORDS.length - 1);
        expect(DRAW_WORDS[8].word).toBe('电脑');
        expect(DRAW_WORDS[63].word).toBe('西瓜');
    });
    it('avoids the last twelve owned topics and degrades safely if a future bank is smaller than the repeat window', () => {
        const recent = Array.from({ length: OFFICE_DRAWING_REPEAT_WINDOW }, (_, offset) => OFFICE_DRAWING_FIRST_WORD_INDEX + offset);
        expect(chooseDrawingWordIndex(DRAW_WORDS.length, recent, () => 0)).toBe(20);
        expect(chooseDrawingWordIndex(10, [8, 9], () => 1)).toBe(9);
        expect(() => chooseDrawingWordIndex(8, [], () => 0)).toThrow();
        expect(() => chooseDrawingWordIndex(10, [], () => 2)).toThrow();
    });
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
    it('requires a nonauthor to have actually guessed, but does not require solving or reveal the topic', () => {
        const d: DrawingParticipation = { published:true,hidden:false,guesses:{} };
        expect(canRateDrawing(d,false,'participant')).toBe(false);
        expect(() => rateDrawing(d,false,'participant',3)).toThrow(expect.objectContaining({response:expect.objectContaining({code:'OFFICE_DRAWING_RATE_PARTICIPATION_REQUIRED'})}));
        d.guesses.participant={attempts:1,solved:false};
        expect(canRateDrawing(d,false,'participant')).toBe(true);
        expect(canRateDrawing(d,true,'participant')).toBe(false);
        rateDrawing(d,false,'participant',3);
        expect(drawingRatingSummary(d,'participant')).toEqual({score:3,ratings:1,myRating:3});
        expect(drawingRatingSummary(d,'outsider')).toEqual({score:3,ratings:1,myRating:null});
        expect(() => rateDrawing(d,true,'participant',3)).toThrow(expect.objectContaining({response:expect.objectContaining({code:'OFFICE_SELF_RATE'})}));
        d.hidden=true; expect(canRateDrawing(d,false,'participant')).toBe(false);
    });
    it.each([undefined,null,0,6,2.5,'3',NaN,Infinity])('rejects invalid drawing rating %s without changing votes', rating => {
        const d: DrawingParticipation = {published:true,hidden:false,guesses:{participant:{attempts:1,solved:false}},ratings:{participant:4}};
        expect(() => rateDrawing(d,false,'participant',rating)).toThrow();
        expect(d.ratings).toEqual({participant:4});
    });
    it('updates one vote rather than appending votes, and keeps legacy unknown invalid values out of averages', () => {
        const d: DrawingParticipation = {published:true,hidden:false,guesses:{a:{attempts:1,solved:false},b:{attempts:1,solved:true}},ratings:{invalid:99}};
        rateDrawing(d,false,'a',1); rateDrawing(d,false,'b',5);
        expect(drawingRatingSummary(d,'a')).toEqual({score:3,ratings:2,myRating:1});
        rateDrawing(d,false,'a',3);
        expect(drawingRatingSummary(d,'a')).toEqual({score:4,ratings:2,myRating:3});
        expect(d.ratings?.invalid).toBe(99);
        expect(drawingRatingSummary({},'a')).toEqual({score:null,ratings:0,myRating:null});
    });
    it('limits new participants without denying an existing participant a vote correction', () => {
        const ratings=Object.fromEntries(Array.from({length:OFFICE_DRAWING_PARTICIPANT_LIMIT},(_,i)=>[`voter-${i}`,3]));
        const d: DrawingParticipation = {published:true,hidden:false,guesses:{new:{attempts:1,solved:false},'voter-0':{attempts:1,solved:false}},ratings};
        expect(() => rateDrawing(d,false,'new',5)).toThrow();
        rateDrawing(d,false,'voter-0',5); expect(d.ratings?.['voter-0']).toBe(5);
    });
    it('bounds the maximum validated artwork and 1000 UUID guesses/votes well below the hard state-byte ceiling', () => {
        const ids=Array.from({length:OFFICE_DRAWING_PARTICIPANT_LIMIT},(_,i)=>`12345678-1234-4234-8234-${String(i).padStart(12,'0')}`);
        const points=Array.from({length:30},()=>({x:1000,y:1000}));
        const strokes=Array.from({length:100},()=>({color:'#334155',width:8,points}));
        const d={author:{userId:ids[0],publicId:ids[0],displayName:'测'.repeat(100)},theme:'测'.repeat(100),wordIndex:8,startedAt:Date.now(),published:true,revision:1000,savedAt:Date.now(),submittedAt:Date.now(),submission:'manual',strokes,
            guesses:Object.fromEntries(ids.map(id=>[id,{attempts:5,solved:false}])),ratings:Object.fromEntries(ids.map(id=>[id,5])),reports:ids.slice(0,3),hidden:false};
        const bytes=Buffer.byteLength(JSON.stringify(d),'utf8');
        expect(bytes).toBeLessThan(OFFICE_DRAWING_STATE_MAX_BYTES);
        expect(bytes).toBeLessThan(190_000);
    });
});
