import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (file: string): string => readFileSync(resolve(__dirname, '../../..', file), 'utf8');

describe('demon tower source request-size boundary', () => {
  it('scopes the larger proxy and Nest parser only to the escaped 512 KiB save envelope', () => {
    const bootstrap = source('packages/backend/src/main.community.ts');
    const nginx = source('deploy/community.nginx.conf');
    const envelope = JSON.stringify({
      requestId: '00000000-0000-4000-8000-000000000000',
      expectedVersion: 0,
      // A nested JSON string can double in transit when every byte needs JSON
      // escaping. The service still applies the authoritative 512 KiB limit
      // to the decoded saveData value after the request parser accepts it.
      saveData: '\\'.repeat(512 * 1024),
    });

    expect(Buffer.byteLength(envelope, 'utf8')).toBeGreaterThan(1024 * 1024);
    expect(Buffer.byteLength(envelope, 'utf8')).toBeLessThan(1200 * 1024);
    expect(bootstrap).toContain("rawBody: true, bodyParser: false");
    expect(bootstrap).toContain("limit: '1200kb'");
    for (const path of [
      '/api/v1/games/demon-tower/source/progress',
      '/api/v1/games/demon-tower/source/world/damage',
      '/api/v1/games/demon-tower/source/world/channel',
      '/api/v1/games/demon-tower/source/world/clue',
    ]) expect(bootstrap).toContain(`'${path}'`);
    expect(bootstrap).toContain("app.useBodyParser('json', { limit: '100kb' });");
    for (const path of ['progress', 'world/damage', 'world/channel', 'world/clue']) {
      expect(nginx).toMatch(new RegExp(`location = \/api\/v1\/games\/demon-tower\/source\/${path.replace('/', '\\/')} \\{[\\s\\S]*?client_max_body_size 1200k;`));
    }
    expect(nginx).toMatch(/location ~ \^\/api\/v1\/games\/demon-tower\(\?:\/\.\*\)\?\$ \{[\s\S]*?client_max_body_size 20k;/);
  });

  it('registers one additive migration that creates only the five source tables', () => {
    const migration = source('packages/backend/src/database/migrations/1700000000042-AddDemonTowerSource.ts');
    const up = migration.split('async down')[0];
    expect(up.match(/CREATE TABLE/g)).toHaveLength(5);
    expect(up).toContain('demon_tower_source_profiles');
    expect(up).toContain('demon_tower_source_world_floors');
    expect(up).not.toMatch(/(?:ALTER|UPDATE|DELETE FROM|DROP TABLE)\s+"?demon_tower_(?!source_)/i);
    const index = source('packages/backend/src/database/migrations/index.ts');
    expect(index).toContain("import { AddDemonTowerSource1700000000042 } from './1700000000042-AddDemonTowerSource';");
    expect(index).toMatch(/AddDemonTowerSource1700000000042,\s*\];/);
  });

  it('serves only the audited source document as a same-origin frame and never falls back missing assets to the SPA', () => {
    const nginx = source('deploy/community.nginx.conf');
    const entry = nginx.match(/location = \/games\/demon-tower-source\/index\.html \{([\s\S]*?)\n    \}/)?.[1] ?? '';
    const assets = nginx.match(/location \/games\/demon-tower-source\/ \{([\s\S]*?)\n    \}/)?.[1] ?? '';
    expect(entry).toContain('add_header_inherit off;');
    expect(entry).toContain('X-Frame-Options "SAMEORIGIN"');
    expect(entry).toContain("frame-ancestors 'self'");
    expect(entry).toContain("connect-src 'none'");
    expect(entry).toContain('try_files $uri =404;');
    expect(assets).toContain('try_files $uri =404;');
    expect(assets).toContain('Cache-Control "no-cache"');
    expect(assets).not.toContain('max-age=');
    expect(entry).not.toContain('try_files $uri /index.html');
    expect(assets).not.toContain('try_files $uri /index.html');
  });

  it('hard-disables the retired automatic and expansion runtimes in build and deployment configuration', () => {
    const compose = source('deploy/docker-compose.community.yml');
    const dockerfile = source('Dockerfile');
    for (const name of ['DEMON_TOWER_AUTO_EXPLORE', 'DEMON_TOWER_EXPANSION']) {
      expect(compose).toContain(`FEATURE_${name}_ENABLED: "false"`);
      expect(compose).toContain(`VITE_${name}_ENABLED: "false"`);
      expect(dockerfile).toContain(`test "$VITE_${name}_ENABLED" = false`);
    }
  });

  it('keeps the one-time legacy final-day settlement off every HTTP and Nest runtime path', () => {
    const script = source('packages/backend/src/scripts/settle-retired-demon-tower-day.ts');
    const module = source('packages/backend/src/modules/community/demon-tower/demon-tower.module.ts');
    const controller = source('packages/backend/src/modules/community/demon-tower/demon-tower.controller.ts');
    expect(script).toContain('CONFIRM_DEMON_TOWER_RETIREMENT_SETTLEMENT');
    expect(script).toContain('settleRetirementDay');
    expect(module).not.toContain('DemonTowerRewardsService');
    expect(controller).not.toContain('settleRetirementDay');
  });

  it('keeps opportunistic world-receipt retention cleanup globally bounded', () => {
    const service = source('packages/backend/src/modules/community/demon-tower/demon-tower-source.service.ts');
    expect(service).toContain('const COMMAND_PRUNE_BATCH = 500');
    expect(service).toContain('take: COMMAND_PRUNE_BATCH');
    expect(service).not.toMatch(/createQueryBuilder\(\)\.delete\(\)[\s\S]{0,300}created_at < :cutoff/);
  });
});
