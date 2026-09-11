import { useRef, useState, type JSX } from 'react';
import { DEMON_TOWER_CATALOG, DEMON_TOWER_PROVISIONS_RULES, DEMON_TOWER_WEAPONS,
  demonTowerLootPool, type DemonTowerAction, type DemonTowerOfficeOfferView,
  type DemonTowerProfileView } from '@stealth-reader/shared';
import { demonTowerActionReasonMessage } from '../../../api/community-demon-tower';
import { towerProvisionsCurrentDate } from './DemonTowerExplorationStats';
import { TowerModal, TowerPanel, towerTime } from './TowerElements';
import type { DemonTowerActionHandler } from './useDemonTower';
import styles from './DemonTower.module.css';
import office from './DemonTowerOfficeSupplies.module.css';

const RULES = DEMON_TOWER_PROVISIONS_RULES;
const period = { day: '每日', week: '每周', lifetime: '累计' };
type Quote = { action: DemonTowerAction; title: string; description: string; cost: number; version: number; serviceDate: string };
const offerDescription = (offer: DemonTowerOfficeOfferView, profile: DemonTowerProfileView): string => {
  if (offer.offer === 'stamina') return `立即恢复 ${RULES.staminaAmount} 体力，最多 ${profile.staminaMax}，空间不足不扣款；不能存为药品。`;
  if (offer.offer === 'pass') return `获得探索符 ×1，库存最多 ${RULES.passCap}；每日最多手动使用 ${RULES.passUseDaily} 次，不扣体力。托管不购买、不使用。`;
  if (offer.offer === 'star') return `当前主手「${DEMON_TOWER_WEAPONS.find(item => item.id === profile.loadout.mainHand)?.name ?? profile.loadout.mainHand}」确定提升 1 星，最高 5 星；保留品质，新星熟练度从 0 开始。每周限 1 次。免费熟练度与残魂升星渠道保留。`;
  return `${offer.attribute ? DEMON_TOWER_CATALOG.attributes[offer.attribute] : '指定属性'}永久 +${RULES.permanentAmount}，与残魂永久丹及宝箱共用每维 +5 的累计上限，不受洗点影响。`;
};

