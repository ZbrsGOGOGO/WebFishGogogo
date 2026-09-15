import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findLocalLabGame, LOCAL_LAB_GAMES } from './local-games';

describe('audited self-hosted game registry and narrow web policy', () => {
  it('only maps known identifiers to six actual original projects', () => {
    expect(new Set(LOCAL_LAB_GAMES.map(game => game.slug)).size).toBe(6);
    for (const invalid of ['', '../index', 'https://evil.invalid', '__proto__', undefined]) expect(findLocalLabGame(invalid)).toBeUndefined();
    for (const game of LOCAL_LAB_GAMES) {
      expect(findLocalLabGame(game.slug)).toBe(game);
      expect(game.source).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
      expect(existsSync(path.join('public', game.licensePath))).toBe(true);
    }
  });
  it('allows only reviewed game documents to be framed, without weakening shell or APIs', () => {
    const nginx = readFileSync('../../deploy/community.nginx.conf', 'utf8');
    const location = nginx.match(/location ~ \^\/games\/local-lab\/\(([^)]+)\)\/index\\\.html\$ \{([\s\S]*?)\n    \}/)!;
    expect(location).not.toBeNull();
    expect(new Set(location[1].split('|'))).toEqual(new Set(LOCAL_LAB_GAMES.map(game => game.slug)));
    expect(location[2]).toContain('add_header_inherit off;');
    expect(location[2]).toContain("frame-ancestors 'self'"); expect(location[2]).toContain("connect-src 'none'");
    expect(location[2]).toContain("media-src 'none'"); expect(location[2]).toContain("font-src 'none'");
    expect(location[2]).toContain("script-src 'self';"); expect(location[2]).not.toContain('unsafe-eval');
    const shell = nginx.slice(0, nginx.indexOf('location = /games/zhengdao/index.html'));
    expect(shell).toContain('X-Frame-Options "DENY"'); expect(shell).toContain("frame-ancestors 'none'");
    expect(nginx).toContain('location /games/local-lab/ {'); expect(nginx).not.toContain('location ^~ /games/local-lab/');
    expect(nginx.match(/location \/games\/local-lab\/ \{([\s\S]*?)\n    \}/)![1]).toContain('try_files $uri =404;');
  });
});
