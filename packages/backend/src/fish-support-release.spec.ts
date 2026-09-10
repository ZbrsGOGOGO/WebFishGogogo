import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { QueryRunner } from 'typeorm';
import { AddFishGrowthAndSupport1700000000036 } from './database/migrations/1700000000036-AddFishGrowthAndSupport';

describe('fish supporter release boundaries', () => {
  it('adds only two empty tables, never replays membership gifts, and refuses destructive DOWN', async () => {
    const queries: string[] = [];
    const migration = new AddFishGrowthAndSupport1700000000036();
    await migration.up({ query: async (sql: string) => { queries.push(sql); } } as QueryRunner);
    expect(queries.filter(sql => sql.startsWith('CREATE TABLE'))).toHaveLength(2);
    expect(queries.join('\n')).not.toMatch(/INSERT INTO|UPDATE users|DROP|ALTER TABLE/i);
    expect(queries.join('\n')).toContain('CREATE UNIQUE INDEX idx_support_order_hash');
    await expect(migration.down()).rejects.toThrow('Retain growth/support records');
  });
  it('reviews the actual current migration and keeps isolated api/web deployment checks', () => {
    const source = (file: string) => readFileSync(resolve(__dirname, '../../../', file), 'utf8');
    const preflight = source('deploy/community-preflight.sh');
    expect(preflight).toContain('LATEST_REGISTERED_MIGRATION');
    expect(preflight).toContain('up -d --no-deps api web');
    expect(preflight).not.toContain('community rollback must explicitly restore the independent webfish-public project');
    expect(preflight).not.toContain('migration 0026 as the release target');
    expect(source('deploy/COMMUNITY_DEPLOYMENT.md')).toContain('1700000000036');
    expect(source('docs/COMMUNITY_FISH_SUPPORT.md')).toContain('FEATURE_ACCOUNT_DELETION_ENABLED');
  });
});
