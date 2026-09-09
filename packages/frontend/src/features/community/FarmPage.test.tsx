import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  communityFarmApi,
  CommunityApiError,
  type CommunityFarmMutationResult,
  type CommunityFarmOverview,
} from '../../api/community';
import {
  resetCommunityAuthStoreForTests,
  useCommunityAuthStore,
} from '../../app/store/community-auth-store';
import { CommunityFarmPage } from './FarmPage';
import { beginCommunityWalletObservation, publishCommunityWalletOverview, resetCommunityWalletStoreForTests, useCommunityWalletStore } from '../../app/store/community-wallet-store';

const ACTIVE_USER = {
  id: 'farm-test-user', publicId: 'farm-test-public', email: 'farm@example.test',
  displayName: '农场测试', accountStatus: 'active' as const, onboardingCompleted: true,
  socialVerificationStatus: 'unverified' as const,
};

const overview: CommunityFarmOverview = {
  serverTime: '2026-08-23T00:00:00.000Z',
  state: 'growing',
  plant: {
    name: '工位薄荷', appearanceKey: 'desk_mint', level: 2, experience: 52,
    experienceInLevel: 12, experienceToNextLevel: 50, careStreak: 1,
    cycleStartedAt: '2026-08-23T00:00:00.000Z', maturesAt: '2026-08-23T00:05:00.000Z',
    cycleSeconds: 300, firstCycle: false,
  },
  growth: {
    farmCoins: 0, officeCoins: 620, totalHarvests: 1, farmVersion: 2,
    skillPointsEarned: 1, skillPointsAvailable: 1,
    nextUnlock: { level: 3, name: '会议番茄', kind: 'crop' },
    plotCount: 1, maxPlotCount: 6,
    nextPlotUnlock: { level: 3, count: 2 }, officeCoinLevelBonusPercent: 0,
    ordersCompleted: 1, ordersTotal: 3,
  },
  crops: [
    { key: 'desk_mint', name: '工位薄荷', mark: '薄', unlockLevel: 1, durationSeconds: 300, experience: 12, coins: 100, seedCost: 10, seedCostPerPlot: 10, description: '成熟最快。', unlocked: true, selected: true, growing: true },
    { key: 'meeting_tomato', name: '会议番茄', mark: '茄', unlockLevel: 3, durationSeconds: 1200, experience: 32, coins: 120, seedCost: 25, seedCostPerPlot: 25, description: '稳定产出。', unlocked: false, selected: false, growing: false },
  ],
  tools: [
    { id: 'watering_can', name: '定时浇水壶', slot: '浇水工具', description: '每级让成熟时间缩短 4%。', level: 0, maxLevel: 5, nextCost: 200 },
  ],
  skills: [
    { id: 'quick_care', name: '快速照料', unlockLevel: 2, description: '每级让成熟时间额外缩短 3%。', level: 0, maxLevel: 5, unlocked: true },
  ],
  standardCycleSeconds: 300,
  firstCycleSeconds: 30,
  dailyRewardClaimed: true,
  encouragementAnimationEnabled: true,
  pendingEncouragements: 0,
};

// Regression fixture matching the reported four-plot coffee planting budget.
const insufficientFarm: CommunityFarmOverview = {
  ...overview,
  state: 'idle',
  plant: {
    ...overview.plant,
    name: '加班咖啡果', level: 13, experience: 1157,
    cycleStartedAt: null, maturesAt: null, cycleSeconds: null,
    firstCycle: true, // Compatibility with an older server's idle-cycle flag.
  },
  growth: { ...overview.growth, officeCoins: 237, plotCount: 4, totalHarvests: 20, ordersCompleted: 3 },
  crops: [
    ...overview.crops.map((crop) => ({ ...crop, seedCost: crop.seedCostPerPlot * 4, selected: false, unlocked: true, growing: false })),
    { ...overview.crops[0], key: 'deadline_strawberry', name: '截止日草莓', seedCost: 240, seedCostPerPlot: 60, selected: false, growing: false },
    { ...overview.crops[0], key: 'overtime_coffee', name: '加班咖啡果', seedCost: 440, seedCostPerPlot: 110, selected: true, growing: false },
  ],
};

