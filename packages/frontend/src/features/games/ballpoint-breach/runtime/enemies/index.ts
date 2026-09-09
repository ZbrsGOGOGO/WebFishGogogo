// Vendored from Ballpoint Breach (Apache-2.0), commit 96290df3fba1c2b64abac684510155d916117903.
// Modified for WebFish integration (2026-09-09); see third_party/ballpoint-breach/README.md.
export { DoodleEnemy, ENEMY_STATS } from './DoodleEnemy';
export type { EnemyAction, EnemyRuntimeContext, EnemyStats } from './DoodleEnemy';
export { DoodlerBoss } from './DoodlerBoss';
export { EnemyManager } from './EnemyManager';
export { ProjectilePool } from './ProjectilePool';
export type {
  EnemyProjectileSpawn,
  EnemyProjectileView,
  ProjectilePlayerImpact,
  ProjectileUpdateContext,
  ProjectileWorldImpact,
} from './ProjectilePool';
export { createDoodleRig, getEnemySharedResources } from './doodleRig';
export type { DoodleRig } from './doodleRig';
export type {
  BossSummonRequest,
  EnemyAttackKind,
  EnemyDamage,
  EnemyDamageResult,
  EnemyDamageType,
  EnemyDeathCause,
  EnemyEvent,
  EnemyEventType,
  EnemyHitZone,
  EnemyKind,
  EnemyManagerCallbacks,
  EnemyManagerOptions,
  EnemyManagerSnapshot,
  EnemyRayHit,
  EnemySpawnOptions,
  EnemyState,
  EnemyView,
  PlayerDamageEvent,
  PlayerTarget,
  ProjectileReflectionResult,
  RegularEnemyKind,
} from './types';
