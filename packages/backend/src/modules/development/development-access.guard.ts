import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { DevelopmentService } from './development.service';

/** Capability-scoped access; it never grants or infers a site-wide role. */
@Injectable()
export class DevelopmentAccessGuard implements CanActivate {
  constructor(private readonly development: DevelopmentService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    await this.development.assertAccess(request.user?.id ?? '');
    return true;
  }
}
