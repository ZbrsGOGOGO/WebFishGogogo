// packages/frontend/src/features/tools/runtime/tools/logic.ts
// T2 时间/计算类工具的纯逻辑函数。抽离出来便于单元测试，且不依赖 React。

/** 两位补零。 */
export function pad2(n: number): string {
  return String(Math.floor(Math.abs(n))).padStart(2, '0');
}

/**
 * 将毫秒时长格式化为 HH:MM:SS（超过 24 小时继续累加小时）。
 * 负数按 0 处理。
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

/**
 * 计算从 `now` 到今天（或明天）指定 HH:MM 下班时刻的剩余毫秒。
 * 若今日目标时刻已过，则指向次日同一时刻。
 * time 形如 "18:00"，非法输入返回 null。
 */
export function msUntilOffWork(time: string, now: Date): number | null {
  const parsed = parseHhMm(time);
  if (parsed === null) {
    return null;
  }
  const target = new Date(now);
  target.setHours(parsed.hours, parsed.minutes, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime() - now.getTime();
}

/** 解析 "HH:MM"；越界或格式错误返回 null。 */
export function parseHhMm(
  time: string,
): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return { hours, minutes };
}

/**
 * 计算两个 ISO 日期字符串（YYYY-MM-DD）之间的整天差（end - start）。
 * 以本地日期的午夜为基准，避免夏令时/时区偏移带来的小数天。
 * 任一参数非法返回 null。
 */
export function daysBetween(startIso: string, endIso: string): number | null {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (start === null || end === null) {
    return null;
  }
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

/**
 * 在给定 ISO 日期上加/减 N 天，返回新的 ISO 日期字符串（YYYY-MM-DD）。
 * 日期非法返回 null。
 */
export function addDays(iso: string, delta: number): string | null {
  const date = parseIsoDate(iso);
  if (date === null || !Number.isFinite(delta)) {
    return null;
  }
  date.setDate(date.getDate() + Math.trunc(delta));
  return toIsoDate(date);
}

/** 将 "YYYY-MM-DD" 解析为本地午夜 Date；非法返回 null。 */
export function parseIsoDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  // 校验回环（例如 2024-02-31 会被规范化，需拒绝）。
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/** 将 Date 格式化为本地 "YYYY-MM-DD"。 */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${year}-${month}-${day}`;
}

/** 基础四则运算符。 */
export type Operator = '+' | '-' | '×' | '÷';

/**
 * 对两个操作数执行一次四则运算。
 * 除以 0 返回 null（由调用方转为错误展示）。
 */
export function applyOperator(
  a: number,
  b: number,
  op: Operator,
): number | null {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '×':
      return a * b;
    case '÷':
      return b === 0 ? null : a / b;
    default:
      return null;
  }
}

/**
 * 汇率换算：amount 单位为 `from` 货币，rate 表示「1 单位 from = rate 单位 to」。
 * 非有限数或负汇率返回 null。
 */
export function convertCurrency(amount: number, rate: number): number | null {
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate < 0) {
    return null;
  }
  return amount * rate;
}

/** 将浮点结果收敛为最多 `digits` 位小数并去除末尾 0 与浮点噪声。 */
export function trimNumber(value: number, digits = 10): string {
  if (!Number.isFinite(value)) {
    return 'Error';
  }
  const fixed = Number(value.toFixed(digits));
  return String(fixed);
}
