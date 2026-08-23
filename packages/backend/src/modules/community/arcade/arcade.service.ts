import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import {
  ArcadeBestScore,
  ArcadeGameRun,
  User,
} from '../../../database/entities';
import type { ArcadeGameKey } from '../../../database/entities/arcade-score.entity';

const RUN_TTL_MS: Record<ArcadeGameKey, number> = {
  tetris: 2 * 60 * 60 * 1_000,
  tank: 30 * 60 * 1_000,
};

export interface FinishRunInput {
  score: number;
  metrics: unknown;
}

export function validateArcadeResult(
  gameKey: ArcadeGameKey,
  input: FinishRunInput,
  elapsedSeconds: number,
): Record<string, unknown> {
  if (!Number.isSafeInteger(input.score) || input.score < 0) {
    throw new BadRequestException({ code: 'ARCADE_SCORE_INVALID' });
  }
  if (!input.metrics || typeof input.metrics !== 'object' || Array.isArray(input.metrics)) {
    throw new BadRequestException({ code: 'ARCADE_METRICS_INVALID' });
  }
  const metrics = input.metrics as Record<string, unknown>;
  if (gameKey === 'tetris') {
    const lines = Number(metrics.lines);
    const level = Number(metrics.level);
    if (
      elapsedSeconds < 3 ||
      input.score > 5_000_000 ||
      !Number.isSafeInteger(lines) ||
      lines < 0 ||
      lines > 500 ||
      !Number.isSafeInteger(level) ||
      level < 1 ||
      level > 60 ||
      level > Math.floor(lines / 10) + 2 ||
      input.score > lines * 10_000 + elapsedSeconds * 100 + 10_000
    ) {
      throw new BadRequestException({ code: 'ARCADE_RESULT_IMPLAUSIBLE' });
    }
    return { lines, level, elapsedSeconds };
  }

  const outcome = metrics.outcome;
  const enemiesDefeated = Number(metrics.enemiesDefeated);
  if (
    elapsedSeconds < 1 ||
    (outcome !== 'won' && outcome !== 'lost') ||
    !Number.isSafeInteger(enemiesDefeated) ||
    enemiesDefeated < 0 ||
    enemiesDefeated > 3 ||
    input.score !== enemiesDefeated * 100 ||
    (outcome === 'won' && enemiesDefeated !== 3)
  ) {
    throw new BadRequestException({ code: 'ARCADE_RESULT_IMPLAUSIBLE' });
  }
  return { outcome, enemiesDefeated, elapsedSeconds };
}

@Injectable()
export class ArcadeService {
  constructor(private readonly dataSource: DataSource) {}

  async startRun(userId: string, gameKey: ArcadeGameKey) {
    return this.dataSource.transaction(async (manager) => {
      await this.activeUser(userId);
      await manager
        .createQueryBuilder()
        .update(ArcadeGameRun)
        .set({ status: 'expired' })
        .where('user_id = :userId AND game_key = :gameKey AND status = :status', {
          userId,
          gameKey,
          status: 'active',
        })
        .execute();
      const now = new Date();
      const run = await manager.getRepository(ArcadeGameRun).save(
        manager.getRepository(ArcadeGameRun).create({
          userId,
          gameKey,
          status: 'active',
          score: null,
          metrics: {},
          startedAt: now,
          expiresAt: new Date(now.getTime() + RUN_TTL_MS[gameKey]),
          completedAt: null,
        }),
      );
      return {
        runId: run.id,
        gameKey: run.gameKey,
        startedAt: run.startedAt.toISOString(),
        expiresAt: run.expiresAt.toISOString(),
      };
    });
  }

  async finishRun(userId: string, runId: string, input: FinishRunInput) {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({ where: { id: userId } });
      if (!user || user.accountStatus !== 'active') {
        throw new UnauthorizedException({ code: 'ARCADE_ACCOUNT_INACTIVE' });
      }
      const run = await manager.getRepository(ArcadeGameRun).findOne({
        where: { id: runId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!run) throw new NotFoundException({ code: 'ARCADE_RUN_NOT_FOUND' });
      if (run.status !== 'active') {
        throw new BadRequestException({ code: 'ARCADE_RUN_ALREADY_FINISHED' });
      }
      const now = new Date();
      if (run.expiresAt.getTime() <= now.getTime()) {
        throw new BadRequestException({ code: 'ARCADE_RUN_EXPIRED' });
      }
      const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - run.startedAt.getTime()) / 1_000));
      const metrics = validateArcadeResult(run.gameKey, input, elapsedSeconds);
      run.status = 'completed';
      run.score = input.score;
      run.metrics = metrics;
      run.completedAt = now;
      await manager.getRepository(ArcadeGameRun).save(run);

      const bestRepo = manager.getRepository(ArcadeBestScore);
      let best = await bestRepo.findOne({
        where: { gameKey: run.gameKey, userId },
        lock: { mode: 'pessimistic_write' },
      });
      const isPersonalBest = !best || input.score > best.bestScore;
      if (isPersonalBest) {
        best ??= bestRepo.create({ gameKey: run.gameKey, userId });
        best.bestScore = input.score;
        best.runId = run.id;
        best.metrics = metrics;
        best.achievedAt = now;
        best = await bestRepo.save(best);
      }

      const rank = await this.rankFor(manager, best!, user.publicId);
      return {
        gameKey: run.gameKey,
        score: input.score,
        bestScore: best!.bestScore,
        isPersonalBest,
        rank,
      };
    });
  }

  async leaderboard(gameKey: ArcadeGameKey, limit: number) {
    const rows = await this.dataSource
      .getRepository(ArcadeBestScore)
      .createQueryBuilder('score')
      .innerJoinAndSelect('score.user', 'user')
      .where('score.game_key = :gameKey', { gameKey })
      .andWhere('user.account_status = :status', { status: 'active' })
      .orderBy('score.bestScore', 'DESC')
      .addOrderBy('score.achievedAt', 'ASC')
      .addOrderBy('user.publicId', 'ASC')
      .take(limit)
      .getMany();
    return {
      gameKey,
      formulaVersion: 'arcade-score-v1',
      items: rows.map((row, index) => ({
        rank: index + 1,
        publicId: row.user.publicId,
        displayName: this.displayName(row.user),
        score: row.bestScore,
        achievedAt: row.achievedAt.toISOString(),
      })),
    };
  }

  private async activeUser(userId: string): Promise<User> {
    const user = await this.dataSource.getRepository(User).findOne({ where: { id: userId } });
    if (!user || user.accountStatus !== 'active') {
      throw new UnauthorizedException({ code: 'ARCADE_ACCOUNT_INACTIVE' });
    }
    return user;
  }

  private async rankFor(
    manager: EntityManager,
    best: ArcadeBestScore,
    publicId: string,
  ): Promise<number> {
    const higher = await manager
      .getRepository(ArcadeBestScore)
      .createQueryBuilder('score')
      .innerJoin('score.user', 'user', 'user.account_status = :status', { status: 'active' })
      .where('score.game_key = :gameKey', { gameKey: best.gameKey })
      .andWhere(
        `(
          score.best_score > :bestScore OR
          (score.best_score = :bestScore AND score.achieved_at < :achievedAt) OR
          (score.best_score = :bestScore AND score.achieved_at = :achievedAt AND user.public_id < :publicId)
        )`,
        { bestScore: best.bestScore, achievedAt: best.achievedAt, publicId },
      )
      .getCount();
    return higher + 1;
  }

  private displayName(user: User): string {
    return user.displayName?.trim() || user.username || `玩家${user.publicId.slice(0, 6)}`;
  }
}
