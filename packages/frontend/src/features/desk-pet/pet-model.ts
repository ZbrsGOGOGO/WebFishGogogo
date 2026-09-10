export const PET_STYLES = [
  { id: 'sticker', label: '原图贴纸', description: '保留颜色，轻轻漂浮' },
  { id: 'pixel', label: '像素搭子', description: '32 × 32 像素缩绘' },
  { id: 'ink', label: '黑白纸片', description: '低调灰阶，融入工位' },
  { id: 'photo', label: '拍立得', description: '把喜欢的照片摆上桌' },
] as const;
export type PetStyle = typeof PET_STYLES[number]['id'];
export type PetPreset = 'fish' | 'cat' | 'sprout';
export interface PetPreferences {
  version: 1;
  enabled: boolean;
  collapsed: boolean;
  name: string;
  style: PetStyle;
  preset: PetPreset;
  image: string | null;
  pixelImage: string | null;
  size: number;
  quiet: boolean;
  sleeping: boolean;
  focusMode: boolean;
  position: { x: number; y: number } | null;
}
export const DEFAULT_PET: PetPreferences = {
  version: 1, enabled: false, collapsed: false, name: '摸摸', style: 'sticker', preset: 'fish',
  image: null, pixelImage: null, size: 96, quiet: false, sleeping: false, focusMode: true, position: null,
};
export const petStorageKey = (owner: string): string => `webfish:desk-pet:v1:${encodeURIComponent(owner)}`;
const png = (value: unknown): value is string => typeof value === 'string' && value.length <= 400_000 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
const bounded = (value: unknown, fallback: number, min: number, max: number): number => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
export function parsePet(raw: string | null): PetPreferences {
  try {
    if (!raw || raw.length > 810_000) return { ...DEFAULT_PET };
    const p = JSON.parse(raw) as Partial<PetPreferences>;
    if (!p || p.version !== 1) return { ...DEFAULT_PET };
    const image = png(p.image) && png(p.pixelImage) ? p.image : null;
    return {
      version: 1,
      enabled: p.enabled === true, collapsed: p.collapsed === true,
      name: typeof p.name === 'string' ? p.name.slice(0, 16) : DEFAULT_PET.name,
      style: PET_STYLES.some(s => s.id === p.style) ? p.style! : 'sticker',
      preset: ['fish', 'cat', 'sprout'].includes(p.preset ?? '') ? p.preset! : 'fish',
      image, pixelImage: image ? p.pixelImage! : null,
      size: bounded(p.size, 96, 64, 144), quiet: p.quiet === true, sleeping: p.sleeping === true,
      focusMode: p.focusMode !== false,
      position: p.position && Number.isFinite(p.position.x) && Number.isFinite(p.position.y)
        ? { x: bounded(p.position.x, 0, 0, 1), y: bounded(p.position.y, 1, 0, 1) } : null,
    };
  } catch { return { ...DEFAULT_PET }; }
}

/** Header check before decoding: reject executable/vector formats and oversized rasters. Output is static PNG only. */
export function rasterDimensions(bytes: Uint8Array): { width: number; height: number; mime: string } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, length: number): string => String.fromCharCode(...bytes.slice(offset, offset + length));
  let width = 0, height = 0, mime = '';
  if (bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n) && ascii(12, 4) === 'IHDR') {
    width = v.getUint32(16); height = v.getUint32(20); mime = 'image/png';
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    mime = 'image/jpeg';
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i++] !== 255) break;
      while (bytes[i] === 255) i++;
      const marker = bytes[i++];
      if (marker === 0xda || marker === 0xd9 || i + 2 > bytes.length) break;
      const length = v.getUint16(i);
      if (length < 2 || i + length > bytes.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length >= 8) {
        height = v.getUint16(i + 3); width = v.getUint16(i + 5); break;
      }
      i += length;
    }
  } else if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    mime = 'image/webp';
    const kind = ascii(12, 4);
    if (kind === 'VP8X') {
      if (bytes[20] & 2) throw new Error('暂不支持动画图片，请选择静态图片。');
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (kind === 'VP8L' && bytes[20] === 0x2f) {
      width = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8);
      height = 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 15) << 10);
    } else if (kind === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) {
      width = v.getUint16(26, true) & 0x3fff; height = v.getUint16(28, true) & 0x3fff;
    }
  }
  if (!width || !height || !mime) throw new Error('无法识别图片，请使用 PNG、JPG 或静态 WebP。');
  if (width > 4096 || height > 4096 || width * height > 16_000_000) throw new Error('图片尺寸太大，请缩小至 4096 × 4096 以内（不超过 1600 万像素）。');
  return { width, height, mime };
}

export async function preparePetImage(file: File): Promise<{ image: string; pixelImage: string }> {
  if (!file.size || file.size > 4 * 1024 * 1024) throw new Error('请选择不超过 4 MB 的图片。');
  const header = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
  const { mime } = rasterDimensions(header);
  if (file.type && file.type !== mime) throw new Error('图片格式与文件类型不符，请重新导出为 PNG 或 JPG。');
  // Re-encoding strips metadata; never store the original file, filename, SVG or arbitrary URL.
  const url = URL.createObjectURL(file);
  try {
    const source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      const finish = (error?: Error): void => {
        clearTimeout(timer); img.onload = null; img.onerror = null;
        if (error) { img.src = ''; reject(error); } else resolve(img);
      };
      const timer = setTimeout(() => finish(new Error('图片解码超时，请换一张较小的图片。')), 10_000);
      img.onload = () => finish(); img.onerror = () => finish(new Error('图片已损坏或浏览器无法解码。')); img.src = url;
    });
    if (!source.naturalWidth || !source.naturalHeight || source.naturalWidth > 4096 || source.naturalHeight > 4096 || source.naturalWidth * source.naturalHeight > 16_000_000) throw new Error('图片尺寸不受支持。');
    const draw = (size: number): string => {
      const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('此浏览器无法处理图片。');
      const scale = Math.min(size / source.naturalWidth, size / source.naturalHeight);
      const w = source.naturalWidth * scale, h = source.naturalHeight * scale;
      ctx.drawImage(source, (size - w) / 2, (size - h) / 2, w, h);
      const result = canvas.toDataURL('image/png');
      if (!png(result)) throw new Error('图片处理后仍然过大，请换一张较简单的图片。');
      return result;
    };
    return { image: draw(256), pixelImage: draw(32) };
  } finally { URL.revokeObjectURL(url); }
}

export function petBounds(viewWidth: number, viewHeight: number, size: number): { left: number; top: number; width: number; height: number } {
  // Leave room for the header, bubble/actions and mobile bottom navigation.
  return { left: 8, top: 88, width: Math.max(0, viewWidth - Math.max(size + 24, 168) - 16), height: Math.max(0, viewHeight - size - 240) };
}
export const petFocusPath = (path: string): boolean => /^\/(?:games(?:\/|$)|tower-defense(?:\/|$)|messages(?:\/|$)|community\/chat(?:\/|$))/.test(path);
