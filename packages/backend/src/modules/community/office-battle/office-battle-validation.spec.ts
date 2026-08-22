import { BadRequestException } from '@nestjs/common';

import {
  battleEquipmentIds,
  battleRequestId,
  strictBattleObject,
} from './office-battle-validation';

describe('Office Battle request trust boundary', () => {
  it('rejects client supplied seed, winner, stats, reward or other authority fields', () => {
    for (const field of ['seed', 'winner', 'stats', 'reward', 'events', 'droppedEquipment']) {
      expect(() =>
        strictBattleObject(
          {
            battleRequestId: 'request-0001',
            opponent: { kind: 'npc', offerId: 'unused' },
            mode: 'reward',
            loadoutVersion: 1,
            [field]: 'forged',
          },
          ['battleRequestId', 'opponent', 'mode', 'loadoutVersion'],
        ),
      ).toThrow(BadRequestException);
    }
  });

  it('requires unique equipment ids and a stable 8-100 byte request id', () => {
    expect(() => battleRequestId('short')).toThrow(BadRequestException);
    expect(battleRequestId('battle-request-0001')).toBe('battle-request-0001');
    const id = '413c49f0-9fbe-4acc-9ea4-99cb768dd79b';
    expect(() => battleEquipmentIds([id, id])).toThrow(BadRequestException);
  });
});
