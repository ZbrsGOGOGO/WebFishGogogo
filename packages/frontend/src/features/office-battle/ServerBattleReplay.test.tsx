import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CommunityBattleSettlement } from '../../api/community';
import { ServerBattleReplay } from './ServerBattleReplay';

const settlement: CommunityBattleSettlement = {
  battleId: 'battle-server-1',
  battleRequestId: 'battle:request-1',
  status: 'completed',
  mode: 'reward',
  opponentKind: 'npc',
  completedAt: '2026-08-22T10:00:00.000Z',
  engineVersion: 'engine-1',
  balanceVersion: 'balance-1',
  seed: 'server-seed-for-audit-only',
  winner: 'player',
  player: {
    publicId: 'ZBRS-1', displayName: '我方', profession: 'developer', battleLevel: 8,
    power: 320, stats: { hp: 120, attack: 20, defense: 12, speed: 13, luck: 8 }, equipment: [],
  },
  opponent: {
    publicId: 'NPC-2', displayName: '临时项目组', profession: 'product', battleLevel: 8,
    power: 315, stats: { hp: 125, attack: 18, defense: 13, speed: 10, luck: 9 }, equipment: null,
  },
  events: [
    { sequence: 2, round: 1, actor: 'opponent', kind: 'attack', damage: 8, playerHp: 112, opponentHp: 100, message: '服务端事件二' },
    { sequence: 1, round: 1, actor: 'player', kind: 'attack', damage: 25, playerHp: 120, opponentHp: 100, message: '服务端事件一' },
  ],
  reward: {
    battleExperience: 12,
    workspaceExperience: 4,
    workspaceCoins: 6,
    parts: 1,
    droppedEquipment: null,
  },
  energy: { current: 110, max: 120, serviceDate: '2026-08-22', resetsAt: '2026-08-22T10:10:00.000Z', nextRecoveryAt: '2026-08-22T10:10:00.000Z', recoveryMinutes: 10 },
  profileVersion: 2,
  loadoutVersion: 1,
  inventoryVersion: 1,
};

describe('ServerBattleReplay', () => {
  it('renders the complete battle events without internal audit data', () => {
    render(<ServerBattleReplay settlement={settlement} />);

    fireEvent.click(screen.getByRole('checkbox', { name: /减少动态效果/ }));

    const list = screen.getByRole('list', { name: '战斗事件' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('服务端事件一');
    expect(items[1]).toHaveTextContent('服务端事件二');
    expect(screen.queryByText('server-seed-for-audit-only')).not.toBeInTheDocument();
    expect(screen.queryByText(/结算审计信息|请求编号|服务端种子/)).not.toBeInTheDocument();
  });
});
