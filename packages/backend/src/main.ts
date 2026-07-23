import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  // 本地开发：允许前端 dev server（默认 5173）跨域调用后端 API。
  if (process.env.LOCAL_DEV === 'true') {
    app.enableCors({ origin: true, credentials: true });
  } else if (process.env.CORS_ORIGIN) {
    app.enableCors({ origin: process.env.CORS_ORIGIN.split(','), credentials: true });
  }
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}

void bootstrap();
