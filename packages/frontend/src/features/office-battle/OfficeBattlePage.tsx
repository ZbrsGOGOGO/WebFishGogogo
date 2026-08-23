import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';

import {
  EQUIPMENT_SLOTS,
  OFFICE_SKILLS,
  PROFESSION_DEFINITIONS,
  RARITY_DEFINITIONS,
  createOpponent,
  createSeededRandom,
  createStarterEquipment,
  deriveFighterStats,
  equipmentScore,
  fighterPower,
  resolveOfficeBattle,
  rollLoot,
  type BattleProfession,
  type EquipmentDefinition,
  type OfficeBattleResult,
  type OfficeFighter,
} from './office-battle-domain';
import styles from './OfficeBattlePage.module.css';

const PROFILE_STORAGE_KEY = 'zbrs.office-battle.profile.v1';
const MAX_STAMINA = 120;
const STAMINA_STEP_MS = 5 * 60 * 1000;
const INVENTORY_LIMIT = 24;
const FIGHTER_STAT_KEYS = new Set(['hp', 'attack', 'defense', 'speed', 'luck']);

type HubTab = 'home' | 'equipment' | 'skills' | 'tasks' | 'reports';
type BattleModeId = 'quick' | 'client' | 'deadline';

interface BattleMode {
  id: BattleModeId;
  name: string;
  mark: string;
  description: string;
  stamina: number;
  experience: number;
  credits: number;
  difficulty: number;
}

interface DailyProgress {
  date: string;
  battles: number;
  wins: number;
  claimed: string[];
}

interface BattleHistoryItem {
  id: string;
  at: string;
  opponentName: string;
  modeName: string;
  won: boolean;
  rounds: number;
  reward: string;
}

interface LocalBattleProfile extends OfficeFighter {
  experience: number;
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
  stamina: number;
  staminaUpdatedAt: number;
  credits: number;
  skillPoints: number;
  skillRanks: Record<string, number>;
  inventory: EquipmentDefinition[];
  towerFloor: number;
  daily: DailyProgress;
  history: BattleHistoryItem[];
}

interface BattleViewState {
  result: OfficeBattleResult;
  loot: EquipmentDefinition | null;
  player: OfficeFighter;
  opponent: OfficeFighter;
  mode: BattleMode;
  lootConverted: boolean;
}

const BATTLE_MODES: readonly BattleMode[] = [
  { id: 'quick', name: '快速切磋', mark: '快', description: '同层同事随机切磋，消耗低，适合熟悉职业。', stamina: 10, experience: 24, credits: 18, difficulty: 0 },
  { id: 'client', name: '客户攻坚', mark: '客', description: '挑战更强对手，奖励与稀有装备概率同步提升。', stamina: 15, experience: 34, credits: 30, difficulty: 1 },
  { id: 'deadline', name: '截止日试炼', mark: '塔', description: '逐层推进高压项目，获胜后解锁下一层。', stamina: 20, experience: 44, credits: 42, difficulty: 2 },
] as const;

const NAV_ITEMS: readonly { id: HubTab; name: string; mark: string }[] = [
  { id: 'home', name: '乐斗大厅', mark: '斗' },
  { id: 'equipment', name: '装备背包', mark: '装' },
  { id: 'skills', name: '能力成长', mark: '技' },
  { id: 'tasks', name: '今日任务', mark: '任' },
  { id: 'reports', name: '战斗记录', mark: '报' },
] as const;

const DAILY_TASKS = [
  { id: 'battle1', name: '准时开工', description: '完成 1 次乐斗', reward: 30, completed: (daily: DailyProgress) => daily.battles >= 1 },
  { id: 'win1', name: '开门红', description: '赢得 1 次乐斗', reward: 50, completed: (daily: DailyProgress) => daily.wins >= 1 },
  { id: 'battle3', name: '今日主力', description: '完成 3 次乐斗', reward: 80, completed: (daily: DailyProgress) => daily.battles >= 3 },
] as const;

function todayKey(): string {
  return new Date().toLocaleDateString('sv-SE');
}

function freshDaily(): DailyProgress {
  return { date: todayKey(), battles: 0, wins: 0, claimed: [] };
}

