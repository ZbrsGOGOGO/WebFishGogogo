import { OFFICE_COLLECTION } from '@stealth-reader/shared';
import { accrueOffice, actOfficeSpy, creditOfficeWaves, drawOffice, newOfficeProfile, officeDay, officeRateLimit, officeStrokes, officeTheme, officeWeek, startOfficeSpy, type OfficeSpyState } from './office-hub.rules';
const now = Date.parse('2026-09-09T00:00:00+08:00');
const spy = (count = 6): OfficeSpyState => ({ title: '描述局', theme: '今日', phase: 'waiting', round: 0, members: Array.from({ length: count }, (_, i) => ({ userId: `u${i}`, publicId: `p${i}`, name: `玩家${i}`, role: 'civilian', alive: true })), descriptions: [], votes: {}, words: ['周报', '月报'], ownerId: 'u0', expiresAt: now + 86400000, guildId: null, outcome: null });
describe('free office collection economy', () => {
    it('starts with zero grants and preserves only permanent assets across Shanghai midnight', () => {
        const p = newOfficeProfile(now);
        expect(p.tickets).toBe(0);
        expect(p.farmEarned).toBe(0);
        p.tickets = 3;
        p.pityR = 5;
        p.owned['skin-paper'] = 1;
        p.farmSpent = 100;
        p.socialPoints = 60;
        p.dailyTicketClaimed = true;
        accrueOffice(p, now + 86400000 + 3600000);
        expect(p.day).toBe('2026-09-10');
        expect(p.farmEarned).toBe(40);
        expect(p.farmSpent).toBe(0);
        expect(p.dailyTicketClaimed).toBe(false);
        expect(p.tickets).toBe(3);
        expect(p.pityR).toBe(5);
        expect(p.socialPoints).toBe(60);
        expect(p.owned).toEqual({ 'skin-paper': 1 });
    });
    it.each([0, 1, 2, 3, 4, 5, 6, 7])('uses position %i income with a hard 2000 daily cap and four credited waves', tier => {
        const p = newOfficeProfile(now);
        creditOfficeWaves(p, 100, tier, now);
        const after = p.farmEarned;
        expect(p.creditedWaves).toBe(4);
        creditOfficeWaves(p, 50, tier, now);
        expect(p.farmEarned).toBe(after);
        accrueOffice(p, now + 23 * 3600000);
        expect(p.farmEarned).toBeLessThanOrEqual(2000);
    });
    it('does not multiply earlier idle time using a newly earned promotion', () => {
        const p = newOfficeProfile(now);
        creditOfficeWaves(p, 0, 7, now + 3600000);
        expect(p.farmEarned).toBe(40);
        accrueOffice(p, now + 7200000);
        expect(p.farmEarned).toBe(170);
    });
    it('retains sub-point accrual without penalizing frequent refresh', () => {
        const a = newOfficeProfile(now), b = newOfficeProfile(now);
        for (let i = 1; i <= 3600; i++)
            accrueOffice(a, now + i * 1000);
        accrueOffice(b, now + 3600000);
        expect(a.farmEarned).toBeCloseTo(b.farmEarned, 6);
    });
    it('rejects insufficient balance, never buys collection using office coins', () => {
        const p = newOfficeProfile(now);
        expect(() => drawOffice(p, 'farm', 'daily', () => .9, now)).toThrow();
        expect(() => drawOffice(p, 'ticket', 'daily', () => .9, now)).toThrow();
        expect(p.draws).toBe(0);
        expect(p.farmSpent).toBe(0);
    });
    it('limits farm draws to 20 but daily tickets remain independent', () => {
        const p = newOfficeProfile(now);
        p.farmEarned = 2000;
        p.tickets = 1;
        for (let i = 0; i < 20; i++)
            drawOffice(p, 'farm', 'standard', () => .9, now);
        expect(() => drawOffice(p, 'farm', 'standard', () => .9, now)).toThrow();
        drawOffice(p, 'ticket', 'daily', () => .9, now);
        expect(p.draws).toBe(21);
        expect(p.farmSpent).toBe(2000);
    });
    it('enforces 10 / 80 pity across pool changes and SSR daily UP deterministically', () => {
        const p = newOfficeProfile(now);
        p.tickets = 80;
        for (let i = 0; i < 79; i++) {
            const item = drawOffice(p, 'ticket', i % 2 ? 'standard' : 'daily', () => .9, now);
            if (i === 9)
                expect(OFFICE_COLLECTION.find(x => x.id === item)?.rarity).toBe('R');
        }
        const last = drawOffice(p, 'ticket', 'daily', () => .9, now);
        expect(last).toBe(officeTheme(now).dailyUp);
        expect(p.pitySSR).toBe(0);
        expect(p.pityR).toBe(0);
    });
    it('has exact full base probability intervals including common outcomes', () => {
        for (const [roll, rarity] of [[0, 'SSR'], [.007999, 'SSR'], [.008, 'SR'], [.022999, 'SR'], [.023, 'R'], [.062999, 'R'], [.063, 'N'], [.999999, 'N']] as const) {
            const p = newOfficeProfile(now);
            p.tickets = 1;
            const item = drawOffice(p, 'ticket', 'standard', () => roll, now);
            expect(OFFICE_COLLECTION.find(x => x.id === item)?.rarity).toBe(rarity);
        }
    });
    it('keeps day / Monday week independent from legacy farm 05:00 boundary', () => {
        expect(officeDay(Date.parse('2026-09-09T15:59:59Z'))).toBe('2026-09-09');
        expect(officeDay(Date.parse('2026-09-09T16:00:00Z'))).toBe('2026-09-10');
        expect(officeWeek(now)).toBe('2026-09-07');
    });
    it('limits sustained and burst actions and resets counters at the daily boundary', () => {
        const p = newOfficeProfile(now);
        officeRateLimit(p, 'create', now, 2, 1000);
        expect(() => officeRateLimit(p, 'create', now + 10, 2, 1000)).toThrow();
        officeRateLimit(p, 'create', now + 1000, 2, 1000);
        expect(() => officeRateLimit(p, 'create', now + 3000, 2, 1000)).toThrow();
        accrueOffice(p, now + 86400000);
        expect(() => officeRateLimit(p, 'create', now + 86400000, 2, 1000)).not.toThrow();
    });
});
describe('asynchronous undercover rules', () => {
    it.each([3, 4, 5, 6, 7, 8])('assigns actual scaled undercover roles for %i participants', count => {
        const s = spy(count);
        startOfficeSpy(s, 'u0', () => .4, now);
        expect(s.members.filter(m => m.role === 'undercover')).toHaveLength(count >= 6 ? 2 : 1);
        expect(s.phase).toBe('describe');
        expect(s.expiresAt).toBe(now + 86400000);
    });
    it('rejects foreign owner / too few players and does not overwrite an in-progress game', () => {
        expect(() => startOfficeSpy(spy(), 'u1', () => .4, now)).toThrow();
        expect(() => startOfficeSpy(spy(2), 'u0', () => .4, now)).toThrow();
        const s = spy();
        startOfficeSpy(s, 'u0', () => .4, now);
        expect(() => startOfficeSpy(s, 'u0', () => .4, now)).toThrow();
    });
    it('never accepts exact-word leaks, repeated descriptions, foreign players, self votes or wrong phase', () => {
        const s = spy(3);
        startOfficeSpy(s, 'u0', () => .4, now);
        expect(() => actOfficeSpy(s, 'u0', 'describe', '我的词是周 报')).toThrow();
        expect(() => actOfficeSpy(s, 'u9', 'describe', '这是工作的东西')).toThrow();
        expect(() => actOfficeSpy(s, 'u0', 'vote', 'p1')).toThrow();
        actOfficeSpy(s, 'u0', 'describe', '定期总结的东西');
        expect(() => actOfficeSpy(s, 'u0', 'describe', '另一句')).toThrow();
        actOfficeSpy(s, 'u1', 'describe', '要在固定时间提交');
        expect(s.phase).toBe('describe');
        actOfficeSpy(s, 'u2', 'describe', '要花时间认真整理');
        expect(s.phase).toBe('vote');
        expect(() => actOfficeSpy(s, 'u0', 'vote', 'p0')).toThrow();
    });
    it('finishes a full description/vote round on civil elimination of the sole spy', () => {
        const s = spy(3);
        startOfficeSpy(s, 'u0', () => .2, now);
        for (const m of s.members)
            actOfficeSpy(s, m.userId, 'describe', `这是第${m.publicId}种描述`);
        const under = s.members.find(m => m.role === 'undercover')!, civil = s.members.filter(m => m.role === 'civilian');
        actOfficeSpy(s, under.userId, 'vote', civil[0].publicId);
        for (const m of civil)
            actOfficeSpy(s, m.userId, 'vote', under.publicId);
        expect(s.phase).toBe('finished');
        expect(s.outcome).toBe('civilian');
    });
    it('retains both spies and progresses on a tied vote without inventing an eliminated player', () => {
        const s = spy(6);
        startOfficeSpy(s, 'u0', () => .4, now);
        for (const m of s.members)
            actOfficeSpy(s, m.userId, 'describe', `我的第${m.publicId}句描述`);
        for (let i = 0; i < 6; i++)
            actOfficeSpy(s, `u${i}`, 'vote', `p${(i + 1) % 6}`);
        expect(s.phase).toBe('describe');
        expect(s.round).toBe(2);
        expect(s.members.every(m => m.alive)).toBe(true);
    });
});
describe('drawing hostile payload boundaries', () => {
    const line = { points: [{ x: 0, y: 0 }, { x: 1000, y: 1000 }], color: '#334155', width: 4 };
    it('copies validated numeric strokes with no URL / SVG / text channel', () => { const out = officeStrokes([line]); expect(out).toEqual([line]); out[0].points[0].x = 3; expect(line.points[0].x).toBe(0); });
    it.each([null, [], [{ ...line, text: 'answer' }], [{ ...line, color: 'url(https://bad.test)' }], [{ ...line, width: 999 }], [{ ...line, points: [{ x: NaN, y: 0 }, { x: 0, y: 0 }] }], [{ ...line, points: [{ x: 1001, y: 0 }, { x: 0, y: 0 }] }], Array(101).fill(line)])('rejects malformed or oversized strokes %j', value => { expect(() => officeStrokes(value)).toThrow(); });
    it('rejects hostile coercion objects and numeric strings explicitly',()=>{for(const patch of [{color:{toString:null}},{width:{toString:null}},{width:'4'}])expect(()=>officeStrokes([{...line,...patch}])).toThrow();});
});
