import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const GAME_ROOT = resolve(process.cwd(), 'public/games/zhengdao');
const INDEX_PATH = resolve(GAME_ROOT, 'index.html');
const EXPECTED_SCRIPTS = [
  'js/01-data.js',
  'js/02-config.js',
  'js/03-util.js',
  'js/04-engine.js',
  'js/05-achievements.js',
  'js/06-record.js',
  'js/07-replay.js',
  'js/08-app.js',
] as const;

function readAsset(relativePath: string): string {
  return readFileSync(resolve(GAME_ROOT, relativePath), 'utf8');
}

describe('证道静态游戏资源', () => {
  it('按固定顺序加载八个本地脚本，且每个入口文件都随站点发布', () => {
    const html = readFileSync(INDEX_PATH, 'utf8');
    const scriptSources = [...html.matchAll(
      /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/giu,
    )].map((match) => match[1]);

    expect(scriptSources).toEqual(EXPECTED_SCRIPTS);
    expect(readdirSync(`${GAME_ROOT}/js`).sort()).toEqual(
      EXPECTED_SCRIPTS.map((source) => source.slice('js/'.length)).sort(),
    );
    for (const source of scriptSources) {
      expect(source).toMatch(/^js\/\d{2}-[a-z-]+\.js$/u);
      expect(statSync(`${GAME_ROOT}/${source}`).isFile()).toBe(true);
    }
  });

  it('保留摸摸公司品牌、游戏中心返回入口和仅本机保存说明', () => {
    const html = readFileSync(INDEX_PATH, 'utf8');

    expect(html).toMatch(/<title>[^<]*摸摸公司<\/title>/u);
    expect(html).toMatch(/<a\s+href=["']\/games["'][^>]*>\s*←\s*返回小游戏中心\s*<\/a>/u);
    expect(html).toContain('摸摸公司 · 本机存档');
    expect(html).toContain('仅保存在当前浏览器，不会上传');
  });

  it('保持为无外链、无动态网络或代码执行能力的纯静态游戏', () => {
    const assets = [
      { path: 'index.html', content: readFileSync(INDEX_PATH, 'utf8') },
      ...EXPECTED_SCRIPTS.map((path) => ({ path, content: readAsset(path) })),
    ];
    const forbiddenPatterns: ReadonlyArray<readonly [string, RegExp]> = [
      ['HTTP(S) 外链', /https?:\/\//iu],
      ['fetch', /\bfetch\b/iu],
      ['XMLHttpRequest', /\bXMLHttpRequest\b/iu],
      ['WebSocket', /\bWebSocket\b/iu],
      ['eval', /\beval\b/u],
      ['new Function', /\bnew\s+Function\b/u],
      [
        '占位上传接口',
        /(?:<input\b[^>]*\btype\s*=\s*["']?file\b|<form\b[^>]*\baction\s*=|<(?:a|button)\b[^>]*>[^<]*上传|\bupload[a-z0-9_$]*\b|\/(?:api|v\d+)\/upload\b)/iu,
      ],
    ];

    for (const asset of assets) {
      for (const [capability, pattern] of forbiddenPatterns) {
        expect(
          pattern.test(asset.content),
          `${asset.path} 不应包含 ${capability}`,
        ).toBe(false);
      }
    }
  });

  it('所有 localStorage 数据键都使用 momo.zhengdao 版本化命名空间', () => {
    const config = readAsset('js/02-config.js');
    const scripts = EXPECTED_SCRIPTS.map(readAsset).join('\n');
    const configuredKeys = new Map(
      [...config.matchAll(/\b(ACH_KEY|LS_KEY)\s*=\s*["']([^"']+)["']/gu)]
        .map((match) => [match[1], match[2]]),
    );

    expect(Object.fromEntries(configuredKeys)).toEqual({
      ACH_KEY: 'momo.zhengdao.achievements.v1',
      LS_KEY: 'momo.zhengdao.life-history.v1',
    });
    for (const key of configuredKeys.values()) {
      expect(key).toMatch(/^momo\.zhengdao\.[a-z0-9.-]+\.v\d+$/u);
    }

    const storageArguments = [...scripts.matchAll(
      /\blocalStorage\.(?:getItem|setItem|removeItem)\(\s*([^,)]+)/gu,
    )].map((match) => match[1].trim());
    expect(storageArguments.length).toBeGreaterThan(0);
    expect(new Set(storageArguments)).toEqual(new Set(['ACH_KEY', 'LS_KEY']));
    expect(scripts).not.toMatch(
      /\blocalStorage\.(?:getItem|setItem|removeItem)\(\s*["']/u,
    );
    expect(scripts).not.toMatch(/\blocalStorage\.(?:clear|key)\s*\(/u);
    expect(scripts).not.toMatch(/\blocalStorage\s*\[/u);
  });
});
