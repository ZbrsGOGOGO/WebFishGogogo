import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DataSource } from 'typeorm';
import { ArcadeBestScore, ArcadeGameRun, User } from '../../../database/entities';
import { createLocalDevDataSource } from '../../../database/local-dev-datasource';
import { ArcadeController } from './arcade.controller';
import { ArcadeService } from './arcade.service';

describe('Arcade community maintenance boundary', () => {
  let db: DataSource;
  let service: ArcadeService;
  let controller: ArcadeController;
  let userId: string;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    process.env.LOCAL_DEV = 'true'; process.env.NODE_ENV = 'test';
    process.env.APP_MODE = 'community'; process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
    db = await createLocalDevDataSource();
    const user = await db.getRepository(User).save(db.getRepository(User).create({
      publicId: randomUUID(), email: `${randomUUID()}@users.invalid`, passwordHash: 'synthetic-test-only', accountStatus: 'active',
    }));
    userId = user.id;
    service = new ArcadeService(db); controller = new ArcadeController(service);
  });
  afterEach(async () => { await db.destroy(); process.env = { ...originalEnv }; });

  it('rejects start/finish during community maintenance without expiring runs or recording scores; reads remain available', async () => {
    const run = await controller.start(userId, { gameKey: 'tetris' });
    await db.getRepository(ArcadeGameRun).update({ id: run.runId }, { startedAt: new Date(Date.now() - 10_000) });
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
    await expect(controller.start(userId, { gameKey: 'tetris' })).rejects.toMatchObject({ status: 503, response: { code: 'COMMUNITY_WRITES_DISABLED' } });
    await expect(controller.finish(userId, run.runId, { score: 0, metrics: { lines: 0, level: 1 } })).rejects.toMatchObject({ status: 503, response: { code: 'COMMUNITY_WRITES_DISABLED' } });
    expect(await db.getRepository(ArcadeGameRun).count()).toBe(1);
    expect(await db.getRepository(ArcadeGameRun).findOneByOrFail({ id: run.runId })).toMatchObject({ status: 'active', score: null, completedAt: null });
    expect(await db.getRepository(ArcadeBestScore).count()).toBe(0);
    await expect(controller.leaderboard('tetris')).resolves.toMatchObject({ gameKey: 'tetris', items: [] });
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'true';
    await expect(controller.finish(userId, run.runId, { score: 0, metrics: { lines: 0, level: 1 } })).resolves.toMatchObject({ score: 0, bestScore: 0 });
  });

  it('fails closed in non-local community mode when the explicit write flag is absent', async () => {
    process.env.LOCAL_DEV = 'false'; delete process.env.FEATURE_COMMUNITY_WRITES_ENABLED;
    await expect(service.startRun(userId, 'tetris')).rejects.toMatchObject({ status: 503, response: { code: 'COMMUNITY_WRITES_DISABLED' } });
    expect(await db.getRepository(ArcadeGameRun).count()).toBe(0);
  });

  it.each(['full', undefined])('does not apply the community flag to the previous %s mode', async (mode) => {
    if (mode === undefined) delete process.env.APP_MODE; else process.env.APP_MODE = mode;
    process.env.FEATURE_COMMUNITY_WRITES_ENABLED = 'false';
    const run = await service.startRun(userId, 'tetris');
    await db.getRepository(ArcadeGameRun).update({ id: run.runId }, { startedAt: new Date(Date.now() - 10_000) });
    await expect(service.finishRun(userId, run.runId, { score: 0, metrics: { lines: 0, level: 1 } })).resolves.toMatchObject({ score: 0 });
    expect(await db.getRepository(ArcadeBestScore).count()).toBe(1);
  });

  it('does not expose the legacy platform/checkin controllers in the community module or proxy', () => {
    const source = (file: string) => readFileSync(resolve(__dirname, '../../../../../..', file), 'utf8');
    const module = source('packages/backend/src/community-app.module.ts');
    expect(module).toContain('ArcadeModule');
    expect(module).not.toMatch(/PlatformModule|CheckinsController|PlatformController/);
    const platformAssets = source('packages/backend/src/modules/platform/platform-assets.module.ts');
    expect(platformAssets).not.toMatch(/controllers\s*:/);
    const locations = [...source('deploy/community.nginx.conf').matchAll(/location ~ (\^[^\s]+) \{/g)].map(match => new RegExp(match[1]));
    expect(locations.some(route => route.test('/api/v1/games/arcade/runs'))).toBe(true);
    expect(locations.some(route => route.test('/api/v1/checkins/today'))).toBe(false);
    expect(locations.some(route => route.test('/api/v1/platform/overview'))).toBe(false);
  });
});
