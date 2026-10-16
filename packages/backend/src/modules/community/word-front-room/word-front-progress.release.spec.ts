import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { migrations } from '../../../database/migrations';

describe('Word Front progression release surface', () => {
  it('keeps the additive progression migration immediately before later additive releases', () => {
    const names = migrations.map((migration) => migration.name);
    expect(names.indexOf('AddWordFrontProgress1700000000041')).toBeGreaterThan(-1);
    expect(names.indexOf('AddWordFrontProgress1700000000041')).toBeLessThan(names.indexOf('AddDemonTowerSource1700000000042'));
  });

  it('proxies only the two intended progression endpoints', () => {
    const nginx = readFileSync(join(process.cwd(), '../../deploy/community.nginx.conf'), 'utf8');
    const match = nginx.match(/location ~ (\^\/api\/v1\/games\/word-front\/progress[^ ]+) \{/);
    expect(match).not.toBeNull();
    const route = new RegExp(match![1]);
    expect(route.test('/api/v1/games/word-front/progress')).toBe(true);
    expect(route.test('/api/v1/games/word-front/progress/shop')).toBe(true);
    expect(route.test('/api/v1/games/word-front/progress/admin')).toBe(false);
    expect(route.test('/api/v1/games/word-front/progress/shop/extra')).toBe(false);
  });
});
