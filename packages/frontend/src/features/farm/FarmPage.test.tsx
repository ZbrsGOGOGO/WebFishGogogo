import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  farmApi,
  type FarmOverview,
  type FarmPlot,
} from '../../api/farm';
import { FarmPage } from './FarmPage';

const NOW = new Date('2026-07-24T01:00:00.000Z');

function makePlots(overrides: Partial<FarmPlot>[] = []): FarmPlot[] {
  return Array.from({ length: 6 }, (_, index) => ({
    id: `plot-${index + 1}`,
    slotIndex: index,
    state: index >= 4 ? 'locked' : 'empty',
    crop: null,
    plantedAt: null,
    maturesAt: null,
    ...overrides[index],
  }));
}

function makeOverview(
  overrides: Partial<FarmOverview> = {},
  plots: FarmPlot[] = makePlots(),
): FarmOverview {
  return {
    serverTime: NOW.toISOString(),
    farm: {
      level: 2,
      experience: 45,
      expToNextLevel: 55,
      plotCount: 4,
    },
    assets: {
      water: 8,
      sunlight: 5,
      fertilizer: 2,
    },
    inventory: {
      wheatSeed: 4,
      strawberrySeed: 2,
      coffeeSeed: 1,
    },
    crops: [
      {
        slug: 'wheat',
        name: '小麦',
        emoji: '🌾',
        growSeconds: 1800,
        requiredLevel: 1,
        plantCost: {
          water: 1,
          seedSlug: 'wheatSeed',
          seedQuantity: 1,
        },
        rewards: { experience: 10 },
      },
      {
        slug: 'strawberry',
        name: '草莓',
        emoji: '🍓',
        growSeconds: 7200,
        requiredLevel: 2,
        plantCost: {
          water: 2,
          seedSlug: 'strawberrySeed',
          seedQuantity: 1,
        },
        rewards: { experience: 10, decorationCoin: 1 },
      },
      {
        slug: 'coffee',
        name: '咖啡豆',
        emoji: '☕',
        growSeconds: 14400,
        requiredLevel: 3,
        plantCost: {
          water: 3,
          seedSlug: 'coffeeSeed',
          seedQuantity: 1,
        },
        rewards: { energy: 1 },
      },
    ],
    plots,
    ...overrides,
  };
}

