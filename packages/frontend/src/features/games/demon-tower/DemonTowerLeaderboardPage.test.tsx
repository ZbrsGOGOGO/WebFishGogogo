import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DemonTowerCatalog, DemonTowerLeaderboard } from '@stealth-reader/shared';

import { communityDemonTowerApi } from '../../../api/community-demon-tower';
import { CommunityApiError, setCommunitySessionTokens } from '../../../api/community-http';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { DemonTowerLeaderboardPage } from './DemonTowerLeaderboardPage';
import { TOWER_TEST_NOW, TOWER_TEST_USER, towerCatalog } from './test-fixtures';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
const board = (): DemonTowerLeaderboard => ({ serverNow: TOWER_TEST_NOW, serviceDate: '2026-09-09', entries: [], me: null,
  rewardDescription: '按有效首领伤害排名。', award: { officeCoins: 0, status: 'pending', winnerPublicId: null } });
const show = () => render(<MemoryRouter><DemonTowerLeaderboardPage /></MemoryRouter>);

describe('demon tower independent ranking and catalog reads', () => {
  beforeEach(() => {
    vi.restoreAllMocks(); resetCommunityAuthStoreForTests(); setCommunitySessionTokens('synthetic-ranking-race');
    useCommunityAuthStore.setState({ phase: 'active', user: TOWER_TEST_USER, sessionReady: true });
    vi.spyOn(communityDemonTowerApi, 'catalog').mockResolvedValue(towerCatalog());
    vi.spyOn(communityDemonTowerApi, 'leaderboard').mockResolvedValue(board());
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('keeps a failed ranking warning when a parallel catalog retry succeeds later', async () => {
    show(); await screen.findByText('冠军奖励标准 100 办公币');
    const catalog = deferred<DemonTowerCatalog>();
    vi.mocked(communityDemonTowerApi.catalog).mockReturnValueOnce(catalog.promise);
    vi.mocked(communityDemonTowerApi.leaderboard).mockRejectedValueOnce(new CommunityApiError(503, 'synthetic-server-detail'));
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    await screen.findByRole('alert');
    await act(async () => { catalog.resolve(towerCatalog()); });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText('synthetic-server-detail')).toBeNull();
    expect(screen.getByText('冠军奖励标准 100 办公币')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '重新读取' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('keeps a failed catalog warning when a parallel ranking read succeeds later', async () => {
    show(); await screen.findByText('冠军奖励标准 100 办公币');
    const pendingBoard = deferred<DemonTowerLeaderboard>();
    vi.mocked(communityDemonTowerApi.catalog).mockRejectedValueOnce(new CommunityApiError(503, 'synthetic-catalog-detail'));
    vi.mocked(communityDemonTowerApi.leaderboard).mockReturnValueOnce(pendingBoard.promise);
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    await screen.findByRole('alert');
    await act(async () => { pendingBoard.resolve(board()); });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText('synthetic-catalog-detail')).toBeNull();
  });

  it('shows a loading state while the first catalog is still pending', async () => {
    const pendingCatalog = deferred<DemonTowerCatalog>();
    vi.mocked(communityDemonTowerApi.catalog).mockReturnValueOnce(pendingCatalog.promise);
    show();
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('status')).toHaveTextContent('正在读取');
    expect(screen.getByRole('button', { name: '查询' })).toBeDisabled();
    await act(async () => { pendingCatalog.resolve(towerCatalog()); });
    await screen.findByText('冠军奖励标准 100 办公币');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: '查询' })).toBeEnabled();
  });
});
