import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Timer from './Timer';

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const advance = (milliseconds: number) => act(() => { vi.advanceTimersByTime(milliseconds); });
const minutes = () => screen.getByRole('spinbutton', { name: '倒计时分钟数' });
const display = () => screen.getByTestId('timer-display');

describe('Timer real component interactions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T04:00:00Z'));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it.each([
    ['☕ 休息 5 分钟', 5, '00:05:00'],
    ['🍅 专注 25 分钟', 25, '00:25:00'],
  ] as const)('合法 1 分钟改用 %s 后同步输入并在模式往返后保留预设', (preset, duration, expected) => {
    render(<Timer />);
    click('倒计时');
    fireEvent.change(minutes(), { target: { value: '1' } });
    expect(display()).toHaveTextContent('00:01:00');

    click(preset);
    expect(display()).toHaveTextContent(expected);
    expect(minutes()).toHaveValue(duration);
    click('正计时');
    expect(display()).toHaveTextContent('00:00:00');
    click('倒计时');
    expect(display()).toHaveTextContent(expected);
    expect(minutes()).toHaveValue(duration);
    expect(screen.getByRole('button', { name: '开始' })).toBeInTheDocument();
  });

  it('切换运行中的预设停止旧计时，暂停/继续/重置仍保留新分钟数', () => {
    render(<Timer />);
    click('开始');
    advance(2250);
    expect(display()).toHaveTextContent('00:00:02');
    click('☕ 休息 5 分钟');
    expect(display()).toHaveTextContent('00:05:00');
    expect(minutes()).toHaveValue(5);
    advance(3000);
    expect(display()).toHaveTextContent('00:05:00');

    click('开始');
    advance(2250);
    expect(display()).toHaveTextContent('00:04:58');
    click('暂停');
    advance(5000);
    expect(display()).toHaveTextContent('00:04:58');
    click('开始');
    advance(1250);
    expect(display()).toHaveTextContent('00:04:57');
    click('重置');
    expect(display()).toHaveTextContent('00:05:00');
    expect(minutes()).toHaveValue(5);
    advance(3000);
    expect(display()).toHaveTextContent('00:05:00');
  });

  it('短倒计时归零自动停止且不会显示负数', () => {
    render(<Timer />);
    click('倒计时');
    fireEvent.change(minutes(), { target: { value: '0.05' } });
    expect(display()).toHaveTextContent('00:00:03');
    click('开始');
    advance(3250);
    expect(display()).toHaveTextContent('00:00:00');
    expect(screen.getByRole('button', { name: '开始' })).toBeInTheDocument();
    advance(5000);
    expect(display()).toHaveTextContent('00:00:00');
  });

  it.each(['-1', ''])('非法/空分钟 %j 不崩溃，选择预设恢复有效输入', (value) => {
    render(<Timer />);
    click('倒计时');
    fireEvent.change(minutes(), { target: { value } });
    expect(display()).toHaveTextContent('00:00:00');
    click('开始');
    advance(500);
    expect(display()).toHaveTextContent('00:00:00');
    expect(screen.getByRole('button', { name: '开始' })).toBeInTheDocument();
    click('🍅 专注 25 分钟');
    expect(minutes()).toHaveValue(25);
    expect(display()).toHaveTextContent('00:25:00');
    expect((minutes() as HTMLInputElement).validity.valid).toBe(true);
  });

  it('正计时暂停不累计停顿，重置停止并清零', () => {
    render(<Timer />);
    click('开始');
    advance(2250);
    expect(display()).toHaveTextContent('00:00:02');
    click('暂停');
    advance(5000);
    expect(display()).toHaveTextContent('00:00:02');
    click('开始');
    advance(1250);
    expect(display()).toHaveTextContent('00:00:03');
    click('重置');
    advance(5000);
    expect(display()).toHaveTextContent('00:00:00');
    expect(screen.getByRole('button', { name: '开始' })).toBeInTheDocument();
  });
});