function nearlyMatureFarm(): CommunityFarmOverview {
  return { ...overview, serverTime: '2026-08-23T00:04:59.000Z' };
}

function quotedFarm(ordersCompleted = 1): CommunityFarmOverview {
  const bonus = ordersCompleted >= 3 ? 0 : 120;
  return {
    ...overview, growth: { ...overview.growth, ordersCompleted },
    crops: overview.crops.map((crop, index) => {
      const base = index === 0 ? 20 : 60;
      return { ...crop, baseHarvestCoins: base, nextOrderBonusCoins: bonus, totalHarvestCoins: base + bonus, estimatedNetCoins: base + bonus - crop.seedCost };
    }),
  };
}

async function advanceTime(milliseconds: number): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
}

describe('CommunityFarmPage growth system', () => {
  beforeEach(() => {
    resetCommunityAuthStoreForTests();
    resetCommunityWalletStoreForTests();
    localStorage.clear();
    useCommunityAuthStore.setState({ phase: 'active', sessionReady: true, user: ACTIVE_USER });
    vi.spyOn(communityFarmApi, 'getOverview').mockResolvedValue(overview);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the simple main loop and the optional growth layers together', async () => {
    render(<CommunityFarmPage />);
    expect(await screen.findByRole('heading', { name: '我的工位农场' })).toBeInTheDocument();
    expect(screen.getByText('农场等级')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '我的地块' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '选择下一轮作物' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '三件农场工具' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '三条农场技能' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lv.3 解锁' })).toBeDisabled();
  });

  it('keeps the planted crop illustration when a different crop is selected for the next cycle', async () => {
    vi.mocked(communityFarmApi.getOverview).mockResolvedValue({ ...overview,
      crops: overview.crops.map((crop) => ({ ...crop, selected: crop.key === 'meeting_tomato' })),
    });
    const { container } = render(<CommunityFarmPage />);
    expect(await screen.findByRole('heading', { name: '工位薄荷' })).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"] [data-crop-art]')).toHaveAttribute('data-crop-art', 'desk_mint');
    const plots = screen.getByRole('heading', { name: '我的地块' }).closest('section')!;
    expect(within(plots).getByRole('img')).toHaveAttribute('data-crop-art', 'desk_mint');
    expect(screen.getByRole('img', { name: '会议番茄图标' })).toHaveAttribute('data-crop-art', 'meeting_tomato');
  });

  it('shows the selected next crop in an idle plot without changing a growing crop', async () => {
    vi.mocked(communityFarmApi.getOverview).mockResolvedValue({ ...overview, state: 'idle',
      crops: overview.crops.map((crop) => ({ ...crop, growing: false, selected: crop.key === 'meeting_tomato' })),
    });
    const { container } = render(<CommunityFarmPage />);
    expect(await screen.findByRole('heading', { name: '会议番茄' })).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"] [data-crop-art]')).toHaveAttribute('data-crop-art', 'meeting_tomato');
    const plots = screen.getByRole('heading', { name: '我的地块' }).closest('section')!;
    expect(within(plots).getByRole('img')).toHaveAttribute('data-crop-art', 'meeting_tomato');
  });

  it('prominently shows the real balance and server-supplied income breakdown', async () => {
    vi.mocked(communityFarmApi.getOverview).mockResolvedValue(quotedFarm());
    render(<CommunityFarmPage />);
    expect(await screen.findByLabelText('农场办公币余额')).toHaveTextContent('620');
    expect(screen.getByLabelText('农场办公币余额')).toHaveTextContent('每次收获都有基础收益');
    const budget = screen.getByLabelText('下一轮种植预算');
    expect(budget).toHaveTextContent('每轮基础收益+20 办公币');
    expect(budget).toHaveTextContent('下次订单额外+120 办公币');
    expect(budget).toHaveTextContent('预计收获入账+140 办公币');
    expect(budget).toHaveTextContent('扣种子后预计净收益+130 办公币');
    expect(useCommunityWalletStore.getState()).toMatchObject({ officeCoins: 620, ownerId: ACTIVE_USER.publicId });
  });

  it('still quotes a positive base harvest after the three daily extra orders are exhausted', async () => {
    vi.mocked(communityFarmApi.getOverview).mockResolvedValue(quotedFarm(3));
    render(<CommunityFarmPage />);
    const budget = await screen.findByLabelText('下一轮种植预算');
    expect(budget).toHaveTextContent('每轮基础收益+20 办公币');
    expect(budget).toHaveTextContent('下次订单额外+0 办公币');
    expect(budget).toHaveTextContent('预计收获入账+20 办公币');
    expect(budget).toHaveTextContent('扣种子后预计净收益+10 办公币');
    expect(screen.getByLabelText('农场办公币余额')).toHaveTextContent('后续收获仍有基础收益');
  });

  it('keeps the growing crop separate from a different next crop and does not invent historical net income', async () => {
    const quoted = quotedFarm(3);
    vi.mocked(communityFarmApi.getOverview).mockResolvedValue({
      ...quoted, crops: quoted.crops.map((crop, index) => ({ ...crop, unlocked: true, selected: index === 1 })),
    });
    render(<CommunityFarmPage />);
    const current = await screen.findByLabelText('本轮收获预估');
    expect(current).toHaveTextContent('本轮作物：工位薄荷');
    expect(current).toHaveTextContent('预计收获入账+20 办公币');
    expect(current).not.toHaveTextContent('预计净收益');
    const next = screen.getByLabelText('下一轮种植预算');
    expect(next).toHaveTextContent('下一轮作物：会议番茄');
    expect(next).toHaveTextContent('预计收获入账+60 办公币');
    expect(next).toHaveTextContent('扣种子后预计净收益+35 办公币');
  });

  it('labels legacy income fields as unsynced instead of using ambiguous coins or inventing zero', async () => {
    render(<CommunityFarmPage />);
    const budget = await screen.findByLabelText('下一轮种植预算');
    expect(budget).toHaveTextContent('收益报价待同步');
    expect(within(budget).queryByText('每轮基础收益')).not.toBeInTheDocument();
    expect(within(budget).queryByText('+0 办公币')).not.toBeInTheDocument();
  });

  it('explains free onboarding net income without subtracting a seed fee that was not paid', async () => {
    const quoted = quotedFarm();
    vi.mocked(communityFarmApi.getOverview).mockResolvedValue({
      ...quoted, state: 'idle', plant: { ...quoted.plant, firstCycle: true, maturesAt: null },
      growth: { ...quoted.growth, totalHarvests: 0 },
    });
    render(<CommunityFarmPage />);
    const budget = await screen.findByLabelText('下一轮种植预算');
    expect(budget).toHaveTextContent('首次种植免费');
    expect(budget).toHaveTextContent('首轮免费预计净收益+140 办公币');
  });

  it('shows separate server rewards and synchronizes the post-replant balance after harvesting', async () => {
    const quoted = quotedFarm(3);
    vi.mocked(communityFarmApi.getOverview).mockResolvedValue({ ...quoted, state: 'ready' });
    vi.spyOn(communityFarmApi, 'harvestAndCare').mockResolvedValue({
      farm: { ...quoted, growth: { ...quoted.growth, officeCoins: 630 } },
      reward: { standardRewardGranted: false, onboardingRewardGranted: false, orderRewardGranted: false, ordersCompleted: 3, ordersTotal: 3, farmExperience: 12, officeCoins: 20, baseCoins: 20, orderBonusCoins: 0, levelUp: false, summary: null },
    });
    render(<CommunityFarmPage />);
    fireEvent.click(await screen.findByRole('button', { name: '收获并尝试种下新一轮' }));
    expect(await screen.findByText(/收获成功：基础收益 \+20，订单额外 \+0，本次入账 \+20 办公币/)).toBeInTheDocument();
    expect(screen.getByLabelText('农场办公币余额')).toHaveTextContent('630');
    expect(useCommunityWalletStore.getState()).toMatchObject({ officeCoins: 630, status: 'ready' });
  });

  it('preserves the authoritative harvest summary including automatic seed debit and remaining balance', async () => {
    vi.mocked(communityFarmApi.getOverview).mockResolvedValue({ ...overview, state: 'ready' });
    vi.spyOn(communityFarmApi, 'harvestAndCare').mockResolvedValue({
      farm: { ...overview, growth: { ...overview.growth, officeCoins: 402 } },
      reward: { standardRewardGranted: false, onboardingRewardGranted: false, orderRewardGranted: false, ordersCompleted: 3, ordersTotal: 3, farmExperience: 12, officeCoins: 567, baseCoins: 567, orderBonusCoins: 0, levelUp: false, summary: '基础收益 +567；订单额外 +0；下一轮扣种子 180 办公币；当前余额 402 办公币。' },
    });
    render(<CommunityFarmPage />);
    fireEvent.click(await screen.findByRole('button', { name: '收获并尝试种下新一轮' }));
    const notice = await screen.findByText(/下一轮扣种子 180 办公币/);
    expect(notice).toHaveTextContent('下一轮扣种子 180 办公币');
    expect(notice).toHaveTextContent('当前余额 402 办公币');
  });

  it('rejects an old mutation receipt, preserves newer data, and reads a fresh overview', async () => {
    const initial = { ...overview, state: 'idle' as const, serverTime: '2026-08-23T00:00:20.000Z' };
    const fresh = { ...overview, serverTime: '2026-08-23T00:00:30.000Z', growth: { ...overview.growth, officeCoins: 610 } };
    vi.mocked(communityFarmApi.getOverview).mockResolvedValueOnce(initial).mockResolvedValue(fresh);
    vi.spyOn(communityFarmApi, 'care').mockResolvedValue({ farm: { ...overview, serverTime: '2026-08-23T00:00:10.000Z', growth: { ...overview.growth, officeCoins: 999 } } });
    render(<CommunityFarmPage />);
    fireEvent.click(await screen.findByRole('button', { name: '浇水，开始成长' }));
    expect(await screen.findByRole('button', { name: '正在成长' })).toBeDisabled();
    expect(screen.getByLabelText('农场办公币余额')).toHaveTextContent('610');
    expect(screen.getByLabelText('农场办公币余额')).not.toHaveTextContent('999');
    expect(communityFarmApi.getOverview).toHaveBeenCalledTimes(2);
    expect(useCommunityWalletStore.getState()).toMatchObject({ officeCoins: 610, status: 'ready' });
  });

  it('keeps the farm balance and affordability in sync with a newer shared server read', async () => {
    render(<CommunityFarmPage />);
    await screen.findByLabelText('农场办公币余额');
    act(() => publishCommunityWalletOverview(beginCommunityWalletObservation(), {
      ...overview, serverTime: '2026-08-23T00:01:00.000Z', growth: { ...overview.growth, officeCoins: 15 },
    }));
    expect(screen.getByLabelText('农场办公币余额')).toHaveTextContent('15办公币');
    expect(screen.getByLabelText('下一轮种植预算')).toHaveTextContent('当前余额：15 办公币');
    expect(screen.getByRole('button', { name: '200 办公币升级' })).toBeDisabled();
  });

  it('still opens the farm when the shared header read finishes before its older initial read', async () => {
    let resolve!: (farm: CommunityFarmOverview) => void;
    vi.mocked(communityFarmApi.getOverview).mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<CommunityFarmPage />);
    act(() => publishCommunityWalletOverview(beginCommunityWalletObservation(), {
      ...overview, serverTime: '2026-08-23T00:01:00.000Z', growth: { ...overview.growth, officeCoins: 420 },
    }));
    await act(async () => { resolve(overview); });
    expect(screen.getByRole('heading', { name: '我的工位农场' })).toBeInTheDocument();
    expect(screen.getByLabelText('农场办公币余额')).toHaveTextContent('420办公币');
    expect(screen.queryByText('绿植暂时没连上')).not.toBeInTheDocument();
  });

  it('marks the retained farm balance unsynced after a failed refresh', async () => {
    vi.mocked(communityFarmApi.getOverview).mockResolvedValueOnce(overview).mockRejectedValue(new Error('offline'));
    render(<CommunityFarmPage />);
    fireEvent.click(await screen.findByRole('button', { name: '刷新状态' }));
    expect(await screen.findByText('余额待同步 · 当前显示上次确认值')).toBeInTheDocument();
    expect(screen.getByLabelText('农场办公币余额')).toHaveTextContent('620办公币');
  });

  it('sends versioned tool upgrades and refreshes the server state', async () => {
    const upgraded: CommunityFarmOverview = {
      ...overview,
      growth: { ...overview.growth, officeCoins: 420, farmVersion: 3 },
      tools: overview.tools.map((tool) => ({ ...tool, level: 1, nextCost: 500 })),
    };
    const upgrade = vi.spyOn(communityFarmApi, 'upgradeTool').mockResolvedValue({ farm: upgraded, cost: 200 });
    render(<CommunityFarmPage />);
    const tool = await screen.findByText('定时浇水壶');
    fireEvent.click(within(tool.closest('article')!).getByRole('button', { name: '200 办公币升级' }));
    expect(upgrade).toHaveBeenCalledWith('watering_can', 2, expect.any(String));
    expect(await screen.findByText(/定时浇水壶已升到 Lv\.1/)).toBeInTheDocument();
  });

  it('explains the real planting shortage and allows a deliberate affordable crop choice', async () => {
    vi.mocked(communityFarmApi.getOverview).mockResolvedValue(insufficientFarm);
    const tomatoFarm: CommunityFarmOverview = {
      ...insufficientFarm,
      plant: { ...insufficientFarm.plant, name: '会议番茄' },
      growth: { ...insufficientFarm.growth, farmVersion: 3 },
      crops: insufficientFarm.crops.map((crop) => ({ ...crop, selected: crop.key === 'meeting_tomato' })),
    };
    const select = vi.spyOn(communityFarmApi, 'selectCrop').mockResolvedValue({ farm: tomatoFarm });
    const care = vi.spyOn(communityFarmApi, 'care').mockResolvedValue({
      farm: { ...tomatoFarm, state: 'growing', growth: { ...tomatoFarm.growth, officeCoins: 137 } },
    });
    render(<CommunityFarmPage />);

    const budget = await screen.findByLabelText('下一轮种植预算');
    expect(budget).toHaveTextContent('110 办公币/块 × 4 块 = 440 办公币');
    expect(budget).toHaveTextContent('当前余额：237 办公币，还差 203');
    expect(budget).toHaveTextContent('工位薄荷（40 办公币）');
    expect(budget).toHaveTextContent('会议番茄（100 办公币）');
    expect(budget).not.toHaveTextContent('截止日草莓');
    expect(screen.getByRole('button', { name: '办公币不足，请先选择低成本作物' })).toBeDisabled();
    expect(select).not.toHaveBeenCalled();
    expect(care).not.toHaveBeenCalled();

    const tomato = within(screen.getByRole('region', { name: '选择下一轮作物' })).getByText('会议番茄').closest('article')!;
    fireEvent.click(within(tomato).getByRole('button', { name: '设为下一轮' }));
    expect(select).toHaveBeenCalledWith('meeting_tomato', 2, expect.any(String));
    expect(await screen.findByText(/会议番茄已设为下一轮作物/)).toBeInTheDocument();
    expect(care).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '浇水，开始成长' }));
    expect(care).toHaveBeenCalledOnce();
    expect(await screen.findByText('照料完成！绿植已经开始成长。')).toBeInTheDocument();
  });

  it('keeps first-time planting free even with no office coins', async () => {
    vi.mocked(communityFarmApi.getOverview).mockResolvedValue({
      ...insufficientFarm,
      growth: { ...insufficientFarm.growth, totalHarvests: 0, officeCoins: 0 },
    });
    render(<CommunityFarmPage />);
    expect(await screen.findByRole('button', { name: '浇水，开始成长' })).toBeEnabled();
    expect(screen.getByLabelText('下一轮种植预算')).toHaveTextContent('首次种植免费');
  });

  it('never blocks a mature harvest for low balance or claims an idle farm was replanted', async () => {
    vi.mocked(communityFarmApi.getOverview).mockResolvedValue({ ...insufficientFarm, state: 'ready' });
    const harvest = vi.spyOn(communityFarmApi, 'harvestAndCare').mockResolvedValue({
      farm: { ...insufficientFarm, growth: { ...insufficientFarm.growth, totalHarvests: 21 } },
    });
    render(<CommunityFarmPage />);

    const harvestButton = await screen.findByRole('button', { name: '收获并尝试种下新一轮' });
    expect(harvestButton).toBeEnabled();
    expect(screen.getByLabelText('下一轮种植预算')).toHaveTextContent('仍可收获，收益会先到账');
    fireEvent.click(harvestButton);
    expect(harvest).toHaveBeenCalledOnce();
    const success = (await screen.findByText(/本次收获已保存/)).closest('[role="status"]')!;
    expect(success).toHaveTextContent('本次收获已保存');
    expect(success).toHaveTextContent('尚未续种');
    expect(success).not.toHaveTextContent('下一轮成长已经开始');
    expect(screen.getByRole('button', { name: '办公币不足，请先选择低成本作物' })).toBeDisabled();
  });

  it('shows the server shortage when the displayed balance is stale and offers a real refresh', async () => {
    vi.mocked(communityFarmApi.getOverview)
      .mockResolvedValueOnce({ ...insufficientFarm, growth: { ...insufficientFarm.growth, officeCoins: 500 } })
      .mockResolvedValue(insufficientFarm);
    vi.spyOn(communityFarmApi, 'care').mockRejectedValue(new CommunityApiError(409, 'Conflict', {
      code: 'OFFICE_COIN_INSUFFICIENT', required: 440, current: 237,
    }));
    render(<CommunityFarmPage />);
    fireEvent.click(await screen.findByRole('button', { name: '浇水，开始成长' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('办公币不足：需要 440 办公币，当前 237，还差 203');
    expect(screen.getByRole('alert')).not.toHaveTextContent('状态已经变化');
    fireEvent.click(screen.getByRole('button', { name: '刷新状态' }));
    expect(await screen.findByRole('button', { name: '办公币不足，请先选择低成本作物' })).toBeDisabled();
    expect(communityFarmApi.getOverview).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('retries a failed maturity confirmation after a delay and then enables harvest', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-23T00:04:59.000Z'));
    vi.mocked(communityFarmApi.getOverview)
      .mockResolvedValueOnce(nearlyMatureFarm())
      .mockRejectedValueOnce(new CommunityApiError(0, 'Network error'))
      .mockResolvedValue({ ...overview, state: 'ready', serverTime: '2026-08-23T00:05:03.000Z' });
    await act(async () => { render(<CommunityFarmPage />); });
    await advanceTime(1000);
    expect(communityFarmApi.getOverview).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('alert')).toHaveTextContent('网络连接失败');
    await advanceTime(2000);
    expect(communityFarmApi.getOverview).toHaveBeenCalledTimes(2);
    await advanceTime(1000);
    expect(communityFarmApi.getOverview).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('button', { name: '收获并尝试种下新一轮' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('limits automatic maturity retries but lets a manual refresh recover afterwards', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-23T00:04:59.000Z'));
    vi.mocked(communityFarmApi.getOverview)
      .mockResolvedValueOnce(nearlyMatureFarm())
      .mockRejectedValue(new CommunityApiError(0, 'Network error'));
    await act(async () => { render(<CommunityFarmPage />); });
    await advanceTime(1000);
    await advanceTime(3000);
    await advanceTime(8000);
    expect(communityFarmApi.getOverview).toHaveBeenCalledTimes(4);
    expect(screen.getByText('成熟状态尚未确认，请点击“刷新状态”重试。')).toBeInTheDocument();
    await advanceTime(60_000);
    expect(communityFarmApi.getOverview).toHaveBeenCalledTimes(4);
    expect(screen.getByRole('alert')).toHaveTextContent('网络连接失败');

    vi.mocked(communityFarmApi.getOverview).mockResolvedValue({ ...overview, state: 'ready', serverTime: new Date().toISOString() });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '刷新状态' })); });
    expect(communityFarmApi.getOverview).toHaveBeenCalledTimes(5);
    expect(screen.getByRole('button', { name: '收获并尝试种下新一轮' })).toBeEnabled();
  });

  it('stops pending maturity retries when the farm page is unmounted', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-23T00:04:59.000Z'));
    vi.mocked(communityFarmApi.getOverview)
      .mockResolvedValueOnce(nearlyMatureFarm())
      .mockRejectedValue(new CommunityApiError(0, 'Network error'));
    let unmount!: () => void;
    await act(async () => { ({ unmount } = render(<CommunityFarmPage />)); });
    await advanceTime(1000);
    expect(communityFarmApi.getOverview).toHaveBeenCalledTimes(2);
    unmount();
    await advanceTime(60_000);
    expect(communityFarmApi.getOverview).toHaveBeenCalledTimes(2);
  });

  it('publishes an already-started mutation to the same-session wallet after leaving the farm page', async () => {
    vi.mocked(communityFarmApi.getOverview).mockResolvedValue({ ...overview, state: 'idle' });
    let resolve!: (result: CommunityFarmMutationResult) => void;
    vi.spyOn(communityFarmApi, 'care').mockReturnValue(new Promise((done) => { resolve = done; }));
    const { unmount } = render(<CommunityFarmPage />);
    fireEvent.click(await screen.findByRole('button', { name: '浇水，开始成长' }));
    unmount();
    await act(async () => { resolve({ farm: { ...overview, serverTime: '2026-08-23T00:00:30.000Z', growth: { ...overview.growth, officeCoins: 610 } } }); });
    expect(useCommunityWalletStore.getState()).toMatchObject({ ownerId: ACTIVE_USER.publicId, officeCoins: 610, status: 'ready' });
  });

  it('does not publish a departed farm mutation into a different account session', async () => {
    vi.mocked(communityFarmApi.getOverview).mockResolvedValue({ ...overview, state: 'idle' });
    let resolve!: (result: CommunityFarmMutationResult) => void;
    vi.spyOn(communityFarmApi, 'care').mockReturnValue(new Promise((done) => { resolve = done; }));
    const { unmount } = render(<CommunityFarmPage />);
    fireEvent.click(await screen.findByRole('button', { name: '浇水，开始成长' }));
    unmount();
    act(() => useCommunityAuthStore.setState({ user: { ...ACTIVE_USER, publicId: 'new-wallet-owner' } }));
    await act(async () => { resolve({ farm: { ...overview, growth: { ...overview.growth, officeCoins: 999 } } }); });
    expect(useCommunityWalletStore.getState()).toMatchObject({ ownerId: 'new-wallet-owner', officeCoins: null });
  });

  it('serializes watering, crop selection, upgrades and refresh requests', async () => {
    const idleFarm: CommunityFarmOverview = { ...overview, state: 'idle', plant: { ...overview.plant, maturesAt: null } };
    vi.mocked(communityFarmApi.getOverview).mockResolvedValue(idleFarm);
    let resolveCare!: (result: CommunityFarmMutationResult) => void;
    const care = vi.spyOn(communityFarmApi, 'care').mockImplementation(() => new Promise((resolve) => { resolveCare = resolve; }));
    const upgrade = vi.spyOn(communityFarmApi, 'upgradeTool');
    render(<CommunityFarmPage />);
    const waterButton = await screen.findByRole('button', { name: '浇水，开始成长' });
    fireEvent.click(waterButton);
    fireEvent.click(waterButton);
    expect(screen.getByRole('button', { name: '刷新状态' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '200 办公币升级' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '刷新状态' }));
    fireEvent.click(screen.getByRole('button', { name: '200 办公币升级' }));
    expect(care).toHaveBeenCalledOnce();
    expect(upgrade).not.toHaveBeenCalled();
    expect(communityFarmApi.getOverview).toHaveBeenCalledOnce();
    await act(async () => { resolveCare({ farm: overview }); });
    expect(screen.getByRole('button', { name: '刷新状态' })).toBeEnabled();
  });

  it('ignores a late mutation response after switching accounts', async () => {
    vi.mocked(communityFarmApi.getOverview)
      .mockResolvedValueOnce({ ...overview, state: 'idle', plant: { ...overview.plant, maturesAt: null } })
      .mockResolvedValue(insufficientFarm);
    let resolveCare!: (result: CommunityFarmMutationResult) => void;
    vi.spyOn(communityFarmApi, 'care').mockImplementation(() => new Promise((resolve) => { resolveCare = resolve; }));
    render(<CommunityFarmPage />);
    fireEvent.click(await screen.findByRole('button', { name: '浇水，开始成长' }));
    await act(async () => {
      useCommunityAuthStore.setState({ user: {
        id: 'second-user', publicId: 'second-public', email: 'second@example.test',
        displayName: '第二个账号', accountStatus: 'active', onboardingCompleted: true,
        socialVerificationStatus: 'unverified',
      } });
    });
    expect(screen.getByLabelText('下一轮种植预算')).toHaveTextContent('当前余额：237');
    await act(async () => { resolveCare({ farm: overview }); });
    expect(screen.getByLabelText('下一轮种植预算')).toHaveTextContent('当前余额：237');
    expect(useCommunityWalletStore.getState()).toMatchObject({ ownerId: 'second-public', officeCoins: 237 });
    expect(screen.queryByText('照料完成！绿植已经开始成长。')).not.toBeInTheDocument();
  });

  it('preserves local guest watering without sending farm requests', async () => {
    useCommunityAuthStore.setState({ phase: 'guest', user: null });
    const care = vi.spyOn(communityFarmApi, 'care');
    render(<CommunityFarmPage />);
    fireEvent.click(await screen.findByRole('button', { name: '浇水，开始成长' }));
    expect(await screen.findByText('浇水完成！第一轮 30 秒后成熟。')).toBeInTheDocument();
    expect(communityFarmApi.getOverview).not.toHaveBeenCalled();
    expect(care).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('zbrs.guest-farm.v1')!)).toMatchObject({ state: 'growing' });
    expect(screen.getByLabelText('本机试玩余额')).toHaveTextContent('不是账号资产');
    expect(screen.queryByLabelText('农场办公币余额')).not.toBeInTheDocument();
    expect(useCommunityWalletStore.getState().officeCoins).toBeNull();
  });

  it('keeps giving explicitly local base demo rewards after all extra demo orders are done', async () => {
    useCommunityAuthStore.setState({ phase: 'guest', user: null });
    localStorage.setItem('zbrs.guest-farm.v1', JSON.stringify({
      ...overview, state: 'ready', growth: { ...overview.growth, officeCoins: 60, ordersCompleted: 3 },
    }));
    render(<CommunityFarmPage />);
    fireEvent.click(await screen.findByRole('button', { name: '收获并尝试种下新一轮' }));
    expect(await screen.findByRole('status')).toHaveTextContent('基础试玩币 +20');
    expect(screen.getByLabelText('本机试玩余额')).toHaveTextContent('80');
    expect(communityFarmApi.getOverview).not.toHaveBeenCalled();
    expect(useCommunityWalletStore.getState().officeCoins).toBeNull();
  });
});
