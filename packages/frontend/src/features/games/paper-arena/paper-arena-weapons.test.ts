import {describe,it,expect} from 'vitest';
import {PAPER_ARENA_WEAPONS,PAPER_ARENA_WEAPON_IDS} from '@stealth-reader/shared';
import {WEAPON_DEFINITIONS} from '../ballpoint-breach/runtime/combat/weaponDefinitions';

describe('multiplayer original weapon parity',()=>{
  it.each(PAPER_ARENA_WEAPON_IDS)('%s keeps every authored model and combat specification',id=>{
    const {hint,...original}=WEAPON_DEFINITIONS[id];
    const {fireIntervalMs,reloadMs,switchMs,...network}=PAPER_ARENA_WEAPONS[id];
    expect(hint).toBeTruthy();expect(network).toEqual(original);
    expect(fireIntervalMs).toBeCloseTo(original.fireInterval*1000);
    expect(reloadMs).toBeCloseTo(original.reloadDuration*1000);
    expect(switchMs).toBeCloseTo(original.switchDuration*1000);
  });
});
