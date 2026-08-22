import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';

import { EnergyState } from '../../database/entities/energy-state.entity';
import { InventoryLedger } from '../../database/entities/inventory-ledger.entity';
import { InventoryStack } from '../../database/entities/inventory-stack.entity';
import { ItemDefinition } from '../../database/entities/item-definition.entity';
import {
  DEFAULT_COMMUNITY_PRIVACY,
  PlayerProfile,
} from '../../database/entities/player-profile.entity';
import { PlayerProgression } from '../../database/entities/player-progression.entity';
import {
  RewardGrant,
  RewardSnapshot,
} from '../../database/entities/reward-grant.entity';
import { User } from '../../database/entities/user.entity';
import { WalletBalance } from '../../database/entities/wallet-balance.entity';
import { WalletLedger } from '../../database/entities/wallet-ledger.entity';
import { getPlayerLevelSnapshot } from './level.rules';
import {
  INITIAL_ENERGY,
  INITIAL_ENERGY_CAPACITY,
  INITIAL_PLAYER_TITLE,
  PLATFORM_CLOCK,
  PlatformClock,
  WALLET_CURRENCIES,
  WalletCurrency,
} from './platform.constants';

export interface PlatformAssetState {
  profile: PlayerProfile;
  progression: PlayerProgression;
  energy: EnergyState;
  balances: Map<WalletCurrency, WalletBalance>;
}

export interface AssetMutationContext {
  sourceType: string;
  sourceId: string;
  reason: string;
  /** 每笔资产流水必须有稳定且全局唯一的幂等键。 */
  idempotencyKey: string;
}

export interface WalletMutationResult {
  applied: boolean;
  balance: number;
  ledger: WalletLedger;
}

export interface InventoryMutationResult {
  applied: boolean;
  quantity: number;
  ledger: InventoryLedger;
  item: ItemDefinition;
}

export interface GrantRewardCommand {
  userId: string;
  sourceType: string;
  sourceId: string;
  ruleKey: string;
  reward: RewardSnapshot;
}

export interface GrantRewardResult {
  /** false 表示同一来源奖励已经发放，本次未再次变更资产。 */
  applied: boolean;
  grant: RewardGrant;
  snapshot: RewardSnapshot;
  state: PlatformAssetState;
}

/**
 * 共享资产唯一写入口。
 *
 * 本服务不自行开启事务：调用方必须传入其业务事务中的 EntityManager，使业务状态、
 * 余额、流水和 RewardGrant 能原子提交。所有并发写按 users 行 → 资产行的顺序加锁。
 */
@Injectable()
export class PlatformAssetsService {
  constructor(
    @Inject(PLATFORM_CLOCK) private readonly clock: PlatformClock,
  ) {}

  /**
   * 懒初始化既有/新用户的平台基础状态，并锁定可变资产行。
   * 零余额初始化不是资产变动，不写流水。
   */
  async ensurePlatformState(
    manager: EntityManager,
    userId: string,
  ): Promise<PlatformAssetState> {
    await this.lockActiveUser(manager, userId);

    const profile = await this.ensureProfile(
      manager.getRepository(PlayerProfile),
      userId,
    );
    const progression = await this.ensureProgression(
      manager.getRepository(PlayerProgression),
      userId,
    );
    const energy = await this.ensureEnergy(
      manager.getRepository(EnergyState),
      userId,
    );
    const balances = await this.ensureWalletBalances(
      manager.getRepository(WalletBalance),
      userId,
    );
    return { profile, progression, energy, balances };
  }

  /**
   * 批量读取指定物品数量。未定义或用户从未获得过的物品按 0 返回。
   * 该方法不创建 stack，也不获取写锁，适合农场 bootstrap 等只读聚合接口。
   */
  async readInventoryQuantities(
    manager: EntityManager,
    userId: string,
    itemSlugs: readonly string[],
  ): Promise<Record<string, number>> {
    await this.assertActiveUser(manager, userId);
    const result: Record<string, number> = {};

    for (const itemSlug of [...new Set(itemSlugs)].sort()) {
      this.nonEmpty(itemSlug, 'itemSlug');
      result[itemSlug] = 0;

      const item = await manager.getRepository(ItemDefinition).findOne({
        where: { slug: itemSlug },
      });
      if (!item) continue;

      const stack = await manager.getRepository(InventoryStack).findOne({
        where: { userId, itemId: item.id },
      });
      if (stack) {
        result[itemSlug] = this.toSafeInteger(
          stack.quantity,
          `${itemSlug} quantity`,
        );
      }
    }
    return result;
  }

