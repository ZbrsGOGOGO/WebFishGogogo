// packages/frontend/src/features/tools/runtime/tools/tools.test.ts
// 开发者类工具（T3）纯转换逻辑的单元 + 属性测试。

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { formatJson, minifyJson, validateJson } from './JsonFormatter';
import { timestampToDate, dateToTimestamp, formatLocal } from './TimestampConverter';
import { runRegex } from './RegexTester';
import { convert, convertTemperature, roundResult } from './UnitConverter';
import { hexToRgb, rgbToHex, rgbToHsl, hslToRgb, type Rgb } from './ColorConverter';

describe('JsonFormatter', () => {
  it('格式化使用 2 空格缩进', () => {
    const r = formatJson('{"a":1}');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe('{\n  "a": 1\n}');
    }
  });

  it('压缩移除多余空白', () => {
    const r = minifyJson('{\n  "a": 1\n}');
    expect(r).toEqual({ ok: true, value: '{"a":1}' });
  });

  it('非法 JSON 返回错误', () => {
    expect(formatJson('{bad}').ok).toBe(false);
    expect(validateJson('{bad}').ok).toBe(false);
  });

  it('空输入返回错误', () => {
    expect(formatJson('   ').ok).toBe(false);
  });

  it('属性：合法 JSON 格式化后仍能解析回等价对象', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const text = JSON.stringify(value);
        const r = formatJson(text);
        expect(r.ok).toBe(true);
        if (r.ok) {
          expect(JSON.parse(r.value)).toEqual(value);
        }
      }),
    );
  });
});

describe('TimestampConverter', () => {
  it('秒时间戳转日期', () => {
    const r = timestampToDate('0', 'seconds');
    expect(r.ok).toBe(true);
  });

  it('非整数返回错误', () => {
    expect(timestampToDate('1.5', 'seconds').ok).toBe(false);
    expect(timestampToDate('abc', 'milliseconds').ok).toBe(false);
  });

  it('无法解析日期返回错误', () => {
    expect(dateToTimestamp('not a date').ok).toBe(false);
  });

  it('属性：日期 -> 毫秒时间戳 -> 日期 往返一致', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4102444800000 }), (ms) => {
        const date = new Date(ms);
        const formatted = formatLocal(date);
        const back = timestampToDate(String(ms), 'milliseconds');
        expect(back.ok).toBe(true);
        if (back.ok) {
          // 秒级精度往返（formatLocal 精确到秒）。
          expect(back.value).toBe(formatted);
        }
      }),
    );
  });
});

describe('RegexTester', () => {
  it('全局匹配返回所有匹配', () => {
    const r = runRegex('\\d+', 'g', 'a1b22c333');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.matches.map((m) => m.match)).toEqual(['1', '22', '333']);
    }
  });

  it('捕获分组', () => {
    const r = runRegex('(\\w)(\\d)', '', 'a1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.matches[0].groups).toEqual(['a', '1']);
    }
  });

  it('非法正则返回错误', () => {
    expect(runRegex('(', 'g', 'x').ok).toBe(false);
  });

  it('零宽全局匹配不会死循环', () => {
    const r = runRegex('', 'g', 'abc');
    // 空 pattern 被视为错误
    expect(r.ok).toBe(false);
    const r2 = runRegex('a*', 'g', 'aa');
    expect(r2.ok).toBe(true);
  });
});

describe('UnitConverter', () => {
  it('长度换算 km -> m', () => {
    expect(convert(1, 'km', 'm', 'length')).toBe(1000);
  });

  it('重量换算 kg -> g', () => {
    expect(convert(2, 'kg', 'g', 'weight')).toBe(2000);
  });

  it('温度 C -> F', () => {
    expect(convertTemperature(100, 'C', 'F')).toBe(212);
    expect(convertTemperature(32, 'F', 'C')).toBe(0);
  });

  it('非有限数值返回 null', () => {
    expect(convert(NaN, 'm', 'km', 'length')).toBeNull();
  });

  it('属性：线性换算往返一致', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), (v) => {
        const toKm = convert(v, 'm', 'km', 'length');
        expect(toKm).not.toBeNull();
        const back = convert(toKm as number, 'km', 'm', 'length');
        expect(roundResult(back as number)).toBeCloseTo(roundResult(v), 3);
      }),
    );
  });
});

describe('ColorConverter', () => {
  it('HEX -> RGB', () => {
    expect(hexToRgb('#FF0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb('#f00')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('RGB -> HEX', () => {
    expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe('#FF0000');
  });

  it('非法 HEX 返回 null', () => {
    expect(hexToRgb('#zzz')).toBeNull();
    expect(hexToRgb('12345')).toBeNull();
  });

  it('已知 HSL 值', () => {
    expect(rgbToHsl({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, l: 50 });
  });

  it('属性：HEX -> RGB -> HEX 往返一致', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        (r, g, b) => {
          const rgb: Rgb = { r, g, b };
          const hex = rgbToHex(rgb);
          expect(hexToRgb(hex)).toEqual(rgb);
        },
      ),
    );
  });

  it('属性：RGB -> HSL -> RGB 近似还原', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        (r, g, b) => {
          const back = hslToRgb(rgbToHsl({ r, g, b }));
          // HSL 以整数百分比表示，往返本质有损：1% 亮度≈2.55/255，
          // 叠加饱和度与最终取整，误差上界约 5。
          expect(Math.abs(back.r - r)).toBeLessThanOrEqual(5);
          expect(Math.abs(back.g - g)).toBeLessThanOrEqual(5);
          expect(Math.abs(back.b - b)).toBeLessThanOrEqual(5);
        },
      ),
    );
  });
});
