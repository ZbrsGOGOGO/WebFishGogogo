import type { AddressInfo } from 'node:net';

import {
  ForbiddenException,
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { DevelopmentAccessGuard } from './development-access.guard';
import { DevelopmentAttachmentAuthorGuard } from './development-attachment-author.guard';
import { DevelopmentController } from './development.controller';
import { DevelopmentService } from './development.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const ATTACHMENT_ID = '33333333-3333-4333-8333-333333333333';

describe('DevelopmentController HTTP attachment boundary', () => {
  let app: INestApplication;
  let origin: string;
  let accessAllowed: boolean;
  let authorAllowed: boolean;
  let service: {
    addAttachment: jest.Mock;
    attachmentContent: jest.Mock;
  };

  beforeEach(async () => {
    accessAllowed = true;
    authorAllowed = true;
    service = {
      addAttachment: jest.fn().mockResolvedValue({ id: REQUEST_ID, version: 2 }),
      attachmentContent: jest.fn().mockResolvedValue({
        filename: '需求 附件.txt',
        content: Buffer.from([0, 1, 2, 255]),
      }),
    };

    const jwtGuard: CanActivate = {
      canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        request.user = { id: USER_ID, sessionId: 'test-session' };
        return true;
      },
    };
    const accessGuard: CanActivate = {
      canActivate(): boolean {
        if (!accessAllowed) throw new ForbiddenException({ code: 'TEST_ACCESS_DENIED' });
        return true;
      },
    };
    const authorGuard: CanActivate = {
      canActivate(): boolean {
        if (!authorAllowed) throw new ForbiddenException({ code: 'TEST_AUTHOR_DENIED' });
        return true;
      },
    };

    const module = await Test.createTestingModule({
      controllers: [DevelopmentController],
      providers: [{ provide: DevelopmentService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(jwtGuard)
      .overrideGuard(DevelopmentAccessGuard)
      .useValue(accessGuard)
      .overrideGuard(DevelopmentAttachmentAuthorGuard)
      .useValue(authorGuard)
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await app.close();
  });

  it('accepts exactly the file and expectedVersion multipart parts', async () => {
    const response = await upload(Buffer.from('safe evidence'), [
      ['expectedVersion', '1'],
    ]);

    const responseBody = await response.text();
    expect({ status: response.status, body: responseBody }).toEqual({
      status: 201,
      body: JSON.stringify({ id: REQUEST_ID, version: 2 }),
    });
    expect(service.addAttachment).toHaveBeenCalledWith(
      USER_ID,
      REQUEST_ID,
      1,
      expect.objectContaining({
        originalname: 'evidence.txt',
        mimetype: 'text/plain',
        buffer: Buffer.from('safe evidence'),
      }),
    );
  });

  it('rejects an oversized file and surplus form fields before the service', async () => {
    const oversized = await upload(Buffer.alloc(5 * 1024 * 1024 + 1), [
      ['expectedVersion', '1'],
    ]);
    expect(oversized.status).toBe(413);
    expect(service.addAttachment).not.toHaveBeenCalled();

    const surplus = await upload(Buffer.from('safe'), [
      ['expectedVersion', '1'],
      ['unexpected', 'value'],
    ]);
    expect(surplus.status).toBeGreaterThanOrEqual(400);
    expect(surplus.status).toBeLessThan(500);
    expect(service.addAttachment).not.toHaveBeenCalled();
  });

  it('runs capability and author guards before buffering or inspecting multipart data', async () => {
    accessAllowed = false;
    let response = await upload(Buffer.alloc(5 * 1024 * 1024 + 1), [
      ['expectedVersion', '1'],
    ]);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'TEST_ACCESS_DENIED' });
    expect(service.addAttachment).not.toHaveBeenCalled();

    accessAllowed = true;
    authorAllowed = false;
    response = await upload(Buffer.alloc(5 * 1024 * 1024 + 1), [
      ['expectedVersion', '1'],
    ]);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'TEST_AUTHOR_DENIED' });
    expect(service.addAttachment).not.toHaveBeenCalled();
  });

  it('downloads exact private bytes with safe attachment headers', async () => {
    const response = await fetch(
      `${origin}/v1/development/requests/${REQUEST_ID}/attachments/${ATTACHMENT_ID}/content`,
    );

    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from([0, 1, 2, 255]));
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('content-length')).toBe('4');
    expect(response.headers.get('content-disposition')).toContain('attachment; filename="attachment"');
    expect(response.headers.get('content-disposition')).toContain("filename*=UTF-8''%E9%9C%80%E6%B1%82%20%E9%99%84%E4%BB%B6.txt");
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
  });

  async function upload(
    content: Buffer,
    fields: ReadonlyArray<readonly [string, string]>,
  ): Promise<Response> {
    const form = new FormData();
    for (const [name, value] of fields) form.append(name, value);
    form.append('file', new Blob([content], { type: 'text/plain' }), 'evidence.txt');
    return fetch(`${origin}/v1/development/requests/${REQUEST_ID}/attachments`, {
      method: 'POST',
      body: form,
    });
  }
});
