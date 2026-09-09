import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PlatformAssetsModule } from '../../platform/platform-assets.module';
import { OfficeHubController } from './office-hub.controller';
import { OfficeHubService } from './office-hub.service';
@Module({ imports: [AuthModule, PlatformAssetsModule], controllers: [OfficeHubController], providers: [OfficeHubService], exports: [OfficeHubService] })
export class OfficeHubModule {
}
