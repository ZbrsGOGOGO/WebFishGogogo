import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import type { SupportAdminView, SupportGrantInput, SupportTotals } from '@stealth-reader/shared';
import { CommunitySupportEntry } from '../../../database/entities/community-growth.entity';
import { User } from '../../../database/entities/user.entity';
import { COMMUNITY_CLOCK, type CommunityClock } from '../community-clock';
import { assertCommunityWritesEnabled } from '../community-write-gate';
import { communityProgressionEnabled, MembershipService } from './membership.service';

const hash = (text: string): string => createHash('sha256').update(text).digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function supportTotals(manager: EntityManager, userId?: string, gross = false): Promise<SupportTotals> {
  const query = manager.getRepository(CommunitySupportEntry).createQueryBuilder('s')
    .select('COUNT(*)', 'orders').addSelect('COALESCE(SUM(s.months), 0)', 'months').addSelect('COALESCE(SUM(s.amountFen), 0)', 'amount');
  if (!gross) query.andWhere('s.revokedAt IS NULL');
  if (userId) query.andWhere('s.userId = :userId', { userId });
  const row = await query.getRawOne();
  return { orders: Number(row.orders), months: Number(row.months), amountFen: Number(row.amount), currency: 'CNY' };
}

@Injectable()
export class SupportLedgerService {
  constructor(private readonly db: DataSource, private readonly membership: MembershipService, @Inject(COMMUNITY_CLOCK) private readonly clock: CommunityClock) {}
  async adminView(actorId: string, offsetRaw = '0'): Promise<SupportAdminView> {
    if (!/^\d{1,7}$/.test(offsetRaw)) throw new BadRequestException({ code: 'SUPPORT_INPUT_INVALID' });
    const offset = Number(offsetRaw);
    await this.admin(this.db.manager, actorId);
    const [totals, grossTotals, rows, active] = await Promise.all([
      supportTotals(this.db.manager), supportTotals(this.db.manager, undefined, true),
      this.db.getRepository(CommunitySupportEntry).find({ relations: { user: true }, order: { createdAt: 'DESC', id: 'DESC' }, take: 51, skip: offset }),
      this.db.getRepository(CommunitySupportEntry).createQueryBuilder('s').innerJoin(User, 'u', "u.id = s.userId AND u.accountStatus = 'active'")
        .select('COUNT(DISTINCT s.userId)', 'count').where('s.revokedAt IS NULL AND s.startsAt <= :now AND s.expiresAt > :now', { now: this.clock.now() }).getRawOne(),
    ]);
    return { totals, grossTotals, activeHolders: Number(active.count), hasMore: rows.length > 50,
      entries: rows.slice(0, 50).map(row => ({ id: row.id, username: row.user?.username ?? null, displayName: row.user?.displayName ?? null, orderHint: row.orderHint,
        months: row.months, amountFen: row.amountFen, startsAt: row.startsAt.toISOString(), expiresAt: row.expiresAt.toISOString(), createdAt: row.createdAt.toISOString(), revokedAt: row.revokedAt?.toISOString() ?? null })) };
  }
  async grant(actorId: string, raw: unknown): Promise<{ replayed: boolean; id: string }> {
    const input = this.parse(raw); this.gates();
    await this.admin(this.db.manager, actorId);
    const requestHash = hash(JSON.stringify(input)); const orderHash = hash(`afdian:${input.orderReference}`);
    try {
      return await this.db.transaction(async manager => {
        const target = await manager.getRepository(User).findOneBy({ username: input.username, accountStatus: 'active' });
        if (!target) throw new NotFoundException({ code: 'SUPPORT_USER_NOT_FOUND' });
        // Stable lock order for two admins granting each other. Serializes stacking and role revocation.
        for (const id of [...new Set([actorId, target.id])].sort()) await manager.getRepository(User).createQueryBuilder('u').where('u.id = :id', { id }).setLock('for_no_key_update').getOne();
        await this.admin(manager, actorId); this.gates();
        if (!await manager.getRepository(User).findOneBy({ id: target.id, accountStatus: 'active', username: input.username })) throw new ConflictException({ code: 'SUPPORT_USER_NOT_FOUND' });
        const repo = manager.getRepository(CommunitySupportEntry);
        const previous = await repo.createQueryBuilder('s').addSelect('s.requestHash').where('s.id = :id', { id: input.requestId }).getOne();
        if (previous) {
          if (previous.requestHash !== requestHash || previous.actorId !== actorId) throw new ConflictException({ code: 'SUPPORT_REQUEST_CONFLICT' });
          return { replayed: true, id: previous.id };
        }
        if (await repo.findOneBy({ orderHash })) throw new ConflictException({ code: 'SUPPORT_ORDER_DUPLICATE' });
        const now = this.clock.now(); const membership = await this.membership.view(manager, target.id, now);
        const pending = await repo.find({ where: { userId: target.id, revokedAt: IsNull() }, order: { expiresAt: 'DESC' }, take: 1 });
        const start = Math.max(now.getTime(), membership.expiresAt ? Date.parse(membership.expiresAt) : 0, pending[0]?.expiresAt.getTime() ?? 0);
        await repo.insert({ id: input.requestId, userId: target.id, actorId, orderHash, requestHash, orderHint: input.orderReference.slice(-4), months: input.months, amountFen: input.amountFen,
          startsAt: new Date(start), expiresAt: new Date(start + input.months * 30 * 86_400_000), createdAt: now, revokedAt: null, revokedBy: null });
        return { replayed: false, id: input.requestId };
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException({ code: 'SUPPORT_ORDER_DUPLICATE' });
      throw error;
    }
  }
  async revoke(actorId: string, id: string, raw: unknown): Promise<{ revoked: true }> {
    if (!uuid.test(id) || !raw || typeof raw !== 'object' || Object.keys(raw).join() !== 'confirmed' || (raw as { confirmed: unknown }).confirmed !== true) throw new BadRequestException({ code: 'SUPPORT_INPUT_INVALID' });
    this.gates(); await this.admin(this.db.manager, actorId);
    return this.db.transaction(async manager => {
      const repo = manager.getRepository(CommunitySupportEntry), receipt = await repo.findOneBy({ id });
      if (!receipt) throw new NotFoundException({ code: 'SUPPORT_ENTRY_NOT_FOUND' });
      for (const userId of [...new Set([actorId, receipt.userId].filter((value): value is string => Boolean(value)))].sort()) await manager.getRepository(User).createQueryBuilder('u').where('u.id = :userId', { userId }).setLock('for_no_key_update').getOne();
      await this.admin(manager, actorId); this.gates();
      await repo.update({ id, revokedAt: IsNull() }, { revokedAt: this.clock.now(), revokedBy: actorId });
      return { revoked: true };
    });
  }
  private async admin(manager: EntityManager, actorId: string): Promise<void> {
    if (!await manager.getRepository(User).findOneBy({ id: actorId, accountStatus: 'active', communityRole: 'admin' })) throw new ForbiddenException({ code: 'ADMIN_ACCESS_REQUIRED' });
  }
  private gates(): void { if (!communityProgressionEnabled()) throw new ServiceUnavailableException({ code: 'PROGRESSION_DISABLED' }); assertCommunityWritesEnabled(); }
  private parse(raw: unknown): SupportGrantInput {
    const v = raw as SupportGrantInput;
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join() !== 'amountFen,confirmed,months,orderReference,requestId,username' || typeof v.requestId !== 'string' || !uuid.test(v.requestId) || typeof v.username !== 'string' || v.username.length < 2 || v.username.length > 32 || v.username.trim() !== v.username || typeof v.orderReference !== 'string' || !/^[A-Za-z0-9_-]{6,80}$/.test(v.orderReference) || !Number.isSafeInteger(v.months) || v.months < 1 || v.months > 12 || !Number.isSafeInteger(v.amountFen) || v.amountFen < 1 || v.amountFen > 100_000_000 || v.confirmed !== true) throw new BadRequestException({ code: 'SUPPORT_INPUT_INVALID' });
    return { requestId: v.requestId.toLowerCase(), username: v.username, orderReference: v.orderReference.toUpperCase(), months: v.months, amountFen: v.amountFen, confirmed: true };
  }
}
