import { TOWER_DEFINITIONS, focusedTowerPartCost, type TowerDefenseState } from './tower-defense-logic';

/** Representative pre-random-opening save. Keep the existing fixed-build balance
 * assertions independently of the new-run lottery; never change runtime rules. */
export function withLegacySingleOpening(state: TowerDefenseState): TowerDefenseState {
  return { ...state, shopFocus: 'single', shop: state.shop.map((offer, index) =>
    index < 3 || index === 4 ? { ...offer, type: 'single', cost: index === 4 ? focusedTowerPartCost('single') : TOWER_DEFINITIONS.single.partCost } : offer,
  ) };
}
