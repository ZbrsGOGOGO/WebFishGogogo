import { createHash } from 'node:crypto';

import type { OfficeBattleProfession } from '../../../database/entities/office-battle-profile.entity';
import type { OfficeBattleStats } from '../../../database/entities/office-battle-equipment.entity';
import { roundHalfUpFraction } from './office-battle-rules';

const TWO_POW_53 = 1n << 53n;

export interface EngineFighter {
  stats: OfficeBattleStats;
  profession: OfficeBattleProfession;
}

export interface EngineEvent {
  sequence: number;
  round: number;
  actor: 'player' | 'opponent' | 'system';
  kind: 'round_start' | 'attack' | 'critical' | 'heal' | 'dodge' | 'effect' | 'battle_end';
  damage?: number | null;
  healing?: number | null;
  playerHp: number;
  opponentHp: number;
  message: string;
}

export interface EngineResult {
  winner: 'player' | 'opponent';
  playerHp: number;
  opponentHp: number;
  rounds: number;
  events: EngineEvent[];
  randomValuesConsumed: number;
}

export class Sha256CounterRandom {
  private counter = 0n;

  constructor(private readonly seed: Buffer) {
    if (seed.length !== 32) throw new Error('Office Battle seed must be 256 bits');
  }

  static fromHex(seedHex: string): Sha256CounterRandom {
    if (!/^[0-9a-f]{64}$/i.test(seedHex)) throw new Error('Invalid Office Battle seed');
    return new Sha256CounterRandom(Buffer.from(seedHex, 'hex'));
  }

  next53(): bigint {
    const counterBytes = Buffer.alloc(8);
    counterBytes.writeBigUInt64BE(this.counter);
    this.counter += 1n;
    const digest = createHash('sha256').update(this.seed).update(counterBytes).digest();
    return digest.readBigUInt64BE(0) >> 11n;
  }

  calls(): number {
    return Number(this.counter);
  }
}

