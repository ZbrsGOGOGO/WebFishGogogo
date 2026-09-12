import type { JSX } from 'react';
import {
  DEMON_TOWER_CATALOG,
  DEMON_TOWER_ATTRIBUTE_KEYS,
  demonTowerItemRarity,
  demonTowerQualityLimit,
  type DemonTowerOwnedSkill,
  type DemonTowerOwnedWeapon,
  type DemonTowerSkillDefinition,
  type DemonTowerWeaponDefinition,
} from '@stealth-reader/shared';

import styles from './DemonTower.module.css';

type WeaponItem = { kind: 'weapon'; definition: DemonTowerWeaponDefinition; owned: DemonTowerOwnedWeapon };
type SkillItem = { kind: 'skill'; definition: DemonTowerSkillDefinition; owned: DemonTowerOwnedSkill };
export type DemonTowerProgressItem = WeaponItem | SkillItem;

export interface DemonTowerUpgradePreviewValue {
  formula: string;
  quality: string;
  star: string | null;
  proficiency: string | null;
}

const number = (value: number): string => Number(value.toFixed(2)).toString();
const multiplier = (value: number): string => `×${number(value)}`;
const percent = (value: number): string => `${number(value * 100)}%`;
const weaponScale = (quality: number): number => 1 + quality * 0.15;
const skillScale = (quality: number, star: number): number => (1 + quality * 0.12) * (1 + (star - 1) * 0.08);

function weaponTrait(definition: DemonTowerWeaponDefinition, quality: number): string {
  const scale = weaponScale(quality);
  switch (definition.id) {
    case 'w1': return `高防目标伤害+${percent(0.15 * scale)}`;
    case 'w2': return `命中震慑率${percent(0.2 * scale)}`;
    case 'w3': return `蓄力伤害+${percent(0.4 * scale)}`;
    case 'w4': return `实际伤害吸血${percent(Math.min(0.6, 0.2 * scale))}`;
    case 'w5': return '先手首击必暴规则固定';
    case 'w6': return `连击率${percent(0.3 * scale)}，追击${number(0.5 * scale)}倍敏捷`;
    case 'w7': return `闪避反击${number(scale)}倍敏捷`;
    case 'w8': return `专属常驻敏捷+${Math.round(15 * scale)}`;
    case 'w9': return `先手判定速度+${number(15 * scale)}`;
    case 'w10': return '横扫全体不衰减规则固定';
    case 'w11': return `武器自身穿透${percent(Math.min(0.75, 0.25 * scale))}`;
    case 'w12': return `其他目标溅射${percent(0.4 * scale)}（主目标50%追击固定）`;
    case 'w13': return `直接攻击减伤${percent(Math.min(0.6, 0.2 * scale))}`;
    case 'w14': return `实际损血反震${percent(Math.min(0.75, 0.25 * scale))}`;
    case 'w15': return `开场护盾${number(1.5 * scale)}倍防御`;
    case 'w16': return `直接攻击免伤率${percent(0.1 * scale)}`;
    case 'w17': return `敌方命中/闪避各-${percent(0.15 * scale)}`;
    case 'w18': return `每2回合召灵${number(0.5 * scale)}倍幸运伤害`;
    case 'w19': return `修炼经验+${percent(0.3 * scale)}`;
    case 'w20': return `专属常驻幸运+${Math.round(15 * scale)}，探索物品率+${percent(0.1 * scale)}（计入总概率后上限70%）`;
  }
}

function skillEffect(definition: DemonTowerSkillDefinition, quality: number, star: number): string {
  const scale = skillScale(quality, star);
  switch (definition.id) {
    case 's1': return `治疗（20+2×幸运）${multiplier(scale)}`;
    case 's2': return `伤害${number(2 * scale)}倍力量`;
    case 's3': return `护盾${number((quality >= 6 ? 2 : 1.5) * scale)}倍防御`;
    case 's4': return `力量+${Math.round(10 * scale)}，持3回合`;
    case 's5': return `每段${number(0.6 * scale)}倍速度，共3段`;
    case 's6': return `首击${number(0.5 * scale)}倍敏捷，每回合毒伤${number(0.3 * scale)}倍敏捷×2`;
    case 's7': {
      const critical = Math.min(0.5, 0.25 * scale);
      return `暴击+${percent(critical)}，闪避+${percent(critical * 0.8)}`;
    }
    case 's8': return `常驻幸运+${Math.round(8 * scale)}，宝匣经验/矿石${multiplier(1 + 0.2 * scale)}`;
    case 's9': return `每回合恢复${number(0.5 * scale)}倍幸运生命`;
    case 's10': return `普通目标${number(1.5 * scale)}倍力量，首领/精英再×1.5`;
    case 's11': return `常驻速度+${Math.round(8 * scale)}`;
    case 's12': return `战斗外回血速度+${percent(0.3 * scale)}`;
    case 's13': return `生命至少补至${percent(Math.min(0.9, 0.5 * scale))}，致命复起50%固定`;
    case 's14': return `五属性各+${Math.round(5 * scale)}，持2回合`;
    case 's15': return `未压血时（1—4）倍幸运${multiplier(scale)}（压血率8%固定）`;
    case 's16': return `伤害${number(3 * scale)}倍力量，破防${percent(Math.min(0.6, 0.3 * scale))}`;
  }
}

function cooldown(definition: DemonTowerSkillDefinition, quality: number): number {
  return definition.cooldown === 0 ? 0 : Math.max(1, definition.cooldown - Math.floor(quality / 3));
}

