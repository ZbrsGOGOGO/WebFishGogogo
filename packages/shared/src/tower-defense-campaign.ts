import {
  advanceTowerPlantIncome, buyTowerShopOffer, campaignSpawns, createTowerDefenseState, deployInventoryTower,
  mergeDeployedTower, moveDeployedTower, moveTowerDefenseHero, pauseTowerDefense, refreshTowerDefenseShop,
  resumeTowerDefense, sellDeployedTower, sellInventoryTower, setTowerShopFocus,
  startNextTowerDefenseWave, startTowerDefense, stepTowerDefense, triggerFocusPulse,
  upgradeTowerDefenseHero, upgradeTowerDefensePlant,
  type TowerDefenseState, type TowerDefenseDirection, type TowerType,
} from './tower-defense-engine';

export const WORKSTATION_PROMOTIONS = [
  { name: '实习生', experience: 0 }, { name: '摸鱼专员', experience: 120 },
  { name: '资深摸鱼', experience: 360 }, { name: '小组长', experience: 800 },
  { name: '部门经理', experience: 1600 }, { name: '总监', experience: 3000 },
  { name: '副总', experience: 5400 }, { name: '大老板', experience: 9000 },
] as const;
export const WORKSTATION_JOBS = {
  specialist: { name: '摸鱼专员', passive: '普攻 +1，均衡守卫', active: '专注脉冲：范围爆发，Lv.3 三倍攻击' },
  admin: { name: '行政', passive: '塔队伤害 +8%', active: '协作脉冲：范围攻击并恢复自身 3 耐久' },
  it: { name: 'IT', passive: '普攻无视护甲', active: '系统清理：脉冲真伤无视护甲' },
  hr: { name: 'HR', passive: '普攻附带减速', active: '流程冻结：范围眩晕，Boss 仍享控制抗性' },
} as const;
export const WORKSTATION_CHAPTERS = [
  { id: 1, title: '入职第一天', story: '待办从走廊涌入，先让一盆绿植和三份零件成为你的搭档。' },
  { id: 2, title: '周报攻坚', story: '催办邮件成群到达，打印与冷静思考比盲目忙碌更有用。' },
  { id: 3, title: '季度审计', story: '重点议题带来护甲，订书机与碎纸机需要一起协作。' },
  { id: 4, title: '会议迷宫', story: '座位扩大了，队伍不能只是变多，也要形成自己的羁绊。' },
  { id: 5, title: '年终盘点', story: '行政与 IT 各有办法，选择最适合自己的防线。' },
  { id: 6, title: '准点下班', story: '最终通知抵达。你守住的不是一张桌子，而是属于自己的时间。' },
] as const;
export const WORKSTATION_SYNERGIES: Record<TowerType, { two: string; three: string }> = {
  single: { two: '相邻装订线攻速 +20%', three: '三星自动线攻击间隔减半' },
  slow: { two: '苦茶区减速可叠加', three: '每 10 秒触发全图 1 秒冰冻' },
  splash: { two: '串印范围 +1 格', three: '纸海三联输出' },
  push: { two: '工位阵法控制 +1 秒', three: '每 10 秒全图暂停 0.5 秒' },
  shred: { two: '普通文书真伤 +50%', three: '每 10 秒可吞一份多余碎纸零件回 20 G' },
};
export type WorkstationJob = keyof typeof WORKSTATION_JOBS;
export type WorkstationMode = 'story' | 'endless' | 'extreme';
export interface WorkstationTalents { output: number; control: number; economy: number }
/** Optional CAS keeps old clients compatible; current clients protect drafts across tabs. */
export interface WorkstationTalentPlanInput extends WorkstationTalents { expectedTalents?: WorkstationTalents }
export type WorkstationCommand =
  | { type: 'start' | 'go' | 'next' | 'pause' | 'resume' | 'pulse' | 'hero' | 'plant' | 'refresh' | 'abandon' | 'skill2' | 'skill3' | 'rush' | 'repair-plant' }
  | { type: 'move'; direction: TowerDefenseDirection }
  | { type: 'buy'; offerId: string }
  | { type: 'focus'; towerType: TowerType }
  | { type: 'deploy'; itemId: string; slotIndex: number }
  | { type: 'move-tower'; towerId: string; fromSlotIndex: number; toSlotIndex: number }
  | { type: 'merge' | 'sell-tower'; slotIndex: number }
  | { type: 'sell-item'; itemId: string };
