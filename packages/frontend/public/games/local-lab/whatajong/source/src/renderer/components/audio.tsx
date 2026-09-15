// Silent self-hosted edition: upstream audio has no asset attribution manifest.
// Preserve gameplay call sites without importing or shipping any audio.
export function play(_track: string): void {}
export function useMusic(_track: string): void {}
export function musicVolume(_volume: number): void {}
