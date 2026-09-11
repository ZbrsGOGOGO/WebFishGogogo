import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { OFFICE_COLLECTION, OFFICE_HOURLY_EXP, OFFICE_THEMES, OFFICE_WAVE_EXP, type OfficeStroke } from '@stealth-reader/shared';
export interface OfficeProfileState {
    /** Permanent activity state; never reset alongside the old daily boss. */
    relief?: import('@stealth-reader/shared').OfficeReliefState;
    version: 1;
    day: string;
    accruedAt: number;
    promotionTier: number;
    farmEarned: number;
    farmSpent: number;
    creditedWaves: number;
    tickets: number;
    dailyTicketClaimed: boolean;
    socialPoints: number;
    socialEarnedToday: number;
    socialExchangesToday: number;
    pityR: number;
    pitySSR: number;
    draws: number;
    owned: Record<string, number>;
    equipped: string | null;
    lastDraw: string | null;
    boss: {
        startedAt: number | null;
        hits: number;
        lastHitAt: number;
        damage: number;
        claimed: boolean;
    };
    weeklyClaims: string[];
    counters: Record<string, number>;
    actionTimes: Record<string, number>;
    stats: {
        stories: number;
        drawings: number;
        correctGuesses: number;
        undercoverWins: number;
        departmentWins: number;
        bossDays: number;
        weeklyWins: number;
    };
}
export const officeDay = (now: number): string => new Date(now + 8 * 3600000).toISOString().slice(0, 10);
export function officeWeek(now: number): string {
    const d = new Date(`${officeDay(now)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
    return d.toISOString().slice(0, 10);
}
export function newOfficeProfile(now: number): OfficeProfileState {
    return { version: 1, day: officeDay(now), accruedAt: now, promotionTier: 0, farmEarned: 0, farmSpent: 0, creditedWaves: 0,
        tickets: 0, dailyTicketClaimed: false, socialPoints: 0, socialEarnedToday: 0, socialExchangesToday: 0,
        pityR: 0, pitySSR: 0, draws: 0, owned: {}, equipped: null, lastDraw: null,
        boss: { startedAt: null, hits: 0, lastHitAt: 0, damage: 0, claimed: false }, weeklyClaims: [], counters: {}, actionTimes: {},
        stats: { stories: 0, drawings: 0, correctGuesses: 0, undercoverWins: 0, departmentWins: 0, bossDays: 0, weeklyWins: 0 } };
}
/** Uses server clock. A new day discards unused daily EXP, never permanent tickets/pity/collection. */
export function accrueOffice(p: OfficeProfileState, now: number): void {
    if (!Number.isFinite(now) || now < p.accruedAt)
        return;
    const day = officeDay(now);
    if (p.day !== day) {
        p.day = day;
        p.farmEarned = 0;
        p.farmSpent = 0;
        p.creditedWaves = 0;
        p.dailyTicketClaimed = false;
        p.socialEarnedToday = 0;
        p.socialExchangesToday = 0;
        p.counters = {};
        p.actionTimes = {};
        p.boss = { startedAt: null, hits: 0, lastHitAt: 0, damage: 0, claimed: false };
        p.accruedAt = Math.max(p.accruedAt, Date.parse(`${day}T00:00:00+08:00`));
    }
    p.farmEarned = Math.min(2000, p.farmEarned + (now - p.accruedAt) / 3600000 * OFFICE_HOURLY_EXP[p.promotionTier]);
    p.accruedAt = now;
}
export function creditOfficeWaves(p: OfficeProfileState, waves: number, tier: number, now: number): void {
    accrueOffice(p, now); // Settle elapsed time at OLD position; no retroactive high-tier income.
    const accepted = Math.max(0, Math.min(4 - p.creditedWaves, Math.floor(waves)));
    p.promotionTier = Math.max(0, Math.min(7, Math.floor(tier)));
    p.creditedWaves += accepted;
    p.farmEarned = Math.min(2000, p.farmEarned + accepted * OFFICE_WAVE_EXP[p.promotionTier]);
}
export function officeTheme(now: number): {
    theme: string;
    dailyUp: string;
} {
    const day = Math.floor((now + 8 * 3600000) / 86400000);
    return { theme: OFFICE_THEMES[((day + 3) % 7 + 7) % 7], dailyUp: ['skin-paper', 'skin-mint', 'skin-night', 'skin-peach'][day % 4] };
}
export function drawOffice(p: OfficeProfileState, source: 'ticket' | 'farm', pool: 'daily' | 'standard', rng: () => number, now: number): string {
    accrueOffice(p, now);
    if (source === 'ticket') {
        if (p.tickets < 1)
            throw new ConflictException({ code: 'OFFICE_TICKETS_LOW' });
        p.tickets -= 1;
    }
    else {
        if (p.farmSpent >= 2000 || Math.floor(p.farmEarned) - p.farmSpent < 100)
            throw new ConflictException({ code: 'OFFICE_EXP_LOW' });
        p.farmSpent += 100;
    }
    const roll = rng();
    // Full distribution: N 93.7%, R 4%, SR 1.5%, SSR 0.8%; shared persistent 10 / 80 pity.
    const rarity = p.pitySSR >= 79 || roll < .008 ? 'SSR' : roll < .023 ? 'SR' : p.pityR >= 9 || roll < .063 ? 'R' : 'N';
    let candidates = OFFICE_COLLECTION.filter((x) => x.rarity === rarity);
    if (rarity === 'SSR' && pool === 'daily')
        candidates = candidates.filter((x) => x.id === officeTheme(now).dailyUp);
    const item = candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))];
    p.owned[item.id] = Math.min(1000000, (p.owned[item.id] ?? 0) + 1);
    p.pityR = rarity === 'N' ? p.pityR + 1 : 0;
    p.pitySSR = rarity === 'SSR' ? 0 : p.pitySSR + 1;
    p.draws += 1;
    p.lastDraw = item.id;
    return item.id;
}
export function officeText(value: unknown, min: number, max: number): string {
    if (typeof value !== 'string')
        throw new BadRequestException({ code: 'OFFICE_TEXT_INVALID' });
    const cleaned = value.normalize('NFKC').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g, '').trim();
    if (cleaned.length < min || cleaned.length > max)
        throw new BadRequestException({ code: 'OFFICE_TEXT_INVALID' });
    return cleaned;
}
export const normalizedOfficeWord = (word: string): string => word.normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
export function officeStrokes(value: unknown): OfficeStroke[] {
    if (!Array.isArray(value) || value.length < 1 || value.length > 100)
        throw new BadRequestException({ code: 'OFFICE_DRAWING_INVALID' });
    let total = 0;
    return value.map((raw: unknown) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
            throw new BadRequestException({ code: 'OFFICE_DRAWING_INVALID' });
        const s = raw as Record<string, unknown>;
        if (Object.keys(s).some((k) => !['points', 'color', 'width'].includes(k)) || !Array.isArray(s.points) || s.points.length < 2 || s.points.length > 200 || (total += s.points.length) > 3000 || typeof s.color!=='string'||!['#334155', '#2563eb', '#dc2626', '#16a34a'].includes(s.color) || typeof s.width!=='number'||![2, 4, 8].includes(s.width))
            throw new BadRequestException({ code: 'OFFICE_DRAWING_INVALID' });
        const points = s.points.map((point: unknown) => {
            if (!point || typeof point !== 'object' || Array.isArray(point))
                throw new BadRequestException({ code: 'OFFICE_DRAWING_INVALID' });
            const p = point as Record<string, unknown>;
            if (Object.keys(p).length !== 2 || !Number.isInteger(p.x) || !Number.isInteger(p.y) || Number(p.x) < 0 || Number(p.x) > 1000 || Number(p.y) < 0 || Number(p.y) > 1000)
                throw new BadRequestException({ code: 'OFFICE_DRAWING_INVALID' });
            return { x: Number(p.x), y: Number(p.y) };
        });
        return { points, color: String(s.color), width: Number(s.width) };
    });
}
export function officeRateLimit(p: OfficeProfileState, action: string, now: number, daily = 100, interval = 500): void {
    if ((p.counters[action] ?? 0) >= daily || now - (p.actionTimes[action] ?? 0) < interval)
        throw new ConflictException({ code: 'OFFICE_RATE_LIMIT' });
    p.counters[action] = (p.counters[action] ?? 0) + 1;
    p.actionTimes[action] = now;
}
export interface SpyMember {
    userId: string;
    publicId: string;
    name: string;
    role: 'civilian' | 'undercover';
    alive: boolean;
}
export interface OfficeSpyState {
    title: string;
    theme: string;
    phase: 'waiting' | 'describe' | 'vote' | 'finished';
    round: number;
    members: SpyMember[];
    descriptions: Array<{
        playerId: string;
        text: string;
        round: number;
    }>;
    votes: Record<string, string>;
    words: [
        string,
        string
    ];
    ownerId: string;
    expiresAt: number;
    guildId: string | null;
    outcome: 'civilian' | 'undercover' | 'cancelled' | null;
}
export function startOfficeSpy(s: OfficeSpyState, actor: string, rng: () => number, now: number): void {
    if (actor !== s.ownerId)
        throw new ForbiddenException({ code: 'OFFICE_OWNER_REQUIRED' });
    if (s.phase !== 'waiting' || s.members.length < 3 || s.members.length > 8)
        throw new ConflictException({ code: 'OFFICE_SPY_START_INVALID' });
    const shuffled = [...s.members];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const spies = new Set(shuffled.slice(0, s.members.length >= 6 ? 2 : 1).map((m) => m.userId));
    for (const m of s.members)
        m.role = spies.has(m.userId) ? 'undercover' : 'civilian';
    s.phase = 'describe';
    s.round = 1;
    s.expiresAt = now + 24 * 3600000;
}
export function actOfficeSpy(s: OfficeSpyState, userId: string, action: 'describe' | 'vote', value: unknown): void {
    const member = s.members.find((m) => m.userId === userId);
    if (!member?.alive)
        throw new ForbiddenException({ code: 'OFFICE_SPY_NOT_ACTIVE' });
    if (s.phase !== action)
        throw new ConflictException({ code: 'OFFICE_SPY_PHASE' });
    if (action === 'describe') {
        if (s.descriptions.some((d) => d.round === s.round && d.playerId === member.publicId))
            throw new ConflictException({ code: 'OFFICE_ALREADY_ACTED' });
        const text = officeText(value, 2, 160);
        const normal = normalizedOfficeWord(text);
        if (s.words.some((w) => normal.includes(normalizedOfficeWord(w))))
            throw new BadRequestException({ code: 'OFFICE_WORD_REVEALED' });
        s.descriptions.push({ playerId: member.publicId, text, round: s.round });
        if (s.members.filter((m) => m.alive).every((m) => s.descriptions.some((d) => d.round === s.round && d.playerId === m.publicId)))
            s.phase = 'vote';
    }
    else {
        if (s.votes[userId])
            throw new ConflictException({ code: 'OFFICE_ALREADY_ACTED' });
        const target = s.members.find((m) => m.publicId === value && m.alive && m.userId !== userId);
        if (!target)
            throw new BadRequestException({ code: 'OFFICE_VOTE_INVALID' });
        s.votes[userId] = target.publicId;
        if (s.members.filter((m) => m.alive).every((m) => s.votes[m.userId])) {
            const counts = new Map<string, number>();
            for (const v of Object.values(s.votes))
                counts.set(v, (counts.get(v) ?? 0) + 1);
            const ranked = [...counts].sort((a, b) => b[1] - a[1]);
            if (ranked.length && (!ranked[1] || ranked[0][1] > ranked[1][1]))
                s.members.find((m) => m.publicId === ranked[0][0])!.alive = false;
            const live = s.members.filter((m) => m.alive), spies = live.filter((m) => m.role === 'undercover').length;
            if (!spies)
                s.outcome = 'civilian';
            else if (spies >= live.length - spies || s.round >= 8)
                s.outcome = 'undercover';
            if (s.outcome)
                s.phase = 'finished';
            else {
                s.round += 1;
                s.phase = 'describe';
                s.votes = {};
            }
        }
    }
}
