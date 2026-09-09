import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import { DEMON_TOWER_AUTO_LIMITS, type DemonTowerAutoResponse, type DemonTowerAutoRunView, type DemonTowerAutoStartInput, type DemonTowerAutoStopReason, type DemonTowerCatalog, type DemonTowerOverview } from '@stealth-reader/shared';
import { communityDemonTowerApi, demonTowerErrorMessage, demonTowerOutcomeUncertain, demonTowerReadErrorMessage } from '../../../api/community-demon-tower';
import { getCommunitySessionGeneration } from '../../../api/community-http';
import { useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { refreshCommunityWallet } from '../../../app/store/community-wallet-store';
import { useCommunityProgression } from '../../community-progression/useCommunityProgression';
import { TowerModal, TowerPanel, towerDuration, towerTime } from './TowerElements';
import styles from './DemonTower.module.css';

export const AUTO_STOP_REASONS: Record<DemonTowerAutoStopReason, string> = {
  completed: '本批探索已完成', manual_stop: '你已停止并接回手动操作', low_health: '生命低于安全阈值，已停止', defeat: '战斗失利，已停止',
  battle_timeout: '战斗达到回合上限', stamina_empty: '体力不足以继续出发', vip_expired: 'VIP 权益已到期', session_ended: '原登录会话已结束',
  account_inactive: '账号状态已变化', day_changed: '已跨过每日结算时间', maintenance: '当前进入维护或功能暂停', time_limit: '已达到本批时长上限',
  step_limit: '已达到本批步骤上限', profile_changed: '角色状态发生变化', floor_changed: '探索楼层发生变化', quota_reached: '今日行动额度已用尽', server_error: '服务器暂时无法继续，请同步查看',
};
type Pending = { kind: 'start'; input: DemonTowerAutoStartInput } | { kind: 'stop'; id: string };
interface Props { overview: DemonTowerOverview; catalog: DemonTowerCatalog; now: number; ownerId: string; manualPending: boolean; onOverview: (next: DemonTowerOverview) => void; onPending: (pending: boolean) => void }

/** Polls server-owned jobs only. There is deliberately no client action runner. */
export function DemonTowerAutoExplore(props: Props): JSX.Element {
  return <AutoWorkspace key={`${props.ownerId}:${getCommunitySessionGeneration()}`} {...props} />;
}
function AutoWorkspace({ overview, catalog, now, ownerId, manualPending, onOverview, onPending }: Props): JSX.Element {
  const progression = useCommunityProgression();
  const generation = getCommunitySessionGeneration();
  const alive = useRef(true); const callbacks = useRef({ onOverview, onPending }); callbacks.current = { onOverview, onPending };
  const [response, setResponse] = useState<DemonTowerAutoResponse | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [pending, setPending] = useState<Pending | null>(null); const pendingRef = useRef<Pending | null>(null);
  const [count, setCount] = useState('3'); const [confirmation, setConfirmation] = useState<{ count: number; floor: number } | null>(null);
  const controllers = useRef(new Set<AbortController>()); const readBusy = useRef(false); const epoch = useRef(0);
  const lastResponse = useRef<DemonTowerAutoResponse | null>(null);
  const current = useCallback(() => alive.current && generation === getCommunitySessionGeneration() && useCommunityAuthStore.getState().phase === 'active' && useCommunityAuthStore.getState().user?.publicId === ownerId, [generation, ownerId]);
  const request = useCallback(async <T,>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController(); controllers.current.add(controller); const timer = setTimeout(() => controller.abort(), 25_000);
    try { return await operation(controller.signal); } finally { clearTimeout(timer); controllers.current.delete(controller); }
  }, []);
  const accept = useCallback((next: DemonTowerAutoResponse): void => {
    if (!current()) return;
    const previous = lastResponse.current;
    if (previous && (next.overview.serverNow < previous.overview.serverNow || (next.run && previous.run?.id === next.run.id && next.run.version < previous.run.version))) return;
    lastResponse.current = next; setResponse(next); callbacks.current.onOverview(next.overview);
  }, [current]);
  const read = useCallback(async (): Promise<void> => {
    if (!current() || readBusy.current || lock.current) return;
    readBusy.current = true; const readEpoch = epoch.current;
    try {
      const next = await request(communityDemonTowerApi.auto);
      if (current() && readEpoch === epoch.current) { accept(next); setReadError(null); }
    } catch (reason) { if (current() && readEpoch === epoch.current) setReadError(demonTowerReadErrorMessage(reason, true)); }
    finally { readBusy.current = false; }
  }, [current, accept, request]);
  useEffect(() => {
    alive.current = true; let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async (): Promise<void> => { await read(); if (alive.current) timer = setTimeout(() => { void poll(); }, 2500); };
    void poll();
    return () => { alive.current = false; controllers.current.forEach((item) => item.abort()); if (timer) clearTimeout(timer); };
  }, [read]);
  const transmit = async (operation: Pending): Promise<void> => {
    if (!current() || lock.current) return;
    lock.current = true; epoch.current += 1; pendingRef.current = operation; setPending(operation); setBusy(true); setWriteError(null); callbacks.current.onPending(true);
    try {
      const next = await request((signal) => operation.kind === 'start' ? communityDemonTowerApi.autoStart(operation.input, signal) : communityDemonTowerApi.autoStop(operation.id, signal));
      if (!current()) return;
      accept(next); pendingRef.current = null; setPending(null); callbacks.current.onPending(false);
    } catch (reason) {
      if (!current()) return;
      if (!demonTowerOutcomeUncertain(reason)) { pendingRef.current = null; setPending(null); callbacks.current.onPending(false); }
      setWriteError(demonTowerErrorMessage(reason));
    } finally { if (current()) { lock.current = false; setBusy(false); void refreshCommunityWallet(); void read(); } }
  };
  const profile = overview.profile;
  const latestRun = response?.run;
  const projected = overview.autoExplore;
  const run: DemonTowerAutoRunView | null = projected && (!latestRun || projected.id === latestRun.id && projected.version > latestRun.version || projected.createdAt > latestRun.createdAt) ? projected : latestRun ?? projected ?? null;
  const running = run?.status === 'running';
  const amount = /^\d+$/.test(count) ? Number(count) : NaN;
  const validCount = Number.isInteger(amount) && amount >= 1 && amount <= DEMON_TOWER_AUTO_LIMITS.maxExplorations;
  const vip = progression.overview?.vip;
  const vipActive = vip?.active && vip.benefits.includes('demon_tower_auto_explore') && vip.expiresAt !== null && Date.parse(vip.expiresAt) > now;
  const startReason = !response ? '正在读取托管状态' : readError ? '托管状态尚未同步，请先重试读取' : !response.enabled ? '托管功能暂未开放' : !progression.overview || progression.error ? '正在确认 VIP 权益' : !vipActive ? '需要有效的 VIP 托管权益' : !overview.writesEnabled ? '维护只读，暂不能启动' : !profile ? '请先建立角色' : profile.battle ? '请先完成或撤离当前战斗' : profile.hp * 100 <= profile.maxHp * DEMON_TOWER_AUTO_LIMITS.startHealthPercent ? `生命需高于 ${DEMON_TOWER_AUTO_LIMITS.startHealthPercent}% 才能出发` : profile.stamina < catalog.rules.exploreCost ? '体力不足以出发' : manualPending ? '请先确认当前手动操作' : !validCount ? `请输入 1–${DEMON_TOWER_AUTO_LIMITS.maxExplorations} 的整数次数` : null;
  const start = (): void => {
    if (!profile || !confirmation || startReason || pendingRef.current || lock.current || running || confirmation.floor !== profile.selectedFloor) return;
    const input = { requestId: crypto.randomUUID(), expectedVersion: profile.version, floor: confirmation.floor, maxExplorations: confirmation.count };
    setConfirmation(null); void transmit({ kind: 'start', input });
  };
  return <TowerPanel title="委托探索" detail={<span className={styles.badge}>{running ? '服务器执行中' : 'VIP 便利权益'}</span>}>
    <p className={styles.muted}>固定区域内的普通探索，由服务器按当前配装推进；不参与首领、建设、修炼、加点或自动领奖。</p>
    {readError ? <p className={styles.error} role="status">{readError}<button type="button" className={styles.textButton} onClick={() => { void read(); }}>重新同步托管状态</button></p> : null}
    {writeError ? <div className={styles.error} role="alert"><p>{writeError}</p>{pending ? <><p>结果未知时不启动新批次。确认会沿用原操作编号或原托管编号。</p><button className={styles.button} type="button" disabled={busy} onClick={() => { if (pendingRef.current) void transmit(pendingRef.current); }}>确认上次托管操作</button></> : null}</div> : null}
    {run ? <section aria-label="最近托管记录"><div className={styles.buttonRow}><strong>第 {run.floor} 层 · {running ? '进行中' : run.stopReason ? AUTO_STOP_REASONS[run.stopReason] : '已结束'}</strong>{response?.replayed ? <span className={styles.muted}>原请求已确认</span> : null}</div><p>已完成 {run.completedExplorations} / {run.maxExplorations} 次 · 已出发 {run.startedExplorations} 次 · 步骤 {run.steps} / {run.maxSteps}</p><p className={styles.muted}>本批累计到账 {run.officeCoinsGranted} 办公币（不是新一笔奖励）；余额由统一钱包同步。{running ? ` 最迟 ${towerTime(run.expiresAt)} 结束，预计剩余 ${towerDuration(run.expiresAt - now)}。` : ''}</p>{running ? <button className={styles.button} type="button" disabled={busy || Boolean(pending)} onClick={() => { void transmit({ kind: 'stop', id: run.id }); }}>停止托管并手动接管</button> : profile?.battle ? <p className={styles.notice}>战斗仍保留在现场，请使用上方战斗按钮手动接管。</p> : null}</section> : null}
    {!running ? <><div className={styles.buttonRow}><label className={styles.muted}>本批最多探索次数 <input aria-label="托管探索次数" className={styles.input} style={{ width: 76, marginInline: 8 }} inputMode="numeric" value={count} maxLength={2} disabled={busy || Boolean(pending)} onChange={(event) => setCount(event.target.value)} /></label><button className={styles.button} type="button" disabled={Boolean(startReason) || busy || Boolean(pending)} onClick={() => { if (profile && validCount) setConfirmation({ count: amount, floor: profile.selectedFloor }); }}>设置本批委托</button></div>{startReason ? <p className={styles.muted}>{startReason}。<Link to="/achievements">查看成长档案与 VIP 权益</Link></p> : null}{progression.error ? <p className={styles.muted}>权益资料尚未同步。<button type="button" className={styles.textButton} onClick={() => { void progression.reload(); }}>重新确认权益</button></p> : null}</> : null}
    <p className={styles.muted}>退出页面或 Esc 收起仍继续；注销、原登录设备会话撤销、VIP 到期、跨日或达到安全上限时停止。停止不回退已完成行动，也不自动结束未完成战斗。</p>
    {confirmation ? <TowerModal title="确认本批委托探索" onClose={() => setConfirmation(null)} footer={<div className={styles.buttonRow}><button className={styles.primary} type="button" disabled={Boolean(startReason) || busy || Boolean(pending) || running || profile?.selectedFloor !== confirmation.floor} onClick={start}>确认启动服务器托管</button><button className={styles.button} type="button" onClick={() => setConfirmation(null)}>取消</button></div>}><p>固定第 {confirmation.floor} 层，最多 {confirmation.count} 次普通探索；每次出发消耗 {catalog.rules.exploreCost} 体力，本批出发消耗最多 {confirmation.count * catalog.rules.exploreCost} 体力，不购买额外体力。</p><p>按现有配装使用可用技能；生命不高于出发 {DEMON_TOWER_AUTO_LIMITS.startHealthPercent}% / 战中 {DEMON_TOWER_AUTO_LIMITS.battleHealthPercent}% 时停止。最多 {DEMON_TOWER_AUTO_LIMITS.maxSteps} 步、{DEMON_TOWER_AUTO_LIMITS.durationMs / 60_000} 分钟，不保证打满次数或获得奖励。</p><p>离开页面仍由服务器继续。启动后先停止托管才能手动行动；停止时如仍在战斗，可继续手动接管。</p>{profile?.selectedFloor !== confirmation.floor ? <p className={styles.error}>区域已变化，请取消后重新确认。</p> : null}{startReason ? <p className={styles.error}>{startReason}</p> : null}</TowerModal> : null}
  </TowerPanel>;
}
