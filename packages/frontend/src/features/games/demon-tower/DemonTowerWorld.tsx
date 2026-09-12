import { useEffect, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import type { DemonTowerAction, DemonTowerCatalog, DemonTowerContributions, DemonTowerLeaderboardEntry, DemonTowerProfileView, DemonTowerWorldView } from '@stealth-reader/shared';

import { communityDemonTowerApi, demonTowerReadErrorMessage } from '../../../api/community-demon-tower';
import { TowerIcon, TowerWorldArt } from './DemonTowerArt';
import { TowerMeter, TowerPanel, towerTime } from './TowerElements';
import { towerSessionKey, useTowerSessionKey } from './useTowerSession';
import styles from './DemonTower.module.css';

/** Jump within the mounted workspace: never submit actions or reset form state. */
export function DemonTowerWorldNavigation({ phase, expanded }: { phase: DemonTowerWorldView['phase']; expanded: boolean }): JSX.Element {
  const sections = [
    ['tower-world-progress', '世界进度'],
    ...(phase === 'passage' ? [['tower-world-passage', '通道建设']] : []),
    ['tower-world-floors', '楼层档案'], ['tower-world-contributions', '贡献档案'],
    ...(expanded ? [['tower-world-recognition', '首杀凭证'], ['tower-world-arena', '论道与好友'], ['tower-world-squad', '同心小队']] : []),
    ['tower-world-journal', '行动战报'],
  ];
  return <nav className={styles.sectionNav} aria-label="协作世界分段导航">{sections.map(([id, label]) => <button key={id} type="button" className={styles.button} aria-controls={id} onClick={() => {
    const target = document.getElementById(id);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
  }}>{label}</button>)}</nav>;
}

export function TowerContributionList({ entries, ownerId, daily = false, me }: { entries: DemonTowerLeaderboardEntry[]; ownerId?: string | null; daily?: boolean; me?: DemonTowerLeaderboardEntry | null }): JSX.Element {
  const rows = me && me.publicId === ownerId && !entries.some((entry) => entry.publicId === me.publicId) ? [...entries, me] : entries;
  return rows.length ? <ol className={styles.leaderboard}>{rows.map((entry) => <li key={entry.publicId}><span className={styles.rank}>{String(entry.rank).padStart(2, '0')}</span><div><strong>{entry.displayName}{entry.publicId === ownerId ? ' · 我' : ''}</strong><small>Lv{entry.level}{daily ? '' : ` · 建设 ${entry.passageContribution.toLocaleString('zh-CN')}（独立记录）`}</small></div><span className={styles.score}>{entry.bossDamage.toLocaleString('zh-CN')}<small>有效伤害</small></span></li>)}</ol> : <p className={styles.empty}>{daily ? '本日还没有有效首领伤害记录。建设单独记入楼层档案，不参与本榜排名。' : '这里还没有贡献记录。完成首领协作或通道建设后会更新。'}</p>;
}

export function DemonTowerWorld({ world, profile, catalog, ownerId, disabled, onAction }: { world: DemonTowerWorldView; profile: DemonTowerProfileView; catalog: DemonTowerCatalog; ownerId: string | null; disabled: boolean; onAction: (action: DemonTowerAction) => Promise<boolean> }): JSX.Element {
  const [material, setMaterial] = useState<'ore' | 'clue'>('ore');
  const [amount, setAmount] = useState('1');
  const [boardFloor, setBoardFloor] = useState(world.currentFloor);
  const sessionKey = useTowerSessionKey();
  const [board, setBoard] = useState<{ key: string; floor: number; value: DemonTowerContributions } | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const count = /^[1-9]\d{0,3}$/.test(amount) && Number(amount) <= 1000 ? Number(amount) : 0;
  const enough = count > 0 && count <= profile.materials[material];
  const floor = catalog.floors.find((entry) => entry.floor === world.currentFloor);
  const meetsFloorLevel = profile.level >= (floor?.requiredLevel ?? 1);
  const canDonate = !disabled && profile.availableActions.includes('donate') && world.phase === 'passage' && enough && meetsFloorLevel;
  const canBoss = !disabled && profile.availableActions.includes('challenge_boss') && world.phase === 'boss' && meetsFloorLevel && profile.hp > 0 && profile.stamina >= catalog.rules.bossCost && profile.daily.bossAttempts < profile.daily.bossAttemptsMax;
  const bossDisabledReason = profile.daily.bossAttempts >= profile.daily.bossAttemptsMax
    ? `今日首领协作次数已用完（${profile.daily.bossAttempts} / ${profile.daily.bossAttemptsMax}）。请下一个北京时间自然日再来。`
    : !meetsFloorLevel ? `请先达到本层 Lv${floor?.requiredLevel ?? 1}，当前为 Lv${profile.level}。`
      : profile.battle ? '请先结束当前探索战斗，再参与首领协作。'
        : profile.hp <= 0 ? '当前生命为 0，请先在探索任务中休整或等待生命恢复。'
          : profile.stamina < catalog.rules.bossCost ? `体力不足：需要 ${catalog.rules.bossCost} 体力，当前 ${profile.stamina}。`
            // The parent combines pending actions and maintenance in disabled;
            // their distinct, authoritative status is already shown above the tabs.
            : disabled ? '当前暂不能提交新行动，请先查看上方同步或只读状态。'
              : !profile.availableActions.includes('challenge_boss') ? '当前档案暂不允许参与首领协作，请同步最新状态。' : null;
  const currentBoard = board?.key === sessionKey && board.floor === boardFloor ? board.value : null;

  useEffect(() => { setBoardFloor(world.currentFloor); }, [world.currentFloor]);
  useEffect(() => {
    let active = true; let timer: ReturnType<typeof setTimeout> | undefined; let controller: AbortController | undefined;
    setBoardError(null); setShowMore(false);
    const poll = async (): Promise<void> => {
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 25_000);
      try { const result = await communityDemonTowerApi.contributions(boardFloor, controller.signal); if (active && towerSessionKey() === sessionKey) { setBoard({ key: sessionKey, floor: boardFloor, value: result }); setBoardError(null); } }
      catch (reason) { if (active && towerSessionKey() === sessionKey) setBoardError(controller.signal.aborted ? '贡献记录读取超时' : demonTowerReadErrorMessage(reason)); }
      finally { clearTimeout(timeout); if (active) timer = setTimeout(() => { void poll(); }, document.hidden ? 30_000 : 10_000); }
    };
    void poll(); return () => { active = false; controller?.abort(); if (timer) clearTimeout(timer); };
  }, [boardFloor, sessionKey]);

  return <div className={styles.stack}>
    <TowerPanel id="tower-world-progress" title="共同推进的九层世界" detail={<span className={styles.badge}>{world.phase === 'complete' ? '九层已联通' : world.phase === 'boss' ? '守关者阶段' : '通道建设中'}</span>}><div className={styles.worldLayout}><TowerWorldArt openFloor={world.unlockedFloor} className={styles.worldArt} /><div className={styles.worldSummary}><span className={styles.eyebrow}>SHARED PROJECT / FLOOR {String(world.currentFloor).padStart(2, '0')}</span><h3>{floor?.name ?? `第 ${world.currentFloor} 层`}</h3><p>{world.phase === 'complete' ? '最后的封印已经完成，仍可自由探索个人已解锁区域。感谢每一份伤害与建设贡献。' : '不要求同时在线，也没有最低人数门槛。每次首领行动和建设材料都计入同一份世界进度。'}</p>{floor?.mechanicHint ? <p className={styles.notice}>行动提示：{floor.mechanicHint}</p> : null}{world.phase === 'boss' ? <><TowerMeter label={world.boss.name} value={world.boss.hp} max={world.boss.maxHp} tone="clay" /><button type="button" className={styles.primary} disabled={!canBoss} aria-describedby={!canBoss && bossDisabledReason ? 'tower-boss-reason' : undefined} onClick={() => { void onAction({ kind: 'challenge_boss', payload: { floor: world.currentFloor } }); }}><TowerIcon name="world" />参与首领协作 · {catalog.rules.bossCost} 体力</button><p className={styles.muted} style={{ marginTop: 10 }}>按已保存的主动技能优先顺序，自动结算至多 {catalog.rules.bossRoundLimit} 回合。今日已参与 {profile.daily.bossAttempts} / {profile.daily.bossAttemptsMax} 次。</p>{!canBoss && bossDisabledReason ? <p id="tower-boss-reason" className={styles.muted}>{bossDisabledReason}</p> : null}</> : <TowerMeter label={world.phase === 'complete' ? '最终通道' : '通道建设'} value={world.passage.current} max={world.passage.required} detail={world.phase === 'complete' ? '全世界进度已完成' : '建设完成后，所有人共同解锁下一层'} />}</div></div><p className={styles.muted} style={{ marginTop: 16, marginBottom: 0 }}>共享版本 {world.version} · 最近更新 {towerTime(world.updatedAt)}。末段伤害和建设以实际剩余量入账，不重复计功。</p></TowerPanel>
    {world.phase === 'passage' ? <TowerPanel id="tower-world-passage" title="通道建设" detail={<span className={styles.muted}>使用塔内绑定材料</span>}><p className={styles.muted}>提交 {catalog.materials.ore} 或 {catalog.materials.clue}，为所有人打开下一段道路。材料不是第二钱包，不能转让或提现。</p><form className={styles.donation} onSubmit={(event) => { event.preventDefault(); if (canDonate) void onAction({ kind: 'donate', payload: { floor: world.currentFloor, material, amount: count } }); }}><label className={styles.field}>建设材料<select value={material} disabled={disabled} onChange={(event) => { setMaterial(event.target.value as 'ore' | 'clue'); setAmount('1'); }}><option value="ore">{catalog.materials.ore} · 持有 {profile.materials.ore}</option><option value="clue">{catalog.materials.clue} · 持有 {profile.materials.clue}</option></select></label><label className={styles.field}>提交数量<input type="text" inputMode="numeric" pattern="[1-9][0-9]*" maxLength={4} value={amount} disabled={disabled} aria-describedby="tower-donation-preview" onChange={(event) => setAmount(event.target.value)} /></label><button type="submit" className={styles.primary} disabled={!canDonate}>确认投入建设</button></form><p id="tower-donation-preview" className={styles.muted} style={{ marginTop: 13 }}>每份增加 {catalog.rules.donationValues[material]} 建设进度{count > 0 ? `，本次提交 ${count} 份，最多计入 ${Math.min(count * catalog.rules.donationValues[material], Math.max(0, world.passage.required - world.passage.current))} 进度` : '；请输入 1–1000 的整数'}。最终消耗与入账以服务器当前剩余进度为准。</p>{count > profile.materials[material] ? <p className={styles.error}>持有材料不足，请减少数量。</p> : null}</TowerPanel> : null}
    <TowerPanel id="tower-world-floors" title="楼层档案" detail={<span className={styles.muted}>世界进度 × 个人等级</span>}><div className={styles.floorList}>{catalog.floors.map((entry) => { const worldOpen = entry.floor <= world.unlockedFloor; const personalOpen = entry.floor <= profile.personalUnlockedFloor && profile.level >= entry.requiredLevel; const selected = entry.floor === profile.selectedFloor; const canSelect = worldOpen && personalOpen && !disabled && profile.availableActions.includes('select_floor'); return <article className={styles.floorRow} key={entry.floor} data-current={selected}><span className={styles.floorNumber}>{String(entry.floor).padStart(2, '0')}</span><div><h3>{entry.name}{world.completedFloors.includes(entry.floor) ? ' · 已联通' : ''}</h3><p>Lv{entry.requiredLevel} · {entry.description}</p></div><button type="button" className={styles.button} disabled={!canSelect || selected} onClick={() => { void onAction({ kind: 'select_floor', payload: { floor: entry.floor } }); }}>{selected ? '当前探索地' : !worldOpen ? '世界尚未解锁' : !personalOpen ? `需要 Lv${entry.requiredLevel}` : '设为探索地'}</button></article>; })}</div></TowerPanel>
    <TowerPanel id="tower-world-contributions" title="楼层贡献档案" detail={<Link className={styles.textButton} to="/games/demon-tower/leaderboard">查看首领讨伐日榜 →</Link>}><label className={styles.field} style={{ maxWidth: 220, marginBottom: 13 }}>查看楼层贡献<select value={boardFloor} onChange={(event) => setBoardFloor(Number(event.target.value))}>{catalog.floors.map((entry) => <option key={entry.floor} value={entry.floor}>第 {entry.floor} 层 · {entry.name}</option>)}</select></label>{boardError ? <p className={styles.error} role="alert">{boardError}，稍后自动重试。</p> : null}{!currentBoard && !boardError ? <p className={styles.empty} role="status">正在读取贡献记录…</p> : null}{currentBoard ? <><TowerContributionList entries={showMore ? currentBoard.entries : currentBoard.entries.slice(0, 8)} ownerId={ownerId} me={currentBoard.me} />{currentBoard.entries.length > 8 ? <button type="button" className={styles.textButton} onClick={() => setShowMore((value) => !value)}>{showMore ? '收起贡献名单' : `查看全部 ${currentBoard.entries.length} 位贡献者`}</button> : null}<p className={styles.muted} style={{ marginTop: 13 }}>{currentBoard.rewardDescription}</p></> : null}</TowerPanel>
  </div>;
}
