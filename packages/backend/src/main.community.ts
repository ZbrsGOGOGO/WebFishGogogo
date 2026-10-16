import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { CommunityAppModule } from './community-app.module';
import { ChatWebSocketGateway } from './modules/chat/chat-websocket.gateway';
import { PaperArenaGateway } from './modules/community/paper-arena/paper-arena.gateway';

const bootstrapLogger = new Logger('CommunityBootstrap');

function commaSeparated(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function bootstrap(): Promise<void> {
  // Provider callback signatures cover the exact request bytes.
  const app = await NestFactory.create<NestExpressApplication>(CommunityAppModule, { rawBody: true, bodyParser: false });
  // saveData is a JSON string nested in one exact request JSON, so escaping can
  // make that envelope larger than the strict 512 KiB decoded-save limit. The
  // larger parser applies only to the progress PUT and the three atomic world
  // POSTs that carry the same save envelope; every other JSON endpoint retains
  // the standard 100 KiB ceiling. Both parsers keep Nest rawBody capture for
  // provider signature verification.
  app.useBodyParser('json', {
    limit: '1200kb',
    type: (request) => {
      const path = (request.url ?? '').split('?', 1)[0];
      return (request.method === 'PUT' && path === '/api/v1/games/demon-tower/source/progress')
        || (request.method === 'POST' && (
          path === '/api/v1/games/demon-tower/source/world/damage'
          || path === '/api/v1/games/demon-tower/source/world/channel'
          || path === '/api/v1/games/demon-tower/source/world/clue'
        ));
    },
  });
  app.useBodyParser('json', { limit: '100kb' });
  app.useBodyParser('urlencoded', { limit: '32kb', extended: false });
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
  app.get(PaperArenaGateway).attach(app.getHttpServer());
  await app.listen(port);
  bootstrapLogger.log(`Community API listening on port ${port}`);
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown error';
  bootstrapLogger.error(`Community API failed to start: ${message}`);
  process.exitCode = 1;
});
