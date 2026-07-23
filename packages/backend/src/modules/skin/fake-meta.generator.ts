// backend/src/modules/skin/fake-meta.generator.ts
import { FakeMeta } from '@stealth-reader/shared';

/**
 * 由文档 id 派生稳定的假元数据（同一 docId 永远得到相同结果）。
 *
 * Preconditions:
 *   - docId 为非空 UUID 字符串
 * Postconditions:
 *   - 结果对同一 docId 幂等（多次调用相等）
 *   - views >= likes >= 0 且 views >= favorites >= 0
 *   - tags.length ∈ [1, 5]
 *   - 无副作用
 *
 * 支撑 design.md Property 4（假元数据幂等性）。
 */

/** 候选标签池（自有合规、技术博客风格），用于伪装元数据。 */
const TAG_POOL: readonly string[] = [
  'Java',
  'Python',
  'JavaScript',
  'TypeScript',
  'Go',
  'Rust',
  '算法',
  '数据结构',
  '后端',
  '前端',
  '数据库',
  '架构设计',
  '云原生',
  '性能优化',
  '面试',
  '源码分析',
  '设计模式',
  'Linux',
  '网络',
  '机器学习',
];

/** 候选"专栏"名池。 */
const COLUMN_POOL: readonly string[] = [
  '技术成长笔记',
  '每日一题',
  '源码解析专栏',
  '架构演进之路',
  '从入门到精通',
  '踩坑实录',
];

/**
 * FNV-1a 32 位字符串哈希：把 docId 稳定地映射为一个无符号 32 位整数种子。
 * 纯函数，无副作用。
 */
export function hashSeed(input: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i) & 0xff;
    // FNV prime 乘法，使用 Math.imul 保证 32 位溢出行为一致
    hash = Math.imul(hash, 0x01000193);
  }
  // 转为无符号 32 位
  return hash >>> 0;
}

/**
 * mulberry32 确定性 PRNG 工厂：给定种子返回一个每次调用产出 [0, 1) 浮点数的函数。
 * 同一种子产出固定序列，故整体生成是确定性的。
 */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 生成 [min, max] 闭区间内的整数。 */
function intInRange(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function generateFakeMeta(docId: string): FakeMeta {
  if (typeof docId !== 'string' || docId.length === 0) {
    throw new Error('generateFakeMeta: docId 必须为非空字符串');
  }

  const seed = hashSeed(docId);
  const rng = createRng(seed);

  // views 作为基准量，likes/favorites 均由 views 派生，天然满足 views >= likes、views >= favorites。
  const views = intInRange(rng, 100, 500_000);
  const likes = Math.floor(views * (rng() * 0.2)); // 0% ~ 20% of views
  const favorites = Math.floor(views * (rng() * 0.1)); // 0% ~ 10% of views

  // 标签：数量 ∈ [1, 5]，从池中确定性无重复抽取。
  const tagCount = intInRange(rng, 1, 5);
  const available = [...TAG_POOL];
  const tags: string[] = [];
  for (let i = 0; i < tagCount && available.length > 0; i += 1) {
    const pick = intInRange(rng, 0, available.length - 1);
    tags.push(available.splice(pick, 1)[0]);
  }

  const columnName = COLUMN_POOL[intInRange(rng, 0, COLUMN_POOL.length - 1)];

  // publishedAt：从一个固定基准时间点确定性回溯若干天，保证同一 docId 稳定。
  const BASE_EPOCH_MS = Date.UTC(2024, 0, 1, 0, 0, 0);
  const daysAgo = intInRange(rng, 0, 720);
  const publishedAt = new Date(
    BASE_EPOCH_MS - daysAgo * 24 * 60 * 60 * 1000,
  ).toISOString();

  return {
    views,
    likes,
    favorites,
    tags,
    columnName,
    publishedAt,
  };
}
