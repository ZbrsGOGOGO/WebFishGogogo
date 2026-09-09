// Vendored from Ballpoint Breach (Apache-2.0), commit 96290df3fba1c2b64abac684510155d916117903.
// Modified for WebFish integration (2026-09-09); see third_party/ballpoint-breach/README.md.
import * as THREE from 'three';

/** Shared ink-and-paper palette sampled from the reference video. */
export const DOODLE_PALETTE = Object.freeze({
  paper: 0xf6f0dc,
  paperLight: 0xfffbeb,
  paperShade: 0xdeddd7,
  ink: 0x27348f,
  darkInk: 0x18246f,
  softInk: 0x6872b3,
  lavender: 0xb8bddd,
  red: 0xd63b55,
  orange: 0xe79a32,
  green: 0x69b887,
});

export type DoodlePaletteKey = keyof typeof DOODLE_PALETTE;

export function paletteColor(key: DoodlePaletteKey): THREE.Color {
  return new THREE.Color(DOODLE_PALETTE[key]);
}
