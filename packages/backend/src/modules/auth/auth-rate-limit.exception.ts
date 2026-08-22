import { HttpException, HttpStatus } from '@nestjs/common';

/** Stable application-layer 429 contract, including a standard header value. */
export class AuthRateLimitException extends HttpException {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    const retryAfter = Math.max(1, Math.ceil(retryAfterSeconds));
    super({ code: 'AUTH_RATE_LIMITED', retryAfter }, HttpStatus.TOO_MANY_REQUESTS);
    this.retryAfterSeconds = retryAfter;
  }
}
