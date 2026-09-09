/** Free, cosmetic office activities. Currency here is never purchasable or transferable. */
export type OfficeRarity = 'N' | 'R' | 'SR' | 'SSR';
export const OFFICE_COLLECTION = [
    { id: 'note-blue', name: '蓝色便签', rarity: 'N', kind: 'badge', color: '#dbeafe' },
    { id: 'note-green', name: '薄荷便签', rarity: 'N', kind: 'badge', color: '#d1fae5' },
    { id: 'note-peach', name: '蜜桃便签', rarity: 'N', kind: 'badge', color: '#ffe4e6' },
    { id: 'note-gold', name: '麦芽便签', rarity: 'N', kind: 'badge', color: '#fef3c7' },
    { id: 'stapler-silver', name: '银质订书机', rarity: 'R', kind: 'tower', color: '#94a3b8' },
    { id: 'coffee-mint', name: '薄荷咖啡机', rarity: 'R', kind: 'tower', color: '#34d399' },
    { id: 'printer-ink', name: '水墨打印机', rarity: 'R', kind: 'tower', color: '#64748b' },
    { id: 'chair-cloud', name: '云朵转椅', rarity: 'R', kind: 'tower', color: '#93c5fd' },
    { id: 'shredder-copper', name: '铜色碎纸机', rarity: 'R', kind: 'tower', color: '#c08457' },
    { id: 'guard-tea', name: '茶水间搭档', rarity: 'SR', kind: 'companion', color: '#059669' },
    { id: 'guard-night', name: '夜班小助手', rarity: 'SR', kind: 'companion', color: '#6366f1' },
    { id: 'guard-weekend', name: '周末守护者', rarity: 'SR', kind: 'companion', color: '#d97706' },
    { id: 'skin-paper', name: '素笺工作台', rarity: 'SSR', kind: 'skin', color: '#faf8f3' },
    { id: 'skin-mint', name: '薄荷工作台', rarity: 'SSR', kind: 'skin', color: '#ecfdf5' },
    { id: 'skin-night', name: '夜航工作台', rarity: 'SSR', kind: 'skin', color: '#e0e7ff' },
    { id: 'skin-peach', name: '晚霞工作台', rarity: 'SSR', kind: 'skin', color: '#fff1f2' },
] as const satisfies ReadonlyArray<{
    id: string;
    name: string;
    rarity: OfficeRarity;
    kind: string;
    color: string;
}>;
export const OFFICE_HOURLY_EXP = [40, 52, 64, 76, 88, 100, 115, 130] as const;
export const OFFICE_WAVE_EXP = [150, 162, 174, 186, 198, 210, 225, 240] as const;
export const OFFICE_TITLES = ['实习生', '摸鱼专员', '资深摸鱼', '小组长', '部门经理', '总监', '副总', '大老板'] as const;
export const OFFICE_THEMES = ['画饼日', '工位焕新', '茶水间故事', '轻装上阵', '下班倒计时', '周末散步', '好好休息'] as const;
export const OFFICE_STORY_STARTERS = ['周一晨会，投影仪突然显示了一封来自未来的邮件。', '茶水间的新咖啡机，每次冲泡都会吐出一张神秘便签。', '下班前五分钟，所有人的键盘同时多出了一个蓝色按键。', '公司宣布试行一天四小时工作制，但门口多了一只会说话的猫。'] as const;
export interface OfficeStroke {
    points: Array<{
        x: number;
        y: number;
    }>;
    color: string;
    width: number;
}
export interface OfficeCollectionView {
    day: string;
    promotionTier: number;
    hourlyExp: number;
    waveExp: number;
    farmExp: number;
    farmEarned: number;
    farmDraws: number;
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
    reputation: number;
    dailyUp: string;
    theme: string;
}
export interface OfficeAuthor {
    publicId: string | null;
    displayName: string;
}
export interface OfficeStoryNode {
    id: string;
    parentId: string | null;
    text: string;
    author: OfficeAuthor;
    mine: boolean;
    archived: boolean;
    archiveReason: string | null;
    score: number | null;
    ratings: number;
    myRating: number | null;
    createdAt: string;
}
export interface OfficeStory {
    id: string;
    title: string;
    nodes: OfficeStoryNode[];
    createdAt: string;
    mine: boolean;
}
export interface OfficeDrawing {
    id: string;
    author: OfficeAuthor;
    mine: boolean;
    theme: string;
    strokes: OfficeStroke[];
    word: string | null;
    wordLength: number;
    guesses: number;
    solved: boolean;
    attempts: number;
    createdAt: string;
}
export interface OfficeSpyView {
    id: string;
    title: string;
    theme: string;
    phase: 'waiting' | 'describe' | 'vote' | 'finished';
    round: number;
    owner: boolean;
    joined: boolean;
    meId: string | null;
    word: string | null;
    myVote: string | null;
    outcome: 'civilian' | 'undercover' | 'cancelled' | null;
    members: Array<{
        id: string;
        name: string;
        alive: boolean;
        described: boolean;
        voted: boolean;
        role: 'civilian' | 'undercover' | null;
    }>;
    descriptions: Array<{
        playerId: string;
        text: string;
        round: number;
    }>;
    expiresAt: string;
    guildGame: boolean;
}
export interface OfficeWeeklyView {
    guildId: string | null;
    guildName: string | null;
    week: string;
    announcement: string;
    canEdit: boolean;
    totalWaves: number;
    targetWaves: number;
    rewardClaimed: boolean;
    myWaves: number;
    reputation: number;
    leaderboard: Array<{
        rank: number;
        author: OfficeAuthor;
        waves: number;
        score: number;
        stars: number;
        streak: number;
    }>;
    departments: Array<{
        name: string;
        waves: number;
        reputation: number;
    }>;
}
export interface OfficeBossView {
    startedAt: string | null;
    endsAt: string | null;
    hits: number;
    damage: number;
    claimed: boolean;
    rewardCoins: number;
}
export interface OfficeHubOverview {
    page?: { nextCursor: string | null; historical: boolean };
    serverTime: string;
    collection: OfficeCollectionView;
    weekly: OfficeWeeklyView;
    boss: OfficeBossView;
    stories: OfficeStory[];
    drawings: OfficeDrawing[];
    spies: OfficeSpyView[];
    notice: string | null;
    moderation: Array<{
        id: string;
        kind: string;
        title: string;
        hidden: boolean;
        reports: number;
        preview?: string;
        strokes?: OfficeStroke[];
    }> | null;
}
