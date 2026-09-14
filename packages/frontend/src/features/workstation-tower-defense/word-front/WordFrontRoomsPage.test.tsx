import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyWordFrontV2Action, createWordFrontV2State } from '@stealth-reader/shared';
import { wordFrontRoomsApi, type WordFrontRoomView } from '../../../api/word-front-rooms';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { WordFrontRoomsPage } from './WordFrontRoomsPage';

vi.mock('../../../api/word-front-rooms', async importOriginal => {
  const original = await importOriginal<typeof import('../../../api/word-front-rooms')>();
  return { ...original, wordFrontRoomsApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), join: vi.fn(), start: vi.fn(), action: vi.fn(), leave: vi.fn() } };
});

const ROOM_ID = '0f72049b-aad4-4d7b-a491-97dfcd255d66';
function view(status: 'waiting' | 'running' = 'waiting'): WordFrontRoomView {
  let board = createWordFrontV2State('story', 1, 77);
  if (status === 'running') {
    board = applyWordFrontV2Action(board, { type: 'recruit', tick: 0 })!;
    board = applyWordFrontV2Action(board, { type: 'deploy_hero', first: 0, second: 1, slot: 0, tick: 0 })!;
    board = applyWordFrontV2Action(board, { type: 'start', tick: 0 })!;
  }
  const { seed: _hiddenSeed, ...visibleBoard } = board;
  return { id: ROOM_ID, name: '双线演练', chapter: 1, status, requiresPassword: false, players: status === 'running' ? 2 : 1,
    capacity: 2, expiresAt: Date.now() + 900_000, protocolVersion: 1, rulesVersion: 2, sequence: 1,
    serverNow: Date.now(), rules: '临时双线演练，不计正式榜。', isHost: true, mySide: 'red',
    me: { publicId: 'member-a', displayName: '甲' }, opponent: status === 'running' ? { publicId: 'member-b', displayName: '乙' } : null,
    board: status === 'running' ? visibleBoard : null, opposingBoard: status === 'running' ? {
      status: 'running', coreHp: 5, wave: 1, completedWaves: 0, kills: 0, score: 0, units: [], enemies: [], pendingSpawns: 4, tick: 0,
    } : null, winner: null };
}
function page(): void { render(<MemoryRouter><WordFrontRoomsPage /></MemoryRouter>); }

describe('WordFrontRoomsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks(); resetCommunityAuthStoreForTests();
    useCommunityAuthStore.setState({ phase: 'active', user: { id: 'member-a', publicId: 'member-a', email: 'a@example.com', displayName: '甲',
      accountStatus: 'active', onboardingCompleted: true, socialVerificationStatus: 'unverified' }, sessionReady: true, restoreSession: vi.fn() });
    vi.mocked(wordFrontRoomsApi.list).mockResolvedValue({ currentRoomId: null, rooms: [] });
    vi.mocked(wordFrontRoomsApi.get).mockResolvedValue(view());
  });

  it('clearly separates V2 temporary rooms from the V3 single-player game and creates an optional-password room', async () => {
    page();
    expect(screen.getByRole('link', { name: '新版单机' })).toHaveAttribute('href', '/tower-defense/word-front');
    expect(screen.getByText(/房间采用 V2 对战规则，不是 V3 单机规则/)).toBeInTheDocument();
    expect(screen.getByText(/不计正式排行榜、办公币、成就或存档/)).toBeInTheDocument();
    await screen.findByRole('button', { name: '创建房间' });
    fireEvent.change(screen.getByRole('textbox', { name: '房间名称' }), { target: { value: '周会守卫' } });
    vi.mocked(wordFrontRoomsApi.create).mockImplementation(async () => {
      vi.mocked(wordFrontRoomsApi.list).mockResolvedValue({ currentRoomId: ROOM_ID, rooms: [] });
      return view();
    });
    fireEvent.click(screen.getByRole('button', { name: '创建房间' }));
    await waitFor(() => expect(wordFrontRoomsApi.create).toHaveBeenCalledWith(expect.objectContaining({
      requestId: expect.any(String), name: '周会守卫', chapter: 1, password: '',
    })));
    await screen.findByText(/等待一位同事加入/);
  });

  it('requires a password entry for protected listings without exposing it in the room summary', async () => {
    vi.mocked(wordFrontRoomsApi.list).mockResolvedValue({ currentRoomId: null, rooms: [{ id: ROOM_ID, name: '同事对攻', chapter: 2,
      status: 'waiting', requiresPassword: true, players: 1, capacity: 2, expiresAt: Date.now() + 600_000 }] });
    vi.mocked(wordFrontRoomsApi.join).mockResolvedValue(view());
    page();
    await screen.findByText('同事对攻');
    fireEvent.click(screen.getByRole('button', { name: '输入密码' }));
    fireEvent.change(screen.getByLabelText('房间密码'), { target: { value: 'quiet-key' } });
    fireEvent.click(screen.getByRole('button', { name: '加入' }));
    await waitFor(() => expect(wordFrontRoomsApi.join).toHaveBeenCalledWith(ROOM_ID, 'quiet-key'));
  });

  it('sends only the selected V2 action to the authoritative room API and shows both lane summaries', async () => {
    const running = view('running');
    vi.mocked(wordFrontRoomsApi.list).mockResolvedValue({ currentRoomId: ROOM_ID, rooms: [] });
    vi.mocked(wordFrontRoomsApi.get).mockResolvedValue(running);
    vi.mocked(wordFrontRoomsApi.action).mockResolvedValue(running);
    page();
    await screen.findByRole('group', { name: '我方 V2 对战棋盘' });
    expect(screen.getByText(/对方波次 1/)).toBeInTheDocument();
    expect(screen.queryByText(/seed/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /招募五张/ }));
    await waitFor(() => expect(wordFrontRoomsApi.action).toHaveBeenCalledWith(ROOM_ID, { type: 'recruit' }, expect.any(String)));
  });
});