function clearStoredProfile(): void {
  try {
    window.localStorage.removeItem(PROFILE_STORAGE_KEY);
  } catch {
    // 禁用本地存储时仍可继续当前试玩。
  }
}

function isValidEquipment(value: unknown, profession: BattleProfession): value is EquipmentDefinition {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<EquipmentDefinition>;
  const slotExists = EQUIPMENT_SLOTS.some((slot) => slot.id === item.slot);
  const rarityExists = typeof item.rarity === 'string' && item.rarity in RARITY_DEFINITIONS;
  if (!slotExists || !rarityExists || item.profession !== profession || typeof item.id !== 'string' || typeof item.name !== 'string' || !Number.isInteger(item.level) || (item.level ?? 0) < 1 || (item.level ?? 0) > 60 || item.stats === null || typeof item.stats !== 'object' || Array.isArray(item.stats)) return false;
  return Object.entries(item.stats).every(([key, stat]) => FIGHTER_STAT_KEYS.has(key) && typeof stat === 'number' && Number.isFinite(stat) && stat >= 0);
}

function normalizeEquipment(value: unknown, profession: BattleProfession, requireSixSlots = false): EquipmentDefinition[] | null {
  if (!Array.isArray(value) || value.some((item) => !isValidEquipment(item, profession))) return null;
  if (requireSixSlots) {
    if (value.length !== EQUIPMENT_SLOTS.length) return null;
    const slots = value.map((item) => item.slot);
    if (new Set(slots).size !== EQUIPMENT_SLOTS.length || EQUIPMENT_SLOTS.some((slot) => !slots.includes(slot.id))) return null;
  }
  return value;
}

function refillProfile(profile: LocalBattleProfile, now = Date.now()): LocalBattleProfile {
  let next = profile;
  if (profile.daily.date !== todayKey()) next = { ...next, daily: freshDaily() };
  const elapsed = Math.max(0, now - profile.staminaUpdatedAt);
  const recovered = Math.floor(elapsed / STAMINA_STEP_MS);
  if (recovered > 0 && profile.stamina < MAX_STAMINA) {
    const stamina = Math.min(MAX_STAMINA, profile.stamina + recovered);
    next = { ...next, stamina, staminaUpdatedAt: stamina === MAX_STAMINA ? now : profile.staminaUpdatedAt + recovered * STAMINA_STEP_MS };
  }
  return next;
}

function loadProfile(): LocalBattleProfile | null {
  try {
    const stored = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<LocalBattleProfile>;
    const professionExists = PROFESSION_DEFINITIONS.some((item) => item.id === parsed.profession);
    if (!professionExists || !parsed.profession || typeof parsed.name !== 'string' || !Number.isInteger(parsed.level) || (parsed.level ?? 0) < 1 || (parsed.level ?? 0) > 60) throw new Error('invalid profile');
    const equipment = normalizeEquipment(parsed.equipment, parsed.profession, true);
    const inventory = normalizeEquipment(parsed.inventory ?? [], parsed.profession) ?? [];
    if (!equipment || inventory.length > INVENTORY_LIMIT) throw new Error('invalid equipment');
    const safeNumber = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
    const skillRanks = parsed.skillRanks && typeof parsed.skillRanks === 'object' && !Array.isArray(parsed.skillRanks) ? parsed.skillRanks : {};
    const daily = parsed.daily && typeof parsed.daily === 'object' && typeof parsed.daily.date === 'string' && Array.isArray(parsed.daily.claimed) ? parsed.daily : freshDaily();
    const history = Array.isArray(parsed.history) ? parsed.history.filter((item): item is BattleHistoryItem => Boolean(item && typeof item.id === 'string' && typeof item.opponentName === 'string')).slice(0, 20) : [];
    return refillProfile({
      name: parsed.name,
      profession: parsed.profession,
      level: Math.floor(parsed.level ?? 1),
      equipment,
      experience: safeNumber(parsed.experience, 0),
      wins: safeNumber(parsed.wins, 0),
      losses: safeNumber(parsed.losses, 0),
      streak: safeNumber(parsed.streak, 0),
      bestStreak: safeNumber(parsed.bestStreak, 0),
      stamina: Math.min(MAX_STAMINA, safeNumber(parsed.stamina, MAX_STAMINA)),
      staminaUpdatedAt: safeNumber(parsed.staminaUpdatedAt, Date.now()),
      credits: safeNumber(parsed.credits, 100),
      skillPoints: safeNumber(parsed.skillPoints, 0),
      skillRanks,
      inventory,
      towerFloor: Math.max(1, safeNumber(parsed.towerFloor, 1)),
      daily,
      history,
    });
  } catch {
    clearStoredProfile();
    return null;
  }
}

