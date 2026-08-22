import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto';

import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

const CALLBACK_WINDOW_SECONDS = 5 * 60;

export interface ProviderVerificationSession {
  provider: string;
  providerReference: string;
  launchUrl: string;
  expiresAt: Date;
}

export interface VerificationCallbackHeaders {
  timestamp: string;
  nonce: string;
  eventId: string;
  signature: string;
}

@Injectable()
export class SocialVerificationProviderService {
  async createSession(
    sessionId: string,
    returnPath: string,
    now = new Date(),
  ): Promise<ProviderVerificationSession> {
    const configuration = this.configuration();
    if (configuration.kind === 'local-test') {
      return {
        provider: 'local-test',
        // The explicit local-test adapter has no external provider to retain
        // this reference. Deriving it from the already random session id lets
        // local end-to-end tests submit a correctly signed callback without
        // adding a production backdoor or storing raw identity data.
        providerReference: `local-${sessionId}`,
        launchUrl: `https://verification.local.test/start/${sessionId}`,
        expiresAt: new Date(now.getTime() + 15 * 60_000),
      };
    }

    const returnUrl = this.absoluteReturnUrl(returnPath);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    timeout.unref();
    try {
      const response = await fetch(configuration.sessionUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${configuration.token}`,
          'content-type': 'application/json',
          'idempotency-key': sessionId,
        },
        body: JSON.stringify({
          sessionId,
          callbackUrl: configuration.callbackUrl,
          returnUrl,
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('provider rejected session');
      const body = (await response.json()) as Record<string, unknown>;
      if (
        typeof body.providerSessionId !== 'string' ||
        body.providerSessionId.length < 8 ||
        body.providerSessionId.length > 256 ||
        typeof body.launchUrl !== 'string' ||
        typeof body.expiresAt !== 'string'
      ) {
        throw new Error('provider response invalid');
      }
      const launchUrl = this.requireHttpsUrl(body.launchUrl);
      const expiresAt = new Date(body.expiresAt);
      const ttl = expiresAt.getTime() - now.getTime();
      if (!Number.isFinite(expiresAt.getTime()) || ttl < 60_000 || ttl > 60 * 60_000) {
        throw new Error('provider expiry invalid');
      }
      return {
        provider: configuration.provider,
        providerReference: body.providerSessionId,
        launchUrl,
        expiresAt,
      };
    } catch {
      throw new ServiceUnavailableException({
        code: 'SOCIAL_VERIFICATION_PROVIDER_UNAVAILABLE',
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  verifyCallback(
    headers: VerificationCallbackHeaders,
    rawBody: Buffer,
    now = new Date(),
  ): void {
    const configuration = this.configuration();
    const timestampSeconds = Number(headers.timestamp);
    if (
      !/^\d{10}$/.test(headers.timestamp) ||
      !Number.isSafeInteger(timestampSeconds) ||
      Math.abs(Math.floor(now.getTime() / 1_000) - timestampSeconds) >
        CALLBACK_WINDOW_SECONDS ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(headers.nonce) ||
      !/^[A-Za-z0-9_.:-]{8,128}$/.test(headers.eventId) ||
      !/^[0-9a-f]{64}$/i.test(headers.signature)
    ) {
      throw new UnauthorizedException({
        code: 'VERIFICATION_CALLBACK_SIGNATURE_INVALID',
      });
    }
    const expected = createHmac('sha256', configuration.callbackSecret)
      .update(headers.timestamp, 'utf8')
      .update('.', 'utf8')
      .update(headers.nonce, 'utf8')
      .update('.', 'utf8')
      .update(rawBody)
      .digest();
    const supplied = Buffer.from(headers.signature, 'hex');
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      throw new UnauthorizedException({
        code: 'VERIFICATION_CALLBACK_SIGNATURE_INVALID',
      });
    }
  }

  providerName(): string {
    const configured = this.configuration();
    return configured.kind === 'local-test' ? 'local-test' : configured.provider;
  }

  private configuration():
    | { kind: 'local-test'; callbackSecret: string }
    | {
        kind: 'remote';
        provider: string;
        sessionUrl: string;
        callbackUrl: string;
        token: string;
        callbackSecret: string;
      } {
    const callbackSecret = process.env.SOCIAL_VERIFICATION_CALLBACK_SECRET;
    if (
      process.env.LOCAL_DEV === 'true' &&
      process.env.NODE_ENV !== 'production' &&
      process.env.SOCIAL_VERIFICATION_LOCAL_TEST_ADAPTER === 'true'
    ) {
      if (!callbackSecret || Buffer.byteLength(callbackSecret, 'utf8') < 32) {
        throw new ServiceUnavailableException({
          code: 'SOCIAL_VERIFICATION_PROVIDER_NOT_CONFIGURED',
        });
      }
      return { kind: 'local-test', callbackSecret };
    }

    const provider = process.env.SOCIAL_VERIFICATION_PROVIDER_NAME;
    const sessionUrl = process.env.SOCIAL_VERIFICATION_PROVIDER_SESSION_URL;
    const callbackUrl = process.env.SOCIAL_VERIFICATION_CALLBACK_URL;
    const token = process.env.SOCIAL_VERIFICATION_PROVIDER_TOKEN;
    if (
      !provider ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(provider) ||
      !sessionUrl ||
      !callbackUrl ||
      !token ||
      Buffer.byteLength(token, 'utf8') < 24 ||
      !callbackSecret ||
      Buffer.byteLength(callbackSecret, 'utf8') < 32
    ) {
      throw new ServiceUnavailableException({
        code: 'SOCIAL_VERIFICATION_PROVIDER_NOT_CONFIGURED',
      });
    }
    return {
      kind: 'remote',
      provider,
      sessionUrl: this.requireHttpsUrl(sessionUrl),
      callbackUrl: this.requireHttpsUrl(callbackUrl),
      token,
      callbackSecret,
    };
  }

  private absoluteReturnUrl(returnPath: string): string {
    const origin = process.env.PUBLIC_SITE_ORIGIN;
    try {
      if (!origin) throw new Error('missing origin');
      const result = new URL(returnPath, origin);
      if (result.protocol !== 'https:' || result.username || result.password) {
        throw new Error('invalid return origin');
      }
      return result.href;
    } catch {
      throw new ServiceUnavailableException({
        code: 'SOCIAL_VERIFICATION_PROVIDER_NOT_CONFIGURED',
      });
    }
  }

  private requireHttpsUrl(raw: string): string {
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' || url.username || url.password) {
        throw new Error('unsafe URL');
      }
      return url.href;
    } catch {
      throw new ServiceUnavailableException({
        code: 'SOCIAL_VERIFICATION_PROVIDER_NOT_CONFIGURED',
      });
    }
  }
}
