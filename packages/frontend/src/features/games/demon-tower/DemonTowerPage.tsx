import { useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DEMON_TOWER_ATTRIBUTE_KEYS, type DemonTowerAction, type DemonTowerCatalog, type DemonTowerProfileView } from '@stealth-reader/shared';

import { useCommunityWalletStore } from '../../../app/store/community-wallet-store';
import { COMMUNITY_FEATURE_FLAGS } from '../../../app/community-nav';
import { getCommunitySessionGeneration } from '../../../api/community-http';
import { DemonTowerAutoExplore } from './DemonTowerAutoExplore';
import { TowerIcon, TowerPortrait, TowerTerrainArt, type TowerIconName } from './DemonTowerArt';
import { DemonTowerBattle, DemonTowerDaily, DemonTowerReport } from './DemonTowerBattle';
import { DemonTowerAttributeReset } from './DemonTowerAttributeReset';
import { DemonTowerAttributeAllocate } from './DemonTowerAttributeAllocate';
import { DemonTowerInventory } from './DemonTowerInventory';
import { DemonTowerGrowth } from './DemonTowerGrowth';
import { DemonTowerExpansion, demonTowerExpansionUIEnabled } from './DemonTowerExpansion';
import { DemonTowerShop } from './DemonTowerShop';
import { DemonTowerFirstClear, DemonTowerSkinPicker } from './DemonTowerRecognition';
import { DemonTowerSocial } from './DemonTowerSocial';
import { DemonTowerWorld } from './DemonTowerWorld';
import { TowerMeter, TowerModal, TowerPanel, revealTowerControl, towerDuration } from './TowerElements';
import { useDemonTower } from './useDemonTower';
import styles from './DemonTower.module.css';

type TowerTab = 'profile' | 'explore' | 'loadout' | 'world' | 'journal' | 'expansion' | 'shop';
const TABS: Array<{ id: TowerTab; label: string; icon: TowerIconName }> = [
  { id: 'profile', label: '人物档案', icon: 'profile' }, { id: 'explore', label: '探索任务', icon: 'explore' },
  { id: 'loadout', label: '装备技能', icon: 'loadout' },
  ...(demonTowerExpansionUIEnabled ? [
    { id: 'expansion' as const, label: '秘境工坊', icon: 'loadout' as const },
    { id: 'shop' as const, label: '物资申领', icon: 'material' as const },
  ] : []),
  { id: 'world', label: '协作世界', icon: 'world' }, { id: 'journal', label: '行动战报', icon: 'journal' },
];
const ATTRIBUTE_DETAILS = {
  STR: '力量影响重兵与力量技能的伤害。', SPD: '速度影响先后手、命中、长兵和速度技能。', AGI: '敏捷影响轻兵伤害与闪避。',
  DEF: '防御提高生存能力、盾兵伤害及相关护盾。', LUCK: '幸运影响法器、回复、暴击概率和部分探索收益。',
};

function CharacterSummary({ name, profile, catalog, balance, balanceStale, now, expanded = false }: { name: string; profile: DemonTowerProfileView; catalog: DemonTowerCatalog; balance: number | null; balanceStale: boolean; now: number; expanded?: boolean }): JSX.Element {
  return <section className={`${styles.panel} ${styles.characterCard}`} aria-label="寻道者状态"><div className={styles.panelBody}><TowerPortrait name={name} weaponId={profile.loadout.mainHand} className={styles.portrait} injured={profile.hp < profile.maxHp * .25} /><div className={styles.characterName}><h2>{name}</h2><p>寻道者档案 · Lv{profile.level} / {catalog.rules.maxLevel}</p></div><TowerMeter label="生命" value={profile.hp} max={profile.maxHp} /><TowerMeter label="体力" value={profile.stamina} max={profile.staminaMax} tone="blue" detail={profile.nextStaminaAt ? `下次恢复约 ${towerDuration(profile.nextStaminaAt - now)} · 以服务器同步为准` : '体力已充足'} /><TowerMeter label="妖塔经验" value={profile.experience} max={profile.experienceToNext} detail={profile.level >= catalog.rules.maxLevel ? '当前已达到等级上限' : '独立于平台账号等级'} /><div className={styles.resourceList}>{(Object.keys(catalog.materials) as Array<keyof typeof catalog.materials>).map((key) => <div className={styles.resource} key={key}><TowerIcon name={key === 'herb' ? 'heart' : key === 'clue' ? 'journal' : 'material'} /><strong>{profile.materials[key].toLocaleString('zh-CN')}</strong><small>{catalog.materials[key]}</small></div>)}</div><div className={styles.wallet}><div>统一办公币<small>{balanceStale ? '余额待同步，保留上次确认值' : '与农场、排行榜共用一个钱包'}</small></div><strong>{balance === null ? '待同步' : balance.toLocaleString('zh-CN')}</strong></div>{expanded ? <p className={styles.muted} style={{ marginTop: 13 }}>塔内材料绑定当前角色，只用于培养和建设，不是通用货币；本模块没有付费入口。</p> : null}</div></section>;
}

