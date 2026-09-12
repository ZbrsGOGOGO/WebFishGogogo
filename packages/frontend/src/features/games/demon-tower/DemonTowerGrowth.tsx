import { useState, type JSX } from 'react';
import { DEMON_TOWER_INNATES, type DemonTowerAction, type DemonTowerAttribute, type DemonTowerProfileView } from '@stealth-reader/shared';
import { TowerModal, TowerPanel } from './TowerElements';
import styles from './DemonTower.module.css';

const CHOICES: Record<DemonTowerAttribute, string> = { STR: '直面挑战 · 力量', SPD: '抢先行动 · 速度', AGI: '灵活应对 · 敏捷', DEF: '稳住阵脚 · 防御', LUCK: '相信机缘 · 幸运' };

export function DemonTowerGrowth({ profile, disabled, onAction }: {
  profile: DemonTowerProfileView; disabled: boolean; onAction: (action: DemonTowerAction) => Promise<boolean>;
}): JSX.Element | null {
  const [choice, setChoice] = useState<DemonTowerAttribute | null>(null), [confirm, setConfirm] = useState(false);
  const growth = profile.growth;
  if (!growth) return null;
  const first = DEMON_TOWER_INNATES.find(item => item.attribute === choice);
  const canChoose = !disabled && !growth.chosenAttribute && profile.availableActions.includes('choose_innate');
  return <TowerPanel title="心性与永久命格" detail={<span className={styles.badge}>{growth.innates.length} / 8 已觉醒</span>}>
    <p className={styles.muted}>命格是免费永久加成，不占主动或被动技能槽，也不会在洗点时丢失。每15级境界补齐一个，最高8个。</p>
    {growth.pendingLegacyBattle ? <p className={styles.notice}>当前是更新前开始的战斗，会按原规则结束；完成或撤离后即可选择心性、启用新成长。</p> : null}
    {!growth.chosenAttribute ? <>
      <fieldset className={styles.panel} style={{ margin: '16px 0', padding: 16 }} disabled={!canChoose}>
        <legend>面对一段未知的旅程，你更倾向怎样出发？</legend>
        <div className={styles.stack}>{(Object.keys(CHOICES) as DemonTowerAttribute[]).map(attribute => <label className={styles.buttonRow} key={attribute}>
          <input type="radio" name="tower-innate-choice" value={attribute} checked={choice === attribute} onChange={() => setChoice(attribute)} />
          <span>{CHOICES[attribute]}</span>
        </label>)}</div>
      </fieldset>
      {first ? <p className={styles.notice}>首个命格：{first.name}。{first.description} 当前等级可一次觉醒 {growth.unlockedCount} 个；后续按固定顺序补齐。心性只能确定一次。</p> : <p className={styles.muted}>请选择一个偏好，不会替你默认选择。老角色同样免费，高等级角色会补齐应有命格。</p>}
      <button type="button" className={styles.primary} disabled={!canChoose || !choice} onClick={() => setConfirm(true)}>确认我的心性</button>
      {!canChoose && !growth.pendingLegacyBattle ? <p className={styles.muted}>请先完成当前战斗、停止委托或等待资料同步，暂时不会提交选择。</p> : null}
    </> : <p className={styles.notice}>你的心性：{CHOICES[growth.chosenAttribute]}。{growth.nextInnateLevel ? `下一命格在 Lv${growth.nextInnateLevel} 自动觉醒。` : '八种命格已经全部觉醒。'}</p>}
    <div className={styles.itemGrid} style={{ marginTop: 16 }}>{DEMON_TOWER_INNATES.map(innate => {
      const unlocked = growth.innates.includes(innate.id);
      return <article key={innate.id} className={styles.item} data-owned={unlocked}><h3>{innate.name} <span className={styles.badge}>{unlocked ? '已觉醒' : '待觉醒'}</span></h3><p className={styles.itemDescription}>{innate.description}</p></article>;
    })}</div>
    {confirm && choice && first && !growth.chosenAttribute ? <TowerModal title="确定永久心性" onClose={() => setConfirm(false)} footer={<div className={styles.actionsRight}>
      <button type="button" className={styles.button} disabled={disabled} onClick={() => setConfirm(false)}>再想一想</button>
      <button type="button" className={styles.primary} disabled={!canChoose} onClick={() => { void onAction({ kind: 'choose_innate', payload: { attribute: choice } }).then(ok => { if (ok) setConfirm(false); }); }}>免费觉醒{first.name}</button>
    </div>}><p>将以「{first.name}」作为首个命格。此选择永久保留，不能再次改选；后续仍能逐步获得全部8种命格。</p><p>不扣办公币或材料，不送额外治疗。由服务器确认后生效，断线重试不会重复领取。</p></TowerModal> : null}
  </TowerPanel>;
}

export function DemonTowerLootGuide({ profile }: { profile: DemonTowerProfileView }): JSX.Element {
  const growth = profile.growth;
  return <TowerPanel title="免费收集与培养" detail={<span className={styles.badge}>等级资格由服务器判定</span>}>
    <p>武器分为“获取等级”和“装备等级”：可以提前收藏，达标后再装备。新手赠送五武器、旧存档已拥有物品保留可使用资格，卡片会明确标记。</p>
    <p className={styles.muted}>星级与品质 +N 分开成长：每次普通攻击行动，主手和已装法器各增加1熟练度，多段不重复。每星需当前星级×15，升星清零；150次普攻可从1星到5星。每多一星，作为主手时的普通攻击/连击伤害增加10%；不会放大法器掉率。</p>
    <p className={styles.muted}>{profile.expansion ? '免费扩展已启用：重复物品自动转品质经验，达到境界自动兑现；旧副本完整转存，已有更高强化不回退。残魂秘市需要逐次确认，不自动购买。熟练度升星必成，免费升星符概率失败也不降星。' : '升星免费、不会降星；+N仍可用副本或探索材料必定成功强化，不会自动替你消费副本或购买物品。'}</p>
    <details><summary className={styles.textButton}>掉落概率与保底怎么算？</summary>
      <p>先判定是否掉物品，再选择武器/技能，再按稀有度与单品权重抽取。武器精/灵/仙/神基础权重40/30/20/10；技能凡/精/灵/仙同权重。先排除当前等级不能获得的物品，再重新归一。</p>
      <p>图鉴“常规条件概率”指已确定该种类成功掉落、没有保底干预时的单品概率，不是每次探索的出货率。每4次可掉落探索结算保证一件物品，并在抽到的稀有度内优先补未收录。</p>
      <p>Lv16起连续20次未得灵以上，下次保底；Lv31起连续50次未得仙以上，下次保底。未达等级不计数，符合资格的保底一定有合法物品；首领挑战不计入。幸运影响普通是否出货，不绕过获取等级。</p>
    </details>
    {growth ? <div className={styles.resourceList} style={{ marginTop: 16 }}>
      <div className={styles.resource}><strong>{growth.eligible.ling ? `${growth.misses.ling} / 20` : 'Lv16开启'}</strong><small>灵以上连续未得 · 达20后下次保底</small></div>
      <div className={styles.resource}><strong>{growth.eligible.xian ? `${growth.misses.xian} / 50` : 'Lv31开启'}</strong><small>仙以上连续未得 · 达50后下次保底</small></div>
    </div> : null}
  </TowerPanel>;
}
