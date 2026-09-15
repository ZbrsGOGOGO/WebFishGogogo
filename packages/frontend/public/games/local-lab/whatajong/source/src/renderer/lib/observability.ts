// No telemetry or network service is used by the self-hosted edition.
export function initObservability(): void {}
export function captureRun(_runId: string, _type: 'solo' | 'adventure'): void {}
export function captureEvent(_event: string, _properties: Record<string, unknown>): void {}
