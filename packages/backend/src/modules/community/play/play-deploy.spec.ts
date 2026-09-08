import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const source = (file: string) => readFileSync(resolve(__dirname, '../../../../../..', file), 'utf8');

describe('authoritative play deployment boundaries', () => {
  it('has a bounded separate proxy budget and does not admit adjacent legacy paths', () => {
    const nginx = source('deploy/community.nginx.conf');
    const route = nginx.match(/location ~ (\^\/api\/v1\/games\/play[^ ]+) \{([\s\S]*?)\n    \}/)!;
    expect(route).not.toBeNull();
    const matches = new RegExp(route[1]);
    expect(matches.test('/api/v1/games/play/catalog')).toBe(true);
    expect(matches.test('/api/v1/games/office-battle/catalog')).toBe(false);
    expect(matches.test('/api/v1/games/play-admin')).toBe(false);
    expect(route[2]).toContain('client_max_body_size 20k;');
    expect(route[2]).toContain('limit_req zone=community_play_ip');
    expect(route[2]).toContain('Cache-Control "no-store" always');
    expect(route[2]).toContain('proxy_pass http://community_api;');
  });
  it('only creates game tables and does not rewrite existing balances or legacy game state', () => {
    const migration = source('packages/backend/src/database/migrations/1700000000027-AddAuthoritativeGameRooms.ts').split('async down')[0];
    expect(migration.match(/CREATE TABLE/g)).toHaveLength(5);
    expect(migration).toContain('WHERE active=true');
    expect(migration).toContain('PRIMARY KEY(service_date,game_key)');
    expect(migration).not.toMatch(/UPDATE\s+wallet|ALTER TABLE|DELETE FROM|DROP TABLE/i);
  });
  it('keeps engine state and invitation secrets off default ORM reads', () => {
    const entity = source('packages/backend/src/database/entities/play-room.entity.ts');
    expect(entity).toMatch(/name: 'join_code'[^\n]+select: false/);
    expect(entity).toMatch(/name: 'engine_state'[^\n]+select: false/);
    expect(source('packages/backend/src/modules/community/play/play-rewards.service.ts')).not.toContain('ArcadeBestScore');
  });
});
