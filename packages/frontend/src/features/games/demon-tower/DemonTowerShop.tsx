import { useEffect, useRef, useState, type JSX } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DEMON_TOWER_AFFIXES, DEMON_TOWER_ATTRIBUTE_KEYS, DEMON_TOWER_WEAPONS,
  type DemonTowerAction, type DemonTowerAffix, type DemonTowerCatalog,
  type DemonTowerProfileView, type DemonTowerShopOffer,
} from '@stealth-reader/shared';
import { demonTowerActionReasonMessage } from '../../../api/community-demon-tower';
import { DemonTowerLegacyMarket } from './DemonTowerLegacyMarket';
import { TowerModal, TowerPanel, towerTime } from './TowerElements';
import styles from './DemonTower.module.css';

const SECTIONS = [
  { id: 'supplies', label: '物资库' }, { id: 'market', label: '残魂秘市' },
  { id: 'effects', label: '增益与符文' }, { id: 'ledger', label: '收支记录' },
] as const;
type ShopSection = typeof SECTIONS[number]['id'];
type Props = {
  profile: DemonTowerProfileView; catalog: DemonTowerCatalog; disabled: boolean; now: number;
  balance: number | null; balanceStale: boolean;
  onAction: (action: DemonTowerAction) => Promise<boolean>; onExplore: () => void; onWorkshop: () => void;
};
const currencyName = (currency: DemonTowerShopOffer['currency']) => currency === 'soul' ? '残魂' : '灵石';
const periodName = { day: '每日', week: '每周', lifetime: '累计' };

export function towerShopQuantityReason(offer: DemonTowerShopOffer, quantity: number, profile: DemonTowerProfileView): string | null {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 5) return '请输入 1–5 的整数数量。';
  if (!offer.available) return offer.reason ? demonTowerActionReasonMessage(offer.reason) : '当前不可申领，请同步状态。';
  if (quantity > offer.remaining) return `本项${periodName[offer.limitPeriod]}还可申领 ${offer.remaining} 份。`;
  const staminaAmount = offer.id === 'stamina_small' ? 3 : offer.id === 'stamina_large' ? 8 : 0;
  if (staminaAmount && profile.stamina + staminaAmount * quantity > profile.staminaMax) return `体力空余 ${Math.max(0, profile.staminaMax - profile.stamina)}，本次需要 ${staminaAmount * quantity} 点空间；不会浪费溢出补给，请减少数量。`;
  if (offer.id === 'heal' && quantity !== 1) return '疗伤符即时恢复生命，每次只能申领 1 份。';
  const balance = offer.currency === 'soul' ? profile.materials.soul : profile.economy?.balance ?? 0;
  if (offer.price * quantity > balance) return `${currencyName(offer.currency)}不足，需要 ${offer.price * quantity}，当前 ${balance}。`;
  return null;
}

