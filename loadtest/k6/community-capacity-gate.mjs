// Intentional fail-closed placeholder.
//
// Do not turn this into a no-op or a public-GET scenario. Replace it only with
// the reviewed mixed HTTP + WebSocket suite and its synthetic-data tooling.
export const options = {
  vus: 1,
  iterations: 1,
};

export function setup() {
  throw new Error(
    [
      'COMMUNITY CAPACITY NOT YET PROVEN.',
      'Missing: synthetic 4000-account dataset, mixed writes, 1000 subscribed WebSockets,',
      'message fan-out, reconnect storm, instance/Redis failures, soak runs and three repeat passes.',
      'The public/read-only capacity.mjs result is not a substitute.',
    ].join(' '),
  );
}

export default function communityCapacityPlaceholder() {
  throw new Error('unreachable fail-closed community capacity placeholder');
}
