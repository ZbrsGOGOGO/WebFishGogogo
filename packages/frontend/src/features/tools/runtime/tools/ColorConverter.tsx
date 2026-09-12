// packages/frontend/src/features/tools/runtime/tools/ColorConverter.tsx
// 颜色转换工具：HEX <-> RGB <-> HSL <-> CMYK，带实时色块预览。纯前端。

import { useState, type JSX } from 'react';

import { Button, Input } from '../../../../components/ui';
import styles from './ToolSurface.module.css';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export interface Cmyk {
  c: number;
  m: number;
  y: number;
  k: number;
}

/** 解析 HEX（#RGB / #RRGGBB，可省略 #）为 RGB；非法返回 null。 */
export function hexToRgb(hex: string): Rgb | null {
  let value = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(value)) {
    value = value
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    return null;
  }
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

/** RGB -> HEX（大写，含 #）。分量会被夹到 0-255 并取整。 */
export function rgbToHex({ r, g, b }: Rgb): string {
  const toHex = (n: number): string =>
    clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/** RGB -> HSL。h 为 0-360，s/l 为 0-100（百分比，四舍五入）。 */
export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = clamp(r, 0, 255) / 255;
  const gn = clamp(g, 0, 255) / 255;
  const bn = clamp(b, 0, 255) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rn:
        h = ((gn - bn) / delta) % 6;
        break;
      case gn:
        h = (bn - rn) / delta + 2;
        break;
      default:
        h = (rn - gn) / delta + 4;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }
  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/** HSL -> RGB。h 0-360，s/l 0-100。分量四舍五入到 0-255。 */
export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hn = ((h % 360) + 360) % 360;
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = ln - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  if (hn < 60) {
    [r, g, b] = [c, x, 0];
  } else if (hn < 120) {
    [r, g, b] = [x, c, 0];
  } else if (hn < 180) {
    [r, g, b] = [0, c, x];
  } else if (hn < 240) {
    [r, g, b] = [0, x, c];
  } else if (hn < 300) {
    [r, g, b] = [x, 0, c];
  } else {
    [r, g, b] = [c, 0, x];
  }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/** RGB -> CMYK（百分比，保留 1 位小数）。未应用印刷设备的 ICC 配置。 */
export function rgbToCmyk({ r, g, b }: Rgb): Cmyk {
  const rn = clamp(r, 0, 255) / 255;
  const gn = clamp(g, 0, 255) / 255;
  const bn = clamp(b, 0, 255) / 255;
  const k = 1 - Math.max(rn, gn, bn);
  if (k >= 1) {
    return { c: 0, m: 0, y: 0, k: 100 };
  }
  const percentage = (value: number): number =>
    Math.round(value * 1000) / 10;
  return {
    c: percentage((1 - rn - k) / (1 - k)),
    m: percentage((1 - gn - k) / (1 - k)),
    y: percentage((1 - bn - k) / (1 - k)),
    k: percentage(k),
  };
}

