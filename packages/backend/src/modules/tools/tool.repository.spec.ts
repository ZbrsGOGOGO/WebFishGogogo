import { Profession } from '@stealth-reader/shared';
import type { Repository } from 'typeorm';

import { Tool } from '../../database/entities/tool.entity';
import { ToolProfession } from '../../database/entities/tool-profession.entity';
import { ToolRepository } from './tool.repository';
import { TOOL_CATALOG_SEED } from './tool-catalog.seed';

/** 构造一个含 toolProfessions 的 Tool 实体夹具。 */
function makeToolEntity(overrides: Partial<Tool> = {}): Tool {
  const tool = new Tool();
  tool.id = overrides.id ?? 'id-1';
  tool.slug = overrides.slug ?? 'json-formatter';
  tool.name = overrides.name ?? 'JSON 格式化';
  tool.category = overrides.category ?? '开发者';
  tool.description = overrides.description ?? '格式化 JSON';
  tool.icon = overrides.icon ?? 'json';
  tool.enabled = overrides.enabled ?? true;
  tool.createdAt = overrides.createdAt ?? new Date();
  tool.toolProfessions = overrides.toolProfessions ?? [];
  return tool;
}

function makeToolProfession(toolId: string, profession: string): ToolProfession {
  const tp = new ToolProfession();
  tp.toolId = toolId;
  tp.profession = profession;
  return tp;
}

describe('ToolRepository', () => {
  describe('listEnabledWithProfessions', () => {
    it('仅查询 enabled=true 且映射职业标签', async () => {
      const entity = makeToolEntity({
        id: 'id-dev',
        toolProfessions: [makeToolProfession('id-dev', Profession.Dev)],
      });

      const find = jest.fn().mockResolvedValue([entity]);
      const repo = new ToolRepository({ find } as unknown as Repository<Tool>);

      const result = await repo.listEnabledWithProfessions();

      // 校验 where enabled=true 被下推到 ORM 查询
      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { enabled: true } }),
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'id-dev',
        slug: 'json-formatter',
        name: 'JSON 格式化',
        category: '开发者',
        description: '格式化 JSON',
        icon: 'json',
        enabled: true,
        professions: [Profession.Dev],
      });
    });

    it('过滤掉不在受支持集合中的职业取值', async () => {
      const entity = makeToolEntity({
        id: 'id-x',
        toolProfessions: [
          makeToolProfession('id-x', Profession.Design),
          makeToolProfession('id-x', '未知职业'),
        ],
      });
      const find = jest.fn().mockResolvedValue([entity]);
      const repo = new ToolRepository({ find } as unknown as Repository<Tool>);

      const [dto] = await repo.listEnabledWithProfessions();
      expect(dto.professions).toEqual([Profession.Design]);
    });

    it('无职业标签时返回空 professions 且不抛错', async () => {
      const entity = makeToolEntity({ toolProfessions: undefined });
      const find = jest.fn().mockResolvedValue([entity]);
      const repo = new ToolRepository({ find } as unknown as Repository<Tool>);

      const [dto] = await repo.listEnabledWithProfessions();
      expect(dto.professions).toEqual([]);
    });
  });
});

describe('TOOL_CATALOG_SEED（合规基线 Req 14.8）', () => {
  const supported = Object.values(Profession) as string[];

  it('slug 唯一', () => {
    const slugs = TOOL_CATALOG_SEED.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('每个工具至少有一个受支持职业标签', () => {
    for (const t of TOOL_CATALOG_SEED) {
      expect(t.professions.length).toBeGreaterThan(0);
      for (const p of t.professions) {
        expect(supported).toContain(p);
      }
    }
  });

  it('不收录任何赌博/博彩/盗版/违法玩法工具', () => {
    const forbidden = [
      '赌',
      '博彩',
      '彩票',
      '下注',
      '抽奖',
      '开箱',
      '盗版',
      '破解',
      'gambl',
      'bet',
      'lottery',
      'casino',
      'piracy',
      'crack',
    ];
    for (const t of TOOL_CATALOG_SEED) {
      const haystack =
        `${t.slug} ${t.name} ${t.category} ${t.description}`.toLowerCase();
      for (const word of forbidden) {
        expect(haystack).not.toContain(word.toLowerCase());
      }
    }
  });
});
