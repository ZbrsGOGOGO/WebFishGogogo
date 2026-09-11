import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  OFFICE_RELIEF_BOOKS, OFFICE_RELIEF_CROPS, OFFICE_RELIEF_MATERIALS, OFFICE_RELIEF_RULES,
  OFFICE_RELIEF_SKINS, OFFICE_RELIEF_TITLES, OFFICE_RELIEF_TOOLS,
  type OfficeReliefDrop, type OfficeReliefOutcome, type OfficeReliefTool, type OfficeReliefView,
} from '@stealth-reader/shared';
import { getCommunitySessionGeneration } from '../../api/community-http';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { useGamePrivacy } from '../games/GamePrivacyContext';
import { OfficeBossArt } from './OfficeBossArt';
import { OfficeBossDailyPanel } from './OfficeBossDailyPanel';
import { useOfficeBoss } from './useOfficeBoss';
import { useOfficeBossSound } from './useOfficeBossSound';
import styles from './OfficeBossWorkspace.module.css';

type Section = 'pending' | 'collection' | 'history' | 'rules';
type Confirmation = { title: string; description: string; button: string; action: string; data: Record<string, unknown>; version: number };
const SECTIONS: Array<[Section, string]> = [['pending', '待领物品'], ['collection', '外观与称号'], ['history', '最近记录'], ['rules', '规则说明']];
const number = (value: number): string => value.toLocaleString('zh-CN');
const date = (value: string): string => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const kindLabel = (kind: OfficeReliefOutcome['kind']): string => ({ coin: '解压币入账', loss: '解压币扣减', title: '称号收藏', tower_material: '妖塔材料待领', farm_crop: '农场礼包待领', tower_book: '研习册待领', purchase: '外观购买', equip: '外观设置', claim: '物品已领取' })[kind];
const itemName = (drop: OfficeReliefDrop): string => [...OFFICE_RELIEF_MATERIALS, ...OFFICE_RELIEF_CROPS, ...OFFICE_RELIEF_BOOKS].find(item => item.id === drop.itemId)?.name ?? '待领物品';
function dropDescription(drop: OfficeReliefDrop): string {
  if (drop.kind === 'farm_crop') return '领取 30 种植经验，不发办公币；不会自动收获或更换作物。';
  if (drop.itemId === 'weapon_manual') return '给领取时的妖塔主手武器增加 15 暂存品质经验；按现有品质规则后续结算，不增加熟练度，也不直接升星或升品质。';
  if (drop.itemId === 'skill_fragments') return '领取 3 个妖塔技能碎片，由自己选择后续用途。';
  return `领取 ${drop.quantity} 份${itemName(drop)}到妖塔材料库。`;
}

export function OfficeBossPage() {
  // Subscribe to the user object, not just the public ID: re-login to the same
  // account must also discard local confirmations and the old session boundary.
  const user = useCommunityAuthStore(state => state.user);
  const phase = useCommunityAuthStore(state => state.phase);
  const generation = getCommunitySessionGeneration();
  if (!user || phase !== 'active') return <section className={styles.workspace}><h1>压力整理</h1><p>登录有效账号后继续。</p><Link to="/login">登录账号</Link></section>;
  return <OfficeBossWorkspace key={`${user.publicId}:${generation}`} owner={user.publicId} generation={generation} />;
}

