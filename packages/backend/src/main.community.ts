import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { CommunityAppModule } from './community-app.module';
import { ChatWebSocketGateway } from './modules/chat/chat-websocket.gateway';

const bootstrapLogger = new Logger('CommunityBootstrap');

function commaSeparated(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function bootstrap(): Promise<void> {
  // Provider callback signatures cover the exact request bytes.
  const app = await NestFactory.create(CommunityAppModule, { rawBody: true });
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');

  // 生产通过 Caddy -> Nginx -> Nest 两层代理；只信任明确配置的跳数。
  const configuredHops = Number(process.env.TRUST_PROXY_HOPS ?? '0');
  if (Number.isSafeInteger(configuredHops) && configuredHops > 0) {
    const adapter = app.getHttpAdapter().getInstance() as {
      set(setting: string, value: number): void;
    };
    adapter.set('trust proxy', configuredHops);
  }

  if (process.env.LOCAL_DEV === 'true') {
    app.enableCors({ origin: true, credentials: true });
  } else {
    const configuredOrigins = commaSeparated(process.env.CORS_ORIGIN);
    if (configuredOrigins.length > 0) {
      app.enableCors({ origin: configuredOrigins, credentials: true });
    }
  }

  const port = Number(process.env.PORT ?? '3000');
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  app.get(ChatWebSocketGateway).attach(app.getHttpServer());
  await app.listen(port);
  bootstrapLogger.log(`Community API listening on port ${port}`);
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown error';
  bootstrapLogger.error(`Community API failed to start: ${message}`);
  process.exitCode = 1;
});
