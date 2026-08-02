import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

import { AppModule } from './app.module';
import { AuthService } from './modules/auth/auth.service';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { DocumentsService } from './modules/documents/documents.service';
import { ReadingService } from './modules/reading/reading.service';
import { SkinService } from './modules/skin/skin.service';
import { MemoService } from './modules/memo/memo.service';
import { PreferencesService } from './modules/preferences/preferences.service';
import { ToolsService } from './modules/tools/tools.service';

/**
 * Task 13 后端集成 checkpoint。
 *
 * 验证根 AppModule 的 Nest 依赖注入图能够完整解析（module graph resolves），
 * 即 auth/documents/reading/skin/memo/preferences/tools 七个功能模块均已接入
 * 且各自的 provider / guard 依赖（含全局 JwtService、跨模块导出的 Repository/Service）
 * 均可被正确解析。为避免触发真实数据库连接，覆盖 TypeORM DataSource。
 */
describe('AppModule (integration checkpoint)', () => {
  async function compileAppModule() {
    const builder = Test.createTestingModule({ imports: [AppModule] });
    // 阻止真实 DB 连接：以最小 stub 覆盖 DataSource，
    // 使 forRoot/forFeature 注册的仓储 provider 不发起真实连接。
    builder.overrideProvider(getDataSourceToken()).useValue({
      isInitialized: true,
      // TypeORM 的 getRepositoryToken provider 工厂会读取 entityMetadatas / options，
      // 提供空元数据即可让工厂走 getRepository 分支，返回下方的仓储 stub。
      entityMetadatas: [],
      options: { type: 'postgres' },
      getRepository: () => ({}),
      getTreeRepository: () => ({}),
      getMongoRepository: () => ({}),
      destroy: async () => undefined,
    } as unknown as DataSource);
    return builder.compile();
  }

  it('resolves the full DI graph and bootstraps all feature modules', async () => {
    const moduleRef = await compileAppModule();
    try {
      // 端到端链路核心服务（上传→解析→章节索引→阅读组装）。
      expect(moduleRef.get(DocumentsService, { strict: false })).toBeDefined();
      expect(moduleRef.get(ReadingService, { strict: false })).toBeDefined();
      expect(moduleRef.get(SkinService, { strict: false })).toBeDefined();
      // 越权拒绝依赖的鉴权守卫与其全局 JwtService。
      expect(moduleRef.get(AuthService, { strict: false })).toBeDefined();
      expect(moduleRef.get(JwtAuthGuard, { strict: false })).toBeDefined();
      // 工具页 选职业→持久化→新会话推荐 一致链路。
      expect(moduleRef.get(ToolsService, { strict: false })).toBeDefined();
      expect(moduleRef.get(PreferencesService, { strict: false })).toBeDefined();
      // 便签自动保存。
      expect(moduleRef.get(MemoService, { strict: false })).toBeDefined();
    } finally {
      await moduleRef.close();
    }
  });
});
