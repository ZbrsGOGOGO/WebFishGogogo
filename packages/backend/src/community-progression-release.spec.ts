import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (file: string): string => readFileSync(resolve(__dirname, '../../..', file), 'utf8');
describe('community progression release boundaries', () => {
  it('uses fail-closed flags shared between frontend and backend', () => {
    for (const key of ['COMMUNITY_PROGRESSION', 'DEMON_TOWER_AUTO_EXPLORE']) {
      const compose = source('deploy/docker-compose.community.yml');
      expect(compose).toContain(`FEATURE_${key}_ENABLED: \${FEATURE_${key}_ENABLED:-false}`);
      expect(compose).toContain(`VITE_${key}_ENABLED: \${FEATURE_${key}_ENABLED:-false}`);
      expect(source('Dockerfile')).toContain(`ARG VITE_${key}_ENABLED=false`);
      expect(source('Dockerfile')).toContain(`VITE_${key}_ENABLED=\${VITE_${key}_ENABLED}`);
      expect(source('deploy/.env.community.example')).toContain(`FEATURE_${key}_ENABLED=false`);
    }
  });
  it('adds four dedicated tables without modifying roles or old data', () => {
    const growth = source('packages/backend/src/database/migrations/1700000000031-AddCommunityProgression.ts').split('async down')[0];
    const auto = source('packages/backend/src/database/migrations/1700000000032-AddDemonTowerAutoExplore.ts').split('async down')[0];
    expect(growth.match(/CREATE TABLE/g)).toHaveLength(3);
    expect(auto.match(/CREATE TABLE/g)).toHaveLength(1);
    expect(`${growth}\n${auto}`).not.toMatch(/UPDATE\s+\w+|DELETE FROM|DROP TABLE|ALTER TABLE/i);
    expect(growth).toContain("FROM users WHERE account_status = 'active'");
    expect(growth).toContain("interval '720 hours'");
    expect(growth).toContain('ON CONFLICT (user_id, campaign_key) DO NOTHING');
    expect(growth).not.toMatch(/community_role|wallet_balance|office_coin/);
  });
  it('limits growth request sizes and disables caching without exposing neighboring routes', () => {
    const route = source('deploy/community.nginx.conf').match(/location ~ (\^\/api\/v1\/community\/progression[^ ]+) \{([\s\S]*?)\n    \}/);
    expect(route).not.toBeNull();
    const pattern = new RegExp(route![1]);
    expect(pattern.test('/api/v1/community/progression/title')).toBe(true);
    expect(pattern.test('/api/v1/community/progression-admin')).toBe(false);
    expect(pattern.test('/api/v1/admin/accounts')).toBe(false);
    expect(route![2]).toContain('client_max_body_size 4k;');
    expect(route![2]).toContain('Cache-Control "no-store" always');
    expect(route![2]).toContain('limit_req zone=community_api_ip');
  });
});
