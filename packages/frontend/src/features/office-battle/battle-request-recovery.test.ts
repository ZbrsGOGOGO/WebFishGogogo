import { describe, expect, it, vi } from 'vitest';

import {
  CommunityApiError,
  type CommunityBattleRequest,
  type CommunityBattleSettlement,
} from '../../api/community';
import { submitBattleWithRecovery } from './battle-request-recovery';

const request: CommunityBattleRequest = {
  battleRequestId: 'battle:recovery-12345678',
  opponent: { kind: 'npc', offerId: 'offer-7' },
  mode: 'reward',
  loadoutVersion: 4,
};

const settlement = { battleId: 'battle-1' } as CommunityBattleSettlement;

describe('battle request timeout recovery', () => {
  it('queries by request id before returning an existing settlement', async () => {
    const submit = vi.fn().mockRejectedValue(new CommunityApiError(0, 'timeout'));
    const lookup = vi.fn().mockResolvedValue(settlement);

    await expect(submitBattleWithRecovery(request, submit, lookup)).resolves.toBe(settlement);

    expect(submit).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith(request.battleRequestId);
  });

  it('retries once with the exact same request only after lookup returns 404', async () => {
    const submit = vi.fn()
      .mockRejectedValueOnce(new CommunityApiError(0, 'timeout'))
      .mockResolvedValueOnce(settlement);
    const lookup = vi.fn().mockRejectedValue(new CommunityApiError(404, 'not found'));

    await expect(submitBattleWithRecovery(request, submit, lookup)).resolves.toBe(settlement);

    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[0][0]).toBe(request);
    expect(submit.mock.calls[1][0]).toBe(request);
  });

  it('does not replay authorization or version failures', async () => {
    const submit = vi.fn().mockRejectedValue(new CommunityApiError(409, 'version conflict'));
    const lookup = vi.fn();

    await expect(submitBattleWithRecovery(request, submit, lookup)).rejects.toMatchObject({ status: 409 });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(lookup).not.toHaveBeenCalled();
  });
});
