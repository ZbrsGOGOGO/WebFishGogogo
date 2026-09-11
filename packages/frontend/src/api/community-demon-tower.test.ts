import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CommunityApiError, resetCommunityHttpForTests, setCommunitySessionTokens } from './community-http';
import { communityDemonTowerApi, demonTowerActionReasonMessage, demonTowerErrorMessage, demonTowerReadErrorMessage, demonTowerOutcomeUncertain } from './community-demon-tower';

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
describe('demon tower API transport', () => {
  beforeEach(() => { resetCommunityHttpForTests(); setCommunitySessionTokens('synthetic-demon-token'); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); resetCommunityHttpForTests(); });
  it('reads public catalog without bearer and includes active credentials for personal rank', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(json({}))); vi.stubGlobal('fetch', fetcher);
    await communityDemonTowerApi.catalog(); await communityDemonTowerApi.leaderboard('2026-09-09'); await communityDemonTowerApi.contributions(3);
    expect(fetcher.mock.calls[0][0]).toMatch(/\/demon-tower\/catalog$/); expect(fetcher.mock.calls[1][0]).toMatch(/\/leaderboard\?date=2026-09-09$/); expect(fetcher.mock.calls[2][0]).toMatch(/\/contributions\?floor=3$/);
    expect(new Headers(fetcher.mock.calls[0][1].headers).has('Authorization')).toBe(false);
    for (const call of fetcher.mock.calls.slice(1)) expect(new Headers(call[1].headers).get('Authorization')).toBe('Bearer synthetic-demon-token');
  });
  it('allows anonymous ranking reads without attempting a session refresh', async () => {
    setCommunitySessionTokens(null);
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(json({}))); vi.stubGlobal('fetch', fetcher);
    await communityDemonTowerApi.leaderboard(); await communityDemonTowerApi.contributions();
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const call of fetcher.mock.calls) expect(new Headers(call[1].headers).has('Authorization')).toBe(false);
  });
  it('does not create a profile on overview GET and forwards cancellation', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ profile: null })); vi.stubGlobal('fetch', fetcher); const controller = new AbortController();
    await communityDemonTowerApi.overview(controller.signal);
    expect(fetcher).toHaveBeenCalledOnce(); expect(fetcher.mock.calls[0][1].method).toBe('GET'); expect(fetcher.mock.calls[0][1].signal).toBe(controller.signal); expect(new Headers(fetcher.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer synthetic-demon-token');
  });
  it('sends version and UUID, never client damage, random seed or reward balances', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({})); vi.stubGlobal('fetch', fetcher);
    const input = { requestId: '00000000-0000-4000-8000-000000000001', expectedVersion: 4, kind: 'attack' as const, payload: { targetId: 'enemy-a' } };
    await communityDemonTowerApi.action(input);
    expect(fetcher.mock.calls[0][0]).toMatch(/\/demon-tower\/actions$/); expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(input);
  });
  it('does not silently refresh and repeat mutation requests after 401', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ code: 'UNAUTHORIZED' }, 401)); vi.stubGlobal('fetch', fetcher);
    await expect(communityDemonTowerApi.action({ requestId: '00000000-0000-4000-8000-000000000001', expectedVersion: 0, kind: 'enroll', payload: {} })).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('reads auto status and starts with CAS but stops by owned run ID without a moving version', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(json({}))); vi.stubGlobal('fetch', fetcher);
    const input = { requestId: '00000000-0000-4000-8000-000000000002', expectedVersion: 5, floor: 1, maxExplorations: 3 };
    await communityDemonTowerApi.auto(); await communityDemonTowerApi.autoStart(input); await communityDemonTowerApi.autoStop('synthetic-run');
    expect(fetcher.mock.calls[0][0]).toMatch(/\/auto-explore$/); expect(fetcher.mock.calls[0][1].method).toBe('GET');
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual(input); expect(fetcher.mock.calls[2][0]).toMatch(/\/auto-explore\/synthetic-run\/stop$/); expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({});
  });
  it('does not classify disabled auto as an uncertain mutation and gives VIP/floor reasons', () => {
    expect(demonTowerOutcomeUncertain(new CommunityApiError(503, '', { code: 'DEMON_TOWER_AUTO_DISABLED' }))).toBe(false);
    expect(demonTowerErrorMessage(new CommunityApiError(403, '', { code: 'VIP_REQUIRED' }))).toContain('仍可手动');
    expect(demonTowerErrorMessage(new CommunityApiError(409, '', { code: 'DEMON_TOWER_AUTO_FLOOR_CHANGED' }))).toContain('没有启动');
  });
  it('keeps transport failures uncertain but distinguishes explicit read-only rejection', () => {
    expect(demonTowerOutcomeUncertain(new CommunityApiError(0, 'lost'))).toBe(true);
    expect(demonTowerOutcomeUncertain(new CommunityApiError(502, 'upstream'))).toBe(true);
    expect(demonTowerOutcomeUncertain(new DOMException('aborted', 'AbortError'))).toBe(true);
    expect(demonTowerOutcomeUncertain(new CommunityApiError(409, 'old version', { code: 'DEMON_TOWER_VERSION_CONFLICT' }))).toBe(false);
    expect(demonTowerOutcomeUncertain(new CommunityApiError(503, 'closed', { code: 'COMMUNITY_WRITES_DISABLED' }))).toBe(false);
  });
  it('does not echo unsafe raw server or JavaScript error messages', () => {
    const raw = '<img src=x onerror=alert(1)> internal-secret';
    expect(demonTowerErrorMessage(new CommunityApiError(409, raw, { code: 'DEMON_TOWER_UNKNOWN' }))).not.toContain(raw);
    expect(demonTowerErrorMessage(new Error(raw))).not.toContain(raw);
  });
  it('distinguishes read-only connectivity from uncertain actions and explains reset rejection', () => {
    const lost = new CommunityApiError(0, 'offline');
    expect(demonTowerReadErrorMessage(lost)).not.toMatch(/操作|上次同步/);
    expect(demonTowerReadErrorMessage(lost, true)).toContain('上次同步');
    expect(demonTowerErrorMessage(lost)).toContain('操作是否完成');
    expect(demonTowerReadErrorMessage(new CommunityApiError(401, 'expired'))).toContain('登录已失效');
    expect(demonTowerErrorMessage(new CommunityApiError(409, 'cooldown', { code: 'DEMON_TOWER_ATTRIBUTE_RESET_COOLDOWN' }))).toContain('服务器确认');
    expect(demonTowerErrorMessage(new CommunityApiError(409, 'no allocation', { code: 'DEMON_TOWER_ATTRIBUTES_UNCHANGED' }))).toContain('没有已分配');
  });
  it.each([
    ['SHOP_LIMIT_REACHED', '限购'], ['STAMINA_SPACE_REQUIRED', '体力空余'], ['HEALTH_FULL', '生命已满'],
    ['SHOP_QUANTITY_INVALID', '整数'], ['RESOURCE_FULL', '材料容量'], ['RUNE_STORAGE_FULL', '99'],
    ['NOT_ENOUGH_SOUL', '残魂不足'], ['NOT_ENOUGH_SPIRIT_STONES', '灵石不足'], ['INVALID_SHOP_OFFER', '物资'],
    ['INVALID_RUNE', '有效的符文'], ['RUNE_NOT_OWNED', '库存不足'], ['RUNE_ALREADY_APPLIED', '同名词条'],
    ['RUNE_REPLACEMENT_INVALID', '旧词条已变化'], ['RUNE_REPLACEMENT_REQUIRED', '槽已满'], ['RUNE_QUALITY_REQUIRED', '+3'],
  ])('maps shop reason %s consistently for offers and API failures', (code, expected) => {
    expect(demonTowerActionReasonMessage(code)).toContain(expected);
    expect(demonTowerActionReasonMessage(`DEMON_TOWER_${code}`)).toContain(expected);
    expect(demonTowerErrorMessage(new CommunityApiError(409, 'internal-only', { code: `DEMON_TOWER_${code}` }))).toContain(expected);
  });
  it('does not render an unrecognized offer reason or raw server detail', () => {
    expect(demonTowerActionReasonMessage('<img src=x> server-secret')).not.toContain('server-secret');
  });
});
