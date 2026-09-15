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

type AchievementCategory = CommunityAchievementDefinition['category'];
type AchievementStatus = 'all' | 'unlocked' | 'eligible' | 'progress';
const CATEGORY_LABELS: Record<AchievementCategory, string> = { community: '日常与共创', farm: '工位绿植', games: '游戏与挑战', tower: '九层妖塔', development: '开发协作' };
const CATEGORY_ORDER: readonly AchievementCategory[] = ['community', 'farm', 'games', 'tower', 'development'];

export function CommunityAchievementsPage(): JSX.Element {
  const auth = useCommunityAuthStore();
  return <AchievementsWorkspace key={`${auth.user?.publicId}:${getCommunitySessionGeneration()}`} />;
}
function ConfirmTitle({ selected, onClose, onConfirm, disabled }: { selected: CommunityAchievementDefinition; onClose: () => void; onConfirm: () => void; disabled: boolean }): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal?.(); }, []);
  return <dialog ref={dialog} open={typeof HTMLDialogElement.prototype.showModal !== 'function' || undefined} className={styles.dialog} aria-labelledby="title-confirm-heading" onCancel={(event) => { event.preventDefault(); onClose(); }}><h2 id="title-confirm-heading">公开佩戴「{selected.title.label}」？</h2><p>这是主动公开的昵称后缀，会显示在个人页、聊天室和私聊中。成就收藏列表仍遵守你的荣誉隐私设置；佩戴不会改变昵称、登录账号或管理权限。</p><p>历史消息在重新加载时显示当前佩戴，已打开的旧记录不会被全部即时重写。</p><div className={styles.actions}><button className={styles.button} type="button" disabled={disabled} onClick={onConfirm}>确认公开佩戴</button><button className={styles.button} type="button" onClick={onClose}>取消</button></div></dialog>;
}
function AchievementsWorkspace(): JSX.Element {
  const admin = useCommunityAuthStore(s => s.phase === 'active' && s.user?.roles?.includes('admin'));
  const state = useCommunityProgression(); const [selection, setSelection] = useState<CommunityAchievementDefinition | null>(null);
  const [category, setCategory] = useState<AchievementCategory | 'all'>('all');
  const [status, setStatus] = useState<AchievementStatus>('all');
  const [query, setQuery] = useState('');
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminOpened, setAdminOpened] = useState(false);
  useEffect(() => { if (!admin) { setAdminOpen(false); setAdminOpened(false); } }, [admin]);
  const overview = state.overview;
  const disabled = state.busy || Boolean(state.pending) || !overview?.writesEnabled;
  const items = (state.catalog?.achievements ?? []).map(definition => ({ definition, progress: overview?.achievements.find(value => value.key === definition.key) }));
  const unlockedCount = items.filter(item => item.progress?.unlockedAt).length;
  const eligibleCount = items.filter(item => !item.progress?.unlockedAt && item.progress?.eligible).length;
  const search = query.trim().toLocaleLowerCase();
  const filtered = items.filter(({ definition, progress }) => (category === 'all' || category === definition.category)
    && (status === 'all' || status === 'unlocked' && Boolean(progress?.unlockedAt) || status === 'eligible' && !progress?.unlockedAt && progress?.eligible || status === 'progress' && !progress?.unlockedAt && !progress?.eligible)
    && (!search || `${definition.label} ${definition.title.label} ${definition.description}`.toLocaleLowerCase().includes(search)));
  const categories = CATEGORY_ORDER.filter(key => items.some(item => item.definition.category === key));
  return <main className={styles.page}><header className={styles.header}><div><span className={styles.eyebrow}>我的工位 / 成长记录</span><h1>成长档案</h1><p>把共同参与的日常留成记录。成就与称号只作纪念，不出售，也不增加战力。</p></div><div className={styles.actions}><Link to="/me">我的主页</Link><Link to="/settings/privacy">荣誉隐私设置</Link><button className={styles.button} type="button" disabled={state.busy || state.loading} onClick={() => { void state.reload(); }}>重新读取</button></div></header>
    {state.loading ? <p role="status">正在同步成长档案…</p> : null}
    {state.error ? <div className={styles.error} role="alert">{state.error}{state.pending ? <><p>确认前不会提交其他佩戴操作；重试使用原编号。</p><button className={styles.button} type="button" disabled={state.busy} onClick={() => { void state.retry(); }}>确认上次佩戴操作</button></> : null}</div> : null}
    {state.notice ? <p className={styles.notice} role="status">{state.notice}</p> : null}
    {state.catalog?.enabled === false || overview?.enabled === false ? <p className={styles.notice}>成长档案暂未开放，其他账号功能不受影响。</p> : null}
    {state.catalog?.enabled && overview?.enabled ? <>
      <section className={`${styles.card} ${styles.equipmentCard}`} aria-label="佩戴状态"><div className={styles.status}><div><span className={styles.eyebrow}>公开展示，由你决定</span><h2>当前佩戴</h2><div className={styles.currentTitle}>{overview.presentation.equippedTitle ? <CommunityTitleBadge title={overview.presentation.equippedTitle} /> : <span className={styles.noTitle}>未佩戴称号</span>}</div><p className={styles.muted}>佩戴后显示在个人页、聊天室和私聊后缀；选择新称号前会再次确认。</p></div><div className={styles.actions}><button className={styles.button} type="button" disabled={disabled || !overview.presentation.equippedTitle} onClick={() => { void state.equip(null); }}>卸下称号</button><button className={`${styles.button} ${styles.primaryButton}`} type="button" disabled={disabled} onClick={() => { void state.sync(); }}>{state.busy ? '处理中…' : '同步成就进度'}</button></div></div><p className={styles.syncHint}>{state.catalog.historicalDataNotice} 同步会一次记录所有达标成就，不必逐个领奖。</p>{!overview.writesEnabled ? <p className={styles.notice}>当前维护只读，进度可以查看，暂不能同步或更换称号。</p> : null}</section>
      <div className={styles.growthOverview}><FishGrowthSummary initial={overview.fish} /><CommunityVipSummary vip={overview.vip} support={overview.support} serverNow={overview.serverNow} giftDays={state.catalog.membership.giftDays} /></div>
      <section className={styles.collection} aria-labelledby="achievement-collection-title">
        <div className={styles.collectionHeading}><div><span className={styles.eyebrow}>收藏有来处，成长有记录</span><h2 id="achievement-collection-title">成就与称号收藏</h2></div><dl className={styles.collectionStats}><div><dt>已解锁</dt><dd>{unlockedCount}</dd></div><div><dt>达标待同步</dt><dd>{eligibleCount}</dd></div><div><dt>收藏目录</dt><dd>{items.length}</dd></div></dl></div>
        <div className={styles.collectionToolbar}><label className={styles.searchField}><span>搜索成就或称号</span><input type="search" placeholder="名称、称号或解锁条件" value={query} onChange={event => setQuery(event.target.value)} /></label><label className={styles.statusField}><span>解锁状态</span><select value={status} onChange={event => setStatus(event.target.value as AchievementStatus)}><option value="all">全部状态</option><option value="unlocked">已解锁</option><option value="eligible">达标待同步</option><option value="progress">进行中</option></select></label></div>
        <div className={styles.categoryFilters} role="group" aria-label="筛选成就分类"><button type="button" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>全部收藏 <span>{items.length}</span></button>{categories.map(key => <button key={key} type="button" aria-pressed={category === key} onClick={() => setCategory(key)}>{CATEGORY_LABELS[key]} <span>{items.filter(item => item.definition.category === key).length}</span></button>)}</div>
        <p className={styles.collectionCount} aria-live="polite">显示 {filtered.length} / {items.length} 项 · 佩戴与同步不会授予账号或管理权限</p>
        {categories.map(key => {
          const group = filtered.filter(item => item.definition.category === key);
          if (!group.length) return null;
          return <section key={key} className={styles.categorySection} aria-labelledby={`achievement-category-${key}`}><div className={styles.categoryHeading}><h3 id={`achievement-category-${key}`}>{CATEGORY_LABELS[key]}</h3><span>{group.length} 项记录</span></div><div className={styles.grid}>{group.map(({ definition: item, progress }) => {
            const unlocked = Boolean(progress?.unlockedAt); const equipped = overview.presentation.equippedTitle?.key === item.title.key;
            return <article key={item.key} className={`${styles.card} ${styles.achievement}`} aria-label={item.label} data-unlocked={unlocked} data-equipped={equipped}><div className={styles.achievementTop}><span className={styles.achievementCategory}>{CATEGORY_LABELS[item.category]}</span><span className={styles.achievementState} data-state={unlocked ? 'unlocked' : progress?.eligible ? 'eligible' : 'progress'}>{unlocked ? '已解锁' : progress?.eligible ? '达标待同步' : progress ? '进行中' : '进度待同步'}</span></div><h3>{item.label}</h3><div className={styles.collectionTitle}><CommunityTitleBadge title={item.title} equipped={equipped} /></div><p className={styles.achievementDescription}>{item.description}</p><div className={styles.achievementProgress}><progress className={styles.meter} aria-label={`${item.label}进度`} max={progress?.target ?? item.target} value={progress ? Math.min(progress.progress, progress.target) : undefined} /><span>{progress ? progress.progress : '—'} / {progress?.target ?? item.target}</span></div>{progress?.unlockedAt ? <p className={styles.unlockedDate}>解锁于 {new Date(progress.unlockedAt).toLocaleDateString('zh-CN')}</p> : null}<button className={styles.button} type="button" disabled={disabled || !unlocked || equipped} onClick={() => setSelection(item)}>{equipped ? '正在佩戴' : unlocked ? `佩戴${item.title.label}` : progress?.eligible ? '请先同步解锁' : '尚未解锁'}</button></article>;
          })}</div></section>;
        })}
        {!filtered.length ? <div className={styles.emptyCollection}><h3>没有匹配的成就</h3><p>换个分类、状态或关键词试试，完整收藏目录仍然保留。</p><button className={styles.button} type="button" onClick={() => { setCategory('all'); setStatus('all'); setQuery(''); }}>查看全部收藏</button></div> : null}
      </section>
      {admin ? <section className={styles.adminArea} aria-label="管理员管理区"><button type="button" className={styles.adminToggle} aria-expanded={adminOpen} aria-controls="support-admin-content" onClick={() => { setAdminOpened(true); setAdminOpen(open => !open); }}><span>支持台账管理 <small>仅管理员 · 显式打开后读取私有记录</small></span><span aria-hidden="true">{adminOpen ? '−' : '+'}</span></button><div id="support-admin-content" hidden={!adminOpen}>{adminOpened ? <SupportAdminPanel writesEnabled={overview.writesEnabled} /> : null}</div></section> : null}
    </> : null}
    {selection ? <ConfirmTitle selected={selection} disabled={disabled || !overview?.achievements.find((item) => item.key === selection.key)?.unlockedAt} onClose={() => setSelection(null)} onConfirm={() => { const title = selection.title.key; setSelection(null); void state.equip(title); }} /> : null}
  </main>;
}
