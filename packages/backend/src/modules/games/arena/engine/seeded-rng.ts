import type { ArenaSeed } from './types';

const UINT32_RANGE = 0x1_0000_0000;

/**
 * 将字符串/数字 seed 稳定映射为无符号 32 位整数。
 *
 * 使用 FNV-1a 和 Math.imul，结果不依赖系统时间、平台字节序或 Math.random。
 */
export function normalizeArenaSeed(seed: ArenaSeed): number {
  if (typeof seed === 'number' && !Number.isFinite(seed)) {
    throw new RangeError('Arena seed must be a finite number or string');
  }

  const source =
    typeof seed === 'number' ? `number:${String(seed)}` : `string:${seed}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * 小型、可复现的 Mulberry32 随机数生成器。
 *
 * 同一 seed 与相同调用顺序必然生成完全相同的 [0, 1) 序列。
 */
export class ArenaSeededRandom {
  readonly normalizedSeed: number;
  private state: number;

  constructor(seed: ArenaSeed) {
    this.normalizedSeed = normalizeArenaSeed(seed);
    this.state = this.normalizedSeed;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  }

  nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError('maxExclusive must be a positive integer');
    }
    return Math.floor(this.next() * maxExclusive);
  }
}

export function createArenaSeededRandom(seed: ArenaSeed): ArenaSeededRandom {
  return new ArenaSeededRandom(seed);
}
