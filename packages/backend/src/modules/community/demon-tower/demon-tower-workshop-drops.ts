import { createHmac } from 'node:crypto';
import type { TowerWorkshopState } from '@stealth-reader/shared';

const MAX_RESOURCE = 1_000_000;
const GREEN_MATERIALS = ['qw', 'sh', 'py'] as const;
const SPIRIT_MATERIALS = ['ct', 'bl', 'yw', 'yl', 'yh', 'sl', 'wj'] as const;
const HIGH_MATERIALS = ['xlg', 'yhs', 'kong', 'zs'] as const;

export type DemonTowerWorkshopDrops = Record<string, number>;

function stream(seed: string, scope: string): () => number {
  let draw = 0;
  return () => createHmac('sha256', seed)
    .update(`workshop-material-v2:${scope}:${draw++}`)
    .digest()
    .readUInt32BE(0) / 0x1_0000_0000;
}

function quantity(roll: () => number, min: number, max: number): number {
  return min + Math.floor(roll() * (max - min + 1));
}

function pick<T>(roll: () => number, values: readonly T[]): T {
  return values[Math.floor(roll() * values.length)];
}

function addMaterial(workshop: TowerWorkshopState, drops: DemonTowerWorkshopDrops, id: string, requested: number): void {
  const current = workshop.materials[id] ?? 0;
  const granted = Math.max(0, Math.min(MAX_RESOURCE - current, Math.max(0, Math.round(requested))));
  workshop.materials[id] = current + granted;
  if (granted > 0) drops[id] = (drops[id] ?? 0) + granted;
}

/**
 * Server-owned workshop drops. This stream never advances the encounter RNG,
 * so adding or rebalancing materials cannot change the exploration outcome.
 */
export function grantDemonTowerExplorationWorkshopDrops(
  workshop: TowerWorkshopState,
  seed: string,
  encounterCounter: number,
  floor: number,
  level: number,
  progressionEligible: boolean,
): DemonTowerWorkshopDrops {
  const roll = stream(seed, `explore:${encounterCounter}`), drops: DemonTowerWorkshopDrops = {};
  addMaterial(workshop, drops, 'ht', quantity(roll, 2, 6));
  addMaterial(workshop, drops, 'mt', quantity(roll, 1, 3));

  if (level >= 16 && roll() < .5) {
    const materialRoll = roll();
    addMaterial(workshop, drops, materialRoll < .5 ? 'ct' : materialRoll < .75 ? 'lm' : 'yh', quantity(roll, 1, materialRoll < .5 ? 4 : 3));
    if (roll() < .35) addMaterial(workshop, drops, 'cuijl', quantity(roll, 1, 3));
  }

  // The owner update makes the three green-equipment staples renewable during
  // ordinary exploration rather than forcing players back to early bosses.
  if (progressionEligible && level >= 16 && roll() < .45) addMaterial(workshop, drops, pick(roll, GREEN_MATERIALS), quantity(roll, 1, 3));

  if (level >= 31 && roll() < .4) {
    addMaterial(workshop, drops, pick(roll, SPIRIT_MATERIALS), quantity(roll, 1, 3));
    if (roll() < .2) addMaterial(workshop, drops, 'ningz', quantity(roll, 1, 2));
  }

  // Gate scarce materials by the selected tower floor, not by an account level
  // that could otherwise farm them indefinitely on the first floor.
  if (progressionEligible && floor >= 7 && roll() < .3) addMaterial(workshop, drops, pick(roll, HIGH_MATERIALS), quantity(roll, 1, 2));
  return drops;
}

export function grantDemonTowerBossWorkshopDrops(
  workshop: TowerWorkshopState,
  seed: string,
  serviceDate: string,
  attempt: number,
  floor: number,
): DemonTowerWorkshopDrops {
  const roll = stream(seed, `boss:${serviceDate}:${attempt}:${floor}`), drops: DemonTowerWorkshopDrops = {};
  const pool = floor >= 6 ? SPIRIT_MATERIALS : floor >= 3 ? SPIRIT_MATERIALS.slice(0, 5) : ['ht', 'qw', 'lm', 'sh', 'py'] as const;
  const min = floor >= 8 || floor < 3 ? 2 : 1, max = floor >= 6 && floor < 8 ? 3 : 4;
  addMaterial(workshop, drops, pick(roll, pool), quantity(roll, min, max));
  addMaterial(workshop, drops, 'mt', quantity(roll, 1, 3));
  if (floor >= 7 && roll() < .3) addMaterial(workshop, drops, pick(roll, HIGH_MATERIALS), quantity(roll, 1, 2));
  return drops;
}