/** A single supply desk; URL-owned sections survive refresh/history without leaking account form state. */
export function DemonTowerShop({ profile, catalog, disabled, now, balance, balanceStale, onAction, onExplore, onWorkshop }: Props): JSX.Element {
  const [params, setParams] = useSearchParams();
  const rawSection = params.get('supply');
  const section: ShopSection = SECTIONS.some(item => item.id === rawSection) ? rawSection as ShopSection : 'supplies';
  const [purchase, setPurchase] = useState<{ offerId: DemonTowerShopOffer['id']; quantity: string } | null>(null);
  const [rune, setRune] = useState<DemonTowerAffix>('critical');
  const [weaponId, setWeaponId] = useState(profile.loadout.mainHand);
  const [replace, setReplace] = useState<DemonTowerAffix | ''>('');
  const [runeConfirmation, setRuneConfirmation] = useState<Extract<DemonTowerAction, { kind: 'use_rune' }> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => { setPurchase(null); setRuneConfirmation(null); }, [section]);
  const economy = profile.economy;
  const offer = economy?.offers.find(item => item.id === purchase?.offerId);
  const quantity = Number(purchase?.quantity ?? 1);
  const purchaseReason = offer ? towerShopQuantityReason(offer, quantity, profile) : '该物资已变化，请重新打开申领单。';
  const can = (kind: DemonTowerAction['kind']) => !disabled && !submitting && !profile.battle && Boolean(economy && now < economy.buffsExpiresAt) && profile.availableActions.includes(kind);
  const weapon = profile.weapons.find(item => item.id === weaponId);
  const weaponName = DEMON_TOWER_WEAPONS.find(item => item.id === weaponId)?.name ?? '未选择武器';
  const slots = Math.min(3, Math.floor((weapon?.quality ?? 0) / 3));
  const affixes = weapon?.affixes ?? [];
  const runeReason = !weapon ? '请先选择已拥有的武器。' : slots < 1 ? '武器至少 +3 才能使用符文，可前往成长工坊强化。'
    : !(economy?.runes[rune] ?? 0) ? '该符文暂无库存，可从残魂秘市申领符文箱。'
      : affixes.includes(rune) ? '这件武器已有同名词条，不能重复装配。'
        : replace && !affixes.includes(replace) ? '旧词条已变化，请重新选择。'
          : affixes.length >= slots && !replace ? '当前开放槽位已满，请选择要替换的旧词条。' : null;
  const changeSection = (next: ShopSection) => {
    const search = new URLSearchParams(params); search.set('supply', next); setParams(search);
    setPurchase(null); setRuneConfirmation(null);
  };
  const submit = async (action: DemonTowerAction) => {
    if (inFlight.current || !can(action.kind)) return;
    inFlight.current = true; setSubmitting(true);
    try {
      if (await onAction(action)) { setPurchase(null); setRuneConfirmation(null); setReplace(''); }
    } finally { inFlight.current = false; setSubmitting(false); }
  };
  return <div className={styles.stack}>
    <TowerPanel title="内部物资申领单" detail={<span className={styles.badge}>仅限塔内资源 · 无真实付费</span>}>
      <div className={styles.supplyBalances} aria-label="妖塔资源余额">
        <div><small>灵石 · 物资库</small><strong>{economy ? economy.balance.toLocaleString('zh-CN') : '待同步'}</strong></div>
        <div><small>残魂 · 秘市与培养</small><strong>{profile.materials.soul.toLocaleString('zh-CN')}</strong></div>
        <div><small>办公币 · 全站钱包</small><strong>{balance === null ? '待同步' : balance.toLocaleString('zh-CN')}</strong>{balanceStale ? <small>余额待同步</small> : null}</div>
      </div>
      <p className={styles.muted}>三种资源独立，不互兑、不转赠。物资申领不扣办公币；药品与补给确认后立即使用，不存入背包。</p>
      {economy ? <p className={styles.muted}>今日灵石 {economy.dailyEarned}/{economy.dailyCap}，其中首领 {economy.bossEarned}/{economy.bossCap}（包含在总额内）。自然日 {economy.serviceDate}，日限北京时间 00:00、周限周一 00:00 重置。</p> : <p className={styles.notice}>新物资库正在维护或同步，原有残魂兑换仍可在「残魂秘市」查看。</p>}
      <div className={styles.supplyContext}><span>体力 {profile.stamina}/{profile.staminaMax} · 生命 {profile.hp}/{profile.maxHp}</span><button type="button" className={styles.button} onClick={onExplore}>{profile.battle ? '返回进行中探索' : '返回探索任务'}</button></div>
      {disabled ? <p className={styles.muted}>当前处于提交、待确认、托管或只读状态；可浏览清单，暂不能申领。</p> : profile.battle ? <p className={styles.notice}>当前战斗不接受补给或配装变更，请先返回探索完成或撤离，再来申领。</p> : null}
      {economy && now >= economy.buffsExpiresAt ? <p className={styles.notice}>已进入新的自然日，正在等待服务器刷新限额与增益；同步后再申领。</p> : null}
      <nav className={styles.supplyNav} aria-label="物资申领分类">{SECTIONS.map(item => <button type="button" key={item.id} aria-current={section === item.id ? 'page' : undefined} onClick={() => changeSection(item.id)}>{item.label}</button>)}</nav>
    </TowerPanel>
    {section === 'supplies' || section === 'market' ? <>
      {economy ? <TowerPanel title={section === 'supplies' ? '物资库 · 灵石申领' : '残魂秘市 · 定额申领'}>
        <p className={styles.muted}>{section === 'supplies' ? '补充体力、恢复生命或准备下一场探索。临时药丸每项每日最多 3 份，单项加成最高 +15；北京时间当日结束失效。' : '永久属性丹单维累计最多 +5，单独计入成长，不受自由点洗点影响。精级箱与传统武器箱的物品池、限额及保底分别计算。'}</p>
        <div className={styles.supplyTable} role="table" aria-label={section === 'supplies' ? '灵石物资清单' : '残魂物资清单'}>
          <div className={styles.supplyTableHead} role="row"><span role="columnheader">物资 / 用途</span><span role="columnheader">单价 / 限额</span><span role="columnheader">操作</span></div>
          {economy.offers.filter(item => item.currency === (section === 'supplies' ? 'spirit_stone' : 'soul')).map(item => <div key={item.id} className={styles.supplyTableRow} role="row">
            <div role="cell"><strong>{item.name}</strong><p>{item.description}</p>{!item.available && item.reason ? <p className={styles.supplyReason}>{demonTowerActionReasonMessage(item.reason)}</p> : null}</div>
            <div role="cell"><strong>{item.price} {currencyName(item.currency)}</strong><small>{periodName[item.limitPeriod]} {item.purchased}/{item.limit} · 剩余 {item.remaining}</small></div>
            <div role="cell"><button type="button" className={styles.button} aria-label={`申领${item.name}`} disabled={!can('shop_purchase') || !item.available} onClick={() => setPurchase({ offerId: item.id, quantity: '1' })}>申领</button></div>
          </div>)}
        </div>
      </TowerPanel> : null}
      {section === 'market' ? <DemonTowerLegacyMarket profile={profile} disabled={disabled || submitting} onAction={onAction} /> : null}
    </> : null}
    {section === 'effects' && economy ? <>
      <TowerPanel title="增益登记" detail={<button type="button" className={styles.textButton} onClick={onWorkshop}>前往成长工坊</button>}>
        <p className={styles.muted}>以下加成已计入人物有效属性。临时增益{now >= economy.buffsExpiresAt ? '已到期，等待服务器同步' : `截至 ${towerTime(economy.buffsExpiresAt)}（北京时间）`}；跨日正在进行的战斗保留开战快照，不中途改写。</p>
        <div className={styles.supplyAttributes}>{DEMON_TOWER_ATTRIBUTE_KEYS.map(key => <div key={key}><strong>{catalog.attributes[key]}</strong><span>今日 +{now >= economy.buffsExpiresAt ? 0 : economy.buffs[key]}</span><small>永久 +{economy.permanent[key]}/5</small></div>)}</div>
        <p className={styles.muted}>临时药效用于新开的个人探索与首领战，不进入论道或小队快照；永久丹在各玩法中保留。</p>
      </TowerPanel>
      <TowerPanel title="符文装配">
        <p className={styles.muted}>符文箱每次获得 2 枚符文。+3 / +6 / +9 武器开放 1 / 2 / 3 词条槽，不能重复同名词条。替换消耗 1 枚符文，旧词条不返还。</p>
        <div className={styles.supplyRuneInventory}>{(Object.keys(DEMON_TOWER_AFFIXES) as DemonTowerAffix[]).map(key => <span key={key}>{DEMON_TOWER_AFFIXES[key].name} × {economy.runes[key] ?? 0}</span>)}</div>
        <div className={styles.supplyForm}>
          <label className={styles.field}>选择武器<select aria-label="符文目标武器" value={weaponId} disabled={disabled || submitting} onChange={event => { setWeaponId(event.target.value as typeof weaponId); setReplace(''); setRuneConfirmation(null); }}>{profile.weapons.map(item => <option key={item.id} value={item.id}>{DEMON_TOWER_WEAPONS.find(definition => definition.id === item.id)?.name} +{item.quality}</option>)}</select></label>
          <label className={styles.field}>使用符文<select aria-label="使用符文" value={rune} disabled={disabled || submitting} onChange={event => { setRune(event.target.value as DemonTowerAffix); setRuneConfirmation(null); }}>{(Object.keys(DEMON_TOWER_AFFIXES) as DemonTowerAffix[]).map(key => <option key={key} value={key}>{DEMON_TOWER_AFFIXES[key].name} · 库存 {economy.runes[key] ?? 0}</option>)}</select></label>
          <label className={styles.field}>装配位置<select aria-label="替换旧词条" value={replace} disabled={disabled || submitting} onChange={event => { setReplace(event.target.value as DemonTowerAffix | ''); setRuneConfirmation(null); }}><option value="">使用空槽（{Math.max(0, slots - affixes.length)} 个可用）</option>{affixes.map(key => <option key={key} value={key}>替换 {DEMON_TOWER_AFFIXES[key].name}</option>)}</select></label>
        </div>
        <p>{DEMON_TOWER_AFFIXES[rune].name}：{DEMON_TOWER_AFFIXES[rune].description}</p>
        <p className={styles.muted}>当前词条：{affixes.map(key => DEMON_TOWER_AFFIXES[key].name).join('、') || '无'} · 已开放 {slots} 槽。</p>
        {runeReason ? <p className={styles.muted}>{runeReason}</p> : null}
        <button type="button" className={styles.button} disabled={!can('use_rune') || Boolean(runeReason)} onClick={() => setRuneConfirmation({ kind: 'use_rune', payload: { rune, itemId: weaponId, ...(replace ? { replace } : {}) } })}>检查并装配符文</button>
      </TowerPanel>
    </> : null}
    {section === 'ledger' && economy ? <TowerPanel title="最近收支登记" detail={<span className={styles.muted}>最近 {economy.ledger.length} 条 · 最多保留 30 条</span>}>
      <p className={styles.muted}>记录本次上线后的灵石收支、新物资申领与符文使用。传统残魂兑换、其他残魂来源不补录；这不是全站钱包流水。</p>
      {economy.ledger.length ? <ol className={styles.supplyLedger}>{economy.ledger.map(entry => <li key={entry.id}><div><strong>{entry.description}</strong><small>{towerTime(entry.at)} · 北京时间</small></div><div><strong>{entry.kind === 'rune' ? '消耗符文 ×1' : `${entry.amount > 0 ? '+' : ''}${entry.amount} ${currencyName(entry.currency)}`}</strong>{entry.kind !== 'rune' ? <small>结余 {entry.balance} {currencyName(entry.currency)}</small> : null}</div></li>)}</ol> : <p className={styles.empty}>尚无收支。完成探索或申领后，服务器会在这里留下记录。</p>}
    </TowerPanel> : null}
    {!economy && (section === 'effects' || section === 'ledger') ? <p className={styles.notice}>此项资料暂未开放，请同步角色状态后再查看。</p> : null}
    {purchase ? <TowerModal title="确认物资申领" onClose={() => { if (!submitting) setPurchase(null); }} footer={<div className={styles.actionsRight}><button type="button" className={styles.button} disabled={submitting} onClick={() => setPurchase(null)}>取消</button><button type="button" className={styles.primary} disabled={!can('shop_purchase') || Boolean(purchaseReason)} onClick={() => { if (offer && !purchaseReason) void submit({ kind: 'shop_purchase', payload: { offerId: offer.id, quantity } }); }}>{submitting ? '提交中…' : '确认申领'}</button></div>}>
      <h3>{offer?.name ?? '物资已更新'}</h3><p>{offer?.description}</p>
      <label className={styles.field}>申领数量<input aria-label="申领数量" inputMode="numeric" type="number" min="1" max={offer?.id === 'heal' ? 1 : Math.min(5, offer?.remaining ?? 5)} step="1" value={purchase.quantity} disabled={submitting} onChange={event => setPurchase({ ...purchase, quantity: event.target.value })} /></label>
      {offer ? <><p>单价 {offer.price} {currencyName(offer.currency)} · {periodName[offer.limitPeriod]}剩余 {offer.remaining} 份</p><p className={styles.supplyTotal}>合计：{Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 5 ? offer.price * quantity : '—'} {currencyName(offer.currency)}</p></> : null}
      {purchaseReason ? <p role="alert" className={styles.notice}>{purchaseReason}</p> : null}
      <p className={styles.muted}>确认后即时结算和使用，不囤药，不扣办公币。实际限额、体力容量与余额由服务器再次检查；未确认结果时请用页面「确认上次操作」，不要重复申领。</p>
    </TowerModal> : null}
    {runeConfirmation ? <TowerModal title="确认符文装配" onClose={() => { if (!submitting) setRuneConfirmation(null); }} footer={<div className={styles.actionsRight}><button type="button" className={styles.button} disabled={submitting} onClick={() => setRuneConfirmation(null)}>取消</button><button type="button" className={styles.primary} disabled={!can('use_rune') || Boolean(runeReason)} onClick={() => { if (!runeReason) void submit(runeConfirmation); }}>确认装配</button></div>}>
      <p>向「{weaponName}」装配 {DEMON_TOWER_AFFIXES[runeConfirmation.payload.rune].name}，消耗该符文 ×1。</p>
      <p>{runeConfirmation.payload.replace ? `将替换「${DEMON_TOWER_AFFIXES[runeConfirmation.payload.replace].name}」，旧词条不会返还。` : '使用已开放的空槽，不改变其他词条。'}</p>
      {runeReason ? <p className={styles.notice}>{runeReason}</p> : null}
    </TowerModal> : null}
  </div>;
}
