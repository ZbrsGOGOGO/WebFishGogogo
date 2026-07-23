// packages/frontend/src/features/tools/runtime/tools/logic.test.ts
// T2 工具纯逻辑的单元测试 + 少量属性测试。

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import {
  addDays,
  applyOperator,
  convertCurrency,
  daysBetween,
  formatDuration,
  msUntilOffWork,
  parseHhMm,
  parseIsoDate,
  trimNumber,
} from './logic';

describe('formatDuration', () => {
  it('格式化为 HH:MM:SS', () => {
    expect(formatDuration(0)).toBe('00:00:00');
    expect(formatDuration(1000)).toBe('00:00:01');
    expect(formatDuration(61_000)).toBe('00:01:01');
    expect(formatDuration(3_661_000)).toBe('01:01:01');
  });

  it('负数按 0 处理', () => {
    expect(formatDuration(-5000)).toBe('00:00:00');
  });
});

describe('parseHhMm', () => {
  it('解析有效时间', () => {
    expect(parseHhMm('18:00')).toEqual({ hours: 18, minutes: 0 });
    expect(parseHhMm('09:30')).toEqual({ hours: 9, minutes: 30 });
  });

  it('拒绝越界与非法输入', () => {
    expect(parseHhMm('24:00')).toBeNull();
    expect(parseHhMm('12:60')).toBeNull();
    expect(parseHhMm('abc')).toBeNull();
  });
});

describe('msUntilOffWork', () => {
  it('当日尚未到点：返回当天剩余毫秒', () => {
    const now = new Date(2024, 0, 1, 17, 0, 0);
    expect(msUntilOffWork('18:00', now)).toBe(60 * 60 * 1000);
  });

  it('当日已过点：指向次日', () => {
    const now = new Date(2024, 0, 1, 19, 0, 0);
    expect(msUntilOffWork('18:00', now)).toBe(23 * 60 * 60 * 1000);
  });

  it('非法时间返回 null', () => {
    expect(msUntilOffWork('bad', new Date())).toBeNull();
  });
});

describe('daysBetween', () => {
  it('计算整天差', () => {
    expect(daysBetween('2024-01-01', '2024-01-10')).toBe(9);
    expect(daysBetween('2024-01-10', '2024-01-01')).toBe(-9);
    expect(daysBetween('2024-01-01', '2024-01-01')).toBe(0);
  });

  it('跨闰年 2 月正确', () => {
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
  });

  it('非法日期返回 null', () => {
    expect(daysBetween('2024-02-31', '2024-03-01')).toBeNull();
    expect(daysBetween('bad', '2024-01-01')).toBeNull();
  });
});

describe('addDays', () => {
  it('加减天数', () => {
    expect(addDays('2024-01-01', 9)).toBe('2024-01-10');
    expect(addDays('2024-01-10', -9)).toBe('2024-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('非法输入返回 null', () => {
    expect(addDays('bad', 1)).toBeNull();
  });

  // 属性：addDays 与 daysBetween 互逆。
  it('addDays / daysBetween 互逆（属性）', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date(1970, 0, 1), max: new Date(2100, 0, 1) }),
        fc.integer({ min: -3650, max: 3650 }),
        (date, delta) => {
          const iso = parseIsoDate(
            `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
          );
          if (iso === null) return;
          const base = `${iso.getFullYear()}-${String(iso.getMonth() + 1).padStart(2, '0')}-${String(iso.getDate()).padStart(2, '0')}`;
          const shifted = addDays(base, delta);
          expect(shifted).not.toBeNull();
          expect(daysBetween(base, shifted as string)).toBe(delta);
        },
      ),
    );
  });
});

describe('applyOperator', () => {
  it('四则运算', () => {
    expect(applyOperator(2, 3, '+')).toBe(5);
    expect(applyOperator(5, 3, '-')).toBe(2);
    expect(applyOperator(4, 3, '×')).toBe(12);
    expect(applyOperator(9, 3, '÷')).toBe(3);
  });

  it('除以 0 返回 null', () => {
    expect(applyOperator(1, 0, '÷')).toBeNull();
  });
});

describe('convertCurrency', () => {
  it('按汇率换算', () => {
    expect(convertCurrency(100, 0.14)).toBeCloseTo(14);
    expect(convertCurrency(0, 5)).toBe(0);
  });

  it('非法输入返回 null', () => {
    expect(convertCurrency(NaN, 1)).toBeNull();
    expect(convertCurrency(100, -1)).toBeNull();
  });

  // 属性：换算再反向换算应还原（rate > 0）。
  it('正反换算可还原（属性）', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1e6, noNaN: true }),
        fc.double({ min: 0.0001, max: 1000, noNaN: true }),
        (amount, rate) => {
          const forward = convertCurrency(amount, rate);
          expect(forward).not.toBeNull();
          const back = convertCurrency(forward as number, 1 / rate);
          expect(back).not.toBeNull();
          expect(back as number).toBeCloseTo(amount, 4);
        },
      ),
    );
  });
});

describe('trimNumber', () => {
  it('去除浮点噪声', () => {
    expect(trimNumber(0.1 + 0.2)).toBe('0.3');
    expect(trimNumber(3)).toBe('3');
  });
});
