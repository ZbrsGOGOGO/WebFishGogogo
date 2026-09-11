import type { JSX } from 'react';
import { DEMON_TOWER_CATALOG, DEMON_TOWER_EXPANSION_RULES, DEMON_TOWER_FLOORS,
  demonTowerExperienceRequirement, type DemonTowerProfileView } from '@stealth-reader/shared';
import { TowerPanel } from './TowerElements';
import styles from './DemonTower.module.css';
import guide from './DemonTowerGuide.module.css';

const dimensions = [
  ['力量', '参与所有普通攻击，也是重兵的主维。选用其他主维武器时，力量仍提供基础补充。'],
  ['速度', '每回合影响行动顺序，并提高直接攻击命中率。先手不等于凭速度差额外行动；连击由命格、武器或技能触发。'],
  ['敏捷', '影响直接攻击闪避，也是轻兵主维。个人探索基础闪避每点增加 0.15 个百分点，叠加其他效果后最多 60%。'],
  ['防御', '降低可防御的直接伤害，并增加生命上限。基础减伤按防御 × 0.45 计算，再处理穿透与其他效果；并非所有伤害都能抵消。'],
  ['幸运', '影响法器主维、部分技能、直接攻击暴击与普通掉落触发。基础暴击为 5% + 幸运 × 0.1 个百分点，叠加后最多 75%；不暗改公示宝箱概率。'],
] as const;

/** One reference to the running rules, not a second progression system. */
export function DemonTowerGuide({ profile }: { profile: DemonTowerProfileView }): JSX.Element {
  const rules = DEMON_TOWER_CATALOG.rules;
  const levels = [...new Set([profile.level, 16, 31, 46, 61, 120])].sort((a, b) => a - b);
  return <TowerPanel title="养成手册" detail={<span className={styles.badge}>本站运行规则</span>}>
    <p className={styles.muted}>先探索积累等级，再选主维和配装，最后强化、升星与突破。补给与兑换统一在「物资申领」，角色属性与形象统一在「人物档案」；旧装备、经验和已解锁进度保留。</p>
    <ol className={guide.route} aria-label="养成路线">
      <li><strong>探索与恢复</strong><span>普通探索 {rules.exploreCost} 体力；每 {rules.staminaRestoreMs / 60000} 分钟恢复 1 点，最多 {rules.staminaCap} 点。普通探索没有每日 10 次硬上限，托管使用同一规则。</span></li>
      <li><strong>等级与心性</strong><span>每级获得 2 点自由属性与 2 点轮转基础属性。先天命格跟随境界解锁，永久丹独立于洗点；满级 {rules.maxLevel}。</span></li>
      <li><strong>品质与星级</strong><span>重复物品转存品质经验，达到境界后兑现。使用装备可累积熟练度，每星所需为当前星级 × 15；最高 5 星。{DEMON_TOWER_EXPANSION_RULES.starCharmSoul} 残魂升星符成功率依次 80% / 55% / 30% / 12%，失败不降星。</span></li>
      <li><strong>突破与协作</strong><span>突破需要境界、品质、精魄和矿石，不重置星级。世界首领击败后还需完成通道建设；个人等级和全服进度都满足才能进入下一层。</span></li>
    </ol>
    <details className={guide.details}><summary>五维如何影响个人探索战斗</summary><dl className={guide.definitions}>{dimensions.map(([name, text]) => <div key={name}><dt>{name}</dt><dd>{text}</dd></div>)}</dl><p className={styles.muted}>以上为个人探索的基础规则；武器被动、命格、词条和敌人机制会进一步修正。论道使用独立技能树，不把个人临时药效带入切磋。综合战力是配装参考分，不承诺胜率或实际秒伤。</p></details>
    <details className={guide.details}><summary>升级需求与九层门槛</summary>
      <p className={styles.muted}>当前升级需求沿用本站曲线，不套用旧原型的每日 500 经验上限，也不把高等级需求突然提高几十倍。</p>
      <div className={guide.levels} aria-label="升级所需经验">{levels.map(level => <div key={level}><span>Lv.{level}</span><strong>{level === rules.maxLevel ? '已达满级' : `${demonTowerExperienceRequirement(level).toLocaleString('zh-CN')} 经验`}</strong></div>)}</div>
      <ol className={guide.floors}>{DEMON_TOWER_FLOORS.map(floor => <li key={floor.floor}><span>{floor.floor} 层 · {floor.name}</span><strong>Lv.{floor.requiredLevel}</strong></li>)}</ol>
      <p className={styles.muted}>楼层使用真实共享血池和实际建设贡献，不模拟在线人数或伤害；无需等待虚构的人数门槛。</p>
    </details>
    <details className={guide.details}><summary>货币、保底与结算边界</summary>
      <p>办公币是全站钱包，灵石和残魂是塔内绑定资源，三者不互兑、不转赠。办公币只在明确标价并确认的专区扣除；既有灵石物资与残魂兑换不扣办公币。</p>
      <p>普通掉落、传统武器箱、每周精级箱和阶梯宝箱各有独立规则。传统武器箱每第 10 箱至少灵级；新宝箱不消耗这项保底。技能残页与新增技能碎片分别保留，领取前可查看具体选择和成本。</p>
      <p className={styles.muted}>每日限额与探索统计按北京时间 00:00 分日，周限周一 00:00 重置。操作结果不确定时先确认原操作，不重复提交；正在进行的战斗沿用开战快照，不在跨日时重写属性。</p>
    </details>
  </TowerPanel>;
}