  async creditWallet(
    manager: EntityManager,
    userId: string,
    currency: WalletCurrency,
    amount: number,
    context: AssetMutationContext,
  ): Promise<WalletMutationResult> {
    return this.mutateWallet(
      manager,
      userId,
      currency,
      this.positiveInteger(amount, 'amount'),
      context,
    );
  }

  async debitWallet(
    manager: EntityManager,
    userId: string,
    currency: WalletCurrency,
    amount: number,
    context: AssetMutationContext,
  ): Promise<WalletMutationResult> {
    return this.mutateWallet(
      manager,
      userId,
      currency,
      -this.positiveInteger(amount, 'amount'),
      context,
    );
  }

  async creditInventory(
    manager: EntityManager,
    userId: string,
    itemSlug: string,
    quantity: number,
    context: AssetMutationContext,
  ): Promise<InventoryMutationResult> {
    return this.mutateInventory(
      manager,
      userId,
      itemSlug,
      this.positiveInteger(quantity, 'quantity'),
      context,
      true,
    );
  }

  async debitInventory(
    manager: EntityManager,
    userId: string,
    itemSlug: string,
    quantity: number,
    context: AssetMutationContext,
  ): Promise<InventoryMutationResult> {
    return this.mutateInventory(
      manager,
      userId,
      itemSlug,
      -this.positiveInteger(quantity, 'quantity'),
      context,
      false,
    );
  }

  /** 增加累计 EXP 并依据版本化曲线重新计算等级。 */
  async addExperience(
    manager: EntityManager,
    userId: string,
    amount: number,
  ): Promise<PlayerProgression> {
    await this.lockActiveUser(manager, userId);
    const progression = await this.ensureProgression(
      manager.getRepository(PlayerProgression),
      userId,
    );
    return this.addExperienceToProgression(
      manager,
      progression,
      this.positiveInteger(amount, 'experience'),
    );
  }

  /**
   * 改变精力。正数按容量封顶，负数在不足时拒绝。
   * 返回实际应用的 delta（奖励在满精力时可能为 0）。
   */
  async changeEnergy(
    manager: EntityManager,
    userId: string,
    delta: number,
  ): Promise<{ state: EnergyState; appliedDelta: number }> {
    await this.lockActiveUser(manager, userId);
    const energy = await this.ensureEnergy(
      manager.getRepository(EnergyState),
      userId,
    );
    return this.changeEnergyState(manager, energy, delta);
  }