export function resolveOfficeBattle(
  player: EngineFighter,
  opponent: EngineFighter,
  seedHex: string,
): EngineResult {
  const random = Sha256CounterRandom.fromHex(seedHex);
  const events: EngineEvent[] = [];
  let sequence = 0;
  let playerHp = player.stats.hp;
  let opponentHp = opponent.stats.hp;
  let playerFrozen = false;
  let opponentFrozen = false;
  let playerDamage = 0;
  let opponentDamage = 0;
  let rounds = 0;

  const first: 'player' | 'opponent' =
    player.stats.speed > opponent.stats.speed
      ? 'player'
      : opponent.stats.speed > player.stats.speed
        ? 'opponent'
        : probability(random.next53(), 5000)
          ? 'player'
          : 'opponent';
  const order: Array<'player' | 'opponent'> = [
    first,
    first === 'player' ? 'opponent' : 'player',
  ];

  const add = (
    round: number,
    actor: EngineEvent['actor'],
    kind: EngineEvent['kind'],
    message: string,
    damage?: number,
    healing?: number,
  ) => {
    events.push({
      sequence: (sequence += 1),
      round,
      actor,
      kind,
      ...(damage === undefined ? {} : { damage }),
      ...(healing === undefined ? {} : { healing }),
      playerHp,
      opponentHp,
      message,
    });
  };

  for (let round = 1; round <= 10 && playerHp > 0 && opponentHp > 0; round += 1) {
    rounds = round;
    add(round, 'system', 'round_start', `第 ${round} 回合开始`);
    for (const actor of order) {
      if (playerHp <= 0 || opponentHp <= 0) break;
      const isPlayer = actor === 'player';
      const attacker = isPlayer ? player : opponent;
      const defender = isPlayer ? opponent : player;
      const isFrozen = isPlayer ? playerFrozen : opponentFrozen;
      if (isFrozen) {
        if (isPlayer) playerFrozen = false;
        else opponentFrozen = false;
        add(round, actor, 'dodge', '需求范围被冻结，本次计划行动被跳过');
        continue;
      }

      const skill = probability(random.next53(), Math.min(4500, 2200 + 20 * attacker.stats.luck));
      let freezesTarget = false;
      if (skill && attacker.profession === 'product') {
        freezesTarget = probability(random.next53(), 4800);
      }
      const critical = probability(random.next53(), Math.min(4000, 1000 + 40 * attacker.stats.luck));
      const wave = random.next53();
      const textIndex = Number(random.next53() % 3n);

      if (skill && attacker.profession === 'hr') {
        const nominal = Math.max(4, Number(roundHalfUpFraction(BigInt(attacker.stats.hp * 10), 100n)));
        const current = isPlayer ? playerHp : opponentHp;
        const actual = Math.min(nominal, attacker.stats.hp - current);
        if (isPlayer) playerHp += actual;
        else opponentHp += actual;
        add(round, actor, 'heal', `团队激励恢复了 ${actual} 点活力`, undefined, actual);
      }

      const targetHp = isPlayer ? opponentHp : playerHp;
      const damage = calculateDamage(attacker, defender, round, targetHp, skill, critical, wave);
      const effectiveDamage = Math.min(targetHp, damage);
      if (isPlayer) {
        opponentHp -= effectiveDamage;
        playerDamage += effectiveDamage;
      } else {
        playerHp -= effectiveDamage;
        opponentDamage += effectiveDamage;
      }
      const actions = ['发起一次精准推进', '用专业方案突破阻力', '完成了一次关键交付'];
      add(
        round,
        actor,
        critical ? 'critical' : 'attack',
        `${actions[textIndex]}，造成 ${effectiveDamage} 点影响${skill ? '（技能触发）' : ''}`,
        effectiveDamage,
      );
      if (freezesTarget && (isPlayer ? opponentHp : playerHp) > 0) {
        if (isPlayer) opponentFrozen = true;
        else playerFrozen = true;
        add(round, actor, 'effect', '需求冻结已生效：目标将跳过下一次计划行动');
      }
    }
  }

  let winner: 'player' | 'opponent';
  if (playerHp <= 0 || opponentHp <= 0) {
    winner = opponentHp <= 0 ? 'player' : 'opponent';
  } else {
    const playerRatio = BigInt(playerHp) * BigInt(opponent.stats.hp);
    const opponentRatio = BigInt(opponentHp) * BigInt(player.stats.hp);
    if (playerRatio !== opponentRatio) winner = playerRatio > opponentRatio ? 'player' : 'opponent';
    else if (playerDamage !== opponentDamage) winner = playerDamage > opponentDamage ? 'player' : 'opponent';
    else if (player.stats.speed !== opponent.stats.speed) winner = player.stats.speed > opponent.stats.speed ? 'player' : 'opponent';
    else winner = probability(random.next53(), 5000) ? 'player' : 'opponent';
  }
  add(rounds, 'system', 'battle_end', winner === 'player' ? '项目切磋完成：你取得了胜利' : '项目切磋完成：对手取得了胜利');
  return { winner, playerHp, opponentHp, rounds, events, randomValuesConsumed: random.calls() };
}

export function calculateDamage(
  attacker: EngineFighter,
  defender: EngineFighter,
  round: number,
  defenderCurrentHp: number,
  skill: boolean,
  critical: boolean,
  waveRandom53: bigint,
): number {
  let numerator = BigInt(attacker.stats.attack) * (95n * TWO_POW_53 + 10n * waveRandom53);
  let denominator = 100n * TWO_POW_53;
  if (critical) {
    numerator *= 155n;
    denominator *= 100n;
  }
  if (skill) {
    const skillPercent =
      attacker.profession === 'developer'
        ? 155
        : attacker.profession === 'product'
          ? 108
          : attacker.profession === 'qa'
            ? 138
            : attacker.profession === 'sales'
              ? defenderCurrentHp * 2 <= defender.stats.hp
                ? 185
                : 125
              : 105;
    numerator *= BigInt(skillPercent);
    denominator *= 100n;
  }
  const deadlinePercent = round <= 7 ? 100 : 100 + (round - 7) * 18;
  numerator *= BigInt(deadlinePercent);
  denominator *= 100n;
  const defensePercent = skill && attacker.profession === 'qa' ? 35n : 70n;
  const combinedNumerator = numerator * 100n - BigInt(defender.stats.defense) * defensePercent * denominator;
  const combinedDenominator = denominator * 100n;
  return Math.max(1, Number(roundHalfUpFraction(combinedNumerator, combinedDenominator)));
}

function probability(random53: bigint, basisPoints: number): boolean {
  return random53 * 10_000n < BigInt(basisPoints) * TWO_POW_53;
}
