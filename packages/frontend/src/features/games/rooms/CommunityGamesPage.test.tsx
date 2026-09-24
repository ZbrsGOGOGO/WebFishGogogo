import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayCatalog, PlayRoomView } from '@stealth-reader/shared';

const windows = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('../ballpoint-breach/BallpointWindow', () => ({ useBallpointWindow: () => ({ openWindow: windows.open, isOpen: false }) }));
vi.mock('../../../app/community-nav', async original => {
  const actual = await original<typeof import('../../../app/community-nav')>();
  return { ...actual, COMMUNITY_FEATURE_FLAGS: { ...actual.COMMUNITY_FEATURE_FLAGS, towerDefense: true, workstationCampaign: true, wordFrontRooms: true, officeHub: true, paperArena: true, demonTower: true } };
});

import { communityGameRoomsApi } from '../../../api/community-game-rooms';
import { setCommunitySessionTokens } from '../../../api/community-http';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { CommunityGamesPage } from './CommunityGamesPage';
import { GAME_NAMES } from './play-ui-state';
import { LOCAL_LAB_GAMES } from '../local-lab/local-games';

const catalog: PlayCatalog = {
  games: (Object.keys(GAME_NAMES) as Array<keyof typeof GAME_NAMES>).map(gameKey => ({ gameKey, name: GAME_NAMES[gameKey], minPlayers: gameKey === 'undercover' ? 3 : 2, maxPlayers: 6, soloDescription: `${GAME_NAMES[gameKey]}服务端单机说明`, roomDescription: `${GAME_NAMES[gameKey]}服务端房间说明`, dailyChampionCoins: 100 })),
  rankingRules: '共享日榜测试规则', rewardRules: '冠军奖励测试规则', settlementTime: '北京时间 00:05', historyNotice: '原练习不计新的办公币日榜',
};
const user = { id: 'gallery-player', publicId: 'gallery-player', email: 'gallery@users.invalid', displayName: '目录玩家', accountStatus: 'active' as const, onboardingCompleted: true, socialVerificationStatus: 'verified' as const };
function CurrentPath() { const path = useLocation(); return <output aria-label="当前路径">{path.pathname}{path.search}</output>; }
function renderGallery() { return render(<MemoryRouter initialEntries={['/games']}><CurrentPath /><CommunityGamesPage /></MemoryRouter>); }
function category(name: string) { return screen.getByRole('button', { name: new RegExp(`^${name}`) }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }

describe('redesigned community games directory', () => {
  beforeEach(() => {
    vi.restoreAllMocks(); windows.open.mockReset(); resetCommunityAuthStoreForTests(); setCommunitySessionTokens('gallery-token');
    useCommunityAuthStore.setState({ phase: 'active', user, sessionReady: true });
    vi.spyOn(communityGameRoomsApi, 'catalog').mockResolvedValue(catalog);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('keeps every existing game and legacy version reachable, with local decorative covers', async () => {
    const view = renderGallery();
    await screen.findByText('贪食蛇服务端单机说明');
    expect(screen.getAllByRole('button', { name: '开始挑战' })).toHaveLength(6);
    expect(screen.getAllByRole('link', { name: '日榜' })).toHaveLength(6);
    const paths = new Set(Array.from(view.container.querySelectorAll('a[href]')).map(link => link.getAttribute('href')));
    for (const path of ['/games/rooms', '/games/ballpoint-breach/arena', '/games/ballpoint-breach', '/office', '/games/office-boss', '/games/office-boss?mode=daily', '/tower-defense', '/tower-defense/practice', '/tower-defense/leaderboard', '/tower-defense/word-front', '/tower-defense/word-front/v3', '/tower-defense/word-front/v2', '/tower-defense/word-front/legacy', '/tower-defense/word-front/rooms', '/games/demon-tower', '/games/demon-tower/leaderboard', '/games/rail', '/games/rail/leaderboard', '/games/office-2048', '/games/underrun', '/games/snake', '/games/tetris', '/games/tank', '/games/zhesi']) expect(paths.has(path), path).toBe(true);
    expect(view.container.querySelector('iframe, img')).not.toBeInTheDocument();
    expect(screen.getByText(/共享日榜测试规则/)).toBeInTheDocument();
    expect(screen.getByText(/冠军奖励测试规则/)).toHaveTextContent('00:05');
    const tank = within(screen.getByRole('article', { name: '坦克大战' }));
    expect(tank.getByText('最多 2 分钟')).toBeInTheDocument();
    expect(tank.getByText('需要登录')).toBeInTheDocument();
    expect(tank.getByText('服务端赛局')).toBeInTheDocument();
    expect(tank.getByRole('link', { name: '查看房间' })).toHaveAttribute('href', '/games/rooms?game=tank');
    const practice = within(screen.getByRole('article', { name: '坦克大战 · 本机练习' }));
    expect(practice.getByText('仅本轮状态')).toBeInTheDocument();
    expect(practice.getByText('不参与办公币奖励日榜')).toBeInTheDocument();
  });

  it('filters the actual same cards into single-player, rooms, growth and local practice', async () => {
    renderGallery(); await screen.findByText('贪食蛇服务端单机说明');
    fireEvent.click(category('实时房间'));
    expect(category('实时房间')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('贪食蛇服务端房间说明')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: '纸上突围 · 红蓝对战' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: '轨道难题' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '开始挑战' })).not.toBeInTheDocument();
    const wordRoom = within(screen.getByRole('article', { name: '文字战线 · 赵云救阿斗' }));
    expect(wordRoom.getByText('对战最多 20 分钟')).toBeInTheDocument();
    expect(wordRoom.getByText('限时服务端快照')).toBeInTheDocument();
    expect(wordRoom.getByText('不计正式榜、成就或办公币')).toBeInTheDocument();
    expect(wordRoom.queryByText('V4 独立榜 · 不发办公币')).not.toBeInTheDocument();
    expect(wordRoom.queryByText('本机草稿')).not.toBeInTheDocument();
    expect(wordRoom.getByRole('link', { name: '双人房间' })).toHaveAttribute('href', '/tower-defense/word-front/rooms');
    expect(wordRoom.queryByRole('link', { name: '进入文字战线' })).not.toBeInTheDocument();
    for (const game of catalog.games) {
      const gameRoom = within(screen.getByRole('article', { name: game.name }));
      expect(gameRoom.queryByRole('button', { name: /开始挑战|登录挑战/ })).not.toBeInTheDocument();
      expect(gameRoom.getByRole('link', { name: '查看房间' })).toHaveAttribute('href', `/games/rooms?game=${game.gameKey}`);
    }
    expect(screen.queryByRole('article', { name: '九层妖塔 · 角色养成' })).not.toBeInTheDocument();
    expect(screen.queryByRole('article', { name: '纸上突围 · 本地单机' })).not.toBeInTheDocument();
    fireEvent.click(category('角色与养成'));
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(screen.getByRole('article', { name: '九层妖塔 · 角色养成' })).toBeInTheDocument();
    fireEvent.click(category('本机练习'));
    expect(screen.getAllByRole('article')).toHaveLength(8 + LOCAL_LAB_GAMES.length);
    expect(screen.queryByRole('button', { name: '开始挑战' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '遮司 · 原命格录' })).toHaveAttribute('href', '/games/zhesi');
    fireEvent.click(category('单机挑战'));
    expect(screen.getAllByRole('button', { name: '开始挑战' })).toHaveLength(6);
    expect(screen.queryByRole('article', { name: '纸上突围 · 红蓝对战' })).not.toBeInTheDocument();
  });

  it('supports search within a selected category and a recoverable empty result', async () => {
    renderGallery(); await screen.findByText('贪食蛇服务端单机说明');
    fireEvent.click(category('本机练习'));
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索游戏' }), { target: { value: '纸笔' } });
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('article', { name: '纸上突围 · 本地单机' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '没有这款游戏' } });
    expect(screen.getByRole('heading', { name: '暂时没有匹配的游戏' })).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看全部游戏' }));
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(category('全部游戏')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('article')).toHaveLength(21 + LOCAL_LAB_GAMES.length);
  });

  it('keeps mobile discovery controls close to the directory and collapses optional guidance', async () => {
    const view = renderGallery();
    await screen.findByText('贪食蛇服务端单机说明');
    expect(view.container.querySelector('#game-directory')).toContainElement(screen.getByRole('searchbox', { name: '搜索游戏' }));
    const guide = screen.getByText('工作稿模式 · 收起与计时说明').closest('details');
    expect(guide).not.toHaveAttribute('open');
    fireEvent.click(screen.getByRole('button', { name: /来一局短挑战/ }));
    expect(category('单机挑战')).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers six new local games to guests as an explicit collection, with no score/reward creation or runtime preload', async () => {
    useCommunityAuthStore.setState({ phase: 'guest', user: null });
    const create = vi.spyOn(communityGameRoomsApi, 'create'); const rendered = renderGallery();
    await screen.findByText('贪食蛇服务端单机说明');
    fireEvent.click(screen.getByRole('button', { name: '试试六款新玩法' }));
    expect(category('新接入精选')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('article')).toHaveLength(LOCAL_LAB_GAMES.length);
    for (const game of LOCAL_LAB_GAMES) {
      const card = within(screen.getByRole('article', { name: game.title }));
      expect(card.getByRole('link', { name: `打开${game.draftTitle}` })).toHaveAttribute('href', `/games/lab/${game.slug}`);
      expect(card.getByText('无需登录')).toBeInTheDocument(); expect(card.getByText('仅本轮状态')).toBeInTheDocument();
      expect(card.getByText('不计官方排行、成就或办公币')).toBeInTheDocument();
      expect(card.getByText(game.mark)).toBeInTheDocument();
      expect(card.getByText(game.genre)).toBeInTheDocument();
    }
    expect(create).not.toHaveBeenCalled(); expect(rendered.container.querySelector('iframe,img,canvas')).toBeNull();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '麻将' } });
    expect(screen.getAllByRole('article')).toHaveLength(1); expect(screen.getByRole('article', { name: '麻将奇旅 · Whatajong' })).toBeInTheDocument();
  });

  it('retains other open entries when the server catalog fails and recovers on retry', async () => {
    vi.mocked(communityGameRoomsApi.catalog).mockRejectedValueOnce(new Error('目录读取失败')).mockResolvedValue(catalog);
    renderGallery();
    expect(await screen.findByRole('alert')).toHaveTextContent('目录读取失败');
    expect(screen.getByRole('link', { name: '打开表格工作稿' })).toBeInTheDocument();
    for (const game of LOCAL_LAB_GAMES) expect(screen.getByRole('link', { name: `打开${game.draftTitle}` })).toHaveAttribute('href', `/games/lab/${game.slug}`);
    expect(screen.queryByRole('button', { name: '开始挑战' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试目录' }));
    expect(await screen.findByText('贪食蛇服务端单机说明')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(communityGameRoomsApi.catalog).toHaveBeenCalledTimes(2);
  });

  it('opens the existing local window without creating an account game, while guests must login for ranked play', async () => {
    useCommunityAuthStore.setState({ phase: 'guest', user: null });
    const create = vi.spyOn(communityGameRoomsApi, 'create'); renderGallery();
    await screen.findByText('贪食蛇服务端单机说明');
    fireEvent.click(screen.getByRole('button', { name: '打开工作稿小窗' }));
    expect(windows.open).toHaveBeenCalledOnce(); expect(create).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: '登录挑战' })[0]);
    expect(screen.getByLabelText('当前路径')).toHaveTextContent('/login');
    expect(create).not.toHaveBeenCalled();
  });

  it('keeps all create buttons locked during a pending request even after changing the filter', async () => {
    const pending = deferred<PlayRoomView>(); const create = vi.spyOn(communityGameRoomsApi, 'create').mockReturnValue(pending.promise);
    renderGallery(); fireEvent.click((await screen.findAllByRole('button', { name: '开始挑战' }))[0]);
    fireEvent.click(category('单机挑战'));
    expect(screen.getByRole('button', { name: '正在建立…' })).toBeDisabled();
    for (const button of screen.getAllByRole('button', { name: '开始挑战' })) expect(button).toBeDisabled();
    expect(create).toHaveBeenCalledOnce();
    await act(async () => { pending.resolve({ id: 'gallery-room' } as PlayRoomView); });
    expect(screen.getByLabelText('当前路径')).toHaveTextContent('/games/rooms/gallery-room');
  });

  it('ignores an old create response after the player identity changes', async () => {
    const pending = deferred<PlayRoomView>(); vi.spyOn(communityGameRoomsApi, 'create').mockReturnValue(pending.promise);
    renderGallery(); fireEvent.click((await screen.findAllByRole('button', { name: '开始挑战' }))[0]);
    act(() => { useCommunityAuthStore.setState({ user: { ...user, publicId: 'next-player', id: 'next-player' } }); });
    await act(async () => { pending.resolve({ id: 'old-player-room' } as PlayRoomView); });
    await waitFor(() => expect(screen.getByLabelText('当前路径')).toHaveTextContent('/games'));
    expect(screen.getByLabelText('当前路径')).not.toHaveTextContent('old-player-room');
    expect(screen.getAllByRole('button', { name: '开始挑战' })[0]).not.toBeDisabled();
  });
});
