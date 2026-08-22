import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';

import {
  EQUIPMENT_SLOTS,
  PROFESSION_DEFINITIONS,
  RARITY_DEFINITIONS,
  createOpponent,
  createSeededRandom,
  createStarterEquipment,
  deriveFighterStats,
  ensureLootUpgrade,
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

interface LocalBattleProfile extends OfficeFighter {
  experience: number;
  wins: number;
  losses: number;
}

interface BattleViewState {
  result: OfficeBattleResult;
  loot: EquipmentDefinition | null;
  player: OfficeFighter;
  opponent: OfficeFighter;
}

const FIGHTER_STAT_KEYS = new Set(['hp', 'attack', 'defense', 'speed', 'luck']);

function clearStoredProfile(): void {
  try {
    window.localStorage.removeItem(PROFILE_STORAGE_KEY);
  } catch {
    // 浏览器禁用本地存储时，不影响当前页面继续试玩。
  }
}

function isValidEquipment(
  value: unknown,
  profession: BattleProfession,
): value is EquipmentDefinition {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const item = value as Partial<EquipmentDefinition>;
  const slotExists = EQUIPMENT_SLOTS.some((slot) => slot.id === item.slot);
  const rarityExists =
    typeof item.rarity === 'string' && item.rarity in RARITY_DEFINITIONS;
  if (
    typeof item.id !== 'string' ||
    item.id.length === 0 ||
    item.profession !== profession ||
    !slotExists ||
    typeof item.name !== 'string' ||
    item.name.length === 0 ||
    !Number.isInteger(item.level) ||
    (item.level ?? 0) < 1 ||
    (item.level ?? 0) > 60 ||
    !rarityExists ||
    item.stats === null ||
    typeof item.stats !== 'object' ||
    Array.isArray(item.stats)
  ) {
    return false;
  }
  const statEntries = Object.entries(item.stats);
  return (
    statEntries.length > 0 &&
    statEntries.every(
      ([key, stat]) =>
        FIGHTER_STAT_KEYS.has(key) &&
        typeof stat === 'number' &&
        Number.isFinite(stat) &&
        stat >= 0,
    )
  );
}

function loadProfile(): LocalBattleProfile | null {
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      clearStoredProfile();
      return null;
    }
    const value = parsed as Partial<LocalBattleProfile>;
    const professionExists = PROFESSION_DEFINITIONS.some(
      (item) => item.id === value.profession,
    );
    if (
      !professionExists ||
      typeof value.name !== 'string' ||
      value.name.length === 0 ||
      value.name.length > 40 ||
      typeof value.level !== 'number' ||
      !Number.isInteger(value.level) ||
      (value.level ?? 0) < 1 ||
      !Array.isArray(value.equipment)
    ) {
      clearStoredProfile();
      return null;
    }
    const profession = value.profession as BattleProfession;
    const equipment = value.equipment as unknown[];
    const slots = new Set(
      equipment
        .filter((item): item is EquipmentDefinition =>
          isValidEquipment(item, profession),
        )
        .map((item) => item.slot),
    );
    if (
      equipment.length !== EQUIPMENT_SLOTS.length ||
      slots.size !== EQUIPMENT_SLOTS.length ||
      !equipment.every((item) => isValidEquipment(item, profession))
    ) {
      clearStoredProfile();
      return null;
    }
    const counters = [value.experience ?? 0, value.wins ?? 0, value.losses ?? 0];
    if (counters.some((counter) => !Number.isFinite(counter) || counter < 0)) {
      clearStoredProfile();
      return null;
    }
    return {
      name: value.name,
      profession,
      level: Math.min(60, value.level),
      experience: Math.max(0, Math.floor(value.experience ?? 0)),
      wins: Math.max(0, Math.floor(value.wins ?? 0)),
      losses: Math.max(0, Math.floor(value.losses ?? 0)),
      equipment,
    };
  } catch {
    clearStoredProfile();
    return null;
  }
}

function saveProfile(profile: LocalBattleProfile | null): void {
  try {
    if (profile) {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } else {
      window.localStorage.removeItem(PROFILE_STORAGE_KEY);
    }
  } catch {
    // 浏览器禁用本地存储时，本次试玩仍可继续。
  }
}

function professionName(profession: BattleProfession): string {
  return PROFESSION_DEFINITIONS.find((item) => item.id === profession)?.name ?? '办公室同事';
}