function OfficeBossWorkspace({ owner, generation }: { owner: string; generation: number }) {
  const { covered } = useGamePrivacy();
  const [params] = useSearchParams();
  const mode = params.get('mode') === 'daily' ? 'daily' : 'chances';
  const section = SECTIONS.some(([id]) => id === params.get('section')) ? params.get('section') as Section : 'pending';
  const state = useOfficeBoss(owner, generation, covered);
  const sound = useOfficeBossSound({ owner, generation, covered, active: mode === 'chances', receipt: state.receipt });
  const [tool, setTool] = useState<OfficeReliefTool>('keyboard');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [effect, setEffect] = useState<{ id: string; kind: 'gain' | 'loss' | 'rare' } | null>(null);
  const confirmationRef = useRef<HTMLDivElement>(null), returnFocus = useRef<HTMLElement | null>(null);
  const focusAfterClose = useRef(false);
  const seenReceipt = useRef(state.receipt?.requestId ?? null);
  const relief = state.view?.relief;
  const blocked = state.busy || Boolean(state.pending) || covered;
  useEffect(() => { setConfirmation(null); }, [mode, section]);
  useEffect(() => {
    if (confirmation && !covered) {
      confirmationRef.current?.focus({ preventScroll: true });
      confirmationRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'auto' });
    } else if (!confirmation && focusAfterClose.current && !covered) {
      focusAfterClose.current = false;
      returnFocus.current?.focus({ preventScroll: true });
    }
  }, [confirmation, covered]);
  useEffect(() => {
    const receipt = state.receipt;
    if (!receipt || seenReceipt.current === receipt.requestId) return;
    seenReceipt.current = receipt.requestId;
    const kind = receipt.outcome?.kind;
    if (covered || document.hidden || receipt.replayed || !receipt.outcome || !['coin', 'loss', 'title', 'tower_material', 'farm_crop', 'tower_book'].includes(kind ?? '') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    setEffect({ id: receipt.requestId, kind: kind === 'coin' ? 'gain' : kind === 'loss' ? 'loss' : 'rare' });
  }, [state.receipt, covered]);
  useEffect(() => {
    if (!effect) return;
    const timer = window.setTimeout(() => setEffect(null), 750);
    const hide = (): void => { setEffect(null); };
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const reduce = (): void => { if (motion?.matches) hide(); };
    window.addEventListener('blur', hide); document.addEventListener('visibilitychange', hide); motion?.addEventListener?.('change', reduce);
    return () => { window.clearTimeout(timer); window.removeEventListener('blur', hide); document.removeEventListener('visibilitychange', hide); motion?.removeEventListener?.('change', reduce); };
  }, [effect]);
  useEffect(() => { if (covered) setEffect(null); }, [covered]);
  const path = (nextMode: 'chances' | 'daily', nextSection = section): string => `/games/office-boss?mode=${nextMode}${nextMode === 'chances' ? `&section=${nextSection}` : ''}`;
  const ask = (next: Omit<Confirmation, 'version'>): void => {
    if (!relief || blocked || generation !== getCommunitySessionGeneration()) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConfirmation({ ...next, data: { ...next.data, expectedVersion: relief.version }, version: relief.version });
  };
  const cancel = (): void => { focusAfterClose.current = true; setConfirmation(null); };
  const confirm = (): void => {
    if (!confirmation || !relief || blocked || confirmation.version !== relief.version) return;
    const request = confirmation;
    setConfirmation(null);
    void state.command(request.action, request.data);
  };
  const playReason = !relief ? '机会挑战暂未开放，仍可使用每日巡视。' : relief.pending.length >= OFFICE_RELIEF_RULES.pendingCap ? '待领区已满，请先领取物品。' : relief.tokenBalance > OFFICE_RELIEF_RULES.tokenCap - OFFICE_RELIEF_RULES.maxCoinReward ? '解压币余额接近容量上限，请先在外观柜使用。' : relief.chances === 0 ? '暂无机会，正常使用本站可积累可信活跃时间。' : null;
  return <section className={styles.workspace} aria-label="压力整理工作区" aria-busy={state.busy}>
    <header className={styles.header}><div><span className={styles.eyebrow}>PERSONAL / 压力整理</span><h1>压力整理</h1><p>让纸片待办先下班。免费参与，默认静音。</p></div><div className={styles.actions}><Link to="/games">小游戏</Link><Link to="/office?tab=boss">公司工作台</Link>{mode === 'chances' && <button type="button" aria-pressed={sound.enabled} disabled={!sound.available || sound.starting || covered} onClick={sound.toggle} title="仅本地短提示音，离开、失焦或遮罩后自动恢复静音">{!sound.available ? '音效不可用' : sound.starting ? '音效：正在开启' : sound.enabled ? '音效：开启' : '音效：静音'}</button>}<button disabled={state.busy || covered} onClick={() => void state.refresh()}>刷新资料</button></div></header>
    {mode === 'chances' && sound.message && <p className={styles.muted} role="status">{sound.message}</p>}
    <nav className={styles.tabs} aria-label="压力整理模式"><Link to={path('chances')} aria-current={mode === 'chances' ? 'page' : undefined}>机会挑战</Link><Link to={path('daily')} aria-current={mode === 'daily' ? 'page' : undefined}>每日巡视</Link></nav>
    {state.error && <div className={styles.error} role="alert">{state.error}</div>}
    {state.pending && !state.busy && <div className={styles.notice} role="status"><strong>上一笔操作待核对</strong><p>可以刷新查看资料，但刷新不会替代操作回执。其余操作暂时锁定，只按原请求核对，不生成新请求。</p><button disabled={covered} onClick={() => void state.retry()}>核对原请求</button></div>}
    {state.busy && <p role="status" className={styles.muted}>正在核对服务器回执，请稍候…</p>}
    {!state.view ? <p role="status">{state.error ? '资料尚未读取，请刷新重试。' : '正在读取压力整理档案…'}</p> : mode === 'daily' ? <OfficeBossDailyPanel view={state.view} busy={blocked} command={state.command} /> : <>
      {relief && <dl className={styles.metrics} aria-label="机会与独立代币"><div className={styles.metric}><dt>机会池</dt><dd>{relief.chances} <span>/ {OFFICE_RELIEF_RULES.chanceCap} 次</span></dd><small>跨日保留，满池暂停积累</small></div><div className={styles.metric}><dt>解压币 · 仅本模块</dt><dd>{number(relief.tokenBalance)}</dd><small>不能充值、转赠或兑换办公币</small></div><div className={styles.metric}><dt>下次机会 · 服务器认可活跃</dt><dd>{Math.floor(relief.remainderSeconds / 60)} <span>/ 30 分钟</span></dd><progress aria-label="下一次机会进度" max={OFFICE_RELIEF_RULES.secondsPerChance} value={relief.remainderSeconds} /><small>{relief.chances >= OFFICE_RELIEF_RULES.chanceCap ? '池已满，暂停计入；用掉后再积累。' : '每日最多计 4 小时 / 8 次机会。'}</small></div></dl>}
      <section className={`${styles.panel} ${styles.stage}`} aria-label="纸片挑战"><div className={styles.stageTop}><div className={styles.heading}><h2>暴打小老板</h2><span className={styles.badge}>虚构纸片角色</span></div><p>每次 1 个机会，可能增减解压币或收获收藏。办公币不会被扣减。</p></div>
        <OfficeBossArt key={effect?.id ?? 'rest'} tool={tool} skin={relief?.equippedSkin ?? null} effect={covered ? null : effect?.kind} />
        <div className={styles.stageBody}><div className={styles.actions}><label>演出工具<select value={tool} disabled={blocked || Boolean(confirmation)} onChange={e => setTool(e.target.value as OfficeReliefTool)}>{OFFICE_RELIEF_TOOLS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className={styles.primary} disabled={blocked || Boolean(confirmation) || Boolean(playReason)} onClick={() => ask({ title: '确认消耗 1 次机会', description: '50% 获得解压币，49% 扣减 50–300 解压币（最多扣到 0），1% 获得收藏或待领物品。只影响本模块，不扣办公币。', button: '确认释放 · 1 次机会', action: 'relief_play', data: { tool } })}>消耗 1 次机会 · 释放压力</button></div>
          <p className={styles.muted}>{playReason ?? '工具和外观只改变演出，不改变概率。没有自动挑战或离线补算。'}</p>
          {relief?.lastResult && <Result outcome={relief.lastResult} />}
        </div>
      </section>
      {confirmation && <div ref={confirmationRef} tabIndex={-1} className={styles.confirmation} role="region" aria-label="操作二次确认"><h3>{confirmation.title}</h3><p>{confirmation.description}</p>{confirmation.version !== relief?.version && <p role="status">资料版本已更新；请取消后重新选择并核对，旧确认不会按新条件提交。</p>}<div className={styles.actions}><button className={styles.primary} disabled={blocked || confirmation.version !== relief?.version} onClick={confirm}>{confirmation.button}</button><button disabled={state.busy} onClick={cancel}>取消</button></div></div>}
      {relief && <><nav className={styles.subnav} aria-label="挑战资料"><Link to={path('chances', 'pending')} aria-current={section === 'pending' ? 'page' : undefined}>待领物品{relief.pending.length ? ` (${relief.pending.length})` : ''}</Link>{SECTIONS.filter(([id]) => id !== 'pending').map(([id, label]) => <Link key={id} to={path('chances', id)} aria-current={section === id ? 'page' : undefined}>{label}</Link>)}</nav>
        <section className={styles.panel} aria-label={SECTIONS.find(([id]) => id === section)?.[1]}>
          {section === 'pending' && <><div className={styles.heading}><h2>待领物品</h2><span className={styles.badge}>{relief.pending.length} / {OFFICE_RELIEF_RULES.pendingCap}</span></div><p className={styles.muted}>领取后才进入对应模块。尚未建档、战斗中、自动探索中或容量不足时，物品留在这里，不会被吞掉。</p><ul className={styles.list}>{relief.pending.map(drop => <li key={drop.id}><div><strong>{itemName(drop)}</strong><p>{dropDescription(drop)}</p><small>{date(drop.receivedAt)} · 北京时间</small></div><div className={styles.actions}><Link to={drop.kind === 'farm_crop' ? '/farm' : '/games/demon-tower?tab=profile'}>{drop.kind === 'farm_crop' ? '去农场' : '去妖塔'}</Link><button disabled={blocked || Boolean(confirmation)} onClick={() => ask({ title: `领取${itemName(drop)}`, description: `${dropDescription(drop)} 领取失败会原样保留。`, button: '确认领取', action: 'relief_claim', data: { dropId: drop.id } })}>领取物品</button></div></li>)}</ul>{relief.pending.length === 0 && <p className={styles.empty}>还没有待领物品。联动奖励会先妥善保存在这里。</p>}</>}
          {section === 'collection' && <Collection relief={relief} blocked={blocked || Boolean(confirmation)} ask={ask} />}
          {section === 'history' && <><h2>最近记录</h2><p className={styles.muted}>最近 {OFFICE_RELIEF_RULES.historyLimit} 笔服务端记录 · 时间为北京时间 · 仅解压币收支，不是全站钱包流水。</p><ul className={styles.list}>{relief.history.map(item => <li key={item.id}><div><strong>{kindLabel(item.kind)}</strong><p>{item.message}</p><small>{date(item.at)}</small></div><strong>{item.tokenDelta > 0 ? '+' : ''}{number(item.tokenDelta)} 解压币</strong></li>)}</ul>{!relief.history.length && <p className={styles.empty}>还没有挑战或外观操作记录。</p>}</>}
          {section === 'rules' && <Rules />}
        </section>
      </>}
    </>}
  </section>;
}

function Result({ outcome }: { outcome: OfficeReliefOutcome }) {
  return <div className={styles.result} data-kind={outcome.kind === 'loss' ? 'loss' : outcome.kind === 'coin' ? 'gain' : 'rare'} role="status" aria-live="polite"><div className={styles.resultHeader}><small>最近回执 · {kindLabel(outcome.kind)}</small><small>{date(outcome.at)} 北京时间</small></div><strong>{outcome.tokenDelta > 0 ? '+' : ''}{number(outcome.tokenDelta)} 解压币</strong><p>{outcome.message}</p>{outcome.kind === 'loss' && <p>仅扣除现有解压币，最低为 0；你的办公币与其他资产不受影响。</p>}{outcome.kind === 'title' && <Link to="/achievements">去成就页查看 / 佩戴称号</Link>}</div>;
}
function Collection({ relief, blocked, ask }: { relief: OfficeReliefView; blocked: boolean; ask: (next: Omit<Confirmation, 'version'>) => void }) {
  return <><div className={styles.heading}><h2>外观柜</h2><button disabled={blocked || relief.equippedSkin === null} onClick={() => ask({ title: '恢复默认便笺', description: '只更换纸片外观，不消耗解压币或改变奖励概率。', button: '确认恢复', action: 'relief_equip', data: { skinId: null } })}>恢复默认</button></div><p className={styles.muted}>6 款固定外观，只用解压币购买。无付费、数值加成或随机盲盒；买下后自己选择是否使用。</p><div className={styles.shopGrid}>{OFFICE_RELIEF_SKINS.map(skin => {
    const owned = relief.skins.includes(skin.id), equipped = relief.equippedSkin === skin.id;
    return <article className={styles.skinCard} key={skin.id}><OfficeBossArt tool="keyboard" skin={skin.id} /><h3>{skin.name}</h3><p>{owned ? equipped ? '当前使用中' : '已收藏，可随时使用' : `${number(skin.price)} 解压币 · 纯外观`}</p><div className={styles.actions}><span className={styles.badge}>{owned ? '已拥有' : relief.tokenBalance < skin.price ? '解压币不足' : '固定价'}</span>{owned ? <button disabled={blocked || equipped} onClick={() => ask({ title: `使用${skin.name}`, description: '只更换纸片外观，不消耗解压币或改变奖励概率。', button: '确认使用', action: 'relief_equip', data: { skinId: skin.id } })}>{equipped ? '使用中' : '使用外观'}</button> : <button disabled={blocked || relief.tokenBalance < skin.price} onClick={() => ask({ title: `购买${skin.name}`, description: `总价 ${number(skin.price)} 解压币，购买后余额 ${number(relief.tokenBalance - skin.price)}。只扣解压币，不扣办公币；购买不会自动装备。`, button: '确认购买外观', action: 'relief_buy', data: { skinId: skin.id } })}>购买外观</button>}</div></article>;
  })}</div><h3 style={{ marginTop: 20 }}>稀有称号 · {relief.titles.length} / {OFFICE_RELIEF_TITLES.length}</h3><ul className={styles.list}>{OFFICE_RELIEF_TITLES.map(title => <li key={title.id}><strong>{title.name}</strong><span className={styles.badge}>{relief.titles.includes(title.id) ? '已收藏' : '尚未获得'}</span></li>)}</ul><p className={styles.muted}>称号不宣称全站唯一。重复称号折为 500 解压币；不会自动替换正在佩戴的称号。</p><Link to="/achievements">打开成就与称号</Link></>;
}
function Rules() {
  return <div className={styles.rules}>
    <h2>规则说明</h2><p>免费、手动、服务端结算。解压币不能充值、交易、转赠或兑换全站办公币。</p>
    <ul><li>每 30 分钟服务器认可的活跃时间获得 1 次机会；每天最多计算 4 小时，最多新增 8 次。</li><li>机会池上限 10 次，满池暂停积累且不会事后补发；已有次数与零碎进度跨日保留。</li><li>后台、离线、失焦或长时间无操作不会增加机会；游戏时间不重复加成，也不会倒扣已获得的次数。</li><li>固定每日巡视独立保留：30 秒后领取 20 办公币 +5 经验，不用机会，也不影响本模块的概率。</li></ul>
    <table className={styles.ruleTable}><thead><tr><th>结果</th><th>单次概率</th><th>去向</th></tr></thead><tbody>
      <tr><td>获得解压币</td><td>50%</td><td>100–10,000 解压币</td></tr>
      <tr><td>扣减解压币</td><td>49%</td><td>50–300，最多扣到 0</td></tr>
      <tr><td>稀有称号</td><td>0.5%</td><td>3 款等概率；重复折为 500 解压币</td></tr>
      <tr><td>妖塔材料</td><td>0.2%</td><td>玄铁砂 / 灵草 / 通道线索，各 3 份，待领</td></tr>
      <tr><td>农场礼包</td><td>0.2%</td><td>3 款等概率，中奖礼包均领取 30 种植经验</td></tr>
      <tr><td>妖塔研习册</td><td>0.1%</td><td>3 技能碎片 / 主手 15 暂存品质经验，待领</td></tr>
    </tbody></table>
    <details><summary>赢币金额细分（仅在 50% 赢币结果内）</summary><table className={styles.ruleTable}><thead><tr><th>金额区间</th><th>赢币结果内占比</th></tr></thead><tbody>{OFFICE_RELIEF_RULES.coinTiers.map(tier => <tr key={tier.min}><td>{number(tier.min)}–{number(tier.max)} 解压币</td><td>{tier.weight}%</td></tr>)}</tbody></table><p>各区间内整数等概率；超过 5,000 的结果占赢币事件的 8%，折合所有挑战的 4%。工具与外观不改变任何概率。</p></details>
    <p className={styles.muted}>待领区最多 99 份，解压币最多 10 亿。容量不足以容纳任何可能结果时，服务端会拒绝开始，不扣机会。最近记录保留 30 笔。</p>
  </div>;
}
