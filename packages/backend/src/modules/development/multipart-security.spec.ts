import type { AddressInfo } from 'node:net';
import { request as httpRequest, type IncomingMessage, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { setImmediate as immediate } from 'node:timers/promises';
import { type CanActivate, type ExecutionContext, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DEVELOPMENT_LIMITS } from '@stealth-reader/shared';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { DocumentsController } from '../documents/documents.controller';
import { DocumentsService } from '../documents/documents.service';
import { DevelopmentAccessGuard } from './development-access.guard';
import { DevelopmentAttachmentAuthorGuard } from './development-attachment-author.guard';
import { DevelopmentController } from './development.controller';
import { DevelopmentService } from './development.service';

const USER = '11111111-1111-4111-8111-111111111111';
const REQUEST = '22222222-2222-4222-8222-222222222222';
const BOUNDARY = 'local-synthetic-multipart-boundary';
const nestRequire = createRequire(require.resolve('@nestjs/platform-express'));
const MULTER_PATH = nestRequire.resolve('multer');
const fieldPart = (name: string, value: string) => `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
const fileStart = `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="synthetic.txt"\r\nContent-Type: text/plain\r\n\r\n`;

/** Untrusted multipart regressions run in an isolated, heap-bounded worker.
 * A future parser regression must fail the test, not hang/crash the Jest runner.
 * The worker binds only loopback, sends only to its own ephemeral server, and
 * uses the SAME resolved package as Nest's FileInterceptor, not a second install. */
function hostileHttp(fields: [string, string][], limits?: Record<string, number>): Promise<{ status: number; code: string | null; healthy: boolean }> {
  const worker = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    const { createServer } = require('node:http');
    const multer = require(workerData.multerPath);
    const parse = multer({ limits: workerData.limits }).none();
    const server = createServer((req, res) => {
      if (req.method === 'GET') { res.end('healthy'); return; }
      parse(req, res, (error) => {
        res.statusCode = error ? 400 : 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ code: error ? error.code : null }));
      });
    });
    server.listen(0, '127.0.0.1', async () => {
      try {
        const origin = 'http://127.0.0.1:' + server.address().port;
        const form = new FormData();
        for (const [name, value] of workerData.fields) form.append(name, value);
        const response = await fetch(origin, { method: 'POST', body: form });
        const body = await response.json();
        const healthy = await (await fetch(origin)).text() === 'healthy';
        parentPort.postMessage({ status: response.status, code: body.code, healthy });
      } catch (error) { parentPort.postMessage({ failure: error.message }); }
      finally { server.closeAllConnections(); server.close(); }
    });
  `, { eval: true, workerData: { multerPath: MULTER_PATH, fields, limits }, resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 } });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { void worker.terminate(); reject(new Error('isolated multipart parser exceeded 3 seconds')); }, 3000);
    worker.once('error', (error) => { clearTimeout(timeout); reject(error); });
    worker.once('message', (message) => {
      clearTimeout(timeout);
      void worker.terminate();
      if ('failure' in message) reject(new Error(message.failure)); else resolve(message);
    });
    worker.once('exit', (code) => { clearTimeout(timeout); if (code !== 0) reject(new Error(`multipart worker exited ${code}`)); });
  });
}

describe('Multer 2.3 upstream security regressions on isolated real HTTP', () => {
  it('resolves the patched package for Nest, not a vulnerable nested duplicate', () => {
    expect(nestRequire('multer/package.json').version).toBe('2.3.0');
  });

  it('routes array-length overflow to an error without killing the request worker', async () => {
    // GHSA-wc9g-mqfw-jrwm: maximum sparse array followed by push; no CPU-sized iteration.
    expect(await hostileHttp([['items[4294967294]', 'x'], ['items[]', 'y']])).toEqual({ status: 400, code: 'INVALID_FIELD_NAME', healthy: true });
  });

  it('bounds oversized numeric indices before append-field can synchronously traverse a sparse array', async () => {
    // GHSA-535w-7cp7-47q4 requires this opt-in bound; 2.3 defaults to Infinity.
    expect(await hostileHttp([['items[4294967294]', 'x'], ['items[metadata]', 'y']], { fieldArrayIndexLimit: 0 })).toEqual({ status: 400, code: 'LIMIT_FIELD_ARRAY_INDEX', healthy: true });
  });

  it.each(['items[0]', 'items[]', 'items[child]', 'items[00004294967294]'])('rejects the nested field %s with the actual flat-form limits', async (name) => {
    expect(await hostileHttp([[name, 'x']], { fieldArrayIndexLimit: 0, fieldNestingDepth: 0 })).toEqual({ status: 400, code: 'LIMIT_FIELD_NESTING', healthy: true });
  });
});