export interface WorkstationProfile {
  experience: number; promotionTier: number; unlockedChapter: number; talents: WorkstationTalents;
  talentPoints: number; formation: { type: TowerType; slotIndex: number }[];
  stats: { runs: number; wins: number; waves: number; bestScore: number; bestStreak: number; totalScore: number; achievements: string[] };
}
export interface WorkstationReport {
  id: string; mode: WorkstationMode; chapter: number; score: number; successfulWaves: number;
  stars: number; streak: number; coins: number; outcome: string; settledAt: string; formation: { type: TowerType; slotIndex: number; level: number }[];
}
export interface WorkstationOverview {
  appearance?: { equipped: string | null; owned: string[] };
  profile: WorkstationProfile; run: { id: string; state: TowerDefenseState; revision: number; catchupPending: boolean } | null;
  reports: WorkstationReport[]; writesEnabled: boolean; rules: string;
}
export function workstationPromotion(experience: number): number {
  return WORKSTATION_PROMOTIONS.reduce((tier, item, index) => experience >= item.experience ? index : tier, 0);
}
export function createWorkstationCampaign(seed: number, options: {
  job: WorkstationJob; mode: WorkstationMode; chapter: number; promotionTier: number; talents: WorkstationTalents; weekday: number;
}): TowerDefenseState {
  const state = createTowerDefenseState(seed);
  return { ...state, hero: { ...state.hero, hp: 12, attack: state.hero.attack + (options.job === 'specialist' ? 1 : 0) },
    spawnQueue: campaignSpawns(1, options.chapter, options.mode),
    campaign: { job: options.job, talents: { ...options.talents }, chapter: options.chapter, mode: options.mode,
      slots: Math.min(9, 6 + Math.floor(options.promotionTier / 2)), totalWaves: options.mode === 'endless' ? 60 : 2,
      streak: 0, bestStreak: 0, waveBreaches: 0, safeTicks: 0, plantHurtTick: -1, bag: null, boostUntil: 0,
      weekend: options.weekday === 6 ? 6 : options.weekday === 0 ? 7 : 0, event: '', eventUntil: 0,
      collectedBags: 0, countdown: 0, completedWaves: 0 } };
}

/** Only the server clock calls this in official runs. Offline uses exactly the same ticks. */
export function stepWorkstationCampaign(state: TowerDefenseState): TowerDefenseState {
  const campaign = state.campaign;
  if (!campaign || !['running', 'intermission'].includes(state.status)) return state;
  if (campaign.countdown > 0) {
    const countdown = campaign.countdown - 1;
    const next = { ...state, tick: state.tick + 1, campaign: { ...campaign, countdown } };
    return countdown === 0 && state.status === 'intermission' ? campaignNextWave(next) : next;
  }
  if (state.status === 'intermission') return campaignNextWave(state);
  // Sunday meeting is a server-timed 60-second rest, once per run; plants keep producing.
  if (campaign.weekend === 7 && state.wave === 2 && campaign.event === '老板开会 · 60 秒补给窗口' && state.tick < campaign.eventUntil) {
    return advanceTowerPlantIncome({ ...state, tick: state.tick + 1 });
  }
  let next = stepTowerDefense(state);
  if (!next.campaign) return next;
  if (next.status === 'intermission' && state.status === 'running') {
    const seed = (Math.imul(next.rngSeed, 1664525) + 1013904223) >>> 0;
    const roll = seed / 0x100000000;
    next = { ...next, rngSeed: seed, campaign: { ...next.campaign, bag: roll < .08 ? { x: 11, y: 6, expires: next.tick + 36, coins: roll < .04 ? 100 : 50 } : null,
      event: next.campaign.weekend === 6 ? '周六零食补给 +50 G' : next.campaign.streak >= 3 ? `HOT STREAK · ${next.campaign.streak} 连胜` : '', eventUntil: next.tick + 36 }, credits: next.credits + (next.campaign.weekend === 6 ? 50 : 0) };
  }
  if (state.wave === 1 && next.wave === 2 && next.campaign?.weekend === 7) next = { ...next, campaign: { ...next.campaign, event: '老板开会 · 60 秒补给窗口', eventUntil: next.tick + 215 } };
  if (next.campaign?.bag) next = { ...next, campaign: { ...next.campaign, bag: next.tick >= next.campaign.bag.expires ? null : { ...next.campaign.bag, x: next.tick % 3 === 0 ? Math.max(0, next.campaign.bag.x - 1) : next.campaign.bag.x } } };
  if (next.campaign && next.tick % 36 === 0 && next.towers.filter((tower) => tower.type === 'shred').length >= 3) {
    const part = next.inventory.find((item) => item.type === 'shred' && item.tier === 1);
    if (part) next = { ...next, inventory: next.inventory.filter((item) => item.id !== part.id), credits: next.credits + 20 };
  }
  return next;
}

