import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { developmentId } from './development-validation';
import { DevelopmentService } from './development.service';

interface AttachmentRequest extends AuthenticatedRequest {
  params?: Record<string, string | undefined>;
}

/** Runs before multer so even an owner cannot buffer a file for another author. */
@Injectable()
export class DevelopmentAttachmentAuthorGuard implements CanActivate {
  constructor(private readonly development: DevelopmentService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AttachmentRequest>();
    await this.development.assertAttachmentAuthor(
      request.user?.id ?? '',
      developmentId(request.params?.id),
    );
    return true;
  }
}