describe('actual attachment/document controllers with patched flat multipart limits', () => {
  let app: INestApplication;
  let origin: string;
  let service: { addAttachment: jest.Mock; upload: jest.Mock };
  const routes = [
    { path: `/v1/development/requests/${REQUEST}/attachments`, field: 'expectedVersion', value: '1', serviceMethod: 'addAttachment' as const },
    { path: '/documents', field: 'ownedContentDeclarationConfirmed', value: 'true', serviceMethod: 'upload' as const },
  ];

  beforeEach(async () => {
    service = { addAttachment: jest.fn().mockResolvedValue({ id: REQUEST }), upload: jest.fn().mockResolvedValue({ id: 'synthetic-document' }) };
    const guard: CanActivate = { canActivate(context: ExecutionContext) {
      context.switchToHttp().getRequest<AuthenticatedRequest>().user = { id: USER, sessionId: 'synthetic-upload-security' };
      return true;
    } };
    const module = await Test.createTestingModule({
      controllers: [DevelopmentController, DocumentsController],
      providers: [{ provide: DevelopmentService, useValue: service }, { provide: DocumentsService, useValue: service }],
    }).overrideGuard(JwtAuthGuard).useValue(guard)
      .overrideGuard(DevelopmentAccessGuard).useValue(guard)
      .overrideGuard(DevelopmentAttachmentAuthorGuard).useValue(guard).compile();
    app = module.createNestApplication(); app.useLogger(false);
    await app.listen(0, '127.0.0.1');
    origin = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });
  afterEach(async () => { await app.close(); });

  async function upload(route: typeof routes[number], bytes = Buffer.from('synthetic evidence')): Promise<Response> {
    const body = new FormData(); body.append(route.field, route.value);
    body.append('file', new Blob([bytes], { type: 'text/plain' }), 'synthetic.txt');
    return fetch(origin + route.path, { method: 'POST', body, signal: AbortSignal.timeout(2000) });
  }

  it.each(routes)('continues to accept the flat $field declaration with exact file bytes', async (route) => {
    const response = await upload(route);
    expect(response.status).toBe(201); await response.arrayBuffer();
    if (route.serviceMethod === 'addAttachment') expect(service.addAttachment).toHaveBeenCalledWith(USER, REQUEST, 1, expect.objectContaining({ buffer: Buffer.from('synthetic evidence') }));
    else expect(service.upload).toHaveBeenCalledWith(expect.objectContaining({ ownerId: USER, ownedContentDeclarationConfirmed: true, buffer: Buffer.from('synthetic evidence') }));
  });

  it.each(routes)('rejects nested fields at the real $path parser before service work', async (route) => {
    // A small nested index proves these controllers pass depth=0, without risking
    // the main Jest process. Huge/adversarial indices are tested in workers above.
    for (const field of ['items[1]', `${route.field}[]`, 'items[constructor]']) {
      const body = new FormData(); body.append(field, '1');
      body.append('file', new Blob(['synthetic']), 'synthetic.txt');
      const response = await fetch(origin + route.path, { method: 'POST', body, signal: AbortSignal.timeout(2000) });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ message: expect.stringContaining('Field name nesting too deep') });
      expect(service[route.serviceMethod]).not.toHaveBeenCalled();
    }
    expect((await upload(route)).status).toBe(201);
  });

  it.each(routes)('rejects a truncated file stream at $path, then handles the next normal upload', async (route) => {
    const partial = fieldPart(route.field, route.value) + fileStart + 'unfinished synthetic content';
    const response = await fetch(origin + route.path, {
      method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${BOUNDARY}` },
      body: partial, signal: AbortSignal.timeout(2000),
    });
    expect(response.status).toBe(400); await response.arrayBuffer();
    expect(service[route.serviceMethod]).not.toHaveBeenCalled();
    expect((await upload(route)).status).toBe(201);
  });

  it.each(routes)('does not persist an aborted in-flight file at $path or block subsequent requests', async (route) => {
    const server = app.getHttpServer() as Server;
    const requestSeen = once(server, 'request') as Promise<[IncomingMessage]>;
    const client = httpRequest(origin + route.path, {
      method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${BOUNDARY}`, 'Content-Length': '100000' },
    });
    client.on('error', () => { /* Expected local ECONNRESET from deliberate abort. */ });
    client.flushHeaders();
    const [incoming] = await requestSeen;
    const bytesSeen = once(incoming, 'data'); const aborted = once(incoming, 'aborted');
    client.write(fieldPart(route.field, route.value) + fileStart + 'x'.repeat(512));
    await bytesSeen; client.destroy(); await aborted;
    await immediate(); await immediate();
    expect(service[route.serviceMethod]).not.toHaveBeenCalled();
    const response = await upload(route); expect(response.status).toBe(201); await response.arrayBuffer();
    expect(service[route.serviceMethod]).toHaveBeenCalledTimes(1);
  });

  it('retains the exact 5 MiB acceptance boundary and rejects the next byte', async () => {
    let response = await upload(routes[0], Buffer.alloc(DEVELOPMENT_LIMITS.fileBytes));
    expect(response.status).toBe(201); await response.arrayBuffer();
    expect(service.addAttachment).toHaveBeenCalledTimes(1);
    response = await upload(routes[0], Buffer.alloc(DEVELOPMENT_LIMITS.fileBytes + 1));
    expect(response.status).toBe(413); await response.arrayBuffer();
    expect(service.addAttachment).toHaveBeenCalledTimes(1);
  });
});
