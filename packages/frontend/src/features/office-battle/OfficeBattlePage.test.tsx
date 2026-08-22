import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OfficeBattlePage } from './OfficeBattlePage';
import { createStarterEquipment } from './office-battle-domain';

const PROFILE_STORAGE_KEY = 'zbrs.office-battle.profile.v1';

function renderPage() {
  return render(
    <MemoryRouter>
      <OfficeBattlePage />
    </MemoryRouter>,
  );
}

describe('OfficeBattlePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('offers the five requested office professions without an API call', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    renderPage();

    expect(screen.getByRole('heading', { name: /先选职业/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /选择程序员/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /选择产品经理/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /选择测试/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /选择销售员/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /选择人力资源管理/ })).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('creates a six-slot loadout and resolves an automatic local battle', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /选择程序员/ }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '研发新人的工位' })).toHaveFocus();
    });

    expect(screen.getByRole('heading', { name: '6 个装备位' })).toBeInTheDocument();
    expect(screen.getByText(/标准·薄膜键盘/)).toBeInTheDocument();
    expect(screen.getAllByText(/标准·/)).toHaveLength(6);
    expect(window.localStorage.getItem('zbrs.office-battle.profile.v1')).toContain(
      'developer',
    );

    fireEvent.click(screen.getByRole('button', { name: '开始办公室乐斗' }));

    expect(screen.getByText('战斗结果')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: '逐回合战报' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(2);
  });

  it.each([
    ['null item', [null]],
    [
      'duplicate slot',
      (() => {
        const items = createStarterEquipment('developer');
        return [...items.slice(0, 5), items[0]];
      })(),
    ],
    [
      'unknown rarity',
      createStarterEquipment('developer').map((item, index) =>
        index === 0 ? { ...item, rarity: 'mythic' } : item,
      ),
    ],
    [
      'invalid stats',
      createStarterEquipment('developer').map((item, index) =>
        index === 0 ? { ...item, stats: { attack: null } } : item,
      ),
    ],
  ])('discards a corrupted local profile with %s', (_label, equipment) => {
    window.localStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({
        name: '损坏存档',
        profession: 'developer',
        level: 1,
        experience: 0,
        wins: 0,
        losses: 0,
        equipment,
      }),
    );

    renderPage();

    expect(screen.getByRole('heading', { name: /先选职业/ })).toBeInTheDocument();
    expect(window.localStorage.getItem(PROFILE_STORAGE_KEY)).toBeNull();
  });

  it('keeps the completed battle opponent snapshot when experience levels up', () => {
    window.localStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({
        name: '研发新人',
        profession: 'developer',
        level: 1,
        experience: 90,
        wins: 0,
        losses: 0,
        equipment: createStarterEquipment('developer'),
      }),
    );
    renderPage();

    const opponentBefore = screen.getByText('来访同事').closest('article');
    expect(opponentBefore).not.toBeNull();
    expect(within(opponentBefore!).getByText(/Lv\.1/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '开始办公室乐斗' }));

    expect(screen.getByText(/Lv\.2 程序员/)).toBeInTheDocument();
    const opponentAfter = screen.getByText('来访同事').closest('article');
    expect(within(opponentAfter!).getByText(/Lv\.1/)).toBeInTheDocument();
  });
});