function saveProfile(profile: LocalBattleProfile | null): void {
  try {
    if (profile) window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    else window.localStorage.removeItem(PROFILE_STORAGE_KEY);
  } catch {
    // 当前游戏仍可继续，只是不跨刷新保存。
  }
}

function createProfile(profession: BattleProfession): LocalBattleProfile {
  const definition = PROFESSION_DEFINITIONS.find((item) => item.id === profession) ?? PROFESSION_DEFINITIONS[0];
  return {
    name: `${definition.shortName}新人`, profession, level: 1, experience: 0,
    wins: 0, losses: 0, streak: 0, bestStreak: 0,
    stamina: MAX_STAMINA, staminaUpdatedAt: Date.now(), credits: 100,
    skillPoints: 0, skillRanks: {}, equipment: createStarterEquipment(profession), inventory: [],
    towerFloor: 1, daily: freshDaily(), history: [],
  };
}

function levelFromExperience(experience: number): number {
  return Math.min(60, Math.floor(experience / 100) + 1);
}

function statText(item: EquipmentDefinition): string {
  const names = { hp: '活力', attack: '执行', defense: '抗压', speed: '反应', luck: '洞察' };
  return Object.entries(item.stats).map(([key, value]) => `${names[key as keyof typeof names]} +${value}`).join(' · ');
}

function professionOf(id: BattleProfession) {
  return PROFESSION_DEFINITIONS.find((item) => item.id === id) ?? PROFESSION_DEFINITIONS[0];
}

function rarityStyle(rarity: EquipmentDefinition['rarity']): React.CSSProperties {
  const colors = { common: '#8792a2', uncommon: '#45a66b', rare: '#4f88cf', epic: '#9b68c5', legendary: '#d9952d' };
  return { '--rarity-color': colors[rarity] } as React.CSSProperties;
}

function FighterPortrait({ profession, compact = false }: { profession: BattleProfession; compact?: boolean }): JSX.Element {
  return <div className={compact ? styles.miniFighter : styles.fighterPortrait} data-profession={profession} aria-hidden="true"><i /><span>{professionOf(profession).mark}</span><b /></div>;
}

function EquipmentCard({ item, actions }: { item: EquipmentDefinition; actions?: JSX.Element }): JSX.Element {
  const slot = EQUIPMENT_SLOTS.find((entry) => entry.id === item.slot) ?? EQUIPMENT_SLOTS[0];
  return (
    <article className={styles.equipmentCard} data-rarity={item.rarity} style={rarityStyle(item.rarity)}>
      <span className={styles.slotMark}>{slot.mark}</span>
      <div><small>{slot.name} · Lv.{item.level} · {RARITY_DEFINITIONS[item.rarity].label}</small><strong>{item.name}</strong><span>{statText(item)}</span>{item.weaponTraitLabel && <em>{item.weaponCategory} · {item.weaponTraitLabel}</em>}</div>
      {actions}
    </article>
  );
}