/** CMYK（百分比）-> RGB。输入会被限制到 0-100。 */
export function cmykToRgb({ c, m, y, k }: Cmyk): Rgb {
  const cn = clamp(c, 0, 100) / 100;
  const mn = clamp(m, 0, 100) / 100;
  const yn = clamp(y, 0, 100) / 100;
  const kn = clamp(k, 0, 100) / 100;
  return {
    r: Math.round(255 * (1 - cn) * (1 - kn)),
    g: Math.round(255 * (1 - mn) * (1 - kn)),
    b: Math.round(255 * (1 - yn) * (1 - kn)),
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function formatCmyk(cmyk: Cmyk): Record<keyof Cmyk, string> {
  return {
    c: String(cmyk.c),
    m: String(cmyk.m),
    y: String(cmyk.y),
    k: String(cmyk.k),
  };
}

/** 颜色转换工具组件。以 RGB 为内部权威表示，任一输入更新即同步其余。 */
export default function ColorConverter(): JSX.Element {
  const [rgb, setRgb] = useState<Rgb>({ r: 252, g: 85, b: 49 });
  const [hexInput, setHexInput] = useState('#FC5531');
  const [hexError, setHexError] = useState<string | null>(null);
  const [cmykInput, setCmykInput] = useState<Record<keyof Cmyk, string>>(
    () => formatCmyk(rgbToCmyk({ r: 252, g: 85, b: 49 })),
  );
  const [cmykError, setCmykError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState('');

  const hsl = rgbToHsl(rgb);

  function applyRgb(next: Rgb): void {
    setRgb(next);
    setHexInput(rgbToHex(next));
    setHexError(null);
    setCmykInput(formatCmyk(rgbToCmyk(next)));
    setCmykError(null);
  }

  function applyHex(next: string): void {
    setHexInput(next);
    const parsed = hexToRgb(next);
    if (parsed === null) {
      setHexError('无效的 HEX 颜色');
    } else {
      setHexError(null);
      setRgb(parsed);
      setCmykInput(formatCmyk(rgbToCmyk(parsed)));
      setCmykError(null);
    }
  }

  function setChannel(channel: keyof Rgb, raw: string): void {
    const n = Number(raw);
    if (raw.trim() === '' || Number.isNaN(n)) {
      return;
    }
    const next = { ...rgb, [channel]: clamp(Math.round(n), 0, 255) };
    applyRgb(next);
  }

  function setHslChannel(channel: keyof Hsl, raw: string): void {
    const n = Number(raw);
    if (raw.trim() === '' || Number.isNaN(n)) {
      return;
    }
    const nextHsl: Hsl = { ...hsl, [channel]: n };
    const nextRgb = hslToRgb(nextHsl);
    applyRgb(nextRgb);
  }

  function setCmykChannel(channel: keyof Cmyk, raw: string): void {
    const nextInput = { ...cmykInput, [channel]: raw };
    setCmykInput(nextInput);
    const entries = Object.entries(nextInput) as Array<[keyof Cmyk, string]>;
    const parsed = Object.fromEntries(
      entries.map(([key, value]) => [key, Number(value)]),
    ) as unknown as Cmyk;
    const isValid = entries.every(([, value]) => value.trim() !== '')
      && Object.values(parsed).every((value) => Number.isFinite(value) && value >= 0 && value <= 100);
    if (!isValid) {
      setCmykError('CMYK 分量需要在 0–100 之间');
      return;
    }
    setCmykError(null);
    const nextRgb = cmykToRgb(parsed);
    setRgb(nextRgb);
    setHexInput(rgbToHex(nextRgb));
    setHexError(null);
  }

  const currentHex = rgbToHex(rgb);
  const rgbText = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  const hslText = `hsl(${hsl.h} ${hsl.s}% ${hsl.l}%)`;
  const cmykText = `cmyk(${cmykInput.c}% ${cmykInput.m}% ${cmykInput.y}% ${cmykInput.k}%)`;

  async function copyColor(value: string, label: string): Promise<void> {
    try {
      if (!navigator.clipboard) {
        throw new Error('clipboard unavailable');
      }
      await navigator.clipboard.writeText(value);
      setCopyStatus(`已复制 ${label}`);
    } catch {
      setCopyStatus('复制失败，请手动选择文本复制。');
    }
  }

  return (
    <div className={styles.surface}>
      <div className={styles.colorLayout}>
        <div
          className={styles.colorPreview}
          data-testid="color-swatch"
          aria-label={`颜色预览 ${currentHex}`}
          style={{ background: currentHex }}
        >
          <span className={styles.colorCode}>{currentHex}</span>
          <Input
            label="原生取色器"
            type="color"
            value={currentHex}
            className={styles.colorPicker}
            onChange={(event) => applyHex(event.target.value)}
          />
        </div>

        <div className={styles.surface}>
          <Input
            label="HEX"
            value={hexInput}
            onChange={(event) => applyHex(event.target.value)}
            placeholder="#FC5531"
            error={hexError ?? undefined}
            className={styles.mono}
          />

          <fieldset className={styles.fieldset}>
            <legend>RGB</legend>
            <div className={styles.tripleGrid}>
              <Input
                label="R"
                type="number"
                min={0}
                max={255}
                value={String(rgb.r)}
                onChange={(event) => setChannel('r', event.target.value)}
              />
              <Input
                label="G"
                type="number"
                min={0}
                max={255}
                value={String(rgb.g)}
                onChange={(event) => setChannel('g', event.target.value)}
              />
              <Input
                label="B"
                type="number"
                min={0}
                max={255}
                value={String(rgb.b)}
                onChange={(event) => setChannel('b', event.target.value)}
              />
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>HSL</legend>
            <div className={styles.tripleGrid}>
              <Input
                label="H"
                type="number"
                min={0}
                max={360}
                value={String(hsl.h)}
                onChange={(event) => setHslChannel('h', event.target.value)}
              />
              <Input
                label="S%"
                type="number"
                min={0}
                max={100}
                value={String(hsl.s)}
                onChange={(event) => setHslChannel('s', event.target.value)}
              />
              <Input
                label="L%"
                type="number"
                min={0}
                max={100}
                value={String(hsl.l)}
                onChange={(event) => setHslChannel('l', event.target.value)}
              />
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>CMYK</legend>
            <div className={styles.quadGrid}>
              {(['c', 'm', 'y', 'k'] as const).map((channel) => (
                <Input
                  key={channel}
                  label={`${channel.toUpperCase()}%`}
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={cmykInput[channel]}
                  onChange={(event) => setCmykChannel(channel, event.target.value)}
                />
              ))}
            </div>
            {cmykError && <p className={styles.error} role="alert">{cmykError}</p>}
            <p className={styles.hint}>
              CMYK 为未应用 ICC 色彩配置的近似值，印刷成品请以打样为准。
            </p>
          </fieldset>
        </div>
      </div>

      <div className={styles.actions} aria-label="复制颜色值">
        <Button
          size="sm"
          onClick={() => void copyColor(currentHex, 'HEX')}
        >
          复制 HEX
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void copyColor(rgbText, 'RGB')}
        >
          复制 RGB
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void copyColor(hslText, 'HSL')}
        >
          复制 HSL
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={cmykError !== null}
          onClick={() => void copyColor(cmykText, 'CMYK')}
        >
          复制 CMYK
        </Button>
      </div>
      <p className={styles.copyStatus} role="status" aria-live="polite">
        {copyStatus}
      </p>
    </div>
  );
}