function Attributes({ profile, catalog, disabled, now, onAction }: { profile: DemonTowerProfileView; catalog: DemonTowerCatalog; disabled: boolean; now: number; onAction: (action: DemonTowerAction) => Promise<boolean> }): JSX.Element {
  const maximum = Math.max(30, ...Object.values(profile.effectiveAttributes));
  return <TowerPanel title="五维成长" detail={<span className={styles.badge}>可分配 {profile.unspentPoints} 点</span>}><div className={styles.attributeList}>{DEMON_TOWER_ATTRIBUTE_KEYS.map((key) => <div key={key}><div className={styles.attribute}><span className={styles.attributeCode}>{key}</span><div><div className={styles.attributeLabel}><span>{catalog.attributes[key]}</span><small>基础 {profile.attributes[key]}</small></div><div className={styles.meterTrack} aria-hidden="true"><span style={{ width: `${profile.effectiveAttributes[key] / maximum * 100}%` }} /></div></div><strong className={styles.attributeValue}>{profile.effectiveAttributes[key]}</strong><button type="button" className={styles.button} disabled={disabled || profile.unspentPoints < 1 || !profile.availableActions.includes('allocate')} aria-label={`${catalog.attributes[key]}分配 1 点`} onClick={() => { void onAction({ kind: 'allocate', payload: { attribute: key, points: 1 } }); }}>+</button></div><p className={styles.attributeDescription} style={{ margin: '5px 0 0 42px' }}>{ATTRIBUTE_DETAILS[key]}</p></div>)}</div><p className={styles.muted} style={{ marginTop: 17 }}>右侧为当前有效属性，包含已保存装备、被动技能及物资申领加成。永久丹与临时药效在物资申领的「增益与符文」统一查看；自由点洗点不会清除永久丹。分配后由服务器保存。</p><DemonTowerAttributeAllocate profile={profile} catalog={catalog} disabled={disabled} onAction={onAction} /><DemonTowerAttributeReset profile={profile} catalog={catalog} now={now} disabled={disabled} onAction={onAction} /></TowerPanel>;
}