function qualityCap(item: DemonTowerProgressItem): number {
  const rarity = item.kind === 'weapon' ? demonTowerItemRarity(item.definition.rarity, item.owned.breakthrough) : item.definition.rarity;
  return demonTowerQualityLimit(rarity, 120);
}

/** Mirrors the server's battle formulas for explanation only; it never mutates or submits player state. */
export function demonTowerUpgradePreview(item: DemonTowerProgressItem, showStars: boolean): DemonTowerUpgradePreviewValue {
  const quality = item.owned.quality;
  const star = item.owned.star ?? 1;
  const nextQuality = quality < qualityCap(item) ? quality + 1 : null;
  let qualityText: string;
  let starText: string | null = null;
  let proficiencyText: string | null = null;

  if (item.kind === 'weapon') {
    const attribute = DEMON_TOWER_CATALOG.attributes[item.definition.attribute];
    const breakthrough = Math.max(0, Math.floor(item.owned.breakthrough ?? 0));
    const adjacentKey = DEMON_TOWER_ATTRIBUTE_KEYS[(DEMON_TOWER_ATTRIBUTE_KEYS.indexOf(item.definition.attribute) + 1) % DEMON_TOWER_ATTRIBUTE_KEYS.length];
    const adjacent = DEMON_TOWER_CATALOG.attributes[adjacentKey];
    const attributeAt = (value: number) => Math.round(item.definition.baseBonus * (1 + value * 0.1)) + breakthrough * 3;
    const currentAttribute = attributeAt(quality);
    const breakthroughText = breakthrough ? `；突破另使${adjacent}+${breakthrough * 4}` : '';
    if (nextQuality === null) {
      qualityText = `品质 +${quality}已达上限：装备后${attribute}+${currentAttribute}${breakthroughText}；${weaponTrait(item.definition, quality)}。`;
    } else {
      const nextAttribute = attributeAt(nextQuality);
      const rounding = currentAttribute === nextAttribute ? '；本阶主维因整数取整暂不变' : '';
      qualityText = `品质 +${quality}→+${nextQuality}：装备后${attribute}+${currentAttribute}→+${nextAttribute}${rounding}${breakthroughText}；${weaponTrait(item.definition, quality)}→${weaponTrait(item.definition, nextQuality)}。`;
    }
    if (showStars) {
      const currentMultiplier = 1 + (star - 1) * 0.1;
      starText = star >= 5
        ? `5星已满：作为主手时普攻星级倍率${multiplier(currentMultiplier)}。`
        : `星级 ${star}→${star + 1}：作为主手时普攻星级倍率${multiplier(currentMultiplier)}→${multiplier(currentMultiplier + 0.1)}。`;
      const trigger = item.definition.type === '法器' ? '作为主手或装入辅助位' : '作为主手';
      proficiencyText = star >= 5
        ? '熟练度：5星已满，不再累积。'
        : `熟练度 ${item.owned.favor ?? 0}/${star * 15}：${trigger}时，每次普通攻击行动+1；多段、群攻仍只记1。达${star * 15}自动免费升${star + 1}星并清零，品质保留。`;
    }
  } else {
    const currentEffect = skillEffect(item.definition, quality, star);
    if (nextQuality === null) qualityText = `品质 +${quality}已达上限：${currentEffect}。`;
    else {
      const currentCooldown = cooldown(item.definition, quality), nextCooldown = cooldown(item.definition, nextQuality);
      const cooldownText = currentCooldown === 0 ? '' : `；有效冷却${currentCooldown}→${nextCooldown}回合`;
      qualityText = `品质 +${quality}→+${nextQuality}：${currentEffect}→${skillEffect(item.definition, nextQuality, star)}${cooldownText}。`;
    }
    if (showStars) {
      starText = star >= 5
        ? `5星已满：受星级影响的数值效果系数${multiplier(1.32)}，与品质系数相乘。`
        : `星级 ${star}→${star + 1}：${currentEffect}→${skillEffect(item.definition, quality, star + 1)}（星级系数${multiplier(1 + (star - 1) * 0.08)}→${multiplier(1 + star * 0.08)}）。`;
      const trigger = item.definition.kind === 'active' ? '每次实际施放+1' : '装入被动槽后，每个存活回合结束+1';
      proficiencyText = star >= 5
        ? '熟练度：5星已满，不再累积。'
        : `熟练度 ${item.owned.favor ?? 0}/${star * 15}：${trigger}。达${star * 15}自动免费升${star + 1}星并清零，品质保留。`;
    }
  }
  const formula = item.kind === 'weapon'
    ? `主维=round(${item.definition.baseBonus}×[1+0.1×品质])+3×突破，相邻第二主维=4×突破；有缩放的专属特性按[1+0.15×品质]，固定规则会明确标注。`
    : `数值效果=基础效果×[1+0.12×品质]${showStars ? '×[1+0.08×(星级-1)]' : ''}；非0冷却每+3品质减1回合，最低1。`;
  return { formula, quality: qualityText, star: starText, proficiency: proficiencyText };
}

export function DemonTowerUpgradePreview({ item, showStars, labelledBy }: { item: DemonTowerProgressItem; showStars: boolean; labelledBy?: string }): JSX.Element {
  const preview = demonTowerUpgradePreview(item, showStars);
  return <div className={styles.notice} aria-label={labelledBy ?? '服务端实际成长数值'}>
    <p><strong>实际生效数值</strong>（下次新开战斗/结算采用）</p>
    <p>{preview.formula}</p>
    <p>{preview.quality}</p>
    {preview.star ? <p>{preview.star}</p> : null}
    {preview.proficiency ? <p>{preview.proficiency}</p> : null}
  </div>;
}
