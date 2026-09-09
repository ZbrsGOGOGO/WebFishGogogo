// Modified for WebFish: deliberately silent; no AudioContext is created.
// Based on Ballpoint Breach, Apache-2.0; see third_party/ballpoint-breach.
export type GameSound = 'rifle' | 'shotgun' | 'revolver' | 'sniper' | 'katana' | 'hit' | 'headshot' | 'reload' | 'grapple' | 'hurt' | 'wave' | 'boss';

/** Quiet office mode is intentionally always muted in this initial integration. */
export class AudioSystem {
  resume(): void { /* No audio, including after a user gesture. */ }
  play(_sound: GameSound): void { /* No nodes or delayed sounds. */ }
  suspend(): void { /* Nothing allocated. */ }
  dispose(): void { /* Nothing allocated. */ }
}