/** Server prices are consented to explicitly and invalidated by any changed profile version. */
export function DemonTowerOfficeSupplies({ profile, disabled, balance, balanceStale, now, onAction, onExplore, onWorkshop }: {
  profile: DemonTowerProfileView; disabled: boolean; balance: number | null; balanceStale: boolean; now: number;
  onAction: DemonTowerActionHandler; onExplore: () => void; onWorkshop: () => void;
}): JSX.Element {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const value = profile.provisions;
  const currentDate = Boolean(value && towerProvisionsCurrentDate(value.serviceDate, now));
  const unavailable = !value ? '当前补给资料尚未同步。' : !currentDate ? '已跨日，等待服务器同步价格与额度。'
    : disabled || submitting ? '当前托管、提交或待确认，暂不能兑换。' : profile.battle ? '先完成或撤离当前战斗，再来兑换。' : null;
  const can = (kind: DemonTowerAction['kind'], cost = 0) => !unavailable && profile.availableActions.includes(kind)
    && (cost === 0 || !balanceStale && balance !== null && balance >= cost);
  const ask = (action: DemonTowerAction, title: string, description: string, cost = 0) => { if (value) setQuote({ action, title, description, cost, version: profile.version, serviceDate: value.serviceDate }); };
  const askOffer = (item: DemonTowerOfficeOfferView) => {
    if (item.offer === 'permanent' && !item.attribute) return;
    const action: DemonTowerAction = item.offer === 'permanent'
      ? { kind: 'office_purchase', payload: { offer: 'permanent', attribute: item.attribute! } }
      : { kind: 'office_purchase', payload: { offer: item.offer } };
    ask(action, item.name, offerDescription(item, profile), item.price);
  };
  const changed = Boolean(quote && (quote.version !== profile.version || quote.serviceDate !== value?.serviceDate || !towerProvisionsCurrentDate(quote.serviceDate, now)));
  const submit = async () => {
    if (!quote || changed || inFlight.current || !can(quote.action.kind, quote.cost)) return;
    inFlight.current = true; setSubmitting(true);
    try { if (await onAction(quote.action, { expectedVersion: quote.version, serviceDate: quote.serviceDate })) setQuote(null); }
    finally { inFlight.current = false; setSubmitting(false); }
  };
  const groups = demonTowerLootPool('weapon', profile.level).map(group => ({ ...group, items: group.items.filter(item => item.requiredLevel <= profile.level) })).filter(group => group.items.length > 0);
  const totalWeight = groups.reduce((sum, group) => sum + group.weight, 0);
  const weaponPool = groups.flatMap(group => group.items.map(item => ({ ...item,
    percent: 100 * group.weight / totalWeight * item.weight / group.items.reduce((sum, entry) => sum + entry.weight, 0),
  })));
  return <div className={styles.stack}>
    <TowerPanel title="办公币补给" detail={<span className={styles.badge}>使用全站钱包 · 无真实付费</span>}>
      <p className={styles.notice}>本专区确认后会扣除办公币。当前余额：{balance === null ? '待同步' : balance.toLocaleString('zh-CN')}{balanceStale ? '（待同步，暂不能扣款）' : ''}。原有灵石和残魂渠道保留，三种资源不互兑。</p>
      {unavailable ? <p className={styles.muted}>{unavailable}</p> : null}
      <p className={styles.muted}>每次只申领一份，服务器统一检查真实余额、容量和额度。日限北京时间 00:00、周限周一 00:00 重置；永久上限不重置。</p>
      {value ? <div className={styles.supplyTable} role="table" aria-label="办公币补给清单"><div className={styles.supplyTableHead} role="row"><span role="columnheader">物资 / 用途</span><span role="columnheader">价格 / 限额</span><span role="columnheader">操作</span></div>
        {value.offers.map(item => <div className={styles.supplyTableRow} role="row" key={`${item.offer}-${item.attribute ?? ''}`}>
          <div role="cell"><strong>{item.name}</strong><p>{offerDescription(item, profile)}</p>{item.reason ? <p className={styles.supplyReason}>{demonTowerActionReasonMessage(item.reason)}</p> : null}</div>
          <div role="cell"><strong>{item.price} 办公币</strong><small>{period[item.limitPeriod]} {item.purchased}/{item.limit} · 剩余 {item.remaining}</small></div>
          <div role="cell"><button type="button" className={styles.button} aria-label={`兑换${item.name}`} disabled={!can('office_purchase', item.price) || !item.available || item.offer === 'permanent' && !item.attribute} onClick={() => askOffer(item)}>兑换</button></div>
        </div>)}
      </div> : null}
    </TowerPanel>
    {value ? <>
      <TowerPanel title="阶梯宝箱" detail={<span className={styles.badge}>今日 {value.chest.opened}/{value.chest.limit}</span>}>
        <p>今日价格依次 {Array.from({ length: RULES.chestDaily }, (_, index) => RULES.chestBaseCost + index * RULES.chestStepCost).join(' / ')} 办公币，每日最多 {RULES.chestDaily} 箱。明日重置价格；不返办公币，不影响传统武器箱保底。</p>
        <ul className={office.odds} aria-label="阶梯宝箱公开概率"><li><strong>{RULES.chestWeights.materials}%</strong><span>绑定材料 ×{RULES.chestMaterials}</span></li><li><strong>{RULES.chestWeights.fragments}%</strong><span>技能碎片 ×{RULES.chestFragments}</span></li><li><strong>{RULES.chestWeights.weapon}%</strong><span>符合获取等级的武器</span></li><li><strong>{RULES.chestWeights.permanent}%</strong><span>未满上限的永久属性 +1</span></li></ul>
        <details className={office.details}><summary>查看奖励池与替代规则</summary><p>材料在玄铁砂与线索中等概率选择。武器先按本站普通掉落的稀有度权重，再按单品权重选择；同名物品转品质经验。当前等级没有可掉武器时，该分支改为材料。永久属性在仍有额度的维度中等概率 +1；全部满额时改为材料。幸运不暗改这些概率。</p>
          {weaponPool.length ? <ul className={office.pool}>{weaponPool.map(item => <li key={item.id}><span>{item.rarity} · {item.name}</span><span>武器分支内 {item.percent.toFixed(2)}%</span></li>)}</ul> : <p className={styles.muted}>当前等级尚无普通武器获取池，武器分支暂替换为绑定材料。</p>}
          <p className={styles.muted}>以上单品比例是进入 20% 武器分支后的条件概率；占整箱概率再乘以 20%。任一可能奖励超过资源容量时，服务器拒绝开箱且不扣款。</p>
        </details>
        {value.chest.reason ? <p className={styles.muted}>{demonTowerActionReasonMessage(value.chest.reason)}</p> : null}
        <button className={styles.button} type="button" disabled={value.chest.nextCost === null || !value.chest.available || !can('progressive_chest', value.chest.nextCost ?? 0)} onClick={() => { if (value.chest.nextCost !== null) ask({ kind: 'progressive_chest', payload: {} }, '开启阶梯宝箱', `这是今日第 ${value.chest.opened + 1} 箱。按页面公示概率随机获得一项绑定奖励，不返办公币；旧箱保底不变。`, value.chest.nextCost); }}>{value.chest.nextCost === null ? '今日宝箱已领完' : `检查开箱 · ${value.chest.nextCost} 办公币`}</button>
      </TowerPanel>
      <TowerPanel title="技能碎片自选" detail={<span className={styles.badge}>碎片 {value.fragments} · 旧残页 {profile.expansion?.skillPages ?? 0}</span>}>
        <p className={styles.muted}>新增碎片与原有残页独立，不折损旧资产。碎片可自选当前已达获取与装备等级、尚未学会的技能；凡 / 精 / 灵 / 仙分别需 3 / 6 / 12 / 30 枚，不直接解锁越级技能。原有 30 残页自选仙级技能仍在「残魂秘市」。</p>
        <div className={office.skillList}>{value.skills.map(item => <div key={item.skillId}><div><strong>{item.rarity} · {item.name}</strong><small>Lv.{item.requiredLevel} · {item.owned ? '已习得' : `${item.cost ?? '—'} 碎片`}</small>{item.reason && !item.owned ? <small>{demonTowerActionReasonMessage(item.reason)}</small> : null}</div><button type="button" className={styles.button} aria-label={`自选${item.name}`} disabled={!item.available || !can('fragment_select')} onClick={() => ask({ kind: 'fragment_select', payload: { skillId: item.skillId } }, `自选${item.name}`, `消耗 ${item.cost} 枚技能碎片，确定习得「${item.name}」。不扣办公币、不消耗旧残页。`)}>自选</button></div>)}</div>
      </TowerPanel>
      <TowerPanel title="补给操作记录" detail={<button className={styles.textButton} type="button" onClick={onWorkshop}>查看养成手册与工坊</button>}>
        <p className={styles.muted}>显示最近 {RULES.historyLimit} 条新增补给操作；办公币真实流水同时写入全站钱包。不是全部钱包历史，不展示他人余额。</p>
        {value.history.length ? <ol className={styles.supplyLedger}>{value.history.map(item => <li key={item.id}><div><strong>{item.description}</strong><small>{towerTime(item.at)} · 北京时间</small></div><strong>{item.cost > 0 ? `−${item.cost} 办公币` : '绑定资源操作'}</strong></li>)}</ol> : <p className={styles.empty}>还没有补给记录。</p>}
        <button type="button" className={styles.button} onClick={onExplore}>返回探索任务</button>
      </TowerPanel>
    </> : null}
    {quote ? <TowerModal title="确认补给操作" onClose={() => { if (!submitting) setQuote(null); }} footer={<div className={styles.actionsRight}><button className={styles.button} type="button" disabled={submitting} onClick={() => setQuote(null)}>取消</button><button className={styles.primary} type="button" disabled={changed || !can(quote.action.kind, quote.cost)} onClick={() => void submit()}>{submitting ? '提交中…' : quote.cost ? `确认扣除 ${quote.cost} 办公币` : '确认兑换'}</button></div>}>
      <h3>{quote.title}</h3><p>{quote.description}</p><p className={styles.supplyTotal}>{quote.cost ? `本次扣除：${quote.cost} 办公币` : '不扣办公币'}</p>
      {changed ? <p role="alert" className={styles.notice}>角色、配装或价格已经变化，请取消后重新确认。本次不会按变化后的价格自动扣款。</p> : unavailable ? <p role="alert" className={styles.notice}>{unavailable}</p> : quote.cost && (balanceStale || balance === null || balance < quote.cost) ? <p role="alert" className={styles.notice}>钱包余额不足或待同步，本次不能扣款。</p> : null}
      <p className={styles.muted}>服务器同一事务保存扣款、奖励、限额和操作编号；结果未确认时先确认原操作，不能重复开箱或扣款。</p>
    </TowerModal> : null}
  </div>;
}
