import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const source = (file: string) => readFileSync(resolve(__dirname, '../../../../../..', file), 'utf8');

describe('rail release boundaries', () => {
  it('uses its own bounded proxy and does not open adjacent legacy APIs', () => {
    const route = source('deploy/community.nginx.conf').match(/location ~ (\^\/api\/v1\/games\/rail[^ ]+) \{([\s\S]*?)\n    \}/)!;
    expect(route).not.toBeNull();
    const pattern = new RegExp(route[1]);
    expect(pattern.test('/api/v1/games/rail/rooms')).toBe(true);
    for (const path of ['/api/v1/games/rail-admin', '/api/v1/games/office-battle', '/api/v1/games/play']) expect(pattern.test(path)).toBe(false);
    expect(route[2]).toContain('client_max_body_size 20k;');
    expect(route[2]).toContain('limit_req zone=community_rail_ip');
    expect(route[2]).toContain('Cache-Control "no-store" always');
  });
  it('only adds seven tables and one nullable column without rewriting previous data', () => {
    const up = source('packages/backend/src/database/migrations/1700000000029-AddRailRoomsAndPasswords.ts').split('async down')[0];
    expect(up.match(/CREATE TABLE/g)).toHaveLength(7);
    expect(up).toContain('ALTER TABLE play_rooms ADD COLUMN password_hash varchar(255)');
    expect(up).not.toMatch(/UPDATE\s+\w+|DELETE FROM|DROP TABLE|ALTER TABLE users/i);
    expect(up).toContain('WHERE active = true');
    expect(source('packages/backend/src/database/entities/rail-room.entity.ts')).toMatch(/name: 'password_hash'[^\n]+select: false/);
    expect(source('packages/backend/src/database/entities/rail-room.entity.ts')).toMatch(/name: 'engine_state'[^\n]+select: false/);
  });
  it('keeps existing six-game score unions separate and requires the new migration in release guards', () => {
    expect(source('packages/shared/src/game-rooms.ts').split('export const PLAY_GAME_KEYS')[1]?.split(';')[0]).not.toContain("'rail'");
    expect(source('deploy/community-migration-rehearsal.sh')).toContain('LATEST_TIMESTAMP=1700000000029');
    expect(source('deploy/community-migration-rehearsal.sh')).toContain('assert_rail_reverted rehearsal_clean');
    expect(source('deploy/community-preflight.sh')).toContain('AddRailRoomsAndPasswords1700000000029');
  });
});