describe('FarmPage', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('土地前置且只展示已实现的五块土地与真实资源', async () => {
    vi.spyOn(farmApi, 'getFarm').mockResolvedValue(makeOverview());

    render(<FarmPage />);

    expect(screen.getByRole('status')).toHaveTextContent('正在加载农场');
    expect(await screen.findByText('Lv.2')).toBeInTheDocument();
    expect(screen.getByLabelText('农场地块').children).toHaveLength(5);
    expect(screen.getByText('水滴')).toBeInTheDocument();
    expect(screen.getByText('小麦种子')).toBeInTheDocument();
    expect(screen.getByText('草莓种子')).toBeInTheDocument();
    expect(screen.getByText('咖啡种子')).toBeInTheDocument();
    expect(screen.queryByText('阳光')).not.toBeInTheDocument();
    expect(screen.queryByText('肥料')).not.toBeInTheDocument();
    expect(screen.queryByText('第 6 块地')).not.toBeInTheDocument();
    expect(screen.getByText('玩法说明')).toBeInTheDocument();
    expect(screen.queryByText(/后续扩展/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /小麦/ })).toBeDisabled();
  });

  it('选择空地后滚动作物区，并直接采用种植响应', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    const plantedPlots = makePlots([
      {
        state: 'growing',
        crop: { slug: 'wheat', name: '小麦', emoji: '🌾' },
        plantedAt: NOW.toISOString(),
        maturesAt: new Date(NOW.getTime() + 1_800_000).toISOString(),
      },
    ]);
    const getSpy = vi.spyOn(farmApi, 'getFarm').mockResolvedValue(makeOverview());
    const plantSpy = vi
      .spyOn(farmApi, 'plantCrop')
      .mockResolvedValue(makeOverview({}, plantedPlots));

    render(<FarmPage />);

    fireEvent.click(
      (await screen.findAllByRole('button', { name: '选择作物' }))[0],
    );
    expect(
      screen.getByText('第 1 块地已选中，请在下方选择作物。'),
    ).toBeInTheDocument();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /小麦/ }));
    fireEvent.click(screen.getByRole('button', { name: '开始种植' }));

    await waitFor(() =>
      expect(plantSpy).toHaveBeenCalledWith('plot-1', 'wheat'),
    );
    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('距离成熟')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      '第 1 块地已种下小麦',
    );
  });

  it('收获成熟作物后直接采用响应并提示奖励到账', async () => {
    const readyPlots = makePlots([
      {
        state: 'ready',
        crop: { slug: 'wheat', name: '小麦', emoji: '🌾' },
        plantedAt: new Date(NOW.getTime() - 1_800_000).toISOString(),
        maturesAt: NOW.toISOString(),
      },
    ]);
    const getSpy = vi
      .spyOn(farmApi, 'getFarm')
      .mockResolvedValue(makeOverview({}, readyPlots));
    const harvestedOverview = makeOverview({
      farm: {
        level: 2,
        experience: 55,
        expToNextLevel: 45,
        plotCount: 4,
      },
    });
    const harvestSpy = vi
      .spyOn(farmApi, 'harvestCrop')
      .mockResolvedValue(harvestedOverview);

    render(<FarmPage />);

    fireEvent.click(await screen.findByRole('button', { name: '收获' }));

    await waitFor(() =>
      expect(harvestSpy).toHaveBeenCalledWith('plot-1'),
    );
    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(
      await screen.findAllByRole('button', { name: '选择作物' }),
    ).toHaveLength(4);
    expect(screen.getByRole('status')).toHaveTextContent(
      '小麦收获成功，奖励已到账：+10 EXP · +10 农场 EXP',
    );
  });

  it('使用服务器时间显示倒计时，并在到期后开放收获', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const growingPlots = makePlots([
      {
        state: 'growing',
        crop: { slug: 'wheat', name: '小麦', emoji: '🌾' },
        plantedAt: NOW.toISOString(),
        maturesAt: new Date(NOW.getTime() + 2_000).toISOString(),
      },
    ]);
    vi.spyOn(farmApi, 'getFarm').mockResolvedValue(
      makeOverview({}, growingPlots),
    );

    render(<FarmPage />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('00:00:02')).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByRole('button', { name: '收获' })).toBeInTheDocument();
  });

  it('加载失败时展示错误并允许重试', async () => {
    const getSpy = vi
      .spyOn(farmApi, 'getFarm')
      .mockRejectedValueOnce(new Error('农场服务暂时不可用'))
      .mockResolvedValueOnce(makeOverview());

    render(<FarmPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '农场服务暂时不可用',
    );
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));

    expect(await screen.findByText('Lv.2')).toBeInTheDocument();
    expect(getSpy).toHaveBeenCalledTimes(2);
  });

  it('种植失败时保留选择并展示操作错误', async () => {
    vi.spyOn(farmApi, 'getFarm').mockResolvedValue(makeOverview());
    vi.spyOn(farmApi, 'plantCrop').mockRejectedValue(
      new Error('水滴数量不足'),
    );

    render(<FarmPage />);
    fireEvent.click(
      (await screen.findAllByRole('button', { name: '选择作物' }))[0],
    );
    fireEvent.click(screen.getByRole('button', { name: /小麦/ }));
    fireEvent.click(screen.getByRole('button', { name: '开始种植' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '种植未完成，当前仍显示操作前的数据。水滴数量不足',
    );
    expect(screen.getByText('已选择：🌾 小麦')).toBeInTheDocument();
  });

  it('刷新失败时保留上次数据并明确提示数据可能陈旧', async () => {
    const getSpy = vi
      .spyOn(farmApi, 'getFarm')
      .mockResolvedValueOnce(makeOverview())
      .mockRejectedValueOnce(new Error('网络连接中断'));

    render(<FarmPage />);
    expect(await screen.findByText('Lv.2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '刷新农场' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '当前仍显示上次成功同步的农场数据。网络连接中断',
    );
    expect(screen.getByText('Lv.2')).toBeInTheDocument();
    expect(getSpy).toHaveBeenCalledTimes(2);
  });
});