export function DemonTowerPage(): JSX.Element {
  const state = useDemonTower();
  const wallet = useCommunityWalletStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab: TowerTab = TABS.some(item => item.id === requestedTab) ? requestedTab as TowerTab : 'explore';
  const [help, setHelp] = useState(false);
  const autoScope = `${state.ownerId}:${getCommunitySessionGeneration()}`;
  const [autoPending, setAutoPending] = useState<{ scope: string; pending: boolean } | null>(null);
  const pointerFocus = useRef(false);
  const catalog = state.catalog;
  const overview = state.overview;
  const profile = overview?.profile;
  const visibleReceipt = state.receipt && (state.receipt.replayed || state.receipt.events.length > 0 || state.receipt.officeCoinsGranted > 0 || state.receipt.effectiveBossDamage > 0 || state.receipt.passageContribution > 0) ? state.receipt : null;
  const autoRunning = overview?.autoExplore?.status === 'running';
  const disabled = state.busy || state.pending || !overview?.writesEnabled || autoRunning || Boolean(autoPending?.scope === autoScope && autoPending?.pending);
  const balance = state.ownerId && wallet.ownerId === state.ownerId ? wallet.officeCoins : null;
  const balanceStale = wallet.status === 'stale' || wallet.status === 'error';
  const selectedFloor = catalog?.floors.find((floor) => floor.floor === profile?.selectedFloor);
  const can = (kind: DemonTowerAction['kind']): boolean => {
    if (disabled || !profile?.availableActions.includes(kind) || !catalog) return false;
    if (kind === 'explore') return profile.hp > 0 && profile.stamina >= catalog.rules.exploreCost;
    if (kind === 'train') return profile.stamina >= catalog.rules.trainCost;
    if (kind === 'rest') return profile.hp < profile.maxHp && profile.stamina >= catalog.rules.restCost;
    return true;
  };
  useEffect(() => { setHelp(false); }, [state.ownerId]);
  useEffect(() => { document.getElementById(`tower-tab-${tab}`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }, [tab]);
  useEffect(() => {
    // Pointer focus occurs between press and release. Moving its target here
    // would cancel a real mobile click; keyboard focus still clears fixed tabs.
    const pointer = (): void => { pointerFocus.current = true; };
    const keyboard = (): void => { pointerFocus.current = false; };
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('keydown', keyboard, true);
    return () => { document.removeEventListener('pointerdown', pointer, true); document.removeEventListener('keydown', keyboard, true); };
  }, []);

  const changeTab = (next: TowerTab): void => {
    const params = new URLSearchParams(searchParams); params.set('tab', next); setSearchParams(params);
    document.getElementById('tower-section-heading')?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
  };
  const openSupplies = (): void => {
    const params = new URLSearchParams(searchParams); params.set('tab', 'shop'); params.set('supply', 'supplies'); setSearchParams(params);
    document.getElementById('tower-section-heading')?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
  };
  const navigateTabs = (event: KeyboardEvent<HTMLButtonElement>, current: TowerTab): void => {
    const index = TABS.findIndex((item) => item.id === current);
    const target = event.key === 'ArrowRight' ? (index + 1) % TABS.length : event.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : null;
    if (target === null) return;
    event.preventDefault(); changeTab(TABS[target].id); document.getElementById('tower-tab-' + TABS[target].id)?.focus();
  };
  return <section className={styles.page} data-expanded={demonTowerExpansionUIEnabled} data-arena-skin={demonTowerExpansionUIEnabled && profile?.expansion?.arena?.skinUnlocked} data-skin={demonTowerExpansionUIEnabled ? profile?.expansion?.skin : 'field'} aria-label="九层妖塔工作台" onFocusCapture={(event) => { if (!pointerFocus.current && event.target instanceof HTMLElement) revealTowerControl(event.target); }}>
    <header className={styles.heading} id="tower-section-heading"><div><span className={styles.eyebrow}>COOPERATIVE FIELD NOTES / VOL. 09</span><h1>九层妖塔</h1><p>一份缓慢成长的角色档案，一段可以和同事共同推进的探索。随时收起画面，进度由服务器保存。</p></div><div className={styles.headingTools}><span className={styles.badge} data-tone={state.stale ? 'warning' : 'muted'}>{state.busy ? '行动提交中' : state.stale ? '状态待同步' : state.refreshing ? '正在同步' : '联网档案'}</span><button type="button" className={styles.iconButton} aria-label="刷新妖塔状态" disabled={state.refreshing || state.busy} onClick={() => { void state.refresh(); }}><TowerIcon name="refresh" /></button><button type="button" className={styles.iconButton} aria-label="查看九层妖塔帮助" onClick={() => setHelp(true)}><TowerIcon name="help" /></button></div></header>
    {state.error ? <div className={styles.error} role="alert"><p>{state.error}</p>{state.pending ? <><p>上次操作结果尚未确认。确认期间不能开始新动作，重试沿用原操作编号，不重复扣除或领奖。</p><button className={styles.button} type="button" disabled={state.busy} onClick={() => { void state.retry(); }}>{state.busy ? '确认处理中…' : '确认上次操作'}</button></> : <button className={styles.button} type="button" disabled={state.refreshing} onClick={() => { void state.refresh(); }}>同步最新状态</button>}</div> : null}
    {state.loading ? <div className={styles.loading} role="status"><TowerIcon name="journal" /><p>正在读取角色与世界档案…</p><span className={styles.muted}>首次打开不会自动创建角色或扣除资源。</span></div> : null}
    {catalog?.enabled === false ? <p className={styles.notice}>九层妖塔暂未开放。已有其他游戏仍可从<Link to="/games">小游戏专区</Link>进入。</p> : null}
    {catalog?.enabled && !state.ownerId ? <section className={styles.intro}><div><span className={styles.eyebrow}>A SHARED ADVENTURE</span><h2>自己的角色，<br />大家的九层世界。</h2><p>登录后创建免费角色。你可以独自探索，也可以在不同时间参与同一个世界首领和通道建设。</p><ul className={styles.introChecks}><li><TowerIcon name="check" />原生文字交互，不需要安装</li><li><TowerIcon name="check" />角色存档与全站账号绑定</li><li><TowerIcon name="check" />无充值、无付费战力</li></ul><Link to="/login" className={styles.primary}>登录后建立档案<TowerIcon name="arrow" /></Link></div><TowerPortrait name="寻道者" weaponId="w1" className={styles.portrait} /></section> : null}
    {catalog?.enabled && state.ownerId && overview && !profile ? <section className={styles.intro}><div><span className={styles.eyebrow}>NEW PERSONNEL FILE</span><h2>{state.displayName}，<br />建立你的寻道者档案。</h2><p>从第一层开始，免费领取五类基础武器和技能。创建角色免费，不扣办公币；每次行动消耗与奖励都会清楚记录。</p><ul className={styles.introChecks}><li><TowerIcon name="check" />20 件武器 / 法器，16 种技能</li><li><TowerIcon name="check" />九层世界按真实协作逐步开放</li><li><TowerIcon name="check" />回合制探索，离开页面仍保留进度</li></ul><p className={styles.muted}>角色存档保存在当前账号下；昵称与有效伤害、建设贡献可能出现在公开榜单。了解<Link to="/privacy-policy">隐私政策</Link>。</p><button className={styles.primary} type="button" disabled={disabled} onClick={() => { void state.act({ kind: 'enroll', payload: {} }); }}>{state.busy ? '正在建立档案…' : '免费建立角色'}<TowerIcon name="arrow" /></button>{!overview.writesEnabled ? <p className={styles.muted} style={{ marginTop: 13 }}>目前为维护只读状态，暂时不能建立新角色。</p> : null}</div><TowerPortrait name={state.displayName} weaponId="w1" className={styles.portrait} /></section> : null}
    {catalog?.enabled && overview && profile ? <>
      {!overview.writesEnabled ? <p className={styles.notice}>当前为维护只读状态。角色、配装和历史战报仍可查看，暂停提交新行动。</p> : null}
      {autoRunning ? <p className={styles.notice}>委托探索正在服务器上执行，暂时不能手动修改角色。<button type="button" className={styles.textButton} onClick={() => changeTab('explore')}>查看进度或停止托管</button></p> : null}
      {profile.growth && !profile.growth.chosenAttribute ? <p className={styles.notice}>你还没有选择免费永久命格。<button type="button" className={styles.textButton} onClick={() => changeTab('profile')}>前往人物档案选择心性</button>；未选择也可继续探索，旧战斗不会中途改变规则。</p> : null}
      {demonTowerExpansionUIEnabled && profile.economy && tab !== 'shop' ? <div className={styles.supplyQuickBar}><span>灵石 <strong>{profile.economy.balance}</strong> · 残魂 <strong>{profile.materials.soul}</strong> · 办公币 <strong>{balance === null ? '待同步' : balance}{balanceStale && balance !== null ? '（待同步）' : ''}</strong><small>塔内资源与办公币独立，不互兑。</small></span><button type="button" className={styles.button} onClick={openSupplies}>物资申领</button></div> : null}
      <nav className={styles.tabs} role="tablist" aria-label="妖塔工作区">{TABS.map((item) => <button type="button" role="tab" id={`tower-tab-${item.id}`} aria-controls={`tower-panel-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onKeyDown={(event) => navigateTabs(event, item.id)} key={item.id} className={styles.tab} onClick={() => changeTab(item.id)}><TowerIcon name={item.icon} /><span>{item.label}</span>{item.id === 'profile' && profile.unspentPoints > 0 ? <span className={styles.tabBadge}>{profile.unspentPoints}</span> : item.id === 'explore' && profile.battle ? <span className={styles.tabBadge}>进行中</span> : null}</button>)}</nav>
      {visibleReceipt ? <div className={styles.feedback} role="status"><div className={styles.buttonRow} style={{ justifyContent: 'space-between' }}><strong>{visibleReceipt.replayed ? '上次操作已确认 · 没有重复结算' : '行动已记录'}</strong><button type="button" className={styles.textButton} onClick={state.dismissReceipt}>收起回执</button></div>{visibleReceipt.events.length ? <ul>{visibleReceipt.events.slice(0, 4).map((event, index) => <li key={index}>{event}</li>)}</ul> : null}{visibleReceipt.officeCoinsGranted > 0 ? <p className={styles.feedbackCoins} style={{ margin: '8px 0 0' }}>{visibleReceipt.replayed ? '原操作' : '本次'}办公币到账 +{visibleReceipt.officeCoinsGranted}；余额将从统一钱包重新同步。</p> : null}{visibleReceipt.effectiveBossDamage > 0 ? <p className={styles.muted} style={{ margin: '5px 0 0' }}>实际计入世界血池伤害：{visibleReceipt.effectiveBossDamage}。</p> : null}{visibleReceipt.passageContribution > 0 ? <p className={styles.muted} style={{ margin: '5px 0 0' }}>实际建设贡献：{visibleReceipt.passageContribution}。</p> : null}</div> : null}
      <div role="tabpanel" id="tower-panel-profile" aria-labelledby="tower-tab-profile" hidden={tab !== 'profile'}><div className={styles.layout}><CharacterSummary name={state.displayName} profile={profile} catalog={catalog} balance={balance} balanceStale={balanceStale} now={state.now} expanded /><div className={styles.stack}><DemonTowerGrowth key={`growth-${state.ownerId}`} profile={profile} disabled={disabled} onAction={state.act} />{demonTowerExpansionUIEnabled ? <DemonTowerSkinPicker profile={profile} disabled={disabled} onAction={state.act} /> : null}<Attributes key={state.ownerId} profile={profile} catalog={catalog} now={state.now} disabled={disabled} onAction={state.act} /><DemonTowerDaily profile={profile} catalog={catalog} disabled={disabled} onAction={state.act} /><TowerPanel title="成长说明"><p className={styles.muted}>妖塔等级、五维和体力独立于平台账号成长。武器类型决定战斗风格；具体效果可在装备技能页查看。探索与修炼累积经验，配装和被动技能会改变有效属性。</p><button type="button" className={styles.button} onClick={() => changeTab('loadout')}>查看我的配装<TowerIcon name="arrow" /></button></TowerPanel></div></div></div>
      <div role="tabpanel" id="tower-panel-explore" aria-labelledby="tower-tab-explore" hidden={tab !== 'explore'}><div className={styles.layout}><aside className={styles.desktopProfile}><CharacterSummary name={state.displayName} profile={profile} catalog={catalog} balance={balance} balanceStale={balanceStale} now={state.now} /></aside><div className={styles.stack}>
        <div className={styles.mobileSummary}><span>Lv{profile.level} · {state.displayName}</span><span>生命 {profile.hp}/{profile.maxHp}</span><span>体力 {profile.stamina}/{profile.staminaMax}</span></div>
        {profile.battle ? <DemonTowerBattle battle={profile.battle} catalog={catalog} disabled={disabled} onAction={state.act} /> : <><section className={`${styles.panel} ${styles.fieldCard}`} aria-label="当前探索区域"><TowerTerrainArt terrain={selectedFloor?.terrain ?? 'plain'} className={styles.terrain} /><div className={styles.panelBody}><div className={styles.fieldTitle}><div><span className={styles.eyebrow}>FIELD {String(profile.selectedFloor).padStart(2, '0')} / EXPLORATION</span><h2>{selectedFloor?.name ?? '探索区域'}</h2><p>{selectedFloor?.description}</p></div><button type="button" className={styles.textButton} onClick={() => changeTab('world')}>换个区域</button></div>{selectedFloor?.mechanicHint ? <p className={styles.notice} style={{ marginBottom: 15 }}>区域提示：{selectedFloor.mechanicHint}</p> : null}<div className={styles.fieldAction}><button type="button" className={styles.primary} disabled={!can('explore')} onClick={() => { void state.act({ kind: 'explore', payload: {} }); }}><TowerIcon name="explore" />开始探索 · {catalog.rules.exploreCost} 体力</button><p>可能遇到妖物、宝箱或机缘。战斗按回合推进，随时可收起页面。</p></div>{profile.stamina < catalog.rules.exploreCost ? <p className={styles.muted} style={{ margin: '10px 0 0' }}>体力不足。每 {towerDuration(catalog.rules.staminaRestoreMs)} 自动恢复 1 点，无需保持页面开启。{demonTowerExpansionUIEnabled ? <button type="button" className={styles.textButton} onClick={openSupplies}>前往物资库补充体力</button> : null}</p> : null}</div></section><div className={styles.smallActions}><button type="button" className={styles.smallAction} disabled={!can('train')} onClick={() => { void state.act({ kind: 'train', payload: {} }); }}><strong><TowerIcon name="journal" />潜心修炼</strong><small>获得妖塔经验 · 消耗 {catalog.rules.trainCost} 体力</small></button><button type="button" className={styles.smallAction} disabled={!can('rest')} onClick={() => { void state.act({ kind: 'rest', payload: {} }); }}><strong><TowerIcon name="heart" />短暂休整</strong><small>恢复 {catalog.rules.restHealingPercent}% 最大生命 · {catalog.rules.restCost} 体力</small></button></div></>}
        {COMMUNITY_FEATURE_FLAGS.demonTowerAuto && state.ownerId ? <DemonTowerAutoExplore overview={overview} catalog={catalog} now={state.now} ownerId={state.ownerId} manualPending={state.busy || state.pending} onOverview={state.observeOverview} onPending={(pending) => setAutoPending({ scope: autoScope, pending })} /> : null}
        <DemonTowerDaily profile={profile} catalog={catalog} disabled={disabled} onAction={state.act} />
        {profile.lastReport && !profile.battle ? <DemonTowerReport report={profile.lastReport} catalog={catalog} compact /> : null}
      </div></div></div>
      <div role="tabpanel" id="tower-panel-loadout" aria-labelledby="tower-tab-loadout" hidden={tab !== 'loadout'}><DemonTowerInventory key={state.ownerId} profile={profile} catalog={catalog} disabled={disabled} onAction={state.act} /></div>
      {demonTowerExpansionUIEnabled ? <div role="tabpanel" id="tower-panel-expansion" aria-labelledby="tower-tab-expansion" hidden={tab !== 'expansion'}><DemonTowerExpansion key={`expansion-${autoScope}`} profile={profile} world={overview.world} disabled={disabled} onAction={state.act} onContinueBattle={() => changeTab('explore')} onSupplies={openSupplies} /></div> : null}
      {demonTowerExpansionUIEnabled ? <div role="tabpanel" id="tower-panel-shop" aria-labelledby="tower-tab-shop" hidden={tab !== 'shop'}>{tab === 'shop' ? <DemonTowerShop key={`shop-${autoScope}`} profile={profile} catalog={catalog} disabled={disabled} now={state.now} balance={balance} balanceStale={balanceStale} onAction={state.act} onExplore={() => changeTab('explore')} onWorkshop={() => changeTab('expansion')} /> : null}</div> : null}
      <div role="tabpanel" id="tower-panel-world" aria-labelledby="tower-tab-world" hidden={tab !== 'world'}>{tab === 'world' ? <><DemonTowerWorld world={overview.world} profile={profile} catalog={catalog} ownerId={state.ownerId} disabled={disabled} onAction={state.act} />{demonTowerExpansionUIEnabled ? <div className={styles.stack}><DemonTowerFirstClear profile={profile} world={overview.world} disabled={disabled} onAction={state.act} /><DemonTowerSocial key={`social-${state.ownerId}`} profile={profile} ownerId={state.ownerId} disabled={disabled} onAction={state.act} /></div> : null}</> : null}</div>
      <div role="tabpanel" id="tower-panel-journal" aria-labelledby="tower-tab-journal" hidden={tab !== 'journal'}><div className={styles.stack}><TowerPanel title="最近行动档案" detail={<span className={styles.muted}>角色版本 {profile.version}</span>}><p className={styles.muted}>这里展示服务器保留的最近一场战报。每一条伤害、恢复与状态变化都来自实际结算；世界首领的有效贡献另见回执和贡献榜。</p>{profile.battle ? <p className={styles.notice}>你有一场探索仍在进行。<button type="button" className={styles.textButton} onClick={() => changeTab('explore')}>返回现场</button></p> : null}<Link to="/games/demon-tower/leaderboard" className={styles.button}>首领讨伐日榜<TowerIcon name="arrow" /></Link></TowerPanel>{profile.lastReport ? <DemonTowerReport report={profile.lastReport} catalog={catalog} /> : <p className={styles.empty}>档案还是空白。完成首次探索战斗或世界首领协作后，战报会保存在这里。</p>}</div></div>
    </> : null}
    {help ? <TowerModal title="九层妖塔使用说明" onClose={() => setHelp(false)}><div className={styles.helpList}><section><h3>你的角色、共同的世界</h3><p>独自完成探索和培养，按自己的时间参与共同首领和通道建设。普通战斗没有实时倒计时，Esc 便签只收起界面，不会回滚服务端已经完成的行动。</p></section>{catalog ? <><section><h3>配装与战斗</h3><p>主手 1 件（可选择法器）、辅助法器 1 件，同件武器不能重复占位；主动技能最多 {catalog.rules.activeSkillSlots} 个、被动技能最多 {catalog.rules.passiveSkillSlots} 个。首领协作按主动技能排序自动行动，普通战斗由你逐回合选择。冷却、治疗和持续回合均真实结算。</p></section><section><h3>体力与恢复</h3><p>每 {towerDuration(catalog.rules.staminaRestoreMs)} 恢复 1 点体力。普通战斗外生命会逐步恢复；休整消耗 {catalog.rules.restCost} 体力，恢复 {catalog.rules.restHealingPercent}% 最大生命。以服务器时间为准，关闭页面不影响自然恢复。</p></section><section><h3>短时日常与奖励边界</h3><p>从零活跃开始，完成 {catalog.rules.dailyActivityTarget} 次修炼，共消耗 {catalog.rules.dailyActivityTarget * catalog.rules.trainCost} 体力，即可达到今日活跃目标；手动领取最多 {catalog.rules.dailyActivityCoins} 办公币，仍受当日剩余额度限制。{catalog.rules.dailyOfficeCoinCap} 办公币是日常奖励总上限，不是短时间必定拿满的奖励。</p><p>妖塔日常按北京时间 00:00 切换自然日，不要求连续在线。全部 {catalog.floors.length} 层联通后不再出现新的世界首领；没有有效首领伤害的日期，不产生讨伐冠军或冠军奖励，仍可继续个人探索。</p></section><section><h3>服务规则</h3><ul>{catalog.rules.rulesText.map((text) => <li key={text}>{text}</li>)}</ul></section></> : <p>规则资料正在同步，请稍后重试。</p>}<section><h3>网络中断时</h3><p>出现“确认上次操作”时，先确认原操作结果，再进行其他动作。重试沿用同一编号，不会重复扣除或发奖；重新登录或切换账号后不会显示上个账号的私人档案。</p></section></div></TowerModal> : null}
  </section>;
}
