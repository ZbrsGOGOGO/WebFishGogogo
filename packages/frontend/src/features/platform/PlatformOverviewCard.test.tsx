import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { platformApi, type PlatformOverview } from '../../api/platform';
import { PlatformOverviewCard } from './PlatformOverviewCard';

const OVERVIEW: PlatformOverview = {
  profile: {
    level: 3,
    exp: 280,
    expToNextLevel: 120,
    title: '阅读摸鱼员',
    energy: 8,
    energyCap: 15,
  },
  balances: {
    officeCoin: 1260,
    decorationCoin: 32,
    water: 6,
    sunlight: 9,
    fertilizer: 2,
  },
  checkin: {
    checkedInToday: false,
  },
};

describe('PlatformOverviewCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('展示加载态并渲染角色、精力和全部基础资产', async () => {
    vi.spyOn(platformApi, 'getOverview').mockResolvedValue(OVERVIEW);

    render(<PlatformOverviewCard />);

    expect(screen.getByRole('status')).toHaveTextContent('正在加载成长数据');
    expect(await screen.findByText('阅读摸鱼员')).toBeInTheDocument();
    expect(screen.getByText('Lv.3')).toBeInTheDocument();
    expect(screen.getByText(/280 EXP/)).toHaveTextContent('距升级还需 120 EXP');
    expect(screen.getByText('8 / 15')).toBeInTheDocument();

    for (const label of ['办公币', '装饰币', '水滴', '阳光', '肥料']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('1,260')).toBeInTheDocument();
  });

  it('签到成功后重新获取总览并展示已签到状态', async () => {
    const checkedIn: PlatformOverview = {
      ...OVERVIEW,
      profile: { ...OVERVIEW.profile, exp: 290 },
      balances: { ...OVERVIEW.balances, water: 7 },
      checkin: { checkedInToday: true },
    };
    const overviewSpy = vi
      .spyOn(platformApi, 'getOverview')
      .mockResolvedValueOnce(OVERVIEW)
      .mockResolvedValueOnce(checkedIn);
    const checkinSpy = vi.spyOn(platformApi, 'checkInToday').mockResolvedValue({
      checkedInToday: true,
    });
    const onCheckinComplete = vi.fn();

    render(
      <PlatformOverviewCard onCheckinComplete={onCheckinComplete} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: '今日签到' }));

    await waitFor(() => expect(checkinSpy).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(overviewSpy).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole('button', { name: '今日已签到' }),
    ).toBeDisabled();
    expect(onCheckinComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/290 EXP/)).toBeInTheDocument();
  });

  it('将首次加载和签到后的最新总览同步给父页面', async () => {
    const checkedIn: PlatformOverview = {
      ...OVERVIEW,
      checkin: { checkedInToday: true },
    };
    vi.spyOn(platformApi, 'getOverview')
      .mockResolvedValueOnce(OVERVIEW)
      .mockResolvedValueOnce(checkedIn);
    vi.spyOn(platformApi, 'checkInToday').mockResolvedValue({
      checkedInToday: true,
    });
    const onOverviewChange = vi.fn();

    render(
      <PlatformOverviewCard onOverviewChange={onOverviewChange} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: '今日签到' }));
    await waitFor(() => expect(onOverviewChange).toHaveBeenCalledTimes(2));
    expect(onOverviewChange).toHaveBeenNthCalledWith(1, OVERVIEW);
    expect(onOverviewChange).toHaveBeenNthCalledWith(2, checkedIn);
  });

  it('总览加载失败时展示错误并支持重试', async () => {
    const overviewSpy = vi
      .spyOn(platformApi, 'getOverview')
      .mockRejectedValueOnce(new Error('服务暂时不可用'))
      .mockResolvedValueOnce(OVERVIEW);

    render(<PlatformOverviewCard />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '服务暂时不可用',
    );
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));

    expect(await screen.findByText('阅读摸鱼员')).toBeInTheDocument();
    expect(overviewSpy).toHaveBeenCalledTimes(2);
  });

  it('签到失败时保留已有数据并提供独立错误提示', async () => {
    vi.spyOn(platformApi, 'getOverview').mockResolvedValue(OVERVIEW);
    vi.spyOn(platformApi, 'checkInToday').mockRejectedValue(
      new Error('今日签到请求失败'),
    );

    render(<PlatformOverviewCard />);
    fireEvent.click(await screen.findByRole('button', { name: '今日签到' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '今日签到请求失败',
    );
    expect(screen.getByText('阅读摸鱼员')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '今日签到' })).toBeEnabled();
  });
});
