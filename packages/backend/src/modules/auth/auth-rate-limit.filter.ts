import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';

import { AuthRateLimitException } from './auth-rate-limit.exception';

interface RateLimitResponse {
  setHeader(name: string, value: string): void;
  status(code: number): RateLimitResponse;
  json(body: unknown): void;
}

/** Adds Retry-After for DB limiter responses (Nginx already does so for edge limits). */
@Catch(AuthRateLimitException)
export class AuthRateLimitExceptionFilter implements ExceptionFilter {
  catch(exception: AuthRateLimitException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<RateLimitResponse>();
    response.setHeader('Retry-After', String(exception.retryAfterSeconds));
    response.status(exception.getStatus()).json(exception.getResponse());
  }
}
