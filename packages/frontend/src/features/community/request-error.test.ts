import { describe, expect, it } from 'vitest';

import { CommunityApiError } from '../../api/community';
import { communityRequestErrorMessage } from './request-error';

describe('community request error messages', () => {
  it('explains the seed balance shortfall instead of asking for a useless refresh', () => {
    const error = new CommunityApiError(409, 'Conflict', {
      code: 'OFFICE_COIN_INSUFFICIENT', required: 440, current: 237,
    });
    expect(communityRequestErrorMessage(error, '失败')).toBe(
      '办公币不足：需要 440 办公币，当前 237，还差 203。请换低成本作物，或获取办公币后再试。',
    );
  });

  it.each([
    {},
    { required: '440', current: '237' },
    { required: 440, current: -1 },
    { required: 20, current: 237 },
    { required: Infinity, current: 237 },
    { required: 440, current: 1.5 },
  ])('does not interpolate invalid balance details: %j', (details) => {
    const error = new CommunityApiError(409, 'Conflict', {
      code: 'OFFICE_COIN_INSUFFICIENT', ...details,
    });
    expect(communityRequestErrorMessage(error, '失败')).toBe(
      '办公币不足，请换低成本作物，或获取办公币后再试。',
    );
  });

  it.each([
    [409, 'PLANT_NOT_READY', '作物尚未成熟，请等待倒计时结束后再收获。'],
    [409, 'FARM_VERSION_CONFLICT', '农场状态已更新，请刷新农场后再试。'],
    [404, 'PLANT_CYCLE_NOT_FOUND', '当前没有可收获的作物，请刷新农场后开始种植。'],
  ])('distinguishes farm errors: %s %s', (status, code, message) => {
    expect(communityRequestErrorMessage(new CommunityApiError(status, '失败', { code }), '失败'))
      .toBe(message);
  });

  it.each([
    [0, '网络连接失败，请检查网络后重试'],
    [401, '登录状态已失效，请重新登录后继续'],
    [403, '你没有权限查看或执行此操作'],
    [404, '没有找到对应的用户或记录'],
    [409, '状态已经变化，请刷新后重试'],
    [429, '操作过于频繁，请稍后再试'],
  ])('keeps generic messages for unrelated errors (%s)', (status, message) => {
    expect(communityRequestErrorMessage(new CommunityApiError(status, '失败'), '失败')).toBe(message);
  });

  it('preserves authentication and authorization errors even with unexpected farm details', () => {
    expect(communityRequestErrorMessage(new CommunityApiError(403, 'Forbidden', {
      code: 'OFFICE_COIN_INSUFFICIENT', required: 440, current: 237,
    }), '失败')).toBe('你没有权限查看或执行此操作');
  });

  it('falls back for unknown failures', () => {
    expect(communityRequestErrorMessage(null, '未知失败')).toBe('未知失败');
    expect(communityRequestErrorMessage(new Error('读取失败'), '未知失败')).toBe('读取失败');
  });
});
