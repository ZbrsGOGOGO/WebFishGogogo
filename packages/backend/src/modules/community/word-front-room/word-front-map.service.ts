import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User, WordFrontMapDraft } from '../../../database/entities';
import { assertCommunityWritesEnabled } from '../community-write-gate';

const KEY = /^[a-z0-9][a-z0-9-]{1,31}$/;
const ALLOWED = /^[ASpP.o#w]{8}$/;
function invalid(): never { throw new BadRequestException({ code: 'WORD_MAP_INVALID', message: '地图必须为 10 行 × 8 列且使用约定地块。' }); }
function parse(raw: unknown): { name: string; cells: string[]; expectedVersion: number } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid(); const value = raw as Record<string, unknown>;
  if (Object.keys(value).some(key => !['name','cells','expectedVersion'].includes(key)) || typeof value.name !== 'string' || !value.name.trim() || [...value.name.trim()].length > 64 ||
    !Array.isArray(value.cells) || value.cells.length !== 10 || !value.cells.every(row => typeof row === 'string' && ALLOWED.test(row)) ||
    !Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 0) return invalid();
  const flat = value.cells.join(''); for (const token of ['A','S']) if ([...flat].filter(char => char === token).length !== 2) return invalid();
  if ([...flat].filter(char => char === 'p').length < 8 || [...flat].filter(char => char === 'P').length < 8) return invalid();
  return { name: value.name.trim(), cells: value.cells as string[], expectedVersion: Number(value.expectedVersion) };
}

@Injectable()
export class WordFrontMapService {
  constructor(private readonly db: DataSource) {}
  private async admin(id: string): Promise<User> { const user = await this.db.getRepository(User).findOneBy({ id }); if (!user || user.accountStatus !== 'active') throw new UnauthorizedException({ code:'INVALID_SESSION' }); if (user.communityRole !== 'admin') throw new ForbiddenException({ code:'ADMIN_ACCESS_REQUIRED' }); return user; }
  async list(userId: string) { await this.admin(userId); const items = await this.db.getRepository(WordFrontMapDraft).find({ order: { updatedAt: 'DESC' } }); return { rulesVersion: 4, width: 8, height: 10, symbols: { A:'阿斗',S:'出兵口',p:'己方兵道',P:'对方兵道','.':'可部署',o:'对方空地','#':'草障',w:'备用空地' }, items: items.map(item => ({ key:item.key,name:item.name,cells:item.cells,version:item.version,updatedAt:item.updatedAt.toISOString() })) }; }
  async save(userId: string, keyRaw: string, raw: unknown) {
    if (!KEY.test(keyRaw)) return invalid(); const input = parse(raw); assertCommunityWritesEnabled(); await this.admin(userId);
    return this.db.transaction(async manager => { const user=await manager.getRepository(User).findOneBy({id:userId}); if(!user||user.accountStatus!=='active')throw new UnauthorizedException({code:'INVALID_SESSION'});if(user.communityRole!=='admin')throw new ForbiddenException({code:'ADMIN_ACCESS_REQUIRED'});assertCommunityWritesEnabled(); const repo = manager.getRepository(WordFrontMapDraft), existing = await repo.findOne({ where:{ key:keyRaw }, lock:{ mode:'pessimistic_write' } });
      if ((existing?.version ?? 0) !== input.expectedVersion) throw new ConflictException({ code:'WORD_MAP_VERSION_CONFLICT', version:existing?.version ?? 0 });
      const now = new Date(), saved = await repo.save(repo.create({ key:keyRaw,name:input.name,cells:input.cells,version:(existing?.version ?? 0)+1,authorId:userId,updatedAt:now }));
      return { key:saved.key,name:saved.name,cells:saved.cells,version:saved.version,updatedAt:saved.updatedAt.toISOString() };
    });
  }
}
