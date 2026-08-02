import { BadRequestException } from '@nestjs/common';
import { Profession } from '@stealth-reader/shared';
import type { Tool, ToolRecommendation } from '@stealth-reader/shared';

import { ToolsController } from './tools.controller';
import { ToolLaunchResult, ToolListResult, ToolsService } from './tools.service';

/** 构造一个工具用于断言。 */
function makeTool(overrides: Partial<Tool> = {}): Tool {
  return {
    id: 'tool-1',
    slug: 'pomodoro',
    name: '番茄钟',
    category: 'productivity',
    description: null,
    icon: null,
    enabled: true,
    professions: [Profession.Dev],
    ...overrides,
  };
}

describe('ToolsController', () => {
  const userId = 'user-123';
  let service: jest.Mocked<
    Pick<
      ToolsService,
      | 'listTools'
      | 'searchTools'
      | 'selectProfession'
      | 'getRecommendationForUser'
      | 'launchTool'
    >
  >;
  let controller: ToolsController;

  beforeEach(() => {
    service = {
      listTools: jest.fn(),
      searchTools: jest.fn(),
      selectProfession: jest.fn(),
      getRecommendationForUser: jest.fn(),
      launchTool: jest.fn(),
    };
    controller = new ToolsController(service as unknown as ToolsService);
  });

  describe('GET /tools', () => {
    it('无筛选参数时返回全部可用工具（Req 14.1）', async () => {
      const tools = [makeTool()];
      service.listTools.mockResolvedValue(tools);

      await expect(controller.list(undefined, undefined)).resolves.toBe(tools);
      expect(service.listTools).toHaveBeenCalledTimes(1);
      expect(service.searchTools).not.toHaveBeenCalled();
    });

    it('仅空白参数视为无筛选（Req 14.1）', async () => {
      const tools = [makeTool()];
      service.listTools.mockResolvedValue(tools);

      await controller.list('  ', '  ');

      expect(service.listTools).toHaveBeenCalledTimes(1);
      expect(service.searchTools).not.toHaveBeenCalled();
    });

    it('带 category 时执行筛选（Req 14.3）', async () => {
      const result: ToolListResult = {
        tools: [makeTool()],
        noMatch: false,
        message: null,
      };
      service.searchTools.mockResolvedValue(result);

      await expect(controller.list('productivity', undefined)).resolves.toBe(result);
      expect(service.searchTools).toHaveBeenCalledWith({
        category: 'productivity',
        query: undefined,
      });
    });

    it('带 q 时执行搜索（Req 14.3）', async () => {
      const result: ToolListResult = { tools: [], noMatch: true, message: '未匹配到任何工具' };
      service.searchTools.mockResolvedValue(result);

      await expect(controller.list(undefined, '番茄')).resolves.toBe(result);
      expect(service.searchTools).toHaveBeenCalledWith({
        category: undefined,
        query: '番茄',
      });
    });

    it('同时带 category 与 q 时传入两者', async () => {
      const result: ToolListResult = { tools: [], noMatch: true, message: '未匹配到任何工具' };
      service.searchTools.mockResolvedValue(result);

      await controller.list('productivity', '番茄');

      expect(service.searchTools).toHaveBeenCalledWith({
        category: 'productivity',
        query: '番茄',
      });
    });
  });

  describe('GET /tools/recommend', () => {
    it('带合法 profession 时选择并持久化职业后推荐（Req 14.2/14.6）', async () => {
      const rec: ToolRecommendation = { profession: Profession.Dev, tools: [makeTool()] };
      service.selectProfession.mockResolvedValue(rec);

      await expect(controller.recommend(userId, Profession.Dev)).resolves.toBe(rec);
      expect(service.selectProfession).toHaveBeenCalledWith(userId, Profession.Dev);
      expect(service.getRecommendationForUser).not.toHaveBeenCalled();
    });

    it('未带 profession 时使用已持久化职业推荐（Req 14.7）', async () => {
      const rec: ToolRecommendation = { profession: Profession.Design, tools: [] };
      service.getRecommendationForUser.mockResolvedValue(rec);

      await expect(controller.recommend(userId, undefined)).resolves.toBe(rec);
      expect(service.getRecommendationForUser).toHaveBeenCalledWith(userId);
      expect(service.selectProfession).not.toHaveBeenCalled();
    });

    it('未设置职业时返回 null（Req 14.7）', async () => {
      service.getRecommendationForUser.mockResolvedValue(null);

      await expect(controller.recommend(userId, '   ')).resolves.toBeNull();
      expect(service.getRecommendationForUser).toHaveBeenCalledWith(userId);
    });

    it('非法 profession 返回 400', async () => {
      await expect(controller.recommend(userId, '黑客')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(service.selectProfession).not.toHaveBeenCalled();
      expect(service.getRecommendationForUser).not.toHaveBeenCalled();
    });
  });

  describe('POST /tools/:id/launch', () => {
    it('启动工具并返回可用状态（Req 14.5）', async () => {
      const launch: ToolLaunchResult = { toolId: 'tool-1', slug: 'pomodoro', available: true };
      service.launchTool.mockResolvedValue(launch);

      await expect(controller.launch('tool-1')).resolves.toBe(launch);
      expect(service.launchTool).toHaveBeenCalledWith('tool-1');
    });
  });
});
