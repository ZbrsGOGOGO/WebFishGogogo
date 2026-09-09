// Vendored from Ballpoint Breach (Apache-2.0), commit 96290df3fba1c2b64abac684510155d916117903.
// Modified for WebFish integration (2026-09-09); see third_party/ballpoint-breach/README.md.
export { WeaponSystem } from './WeaponSystem';
export type { KatanaSlashVariant } from './WeaponSystem';
export { WEAPON_DEFINITIONS, weaponIdForSlot } from './weaponDefinitions';
export { createWeaponViewmodels } from './viewmodels';
export type { ViewmodelPose, WeaponViewmodel, WeaponViewmodelParts } from './viewmodels';
export { WEAPON_IDS } from './types';
export type {
  AmmoSnapshot,
  FireMode,
  HitscanRequest,
  IncomingProjectile,
  MeleeRequest,
  MotionInput,
  MuzzleRequest,
  PelletRay,
  PelletsRequest,
  ReflectRequest,
  ScopeState,
  Vec3Tuple,
  ViewmodelOffsetsSnapshot,
  WeaponCallbacks,
  WeaponDefinition,
  WeaponEffect,
  WeaponEffectKind,
  WeaponId,
  WeaponPhase,
  WeaponSlot,
  WeaponStateSnapshot,
  WeaponSystemOptions,
} from './types';
