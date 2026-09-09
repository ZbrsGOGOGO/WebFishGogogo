import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (file: string): string => readFileSync(resolve(__dirname, '../../..', file), 'utf8');

describe('demon tower release and privacy boundaries', () => {
  it('adds only a bounded game-specific proxy, leaving adjacent legacy routes closed', () => {
    const nginx = source('deploy/community.nginx.conf');
    const route = nginx.match(/location ~ (\^\/api\/v1\/games\/demon-tower[^ ]+) \{([\s\S]*?)\n    \}/);
    expect(route).not.toBeNull();
    const pattern = new RegExp(route![1]);
    for (const path of ['/api/v1/games/demon-tower/catalog', '/api/v1/games/demon-tower/actions', '/api/v1/games/demon-tower']) {
      expect(pattern.test(path)).toBe(true);
    }
    for (const path of ['/api/v1/games/demon-tower-admin', '/api/v1/games/office-battle', '/api/v1/games/play', '/api/v1/admin']) {
      expect(pattern.test(path)).toBe(false);
    }
    expect(route![2]).toContain('client_max_body_size 8k;');
    expect(route![2]).toContain('limit_req zone=community_demon_tower_ip');
    expect(route![2]).toContain('Cache-Control "no-store" always');
    expect(route![2]).toContain('proxy_read_timeout 20s;');
  });

  it('keeps frontend and backend disabled by default and from the same flag', () => {
    const compose = source('deploy/docker-compose.community.yml');
    expect(compose).toContain('FEATURE_COMMUNITY_DEMON_TOWER_ENABLED: ${FEATURE_COMMUNITY_DEMON_TOWER_ENABLED:-false}');
    expect(compose).toContain('VITE_COMMUNITY_DEMON_TOWER_ENABLED: ${FEATURE_COMMUNITY_DEMON_TOWER_ENABLED:-false}');
    expect(source('deploy/.env.community.example')).toContain('FEATURE_COMMUNITY_DEMON_TOWER_ENABLED=false');
    expect(source('Dockerfile')).toContain('ARG VITE_COMMUNITY_DEMON_TOWER_ENABLED=false');
    expect(source('Dockerfile')).toContain('VITE_COMMUNITY_DEMON_TOWER_ENABLED=${VITE_COMMUNITY_DEMON_TOWER_ENABLED}');
    expect(compose).toContain('FEATURE_COMMUNITY_BATTLE_ENABLED: "false"');
    expect(compose).toContain('VITE_COMMUNITY_TOWER_DEFENSE_ENABLED: "true"');
  });

  it('adds dedicated data only and never serializes raw saves or receipts by default', () => {
    const migration = source('packages/backend/src/database/migrations/1700000000030-AddDemonTower.ts').split('async down')[0];
    expect(migration.match(/CREATE TABLE/g)).toHaveLength(6);
    expect(migration).not.toMatch(/UPDATE\s+\w+|DELETE FROM|DROP TABLE|ALTER TABLE/i);
    expect(migration).toContain('CHECK (applied_version = expected_version + 1)');
    expect(migration).toContain('CHECK (office_coins BETWEEN 0 AND 200)');
    const entities = source('packages/backend/src/database/entities/demon-tower.entity.ts');
    expect(entities).toMatch(/type: 'jsonb', select: false[^\n]+state/);
    expect(entities).toMatch(/type: 'jsonb', select: false[^\n]+receipt/);
    expect(entities).toMatch(/name: 'request_hash'[^\n]+select: false/);
    expect(entities).not.toContain('displayName');
  });

  it('requires database and HTTP acceptance without allowing production test targets', () => {
    const preflight = source('deploy/community-preflight.sh');
    expect(preflight).toContain('deploy/community-demon-tower-rehearsal.cjs');
    expect(preflight).toContain('deploy/community-demon-tower-http-rehearsal.cjs');
    const http = source('deploy/community-demon-tower-http-rehearsal.cjs');
    expect(http).toContain('ISOLATED_TOWER_HTTP_ONLY:hgbacy');
    expect(http).toContain('O_NOFOLLOW');
    expect(http).toContain("['collaborator', 'admin']");
    expect(http).toContain('account?.username, `qa_${label}`');
    expect(http).not.toContain('zbrshyyzxx.top');
  });
});
