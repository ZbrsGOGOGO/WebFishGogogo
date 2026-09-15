import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCommunitySessionTokens } from '../../../api/community-http';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { GamePrivacyProvider } from '../GamePrivacyContext';
import { announceLocalGameForeground } from '../game-input';
import { LocalLabPage } from './LocalLabPage';
import { LOCAL_LAB_GAMES } from './local-games';

function view(slug = 'hextris', covered = false, toggle = vi.fn()) {
  return render(<MemoryRouter initialEntries={[`/games/lab/${slug}`]}><GamePrivacyProvider value={{ covered, toggleCover: toggle }}><Routes><Route path="/games/lab/:slug" element={<LocalLabPage />} /></Routes></GamePrivacyProvider></MemoryRouter>);
}
function iframe() { return document.querySelector('iframe')!; }
function notify(type: string, overrides: Partial<MessageEventInit> = {}) {
  const frame = iframe(); const nonce = new URLSearchParams(new URL(frame.src).hash.slice(1)).get('momo');
  act(() => { window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'null', data: { channel: 'momo-local-lab', nonce, type }, ...overrides })); });
}
function start() { fireEvent.click(screen.getByRole('button', { name: '打开工作稿' })); }
describe('local lab low-key wrapper', () => {
  beforeEach(() => { resetCommunityAuthStoreForTests(); useCommunityAuthStore.setState({ phase: 'guest', user: null }); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  it('offers six distinct audited original games without preloading any frame or reading an account', () => {
    view(); expect(document.querySelector('iframe')).toBeNull();
    expect(LOCAL_LAB_GAMES).toHaveLength(6); expect(new Set(LOCAL_LAB_GAMES.map(game => game.genre)).size).toBe(6);
    expect(screen.getByRole('heading', { name: '色块整理稿' })).toBeInTheDocument();
    expect(screen.getByText('无需登录')).toBeInTheDocument();
    expect(screen.getAllByRole('link').filter(link => link.getAttribute('href')?.startsWith('/games/lab/'))).toHaveLength(5);
  });
  it('rejects unaudited slugs and never uses arbitrary route text as an iframe URL', () => {
    view('unreviewed'); expect(screen.getByRole('heading', { name: '没有找到这份工作稿' })).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
  });
  it.each(LOCAL_LAB_GAMES)('keeps modified source for $slug outside the restricted running frame', game => {
    view(game.slug);
    const source = screen.getByRole('link', { name: '本站修改后源码与重编译说明', hidden: true });
    expect(source).toHaveAttribute('href', game.slug === 'hextris' || game.slug === 'whatajong' ? `/games/local-lab/${game.slug}/SOURCE.md` : `https://github.com/ZbrsGOGOGO/WebFishGogogo/tree/main/third_party/${game.slug}`);
    expect(source).toHaveAttribute('target', '_blank'); expect(source).toHaveAttribute('rel', 'noreferrer');
    expect(document.querySelector('iframe')).toBeNull();
  });
  it('loads only on intent, with an opaque script-only sandbox and exact nonce/frame authorization', () => {
    view(); start(); const frame = iframe();
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts'); expect(frame.src).toContain('/games/local-lab/hextris/index.html#momo=');
    expect(frame).toHaveAttribute('data-paused', 'true');
    notify('ready', { origin: 'https://site.invalid' }); notify('ready', { source: window });
    notify('ready', { data: { channel: 'momo-local-lab', nonce: 'wrong', type: 'ready' } });
    expect(frame).toHaveAttribute('data-paused', 'true'); notify('ready'); expect(frame).toHaveAttribute('data-paused', 'false');
    fireEvent.click(screen.getByRole('button', { name: '收起本轮' })); expect(iframe()).toBe(frame); expect(frame).toHaveAttribute('data-paused', 'true');
    fireEvent.focus(window); expect(frame).toHaveAttribute('data-paused', 'true');
    fireEvent.click(screen.getByRole('button', { name: '继续本轮' })); expect(frame).toHaveAttribute('data-paused', 'false');
    fireEvent.click(screen.getByRole('button', { name: '结束本轮' })); expect(document.querySelector('iframe')).toBeNull();
  });
  it('does not advance behind notes, proxies Escape, and pauses on another foreground local game', () => {
    const toggle = vi.fn(); view('hextris', false, toggle); start(); notify('ready'); notify('escape');
    expect(toggle).toHaveBeenCalledOnce(); expect(iframe()).toHaveAttribute('data-paused', 'true');
    fireEvent.click(screen.getByRole('button', { name: '继续本轮' }));
    act(() => announceLocalGameForeground('other-work-draft')); expect(iframe()).toHaveAttribute('data-paused', 'true');
  });
  it('requires explicit retry after resource errors or the 25-second startup timeout', () => {
    vi.useFakeTimers(); view(); start(); act(() => vi.advanceTimersByTime(25000));
    expect(screen.getByRole('heading', { name: '这份工作稿暂时无法启动' })).toBeInTheDocument(); expect(document.querySelector('iframe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '重新尝试' })); notify('error');
    expect(document.querySelector('iframe')).toBeNull(); expect(screen.getByRole('button', { name: '重新尝试' })).toBeInTheDocument();
  });
  it('ends old local state on session changes even when the same player logs in again', () => {
    view(); start(); notify('ready'); const frame = iframe();
    act(() => { setCommunitySessionTokens('new-test-session'); useCommunityAuthStore.setState({ sessionReady: true }); });
    expect(frame.isConnected).toBe(false); expect(document.querySelector('iframe')).toBeNull();
  });
  it('never starts when the workspace is covered', () => {
    view('hextris', true); start(); notify('ready'); expect(iframe()).toHaveAttribute('data-paused', 'true');
  });
});
