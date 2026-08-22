import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export interface RegistrationEmailCommand {
  email: string;
  code: string;
  expiresAt: Date;
  /** Stable queue id; the webhook must deduplicate retries by this value. */
  idempotencyKey: string;
}

export interface PasswordResetEmailCommand {
  email: string;
  token: string;
  expiresAt: Date;
  idempotencyKey: string;
}

/**
 * 极小的邮件投递端口。生产通过受保护的 HTTPS webhook 对接邮件服务；
 * 未配置时 fail-closed，绝不把验证码放进生产响应或日志。
 */
@Injectable()
export class EmailDeliveryService {
  assertRegistrationDeliveryAvailable(): void {
    if (process.env.LOCAL_DEV === 'true') return;
    this.configuration();
  }

  assertPasswordResetDeliveryAvailable(): void {
    if (process.env.LOCAL_DEV === 'true') return;
    this.configuration();
    this.passwordResetUrl('availability-check');
  }

  async sendRegistrationCode(command: RegistrationEmailCommand): Promise<void> {
    if (process.env.LOCAL_DEV === 'true') return;
    const { url, token } = this.configuration();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    timeout.unref();
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'idempotency-key': command.idempotencyKey,
        },
        body: JSON.stringify({
          template: 'registration-verification',
          to: command.email,
          variables: {
            code: command.code,
            expiresAt: command.expiresAt.toISOString(),
          },
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`email webhook returned ${response.status}`);
      }
    } catch {
      throw new ServiceUnavailableException({
        code: 'EMAIL_DELIVERY_FAILED',
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async sendPasswordReset(command: PasswordResetEmailCommand): Promise<void> {
    if (process.env.LOCAL_DEV === 'true') return;
    const resetUrl = this.passwordResetUrl(command.token);
    await this.sendWebhook(
      command.idempotencyKey,
      {
        template: 'password-reset',
        to: command.email,
        variables: {
          resetUrl,
          expiresAt: command.expiresAt.toISOString(),
        },
      },
    );
  }

  private async sendWebhook(
    idempotencyKey: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const { url, token } = this.configuration();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    timeout.unref();
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('email webhook rejected request');
    } catch {
      throw new ServiceUnavailableException({ code: 'EMAIL_DELIVERY_FAILED' });
    } finally {
      clearTimeout(timeout);
    }
  }

  private passwordResetUrl(token: string): string {
    const origin = process.env.PUBLIC_SITE_ORIGIN;
    try {
      if (!origin) throw new Error('missing origin');
      const url = new URL('/password/reset', origin);
      if (
        (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') ||
        url.username ||
        url.password
      ) {
        throw new Error('invalid origin');
      }
      url.searchParams.set('token', token);
      return url.href;
    } catch {
      throw new ServiceUnavailableException({
        code: 'PASSWORD_RESET_DELIVERY_NOT_CONFIGURED',
      });
    }
  }

  private configuration(): { url: string; token: string } {
    const url = process.env.AUTH_EMAIL_WEBHOOK_URL;
    const token = process.env.AUTH_EMAIL_WEBHOOK_TOKEN;
    if (!url || !token || token.length < 16) {
      throw new ServiceUnavailableException({
        code: 'EMAIL_DELIVERY_NOT_CONFIGURED',
      });
    }
    try {
      const parsed = new URL(url);
      if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
        throw new Error('HTTPS required');
      }
    } catch {
      throw new ServiceUnavailableException({
        code: 'EMAIL_DELIVERY_NOT_CONFIGURED',
      });
    }
    return { url, token };
  }
}
