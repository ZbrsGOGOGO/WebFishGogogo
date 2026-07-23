import { BadRequestException } from '@nestjs/common';
import { Profession } from '@stealth-reader/shared';

import { PreferencePatch } from '../preferences.repository';

/**
 * PUT /preferences 请求体（部分更新）。
 * 仅包含可由客户端更新的偏好字段（对齐 requirements 6.4 / 9.4 / 14.6）。
 * 未提供的字段保持不变；profession 校验交由 PreferencesService 完成。
 */
export interface UpdatePreferencesDto {
  activeSkin?: string;
  fontSize?: number;
  // line_height 在实体中以 numeric（字符串）承载，请求侧允许数字或字符串。
  lineHeight?: string | number;
  theme?: string;
  bossKey?: string;
  profession?: Profession | null;
}

/**
 * 将原始请求体规整并校验为 PreferencePatch。
 *
 * 无 class-validator 依赖，故在此做轻量类型/取值校验；
 * profession 的“受支持集合”语义校验委托给 PreferencesService（单一事实来源）。
 * 仅拷贝显式出现的字段，保证部分更新语义。
 */
export function toPreferencePatch(body: unknown): PreferencePatch {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('Request body must be an object');
  }
  const raw = body as Record<string, unknown>;
  const patch: PreferencePatch = {};

  if ('activeSkin' in raw) {
    patch.activeSkin = expectString(raw.activeSkin, 'activeSkin');
  }
  if ('fontSize' in raw) {
    patch.fontSize = expectInt(raw.fontSize, 'fontSize');
  }
  if ('lineHeight' in raw) {
    // lineHeight 在实体中为 numeric（以字符串承载），同时接受 number 输入。
    patch.lineHeight = expectNumericString(raw.lineHeight, 'lineHeight');
  }
  if ('theme' in raw) {
    patch.theme = expectString(raw.theme, 'theme');
  }
  if ('bossKey' in raw) {
    patch.bossKey = expectString(raw.bossKey, 'bossKey');
  }
  if ('profession' in raw) {
    patch.profession = raw.profession === null ? null : expectString(raw.profession, 'profession') as Profession;
  }

  return patch;
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a string`);
  }
  return value;
}

function expectInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new BadRequestException(`${field} must be an integer`);
  }
  return value;
}

function expectNumericString(value: unknown, field: string): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return value;
  }
  throw new BadRequestException(`${field} must be a number`);
}
