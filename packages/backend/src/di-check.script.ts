import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';

// 仅验证 Nest 依赖注入图能否解析（不连接真实数据库）。
// 覆盖 TypeORM DataSource + 各实体仓储，使 forRoot/forFeature 不触发真实连接。
import { entities } from './database/entities';

async function main(): Promise<void> {
  const builder = Test.createTestingModule({ imports: [AppModule] });

  // 阻止真实 DB 连接：覆盖 DataSource
  builder.overrideProvider(getDataSourceToken()).useValue({
    isInitialized: true,
    getRepository: () => ({}),
    destroy: async () => undefined,
  } as unknown as DataSource);

  const moduleRef = await builder.compile();
  await moduleRef.close();
  // eslint-disable-next-line no-console
  console.log('DI_OK entities=' + entities.length);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('DI_FAIL', err);
  process.exit(1);
});
