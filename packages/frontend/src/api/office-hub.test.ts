import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { officeBossError, officeHubApi } from './office-hub';
import { communityHttp, CommunityApiError } from './community-http';
import * as wallet from '../app/store/community-wallet-store';

vi.mock('../app/store/community-wallet-store', () => ({ beginCommunityWalletObservation: vi.fn(), finishCommunityWalletObservation: vi.fn(), markCommunityWalletObservationFailed: vi.fn(), refreshCommunityWallet: vi.fn(async () => {}) }));
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => vi.restoreAllMocks());
describe('office boss transport and isolated wallet observation', () => {
  it.each(['relief_play', 'relief_buy', 'relief_equip', 'relief_claim'])('%s reuses its exact request key and never observes global office coins', async action => {
    const post = vi.spyOn(communityHttp, 'post').mockResolvedValue({});
    const data = { expectedVersion: 3, tool: 'keyboard' };
    await officeHubApi.action(action, data, '00000000-0000-4000-8000-000000000001');
    expect(post).toHaveBeenCalledWith('/v1/office-hub/actions', { action, ...data, requestId: '00000000-0000-4000-8000-000000000001' }, { retryAfterRefresh: false });
    expect(wallet.beginCommunityWalletObservation).not.toHaveBeenCalled(); expect(wallet.refreshCommunityWallet).not.toHaveBeenCalled();
  });
  it('still refreshes the real office wallet after the original fixed daily claim', async () => {
    vi.spyOn(communityHttp, 'post').mockResolvedValue({});
    await officeHubApi.action('boss_claim', {}, '00000000-0000-4000-8000-000000000002');
    expect(wallet.beginCommunityWalletObservation).toHaveBeenCalledWith('mutation');
    expect(wallet.refreshCommunityWallet).toHaveBeenCalledOnce();
  });
  it('never refreshes or repeats a new mutation automatically after unauthorized transport', async () => {
    const post = vi.spyOn(communityHttp, 'post').mockRejectedValue(new CommunityApiError(401, 'unauthorized'));
    await expect(officeHubApi.action('relief_play', { expectedVersion: 1, tool: 'keyboard' }, '00000000-0000-4000-8000-000000000003')).rejects.toMatchObject({ status: 401 });
    expect(post).toHaveBeenCalledOnce(); expect(wallet.refreshCommunityWallet).not.toHaveBeenCalled();
  });
  it.each([
    ['OFFICE_RELIEF_NO_CHANCES', '机会不足'], ['OFFICE_RELIEF_VERSION_CONFLICT', '版本已更新'], ['OFFICE_RELIEF_TOKENS_LOW', '不会改扣'],
    ['OFFICE_RELIEF_TOWER_REQUIRED', '建立角色'], ['OFFICE_RELIEF_TOWER_BUSY', '仍然保留'], ['OFFICE_RELIEF_REWARD_FULL', '保留'],
    ['OFFICE_RELIEF_FARM_REQUIRED', '开通农场'], ['OFFICE_RELIEF_DAY_CHANGED', '回滚'], ['OFFICE_RELIEF_PENDING_FULL', '99'],
  ])('explains server rejection %s without leaking transport detail', (code, message) => {
    expect(officeBossError(new CommunityApiError(409, 'private internal detail', { code }))).toContain(message);
  });
  it('does not expose unknown server or runtime messages', () => {
    expect(officeBossError(new CommunityApiError(500, 'private internal detail'))).not.toContain('private');
    expect(officeBossError(new Error('private runtime detail'))).not.toContain('private');
  });
});