function professionMark(profession: BattleProfession): string {
  return PROFESSION_DEFINITIONS.find((item) => item.id === profession)?.mark ?? '职';
}

function nextProfileAfterBattle(
  profile: LocalBattleProfile,
  result: OfficeBattleResult,
): LocalBattleProfile {
  const gainedExperience = result.winner === 'player' ? 24 : 10;
  const totalExperience = profile.experience + gainedExperience;
  const nextLevel = Math.min(
    60,
    Math.max(profile.level, Math.floor(totalExperience / 100) + 1),
  );
  return {
    ...profile,
    level: nextLevel,
    experience: totalExperience,
    wins: profile.wins + (result.winner === 'player' ? 1 : 0),
    losses: profile.losses + (result.winner === 'opponent' ? 1 : 0),
  };
}

export function OfficeBattlePage(): JSX.Element {
  const [profile, setProfile] = useState<LocalBattleProfile | null>(loadProfile);
  const [opponentSeed, setOpponentSeed] = useState(20260822);
  const [battleState, setBattleState] = useState<BattleViewState | null>(null);
  const pageHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusHeadingOnTransitionRef = useRef(false);

  useEffect(() => {
    if (!focusHeadingOnTransitionRef.current) return undefined;
    const root = document.documentElement;
    const previousScrollBehavior = root.style.scrollBehavior;
    const resetScroll = (): void => {
      root.style.scrollBehavior = 'auto';
      root.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    resetScroll();
    const frame = window.requestAnimationFrame(() => {
      resetScroll();
      pageHeadingRef.current?.focus({ preventScroll: true });
      focusHeadingOnTransitionRef.current = false;
      root.style.scrollBehavior = previousScrollBehavior;
    });
    return () => {
      window.cancelAnimationFrame(frame);
      root.style.scrollBehavior = previousScrollBehavior;
    };
  }, [profile?.profession]);

  const opponent = useMemo(
    () =>
      profile
        ? createOpponent(profile.profession, profile.level, opponentSeed)
        : null,
    [opponentSeed, profile],
  );

  const chooseProfession = (profession: BattleProfession): void => {
    const definition = PROFESSION_DEFINITIONS.find((item) => item.id === profession);
    if (!definition) return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    focusHeadingOnTransitionRef.current = true;
    const nextProfile: LocalBattleProfile = {
      name: `${definition.shortName}新人`,
      profession,
      level: 1,
      experience: 0,
      wins: 0,
      losses: 0,
      equipment: createStarterEquipment(profession),
    };
    setProfile(nextProfile);
    saveProfile(nextProfile);
    setBattleState(null);
  };

  const resetProfession = (): void => {
    focusHeadingOnTransitionRef.current = true;
    setProfile(null);
    saveProfile(null);
    setBattleState(null);
  };

  const startBattle = (): void => {
    if (!profile || !opponent) return;
    const random = createSeededRandom(
      opponentSeed + profile.wins * 31 + profile.losses * 17 + profile.level * 101,
    );
    const result = resolveOfficeBattle(profile, opponent, random);
    const rolledLoot = result.winner === 'player'
      ? rollLoot(profile.profession, profile.level, random)
      : null;
    const loot = rolledLoot
      ? ensureLootUpgrade(
          rolledLoot,
          profile.equipment.find((item) => item.slot === rolledLoot.slot),
        )
      : null;
    const nextProfile = nextProfileAfterBattle(profile, result);
    setProfile(nextProfile);
    saveProfile(nextProfile);
    setBattleState({ result, loot, player: profile, opponent });
  };

  const changeOpponent = (): void => {
    setOpponentSeed((value) => value + 137);
    setBattleState(null);
  };

  const equipLoot = (): void => {
    if (!profile || !battleState?.loot) return;
    const loot = battleState.loot;
    const nextEquipment = profile.equipment.map((item) =>
      item.slot === loot.slot ? loot : item,
    );
    const nextProfile = { ...profile, equipment: nextEquipment };
    setProfile(nextProfile);
    saveProfile(nextProfile);
    setBattleState({ ...battleState, loot: null });
  };

  if (!profile) {
    return (
      <main className={styles.page} aria-labelledby="ledou-title">
        <section className={styles.introHero}>
          <div>
            <span className={styles.eyebrow}>办公室乐斗 · 本机试玩</span>
            <h1 ref={pageHeadingRef} id="ledou-title" tabIndex={-1}>
              先选职业，再看这局项目谁能扛到最后
            </h1>
            <p>
              五种职业拥有不同的基础属性和专属行动。战斗自动进行，
              你的决策发生在职业、装备和之后的策略搭配中。
            </p>
          </div>
          <aside>
            <strong>首版规则</strong>
            <span>最多 10 回合</span>
            <span>6 个装备位</span>
            <span>进度仅保存在本机</span>
          </aside>
        </section>

        <section className={styles.professionSection} aria-labelledby="profession-title">
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.eyebrow}>入职选择</span>
              <h2 id="profession-title">你的第一份办公室职业</h2>
            </div>
            <p>当前试玩可以随时重选；接入账号后会提供正式转职规则。</p>
          </div>
          <div className={styles.professionGrid}>
            {PROFESSION_DEFINITIONS.map((profession) => (
              <article key={profession.id} className={styles.professionCard}>
                <span className={styles.professionMark} aria-hidden="true">
                  {profession.mark}
                </span>
                <small>{profession.shortName}</small>
                <h3>{profession.name}</h3>
                <p>{profession.slogan}</p>
                <dl>
                  <div><dt>活力</dt><dd>{profession.baseStats.hp}</dd></div>
                  <div><dt>执行</dt><dd>{profession.baseStats.attack}</dd></div>
                  <div><dt>反应</dt><dd>{profession.baseStats.speed}</dd></div>
                </dl>
                <button
                  type="button"
                  className={styles.professionSelect}
                  onClick={() => chooseProfession(profession.id)}
                >
                  选择{profession.name} →
                </button>
              </article>
            ))}
          </div>
        </section>
      </main>
    );
  }

  const stats = deriveFighterStats(profile);
  const currentItemForLoot = battleState?.loot
    ? profile.equipment.find((item) => item.slot === battleState.loot?.slot)
    : null;
  const lootIsUpgrade =
    battleState?.loot && currentItemForLoot
      ? equipmentScore(battleState.loot) > equipmentScore(currentItemForLoot)
      : false;
  const displayedPlayer = battleState?.player ?? profile;
  const displayedOpponent = battleState?.opponent ?? opponent;

  return (
    <main className={styles.page} aria-labelledby="ledou-title">
      <header className={styles.dashboardHeader}>
        <div>
          <span className={styles.eyebrow}>OFFICE BATTLE</span>
          <h1 ref={pageHeadingRef} id="ledou-title" tabIndex={-1}>{profile.name}的工位</h1>
          <p>Lv.{profile.level} {professionName(profile.profession)} · {profile.wins} 胜 {profile.losses} 负 · 本机战力 {fighterPower(profile)}</p>
        </div>
        <div className={styles.headerActions}>
          <Link to="/">返回工作台</Link>
          <button type="button" onClick={resetProfession}>换职业</button>
        </div>
      </header>

      <section className={styles.gameShell}>
        <article className={styles.playerHud} aria-labelledby="profile-stats-title">
          <div className={styles.levelBadge}><span>LV</span><strong>{profile.level}</strong></div>
          <div className={styles.fighterPortrait} data-profession={profile.profession} aria-hidden="true">
            <span>{professionMark(profile.profession)}</span><i /><b />
          </div>
          <small>{professionName(profile.profession)}</small>
          <h2 id="profile-stats-title">{profile.name}</h2>
          <div className={styles.power}><span>综合战力</span><strong>{fighterPower(profile)}</strong></div>
          <div className={styles.experience}>
            <div><span>升级经验</span><b>{profile.experience % 100}/100</b></div>
            <i><b style={{ width: `${profile.experience % 100}%` }} /></i>
          </div>
          <div className={styles.statGrid}>
            <div><span>活力</span><strong>{stats.hp}</strong></div>
            <div><span>执行</span><strong>{stats.attack}</strong></div>
            <div><span>抗压</span><strong>{stats.defense}</strong></div>
            <div><span>反应</span><strong>{stats.speed}</strong></div>
            <div><span>洞察</span><strong>{stats.luck}</strong></div>
          </div>
        </article>

        <section className={styles.arena} aria-labelledby="battle-title">
          <header>
            <div><span>今日行动</span><h2 id="battle-title">项目攻防</h2></div>
            <small>自动战斗 · 最多 10 回合</small>
          </header>

          {displayedOpponent ? (
            <div className={styles.matchStage}>
              <article className={styles.fighterCard} data-side="player">
                <small>我的工位</small>
                <div className={styles.miniFighter} data-profession={displayedPlayer.profession} aria-hidden="true"><span>{professionMark(displayedPlayer.profession)}</span><i /></div>
                <strong>{displayedPlayer.name}</strong>
                <span>Lv.{displayedPlayer.level} · {professionName(displayedPlayer.profession)}</span>
                <div><i /><b>{fighterPower(displayedPlayer)} 战力</b></div>
              </article>
              <div className={styles.versus}><small>项目争夺</small><strong>VS</strong><i /></div>
              <article className={styles.fighterCard} data-side="opponent">
                <small>来访同事</small>
                <div className={styles.miniFighter} data-profession={displayedOpponent.profession} aria-hidden="true"><span>{professionMark(displayedOpponent.profession)}</span><i /></div>
                <strong>{displayedOpponent.name}</strong>
                <span>Lv.{displayedOpponent.level} · {professionName(displayedOpponent.profession)}</span>
                <div><i /><b>{fighterPower(displayedOpponent)} 战力</b></div>
              </article>
            </div>
          ) : null}

          <div className={styles.battleActions}>
            <button type="button" className={styles.primaryButton} onClick={startBattle}>开始办公室乐斗</button>
            <button type="button" className={styles.secondaryButton} onClick={changeOpponent}>换一位对手</button>
          </div>
          <p className={styles.playHint}>点“开始”就会自动打完；获胜有机会掉落当前职业装备。</p>
        </section>

        <article className={styles.equipmentPanel} aria-labelledby="equipment-title">
          <div className={styles.panelHeading}>
            <div><small>当前穿戴</small><h2 id="equipment-title">6 个装备位</h2></div>
            <span>{profile.equipment.length}/6</span>
          </div>
          <div className={styles.equipmentGrid}>
            {EQUIPMENT_SLOTS.map((slot) => {
              const item = profile.equipment.find((entry) => entry.slot === slot.id);
              return (
                <div key={slot.id} className={styles.equipmentCard} data-rarity={item?.rarity}>
                  <span className={styles.slotMark} aria-hidden="true">{slot.mark}</span>
                  <div><small>{slot.name} · Lv.{item?.level ?? 1}</small><strong>{item?.name ?? '空装备位'}</strong><span>{item ? RARITY_DEFINITIONS[item.rarity].label : '未装备'}</span></div>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      {battleState ? (
        <section className={styles.resultArea} aria-label="本局结果">
          <div className={styles.resultSummary} data-win={battleState.result.winner === 'player'}>
            <div role="status" aria-live="polite" aria-atomic="true">
              <small>战斗结果</small>
              <strong>{battleState.result.winner === 'player' ? '项目拿下！' : '本轮失利'}</strong>
              <p>共 {battleState.result.rounds} 回合 · 我方剩余 {battleState.result.playerRemainingHp} 活力 · 对方剩余 {battleState.result.opponentRemainingHp} 活力</p>
              <span>+{battleState.result.winner === 'player' ? 24 : 10} 经验</span>
            </div>
            {battleState.loot ? (
              <aside data-rarity={battleState.loot.rarity}>
                <span className={styles.lootGlow} aria-hidden="true">{EQUIPMENT_SLOTS.find((slot) => slot.id === battleState.loot?.slot)?.mark}</span>
                <div><small>获得新装备</small><strong>{battleState.loot.name}</strong><span>Lv.{battleState.loot.level} · {RARITY_DEFINITIONS[battleState.loot.rarity].label}{lootIsUpgrade ? ' · 战力提升' : ''}</span></div>
                <button type="button" onClick={equipLoot}>立即装备</button>
              </aside>
            ) : <aside className={styles.noLoot}><strong>继续挑战</strong><span>这局没有装备，经验已经记下。</span></aside>}
          </div>

          <details className={styles.battleDetails} open>
            <summary>查看逐回合战报</summary>
            <ol className={styles.battleLog} aria-label="逐回合战报">
              {battleState.result.logs.map((entry, index) => (
                <li key={`${entry.round}-${index}`} data-kind={entry.kind}>
                  <span>{entry.kind === 'result' ? '结' : String(entry.round).padStart(2, '0')}</span>
                  <p>{entry.text}</p>
                </li>
              ))}
            </ol>
          </details>
        </section>
      ) : null}
    </main>
  );
}