export default function OfficeBattlePage(): JSX.Element {
  const [profile, setProfile] = useState<LocalBattleProfile | null>(() => loadProfile());
  const [tab, setTab] = useState<HubTab>('home');
  const [selectedMode, setSelectedMode] = useState<BattleModeId>('quick');
  const [battle, setBattle] = useState<BattleViewState | null>(null);
  const [notice, setNotice] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => saveProfile(profile), [profile]);
  useEffect(() => {
    if (!profile) return;
    const interval = window.setInterval(() => setProfile((current) => current ? refillProfile(current) : current), 60_000);
    return () => window.clearInterval(interval);
  }, [Boolean(profile)]);

  const mode = BATTLE_MODES.find((item) => item.id === selectedMode) ?? BATTLE_MODES[0];
  const opponent = useMemo(() => profile ? createOpponent(profile.profession, profile.level, profile.wins + profile.losses + profile.towerFloor * 7 + 13, mode.difficulty) : null, [profile?.profession, profile?.level, profile?.wins, profile?.losses, profile?.towerFloor, mode.difficulty]);
  const stats = profile ? deriveFighterStats(profile) : null;

  const chooseProfession = (profession: BattleProfession) => {
    setProfile(createProfile(profession));
    setBattle(null); setTab('home'); setNotice('职业创建完成，先打一场快速切磋熟悉节奏。');
    window.setTimeout(() => headingRef.current?.focus(), 0);
  };

  const resetProfile = () => {
    clearStoredProfile(); setProfile(null); setBattle(null); setTab('home'); setNotice('');
  };

  const startBattle = (battleMode: BattleMode) => {
    if (!profile || profile.stamina < battleMode.stamina) {
      setNotice('体力不足。可等待恢复，或使用 40 工位币喝咖啡恢复 50 体力。');
      return;
    }
    const seed = Date.now() + profile.wins * 31 + profile.losses * 17 + battleMode.difficulty * 101;
    const random = createSeededRandom(seed);
    const playerSnapshot: OfficeFighter = { name: profile.name, profession: profile.profession, level: profile.level, equipment: profile.equipment.map((item) => ({ ...item, stats: { ...item.stats } })), skillRanks: { ...profile.skillRanks } };
    const opponentSnapshot = createOpponent(profile.profession, profile.level, seed, battleMode.difficulty + (battleMode.id === 'deadline' ? Math.floor((profile.towerFloor - 1) / 5) : 0));
    const result = resolveOfficeBattle(playerSnapshot, opponentSnapshot, random);
    const won = result.winner === 'player';
    const loot = won ? rollLoot(profile.profession, profile.level, random) : null;
    const oldLevel = profile.level;
    const experience = profile.experience + (won ? battleMode.experience : Math.round(battleMode.experience * 0.45));
    const level = levelFromExperience(experience);
    const creditsEarned = won ? battleMode.credits : Math.round(battleMode.credits * 0.35);
    const lootConverted = Boolean(loot && profile.inventory.length >= INVENTORY_LIMIT);
    const nextStreak = won ? profile.streak + 1 : 0;
    const historyItem: BattleHistoryItem = {
      id: String(seed), at: new Date().toLocaleString('zh-CN', { hour12: false }), opponentName: opponentSnapshot.name,
      modeName: battleMode.id === 'deadline' ? `${battleMode.name} ${profile.towerFloor}F` : battleMode.name,
      won, rounds: result.rounds, reward: `${creditsEarned + (lootConverted ? 25 : 0)} 工位币 · ${won ? battleMode.experience : Math.round(battleMode.experience * 0.45)} 经验`,
    };
    setProfile({
      ...profile, level, experience, stamina: profile.stamina - battleMode.stamina, staminaUpdatedAt: Date.now(),
      credits: profile.credits + creditsEarned + (lootConverted ? 25 : 0), wins: profile.wins + (won ? 1 : 0), losses: profile.losses + (won ? 0 : 1),
      streak: nextStreak, bestStreak: Math.max(profile.bestStreak, nextStreak), skillPoints: profile.skillPoints + Math.max(0, level - oldLevel),
      inventory: loot && !lootConverted ? [loot, ...profile.inventory] : profile.inventory,
      towerFloor: battleMode.id === 'deadline' && won ? profile.towerFloor + 1 : profile.towerFloor,
      daily: { ...profile.daily, battles: profile.daily.battles + 1, wins: profile.daily.wins + (won ? 1 : 0) },
      history: [historyItem, ...profile.history].slice(0, 20),
    });
    setBattle({ result, loot, player: playerSnapshot, opponent: opponentSnapshot, mode: battleMode, lootConverted });
    setNotice(level > oldLevel ? `晋升到 Lv.${level}，获得 ${level - oldLevel} 个能力点！` : won ? '挑战成功，奖励已经入账。' : '挑战失败，但仍获得了部分经验。');
  };

  const drinkCoffee = () => {
    if (!profile) return;
    if (profile.credits < 40) { setNotice('工位币不足 40，完成战斗和每日任务可以继续赚取。'); return; }
    if (profile.stamina >= MAX_STAMINA) { setNotice('当前体力已经满了。'); return; }
    setProfile({ ...profile, credits: profile.credits - 40, stamina: Math.min(MAX_STAMINA, profile.stamina + 50), staminaUpdatedAt: Date.now() });
    setNotice('咖啡已送达，恢复 50 体力。');
  };

  const equipItem = (item: EquipmentDefinition) => {
    if (!profile) return;
    const current = profile.equipment.find((entry) => entry.slot === item.slot);
    setProfile({ ...profile, equipment: profile.equipment.map((entry) => entry.slot === item.slot ? item : entry), inventory: [current, ...profile.inventory.filter((entry) => entry.id !== item.id)].filter((entry): entry is EquipmentDefinition => Boolean(entry)).slice(0, INVENTORY_LIMIT) });
    setNotice(`${item.name} 已装备，战力已重新计算。`);
  };

  const salvageItem = (item: EquipmentDefinition) => {
    if (!profile) return;
    const reward = 8 + Math.round(equipmentScore(item) / 3);
    setProfile({ ...profile, credits: profile.credits + reward, inventory: profile.inventory.filter((entry) => entry.id !== item.id) });
    setNotice(`已整理 ${item.name}，获得 ${reward} 工位币。`);
  };

  const upgradeSkill = (skillId: string) => {
    if (!profile || profile.skillPoints < 1) return;
    const skill = OFFICE_SKILLS.find((entry) => entry.id === skillId);
    if (!skill || profile.level < skill.unlockLevel) return;
    const rank = profile.skillRanks[skillId] ?? 0;
    if (rank >= skill.maxRank) return;
    setProfile({ ...profile, skillPoints: profile.skillPoints - 1, skillRanks: { ...profile.skillRanks, [skillId]: rank + 1 } });
    setNotice(`${skill.name} 提升到 ${rank + 1} 级。`);
  };

  const claimTask = (taskId: string) => {
    if (!profile) return;
    const task = DAILY_TASKS.find((entry) => entry.id === taskId);
    if (!task || !task.completed(profile.daily) || profile.daily.claimed.includes(taskId)) return;
    setProfile({ ...profile, credits: profile.credits + task.reward, daily: { ...profile.daily, claimed: [...profile.daily.claimed, taskId] } });
    setNotice(`领取 ${task.reward} 工位币。`);
  };

  if (!profile) {
    return (
      <main className={styles.page}>
        <section className={styles.introHero}>
          <div><span className={styles.eyebrow}>OFFICE BATTLE · 原创办公室对战</span><h1>选一个职业，开始你的职场乐斗生涯</h1><p>每个职业拥有独立属性、专属技能和武器特性。战斗消耗体力，胜利可升级、掉装备、闯试炼，也能通过任务持续成长。</p></div>
          <aside><strong>一眼看懂的成长路线</strong><span>① 选职业并完成快速切磋</span><span>② 换装备、点能力、提升战力</span><span>③ 挑战客户攻坚与截止日试炼</span></aside>
        </section>
        <section className={styles.professionSection}>
          <header className={styles.sectionHeading}><div><span className={styles.eyebrow}>STEP 01</span><h2>先选职业</h2></div><p>职业一旦创建会保存在本机。想换职业时可在游戏内重开。</p></header>
          <div className={styles.professionGrid}>
            {PROFESSION_DEFINITIONS.map((item) => (
              <article className={styles.professionCard} key={item.id}>
                <span className={styles.professionMark}>{item.mark}</span><small>{item.shortName}路线</small><h3>{item.name}</h3><p>{item.slogan}</p>
                <dl><div><dt>活力</dt><dd>{item.baseStats.hp}</dd></div><div><dt>执行</dt><dd>{item.baseStats.attack}</dd></div><div><dt>反应</dt><dd>{item.baseStats.speed}</dd></div></dl>
                <span className={styles.professionSkill}><b>{item.skillName}</b>{item.skillDescription}</span>
                <button className={styles.professionSelect} type="button" onClick={() => chooseProfession(item.id)} aria-label={`选择${item.name}`}>选择 {item.name}</button>
              </article>
            ))}
          </div>
        </section>
      </main>
    );
  }

  const definition = professionOf(profile.profession);
  const experienceInLevel = profile.experience % 100;
  const staminaPercent = Math.round(profile.stamina / MAX_STAMINA * 100);
  const availableSkills = OFFICE_SKILLS.filter((skill) => skill.profession === 'all' || skill.profession === profile.profession);

  return (
    <main className={styles.page}>
      <header className={styles.dashboardHeader}>
        <div><span className={styles.eyebrow}>OFFICE BATTLE CENTER</span><h1 ref={headingRef} tabIndex={-1}>{profile.name}的乐斗地盘</h1><p>体力挑战 · 装备掉落 · 能力成长 · 每日任务 · 自动战报</p></div>
        <div className={styles.headerActions}><Link to="/games">返回游戏中心</Link><button type="button" onClick={resetProfile}>重开职业</button></div>
      </header>
      {notice && <div className={styles.notice} role="status"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="关闭提示">×</button></div>}

      <div className={styles.battleHub}>
        <aside className={styles.profileRail}>
          <div className={styles.profileIdentity}><span className={styles.levelBadge}><small>LV</small>{profile.level}</span><FighterPortrait profession={profile.profession} /><small>{definition.name}</small><h2>{profile.name}</h2><div className={styles.power}><span>综合战力</span><strong>{fighterPower(profile)}</strong></div></div>
          <div className={styles.railBars}>
            <div><span>体力 <b>{profile.stamina}/{MAX_STAMINA}</b></span><i><b style={{ width: `${staminaPercent}%` }} /></i><small>每 5 分钟恢复 1 点</small></div>
            <div><span>经验 <b>{experienceInLevel}/100</b></span><i><b style={{ width: `${experienceInLevel}%` }} /></i><small>{profile.level >= 60 ? '已满级' : `距 Lv.${profile.level + 1} 还差 ${100 - experienceInLevel}`}</small></div>
          </div>
          <div className={styles.currencyCard}><div><span>工位币</span><strong>{profile.credits}</strong></div><button type="button" onClick={drinkCoffee}>咖啡 +50 体力</button></div>
          {stats && <div className={styles.statGrid}><div><span>活力</span><strong>{stats.hp}</strong></div><div><span>执行</span><strong>{stats.attack}</strong></div><div><span>抗压</span><strong>{stats.defense}</strong></div><div><span>反应</span><strong>{stats.speed}</strong></div><div><span>洞察</span><strong>{stats.luck}</strong></div></div>}
          <nav className={styles.hubNav} aria-label="乐斗功能">
            {NAV_ITEMS.map((item) => <button type="button" key={item.id} className={tab === item.id ? styles.active : ''} onClick={() => setTab(item.id)}><span>{item.mark}</span>{item.name}{item.id === 'tasks' && DAILY_TASKS.some((task) => task.completed(profile.daily) && !profile.daily.claimed.includes(task.id)) && <i />}</button>)}
          </nav>
        </aside>

        <section className={styles.hubMain}>
          <div className={styles.resourceStrip}>
            <span><b>{profile.wins}</b> 胜</span><span><b>{profile.losses}</b> 负</span><span><b>{profile.streak}</b> 连胜</span><span><b>{profile.towerFloor}</b> 试炼层</span><span><b>{profile.inventory.length}/{INVENTORY_LIMIT}</b> 背包</span>
          </div>

          {tab === 'home' && <>
            <section className={styles.activitySection}>
              <header className={styles.panelTitle}><div><span className={styles.eyebrow}>CHOOSE A MODE</span><h2>今天想打哪一局？</h2></div><small>选模式后点击开始，战斗自动演算并保存结果</small></header>
              <div className={styles.activityGrid}>{BATTLE_MODES.map((item) => <article key={item.id} className={selectedMode === item.id ? styles.selected : ''} onClick={() => setSelectedMode(item.id)}><button type="button" aria-label={`选择${item.name}`}><span className={styles.activityMark}>{item.mark}</span><div><strong>{item.name}{item.id === 'deadline' ? ` · ${profile.towerFloor}F` : ''}</strong><p>{item.description}</p><small>-{item.stamina} 体力 · 胜利 +{item.experience} 经验 / +{item.credits} 币</small></div></button></article>)}</div>
            </section>
            {opponent && <section className={styles.arena}>
              <header><div><span>{mode.name}</span><h2>本场对手</h2></div><small>战力会随模式与试炼层数提高</small></header>
              <div className={styles.matchStage}>
                <article className={styles.miniCard}><small>我的工位</small><FighterPortrait profession={profile.profession} compact /><strong>{profile.name}</strong><span>Lv.{profile.level} · 战力 {fighterPower(profile)}</span></article>
                <div className={styles.versus}><small>AUTO</small><strong>VS</strong><i /></div>
                <article className={styles.miniCard}><small>来访同事</small><FighterPortrait profession={opponent.profession} compact /><strong>{opponent.name}</strong><span>Lv.{opponent.level} · 战力 {fighterPower(opponent)}</span></article>
              </div>
              <button className={styles.primaryButton} type="button" disabled={profile.stamina < mode.stamina} onClick={() => startBattle(mode)}>开始 {mode.name} · 消耗 {mode.stamina} 体力</button>
            </section>}
            <section className={styles.loadoutPreview}><header className={styles.panelTitle}><div><span className={styles.eyebrow}>CURRENT LOADOUT</span><h2>当前 6 件装备</h2></div><button type="button" onClick={() => setTab('equipment')}>管理装备 →</button></header><div className={styles.equipmentGrid}>{profile.equipment.map((item) => <EquipmentCard item={item} key={item.id} />)}</div></section>
          </>}

          {tab === 'equipment' && <section className={styles.managementPanel}>
            <header className={styles.panelTitle}><div><span className={styles.eyebrow}>EQUIPMENT</span><h2>装备与背包</h2></div><small>新装备先进入背包；换下的装备会自动回到背包</small></header>
            <h3 className={styles.subTitle}>正在使用 · 6 个装备位</h3><div className={styles.equipmentGrid}>{profile.equipment.map((item) => <EquipmentCard item={item} key={item.id} />)}</div>
            <h3 className={styles.subTitle}>背包 · {profile.inventory.length}/{INVENTORY_LIMIT}</h3>
            {profile.inventory.length ? <div className={styles.inventoryList}>{profile.inventory.map((item) => { const equipped = profile.equipment.find((entry) => entry.slot === item.slot); const better = equipmentScore(item) > equipmentScore(equipped!); return <EquipmentCard key={item.id} item={item} actions={<div className={styles.itemActions}><button type="button" onClick={() => equipItem(item)}>{better ? '换上 ↑' : '换上'}</button><button className={styles.salvageButton} type="button" onClick={() => salvageItem(item)}>整理</button></div>} />; })}</div> : <div className={styles.emptyState}><span>箱</span><strong>背包还是空的</strong><p>赢得战斗就有机会获得新装备。</p><button type="button" onClick={() => setTab('home')}>去挑战</button></div>}
          </section>}

          {tab === 'skills' && <section className={styles.managementPanel}>
            <header className={styles.panelTitle}><div><span className={styles.eyebrow}>GROWTH</span><h2>能力成长</h2></div><span className={styles.pointBadge}>可用能力点 <b>{profile.skillPoints}</b></span></header>
            <p className={styles.panelIntro}>每次升级获得 1 个能力点。通用能力强化基础属性，职业能力强化专属战斗节奏。</p>
            <div className={styles.skillGrid}>{availableSkills.map((skill) => { const rank = profile.skillRanks[skill.id] ?? 0; const locked = profile.level < skill.unlockLevel; return <article key={skill.id} data-locked={locked}><span className={styles.activityMark}>{skill.mark}</span><div><small>{skill.profession === 'all' ? '通用能力' : `${definition.name}专属`} · Lv.{skill.unlockLevel} 解锁</small><h3>{skill.name}</h3><p>{skill.description}</p><div className={styles.rankDots} aria-label={`${skill.name} ${rank}级`}>{Array.from({ length: skill.maxRank }, (_, index) => <i key={index} data-filled={index < rank} />)}</div></div><button type="button" disabled={locked || profile.skillPoints < 1 || rank >= skill.maxRank} onClick={() => upgradeSkill(skill.id)}>{locked ? `Lv.${skill.unlockLevel} 解锁` : rank >= skill.maxRank ? '已满级' : '升级'}</button></article>; })}</div>
          </section>}

          {tab === 'tasks' && <section className={styles.managementPanel}>
            <header className={styles.panelTitle}><div><span className={styles.eyebrow}>DAILY TASKS</span><h2>今日任务</h2></div><small>每日自动刷新 · 今日 {profile.daily.battles} 战 {profile.daily.wins} 胜</small></header>
            <div className={styles.taskList}>{DAILY_TASKS.map((task) => { const completed = task.completed(profile.daily); const claimed = profile.daily.claimed.includes(task.id); return <article key={task.id} data-completed={completed}><span>{claimed ? '✓' : completed ? '!' : '·'}</span><div><strong>{task.name}</strong><p>{task.description}</p></div><b>+{task.reward} 币</b><button type="button" disabled={!completed || claimed} onClick={() => claimTask(task.id)}>{claimed ? '已领取' : completed ? '领取' : '进行中'}</button></article>; })}</div>
            <div className={styles.taskTip}><strong>成长提示</strong><p>快速切磋适合完成日常；客户攻坚掉落更好；截止日试炼则用于检验当前配装和技能路线。</p></div>
          </section>}

          {tab === 'reports' && <section className={styles.managementPanel}>
            <header className={styles.panelTitle}><div><span className={styles.eyebrow}>BATTLE REPORTS</span><h2>最近战斗</h2></div><small>保留最近 20 场</small></header>
            {profile.history.length ? <div className={styles.historyList}>{profile.history.map((item) => <article key={item.id} data-win={item.won}><span>{item.won ? '胜' : '负'}</span><div><strong>{item.modeName} · 对战 {item.opponentName}</strong><small>{item.at} · {item.rounds} 回合</small></div><p>{item.reward}</p></article>)}</div> : <div className={styles.emptyState}><span>报</span><strong>还没有战斗记录</strong><p>完成第一场乐斗后，结果会保存在这里。</p><button type="button" onClick={() => setTab('home')}>去挑战</button></div>}
          </section>}
        </section>
      </div>

      {battle && <section className={styles.resultArea} aria-live="polite">
        <div className={styles.resultSummary} data-win={battle.result.winner === 'player'}><div><small>{battle.mode.name} · {battle.result.rounds} 回合</small><strong>{battle.result.winner === 'player' ? '挑战成功' : '暂时落败'}</strong><p>{battle.player.name} VS {battle.opponent.name}</p><span>{battle.result.winner === 'player' ? `+${battle.mode.experience} 经验 · +${battle.mode.credits} 工位币` : '获得部分经验与工位币'}</span></div>{battle.loot ? <aside><span className={styles.lootGlow}>装</span><div><small>{battle.lootConverted ? '背包已满，自动整理' : '本场装备掉落'}</small><strong>{battle.loot.name}</strong><span>{battle.lootConverted ? '已换成 25 工位币' : statText(battle.loot)}</span></div>{!battle.lootConverted && <button type="button" onClick={() => { setTab('equipment'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>查看背包</button>}</aside> : <aside className={styles.noLoot}><strong>本场没有装备掉落</strong><span>继续挑战，难度越高越容易获得稀有装备。</span></aside>}</div>
        <details className={styles.battleDetails} open><summary>完整逐回合战报</summary><ol className={styles.battleLog} aria-label="逐回合战报">{battle.result.logs.map((entry, index) => <li key={`${entry.round}-${index}`} data-kind={entry.kind}><span>{entry.kind === 'result' ? '终' : entry.round}</span><p>{entry.text}</p></li>)}</ol></details>
      </section>}
    </main>
  );
}

export { OfficeBattlePage };
