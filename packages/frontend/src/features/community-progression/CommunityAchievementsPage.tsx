import { useEffect, useRef, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import type { CommunityAchievementDefinition } from '@stealth-reader/shared';
import { getCommunitySessionGeneration } from '../../api/community-http';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { CommunityTitleBadge } from './CommunityTitleBadge';
import { CommunityVipSummary } from './CommunityVipSummary';
import { useCommunityProgression } from './useCommunityProgression';
import styles from './Progression.module.css';
import { FishGrowthSummary } from './FishGrowthSummary';
import { SupportAdminPanel } from './SupportAdminPanel';

export function CommunityAchievementsPage(): JSX.Element {
  const owner = useCommunityAuthStore((state) => state.user?.publicId);
  return <AchievementsWorkspace key={`${owner}:${getCommunitySessionGeneration()}`} />;
}
function ConfirmTitle({ selected, onClose, onConfirm, disabled }: { selected: CommunityAchievementDefinition; onClose: () => void; onConfirm: () => void; disabled: boolean }): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal?.(); }, []);
  return <dialog ref={dialog} open={typeof HTMLDialogElement.prototype.showModal !== 'function' || undefined} className={styles.dialog} aria-labelledby="title-confirm-heading" onCancel={(event) => { event.preventDefault(); onClose(); }}><h2 id="title-confirm-heading">公开佩戴「{selected.title.label}」？</h2><p>这是主动公开的昵称后缀，会显示在个人页、聊天室和私聊中。成就收藏列表仍遵守你的荣誉隐私设置；佩戴不会改变昵称、登录账号或管理权限。</p><p>历史消息在重新加载时显示当前佩戴，已打开的旧记录不会被全部即时重写。</p><div className={styles.actions}><button className={styles.button} type="button" disabled={disabled} onClick={onConfirm}>确认公开佩戴</button><button className={styles.button} type="button" onClick={onClose}>取消</button></div></dialog>;
}
function AchievementsWorkspace(): JSX.Element {
  const admin = useCommunityAuthStore(s => s.user?.roles?.includes('admin'));
  const state = useCommunityProgression(); const [selection, setSelection] = useState<CommunityAchievementDefinition | null>(null);
  const overview = state.overview;
  const disabled = state.busy || Boolean(state.pending) || !overview?.writesEnabled;
  return <main className={styles.page}><header className={styles.header}><span className={styles.eyebrow}>PERSONNEL GROWTH RECORD</span><h1>成长档案</h1><p>把共同参与的日常留成记录。成就与称号只作纪念，不出售，也不增加战力。</p><div className={styles.actions}><Link to="/me">我的主页</Link><Link to="/settings/privacy">荣誉隐私设置</Link><button className={styles.button} type="button" disabled={state.busy || state.loading} onClick={() => { void state.reload(); }}>重新读取</button></div></header>
    {state.loading ? <p role="status">正在同步成长档案…</p> : null}
    {state.error ? <div className={styles.error} role="alert">{state.error}{state.pending ? <><p>确认前不会提交其他佩戴操作；重试使用原编号。</p><button className={styles.button} type="button" disabled={state.busy} onClick={() => { void state.retry(); }}>确认上次佩戴操作</button></> : null}</div> : null}
    {state.notice ? <p className={styles.notice} role="status">{state.notice}</p> : null}
    {state.catalog?.enabled === false || overview?.enabled === false ? <p className={styles.notice}>成长档案暂未开放，其他账号功能不受影响。</p> : null}
    {state.catalog?.enabled && overview?.enabled ? <><FishGrowthSummary initial={overview.fish} /><CommunityVipSummary vip={overview.vip} support={overview.support} serverNow={overview.serverNow} giftDays={state.catalog.membership.giftDays} />
      {admin ? <SupportAdminPanel writesEnabled={overview.writesEnabled} /> : null}
      <section className={styles.card} aria-label="佩戴状态"><div className={styles.status}><div><h2>成就与称号</h2><p>当前公开佩戴：{overview.presentation.equippedTitle ? <CommunityTitleBadge title={overview.presentation.equippedTitle} /> : '未佩戴'}</p></div><div className={styles.actions}><button className={styles.button} type="button" disabled={disabled || !overview.presentation.equippedTitle} onClick={() => { void state.equip(null); }}>卸下称号</button><button className={styles.button} type="button" disabled={disabled} onClick={() => { void state.sync(); }}>{state.busy ? '处理中…' : '同步成就进度'}</button></div></div><p className={styles.muted}>{state.catalog.historicalDataNotice} 同步会一次记录所有达标成就，不必逐个领奖。</p>{!overview.writesEnabled ? <p className={styles.notice}>当前维护只读，进度可以查看，暂不能同步或更换称号。</p> : null}</section>
      <div className={styles.grid}>{state.catalog.achievements.map((item) => {
        const progress = overview.achievements.find((value) => value.key === item.key); const unlocked = Boolean(progress?.unlockedAt); const equipped = overview.presentation.equippedTitle?.key === item.title.key;
        return <article key={item.key} className={`${styles.card} ${styles.achievement}`}><div className={styles.status}><h3>{item.label}</h3><span className={styles.muted}>{unlocked ? '已解锁' : progress?.eligible ? '达标待同步' : '进行中'}</span></div><p><CommunityTitleBadge title={item.title} equipped={equipped} /></p><p>{item.description}</p><progress className={styles.meter} aria-label={`${item.label}进度`} max={progress?.target ?? item.target} value={Math.min(progress?.progress ?? 0, progress?.target ?? item.target)} /><p className={styles.muted}>{progress?.progress ?? 0} / {progress?.target ?? item.target}</p><button className={styles.button} type="button" disabled={disabled || !unlocked || equipped} onClick={() => setSelection(item)}>{equipped ? '正在佩戴' : unlocked ? `佩戴${item.title.label}` : progress?.eligible ? '请先同步解锁' : '尚未解锁'}</button></article>;
      })}</div></> : null}
    {selection ? <ConfirmTitle selected={selection} disabled={disabled || !overview?.achievements.find((item) => item.key === selection.key)?.unlockedAt} onClose={() => setSelection(null)} onConfirm={() => { const title = selection.title.key; setSelection(null); void state.equip(title); }} /> : null}
  </main>;
}
