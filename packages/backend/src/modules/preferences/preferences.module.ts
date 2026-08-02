import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserPreference } from '../../database/entities/user-preference.entity';
import { PreferencesController } from './preferences.controller';
import { PreferencesRepository } from './preferences.repository';
import { PreferencesService } from './preferences.service';

/**
 * PreferencesModule：用户偏好领域（controller/service/repository 层）。
 * Controller（task 11.2）暴露 GET/PUT /preferences。导出 service 与 repository，
 * 供 ToolsService（task 12.5）复用 getProfession/setProfession。
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserPreference])],
  controllers: [PreferencesController],
  providers: [PreferencesRepository, PreferencesService],
  exports: [PreferencesRepository, PreferencesService],
})
export class PreferencesModule {}
