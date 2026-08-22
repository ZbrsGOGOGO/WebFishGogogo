import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';

import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export interface EncryptedAuthValue {
  keyId: string;
  ciphertext: string;
  nonce: string;
  authTag: string;
}

/** Domain-separated encryption for small security/audit values. */
@Injectable()
export class AuthSensitiveDataService {
  assertAvailable(): void {
    this.baseConfiguration();
  }

  encrypt(
    purpose: string,
    recordId: string,
    value: Record<string, unknown> | string,
  ): EncryptedAuthValue {
    const { baseKey, keyId } = this.baseConfiguration();
    const key = this.deriveKey(baseKey, purpose);
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(this.aad(purpose, recordId));
    const plaintext =
      typeof value === 'string' ? value : JSON.stringify(value);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return {
      keyId,
      ciphertext: ciphertext.toString('base64url'),
      nonce: nonce.toString('base64url'),
      authTag: cipher.getAuthTag().toString('base64url'),
    };
  }

  decrypt(
    purpose: string,
    recordId: string,
    encrypted: EncryptedAuthValue,
  ): string {
    const { baseKey, keyId } = this.baseConfiguration();
    if (encrypted.keyId !== keyId) {
      throw new ServiceUnavailableException({
        code: 'AUTH_SENSITIVE_KEY_UNAVAILABLE',
      });
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.deriveKey(baseKey, purpose),
        Buffer.from(encrypted.nonce, 'base64url'),
      );
      decipher.setAAD(this.aad(purpose, recordId));
      decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(encrypted.ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException({
        code: 'AUTH_SENSITIVE_DATA_UNAVAILABLE',
      });
    }
  }

  private deriveKey(baseKey: Buffer, purpose: string): Buffer {
    if (!/^[a-z][a-z0-9:-]{2,63}$/.test(purpose)) {
      throw new ServiceUnavailableException({
        code: 'AUTH_SENSITIVE_PURPOSE_INVALID',
      });
    }
    return createHmac('sha256', baseKey)
      .update(`webfish-auth-sensitive:${purpose}:v1`, 'utf8')
      .digest();
  }

  private aad(purpose: string, recordId: string): Buffer {
    return Buffer.from(`auth-sensitive:${purpose}:${recordId}:v1`, 'utf8');
  }

  private baseConfiguration(): { baseKey: Buffer; keyId: string } {
    const configured = process.env.AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY;
    const configuredKeyId =
      process.env.AUTH_EMAIL_OUTBOX_ENCRYPTION_KEY_ID ?? 'v1';
    if (
      !configured &&
      process.env.LOCAL_DEV === 'true' &&
      process.env.NODE_ENV !== 'production'
    ) {
      return {
        baseKey: createHash('sha256')
          .update('webfish-local-auth-email-outbox-key', 'utf8')
          .digest(),
        keyId: 'local-dev-v1',
      };
    }
    let baseKey = Buffer.alloc(0);
    try {
      baseKey = Buffer.from(configured ?? '', 'base64');
    } catch {
      // handled below
    }
    if (
      baseKey.length !== 32 ||
      !/^[A-Za-z0-9._-]{1,64}$/.test(configuredKeyId)
    ) {
      throw new ServiceUnavailableException({
        code: 'AUTH_SENSITIVE_KEY_NOT_CONFIGURED',
      });
    }
    return { baseKey, keyId: configuredKeyId };
  }
}