  /**
   * 幂等发放一组奖励。RewardGrant、钱包/背包流水及所有余额在调用方事务内原子写入。
   */
  async grantReward(
    manager: EntityManager,
    command: GrantRewardCommand,
  ): Promise<GrantRewardResult> {
    this.assertSource(command);
    const state = await this.ensurePlatformState(manager, command.userId);
    const grantRepo = manager.getRepository(RewardGrant);

    const existing = await grantRepo.findOne({
      where: {
        userId: command.userId,
        sourceType: command.sourceType,
        sourceId: command.sourceId,
        ruleKey: command.ruleKey,
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (existing) {
      return {
        applied: false,
        grant: existing,
        snapshot: existing.rewardSnapshot,
        state,
      };
    }

    const appliedSnapshot: RewardSnapshot = {};

    if (command.reward.experience !== undefined) {
      const experience = this.positiveInteger(
        command.reward.experience,
        'reward.experience',
      );
      await this.addExperienceToProgression(
        manager,
        state.progression,
        experience,
      );
      appliedSnapshot.experience = experience;
    }

    const currencies = Object.entries(command.reward.currencies ?? {}).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    for (const [rawCurrency, rawAmount] of currencies) {
      const currency = this.assertWalletCurrency(rawCurrency);
      const amount = this.positiveInteger(
        rawAmount,
        `reward.currencies.${currency}`,
      );
      const result = await this.mutateWalletWithBalance(
        manager,
        state.balances.get(currency) ??
          (await this.ensureWalletBalance(
            manager.getRepository(WalletBalance),
            command.userId,
            currency,
          )),
        amount,
        {
          sourceType: command.sourceType,
          sourceId: command.sourceId,
          reason: command.ruleKey,
          idempotencyKey: this.rewardLedgerKey(
            command,
            'currency',
            currency,
          ),
        },
      );
      state.balances.set(currency, result.balanceEntity);
      (appliedSnapshot.currencies ??= {})[currency] = amount;
    }

    const items = Object.entries(command.reward.items ?? {}).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    for (const [itemSlug, rawQuantity] of items) {
      const quantity = this.positiveInteger(
        rawQuantity,
        `reward.items.${itemSlug}`,
      );
      await this.mutateInventoryLocked(
        manager,
        command.userId,
        itemSlug,
        quantity,
        {
          sourceType: command.sourceType,
          sourceId: command.sourceId,
          reason: command.ruleKey,
          idempotencyKey: this.rewardLedgerKey(command, 'item', itemSlug),
        },
        true,
      );
      (appliedSnapshot.items ??= {})[itemSlug] = quantity;
    }

    if (command.reward.energy !== undefined) {
      const requestedEnergy = this.positiveInteger(
        command.reward.energy,
        'reward.energy',
      );
      const energyResult = await this.changeEnergyState(
        manager,
        state.energy,
        requestedEnergy,
      );
      appliedSnapshot.energy = energyResult.appliedDelta;
    }

    const grant = await grantRepo.save(
      grantRepo.create({
        userId: command.userId,
        sourceType: command.sourceType,
        sourceId: command.sourceId,
        ruleKey: command.ruleKey,
        rewardSnapshot: appliedSnapshot,
      }),
    );
    return {
      applied: true,
      grant,
      snapshot: appliedSnapshot,
      state,
    };
  }

  private async mutateWallet(
    manager: EntityManager,
    userId: string,
    currency: WalletCurrency,
    delta: number,
    context: AssetMutationContext,
  ): Promise<WalletMutationResult> {
    this.assertContext(context);
    await this.lockActiveUser(manager, userId);
    const balance = await this.ensureWalletBalance(
      manager.getRepository(WalletBalance),
      userId,
      this.assertWalletCurrency(currency),
    );
    const result = await this.mutateWalletWithBalance(
      manager,
      balance,
      delta,
      context,
    );
    return {
      applied: result.applied,
      balance: this.toSafeInteger(result.ledger.balanceAfter, 'balanceAfter'),
      ledger: result.ledger,
    };
  }

  private async mutateWalletWithBalance(
    manager: EntityManager,
    balance: WalletBalance,
    delta: number,
    context: AssetMutationContext,
  ): Promise<{
    applied: boolean;
    ledger: WalletLedger;
    balanceEntity: WalletBalance;
  }> {
    this.assertContext(context);
    const ledgerRepo = manager.getRepository(WalletLedger);
    const existing = await ledgerRepo.findOne({
      where: { idempotencyKey: context.idempotencyKey },
    });
    if (existing) {
      this.assertWalletLedgerReplay(existing, balance, delta);
      return { applied: false, ledger: existing, balanceEntity: balance };
    }

    const current = this.toSafeInteger(balance.balance, 'wallet balance');
    const next = current + delta;
    if (!Number.isSafeInteger(next) || next < 0) {
      throw new ConflictException({
        code: 'INSUFFICIENT_WALLET_BALANCE',
        currency: balance.currency,
      });
    }

    balance.balance = String(next);
    const savedBalance = await manager
      .getRepository(WalletBalance)
      .save(balance);
    const ledger = await ledgerRepo.save(
      ledgerRepo.create({
        userId: balance.userId,
        currency: balance.currency,
        delta: String(delta),
        balanceAfter: String(next),
        sourceType: context.sourceType,
        sourceId: context.sourceId,
        reason: context.reason,
        idempotencyKey: context.idempotencyKey,
      }),
    );
    return { applied: true, ledger, balanceEntity: savedBalance };
  }

  private async mutateInventory(
    manager: EntityManager,
    userId: string,
    itemSlug: string,
    delta: number,
    context: AssetMutationContext,
    requireEnabled: boolean,
  ): Promise<InventoryMutationResult> {
    this.assertContext(context);
    await this.lockActiveUser(manager, userId);
    return this.mutateInventoryLocked(
      manager,
      userId,
      itemSlug,
      delta,
      context,
      requireEnabled,
    );
  }

  private async mutateInventoryLocked(
    manager: EntityManager,
    userId: string,
    itemSlug: string,
    delta: number,
    context: AssetMutationContext,
    requireEnabled: boolean,
  ): Promise<InventoryMutationResult> {
    this.assertContext(context);
    const item = await manager.getRepository(ItemDefinition).findOne({
      where: { slug: itemSlug },
    });
    if (!item || (requireEnabled && !item.enabled)) {
      throw new NotFoundException(`Item unavailable: ${itemSlug}`);
    }

    const stackRepo = manager.getRepository(InventoryStack);
    let stack = await stackRepo.findOne({
      where: { userId, itemId: item.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!stack) {
      stack = await stackRepo.save(
        stackRepo.create({
          userId,
          itemId: item.id,
          quantity: '0',
        }),
      );
    }

    const ledgerRepo = manager.getRepository(InventoryLedger);
    const existing = await ledgerRepo.findOne({
      where: { idempotencyKey: context.idempotencyKey },
    });
    if (existing) {
      this.assertInventoryLedgerReplay(existing, stack, delta);
      return {
        applied: false,
        quantity: this.toSafeInteger(
          existing.quantityAfter,
          'quantityAfter',
        ),
        ledger: existing,
        item,
      };
    }

    const current = this.toSafeInteger(stack.quantity, 'inventory quantity');
    const next = current + delta;
    if (!Number.isSafeInteger(next) || next < 0) {
      throw new ConflictException({
        code: 'INSUFFICIENT_ITEM_QUANTITY',
        itemSlug,
      });
    }
    if (!item.stackable && next > 1) {
      throw new ConflictException({
        code: 'ITEM_NOT_STACKABLE',
        itemSlug,
      });
    }

    stack.quantity = String(next);
    await stackRepo.save(stack);
    const ledger = await ledgerRepo.save(
      ledgerRepo.create({
        userId,
        itemId: item.id,
        delta: String(delta),
        quantityAfter: String(next),
        sourceType: context.sourceType,
        sourceId: context.sourceId,
        reason: context.reason,
        idempotencyKey: context.idempotencyKey,
      }),
    );
    return { applied: true, quantity: next, ledger, item };
  }

  private async addExperienceToProgression(
    manager: EntityManager,
    progression: PlayerProgression,
    amount: number,
  ): Promise<PlayerProgression> {
    const next =
      this.toSafeInteger(progression.experience, 'experience') + amount;
    if (!Number.isSafeInteger(next)) {
      throw new ConflictException({ code: 'EXPERIENCE_LIMIT_EXCEEDED' });
    }
    progression.experience = String(next);
    progression.level = getPlayerLevelSnapshot(next).level;
    return manager.getRepository(PlayerProgression).save(progression);
  }

  private async changeEnergyState(
    manager: EntityManager,
    energy: EnergyState,
    delta: number,
  ): Promise<{ state: EnergyState; appliedDelta: number }> {
    if (!Number.isSafeInteger(delta) || delta === 0) {
      throw new BadRequestException('energy delta must be a non-zero integer');
    }
    const requested = energy.balance + delta;
    if (requested < 0) {
      throw new ConflictException({ code: 'INSUFFICIENT_ENERGY' });
    }
    const next = Math.min(requested, energy.capacity);
    const appliedDelta = next - energy.balance;
    if (appliedDelta !== 0) {
      energy.balance = next;
      await manager.getRepository(EnergyState).save(energy);
    }
    return { state: energy, appliedDelta };
  }

  private async lockActiveUser(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    const user = await manager.getRepository(User).findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!user) {
      throw new UnauthorizedException('账号不存在或已停用');
    }
  }

  private async assertActiveUser(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    const user = await manager.getRepository(User).findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new UnauthorizedException('账号不存在或已停用');
    }
  }

  private async ensureProfile(
    repo: Repository<PlayerProfile>,
    userId: string,
  ): Promise<PlayerProfile> {
    const existing = await repo.findOne({ where: { userId } });
    if (existing) return existing;
    return repo.save(
      repo.create({
        userId,
        nickname: null,
        avatarKey: null,
        bio: null,
        battleProfession: null,
        privacySettings: { ...DEFAULT_COMMUNITY_PRIVACY },
        title: INITIAL_PLAYER_TITLE,
      }),
    );
  }

  private async ensureProgression(
    repo: Repository<PlayerProgression>,
    userId: string,
  ): Promise<PlayerProgression> {
    const existing = await repo.findOne({
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (existing) return existing;
    return repo.save(
      repo.create({
        userId,
        level: 1,
        experience: '0',
      }),
    );
  }

  private async ensureEnergy(
    repo: Repository<EnergyState>,
    userId: string,
  ): Promise<EnergyState> {
    const existing = await repo.findOne({
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (existing) return existing;
    return repo.save(
      repo.create({
        userId,
        balance: INITIAL_ENERGY,
        capacity: INITIAL_ENERGY_CAPACITY,
        lastRecoveredAt: this.clock.now(),
      }),
    );
  }

  private async ensureWalletBalances(
    repo: Repository<WalletBalance>,
    userId: string,
  ): Promise<Map<WalletCurrency, WalletBalance>> {
    const balances = new Map<WalletCurrency, WalletBalance>();
    for (const currency of WALLET_CURRENCIES) {
      balances.set(
        currency,
        await this.ensureWalletBalance(repo, userId, currency),
      );
    }
    return balances;
  }

  private async ensureWalletBalance(
    repo: Repository<WalletBalance>,
    userId: string,
    currency: WalletCurrency,
  ): Promise<WalletBalance> {
    const existing = await repo.findOne({
      where: { userId, currency },
      lock: { mode: 'pessimistic_write' },
    });
    if (existing) return existing;
    return repo.save(
      repo.create({
        userId,
        currency,
        balance: '0',
      }),
    );
  }

  private assertWalletLedgerReplay(
    ledger: WalletLedger,
    balance: WalletBalance,
    expectedDelta: number,
  ): void {
    if (
      ledger.userId !== balance.userId ||
      ledger.currency !== balance.currency ||
      ledger.delta !== String(expectedDelta)
    ) {
      throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' });
    }
  }

  private assertInventoryLedgerReplay(
    ledger: InventoryLedger,
    stack: InventoryStack,
    expectedDelta: number,
  ): void {
    if (
      ledger.userId !== stack.userId ||
      ledger.itemId !== stack.itemId ||
      ledger.delta !== String(expectedDelta)
    ) {
      throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' });
    }
  }

  private assertWalletCurrency(currency: string): WalletCurrency {
    if (!(WALLET_CURRENCIES as readonly string[]).includes(currency)) {
      throw new BadRequestException(`Unsupported currency: ${currency}`);
    }
    return currency as WalletCurrency;
  }

  private assertSource(command: GrantRewardCommand): void {
    this.nonEmpty(command.userId, 'userId');
    this.nonEmpty(command.sourceType, 'sourceType');
    this.nonEmpty(command.sourceId, 'sourceId');
    this.nonEmpty(command.ruleKey, 'ruleKey');
  }

  private assertContext(context: AssetMutationContext): void {
    this.nonEmpty(context.sourceType, 'sourceType');
    this.nonEmpty(context.sourceId, 'sourceId');
    this.nonEmpty(context.reason, 'reason');
    this.nonEmpty(context.idempotencyKey, 'idempotencyKey');
    if (context.idempotencyKey.length > 200) {
      throw new BadRequestException('idempotencyKey is too long');
    }
  }

  private positiveInteger(value: number, field: string): number {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new BadRequestException(`${field} must be a positive integer`);
    }
    return value;
  }

  private nonEmpty(value: string, field: string): void {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new BadRequestException(`${field} must be a non-empty string`);
    }
  }

  private toSafeInteger(value: string, field: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new Error(`${field} is outside the safe integer range`);
    }
    return parsed;
  }

  private rewardLedgerKey(
    command: GrantRewardCommand,
    assetType: string,
    assetKey: string,
  ): string {
    const raw = [
      'reward',
      command.userId,
      command.sourceType,
      command.sourceId,
      command.ruleKey,
      assetType,
      assetKey,
    ].join(':');
    if (raw.length <= 200) return raw;
    return `reward:${createHash('sha256').update(raw).digest('hex')}`;
  }
}