export function applyWorkstationCommand(state: TowerDefenseState, command: WorkstationCommand): TowerDefenseState {
  switch (command.type) {
    case 'repair-plant': return state.campaign && state.plantLevel>0 && ['idle','running','intermission'].includes(state.status) && state.credits>=10 && (state.campaign.plantHp??0)<6+state.plantLevel*3 ? {...state,credits:state.credits-10,campaign:{...state.campaign,plantHp:6+state.plantLevel*3}}:state;
    case 'rush': return state.status==='running' && state.campaign ? {...state,spawnQueue:state.spawnQueue.map(spawn=>({...spawn,spawnDelayTicks:1})),nextSpawnAt:state.tick+1,campaign:{...state.campaign,event:'集中处理 · 本波待办加速到达',eventUntil:state.tick+18}}:state;
    case 'skill2': {
      if (state.status !== 'running' || !state.campaign || state.hero.level<3 || (state.campaign.skill2Until??0)>state.tick) return state;
      return { ...state,hero:{...state.hero,hp:Math.min(12,(state.hero.hp??12)+2)},campaign:{...state.campaign,boostUntil:state.tick+22,skill2Until:state.tick+108,event:'团队协作 · 6 秒伤害增益',eventUntil:state.tick+22} };
    }
    case 'skill3': {
      if (state.status !== 'running' || !state.campaign || state.hero.level<5 || (state.campaign.skill3Until??0)>state.tick) return state;
      return { ...state,enemies:state.enemies.map(enemy=>(enemy.controlImmunityTicks??0)>0?enemy:{...enemy,stunTicks:enemy.boss?1:5,controlImmunityTicks:enemy.boss?18:12}),campaign:{...state.campaign,skill3Until:state.tick+144,event:'全域协调 · 目标短暂冻结',eventUntil:state.tick+18} };
    }
    case 'abandon': return ['won','lost'].includes(state.status) ? state : { ...state, status: 'lost' };
    case 'start': { const next = startTowerDefense(state); return next !== state && next.campaign ? { ...next, campaign: { ...next.campaign, countdown: 18 } } : state; }
    case 'go': case 'next': {
      let next = state.status === 'intermission' ? campaignNextWave(state) : state;
      if (next.campaign) next = { ...next, campaign: { ...next.campaign, countdown: 0 } };
      return next;
    }
    case 'pause': return pauseTowerDefense(state);
    case 'resume': return resumeTowerDefense(state);
    case 'move': return moveTowerDefenseHero(state, command.direction);
    case 'pulse': return triggerFocusPulse(state);
    case 'hero': return upgradeTowerDefenseHero(state);
    case 'plant': return upgradeTowerDefensePlant(state).state;
    case 'refresh': return refreshTowerDefenseShop(state).state;
    case 'buy': return buyTowerShopOffer(state, command.offerId).state;
    case 'focus': return setTowerShopFocus(state, command.towerType).state;
    case 'deploy': return deployInventoryTower(state, command.itemId, command.slotIndex).state;
    case 'move-tower': return moveDeployedTower(state, command.fromSlotIndex, command.toSlotIndex, command.towerId).state;
    case 'merge': return mergeDeployedTower(state, command.slotIndex).state;
    case 'sell-tower': return sellDeployedTower(state, command.slotIndex).state;
    case 'sell-item': return sellInventoryTower(state, command.itemId).state;
  }
}

function campaignNextWave(state: TowerDefenseState): TowerDefenseState {
  const base = startNextTowerDefenseWave(state);
  const next = base.campaign ? { ...base, campaign: { ...base.campaign,waveStartedTick:base.tick } } : base;
  return state.wave === 1 && next.wave === 2 && next.campaign?.weekend === 7
    ? { ...next, campaign: { ...next.campaign, event: '老板开会 · 60 秒补给窗口', eventUntil: next.tick + 215 } }
    : next;
}

export function workstationRewards(state: TowerDefenseState): { coins: number; experience: number; waves: number; stars: number; streak: number; achievements: string[] } {
  const waves = state.campaign?.completedWaves ?? 0;
  const won = state.status === 'won';
  const stars = Math.max(state.campaign?.mergedThree ? 3 : 0, ...state.towers.map((tower) => tower.level), ...state.inventory.map((item) => item.tier));
  const base = Math.min(40, Math.floor(state.score / 250) + waves * 3);
  return { coins: state.defeated < 3 || state.tick < 36 ? 0 : Math.floor(base * (won ? 1 : .3)),
    experience: state.defeated < 3 ? 0 : Math.min(120, waves * 12 + Math.floor(state.defeated / 3)), waves, stars,
    streak: state.campaign?.bestStreak ?? 0, achievements: [
      ...(state.campaign?.mergedThree ? ['tower_first_three'] : []), ...(won && state.breached === 0 ? ['tower_perfect'] : []),
      ...(won && (state.campaign?.fastestWaveTicks ?? state.tick) * 280 <= 20000 ? ['tower_speed'] : []), ...(waves >= 10 ? ['tower_overtime'] : []),
    ] };
}
