import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate, Trend } from 'k6/metrics';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8080';
const PRODUCTION_HOSTS = new Set([
  'zbrshyyzxx.top',
  'www.zbrshyyzxx.top',
]);

const PUBLIC_ROUTES = [
  { path: '/', weight: 25 },
  { path: '/tools', weight: 20 },
  { path: '/games', weight: 15 },
  { path: '/games/snake', weight: 10 },
  { path: '/games/tetris', weight: 10 },
  { path: '/games/tank', weight: 8 },
  { path: '/games/three-sum', weight: 7 },
  { path: '/privacy-policy', weight: 3 },
  { path: '/terms-of-service', weight: 2 },
];

// Authenticated traffic deliberately contains GET-only endpoints. Login,
// registration, upload and all state-changing endpoints are out of scope.
const AUTHENTICATED_ROUTES = [
  { path: '/api/auth/me', weight: 35 },
  { path: '/api/v1/platform/overview', weight: 30 },
  { path: '/api/v1/tasks/today', weight: 20 },
  { path: '/api/v1/activity/recent', weight: 15 },
];

const PROFILES = {
  smoke: {
    kind: 'constant-arrival-rate',
    rate: 2,
    duration: '30s',
    preAllocatedVUs: 5,
    maxVUs: 20,
  },
  stable: {
    kind: 'constant-arrival-rate',
    rate: 400,
    duration: '10m',
    preAllocatedVUs: 500,
    maxVUs: 1200,
  },
  peak: {
    kind: 'ramping-arrival-rate',
    startRate: 100,
    stages: [
      { duration: '2m', target: 400 },
      { duration: '5m', target: 400 },
      { duration: '2m', target: 800 },
      { duration: '5m', target: 800 },
      { duration: '2m', target: 400 },
    ],
    preAllocatedVUs: 900,
    maxVUs: 1600,
  },
  soak: {
    kind: 'constant-arrival-rate',
    rate: 400,
    duration: '30m',
    preAllocatedVUs: 500,
    maxVUs: 1200,
  },
  online: {
    kind: 'ramping-vus',
    stages: [
      { duration: '3m', target: 1000 },
      { duration: '10m', target: 1000 },
      { duration: '2m', target: 0 },
    ],
  },
};

const profileName = (__ENV.PROFILE || 'smoke').trim().toLowerCase();
const profile = PROFILES[profileName];

if (!profile) {
  throw new Error(
    `Unknown PROFILE=${profileName}. Use smoke, stable, peak, soak or online.`,
  );
}

const { baseUrl, host, isLoopback } = parseAndValidateTarget(
  __ENV.BASE_URL || DEFAULT_BASE_URL,
);

guardRemoteTarget(host, isLoopback);

const authTokensFile = (__ENV.AUTH_TOKENS_FILE || '').trim();
const authTokens = new SharedArray('webfish auth tokens', () => {
  if (!authTokensFile) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(open(authTokensFile).replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`Unable to parse AUTH_TOKENS_FILE: ${error.message}`);
  }

  const values = Array.isArray(parsed) ? parsed : parsed.tokens;
  if (!Array.isArray(values)) {
    throw new Error(
      'AUTH_TOKENS_FILE must be a JSON array or an object with a tokens array.',
    );
  }

  const tokens = values
    .map((value) => (typeof value === 'string' ? value : value?.token))
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());

  if (tokens.length === 0) {
    throw new Error('AUTH_TOKENS_FILE contains no usable bearer tokens.');
  }

  return tokens;
});

const authEnabled = authTokens.length > 0;
const authShare = authEnabled
  ? readFraction('AUTH_SHARE', __ENV.AUTH_SHARE, 0.3)
  : 0;

const assetPathsFile = (__ENV.ASSET_PATHS_FILE || '').trim();
const assetPaths = new SharedArray('webfish static asset paths', () => {
  if (!assetPathsFile) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(open(assetPathsFile).replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`Unable to parse ASSET_PATHS_FILE: ${error.message}`);
  }

  const values = Array.isArray(parsed) ? parsed : parsed.assets;
  if (!Array.isArray(values)) {
    throw new Error(
      'ASSET_PATHS_FILE must be a JSON array or an object with an assets array.',
    );
  }

  const paths = values
    .map((value) => (typeof value === 'string' ? value : value?.path))
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());

  if (paths.length === 0) {
    throw new Error('ASSET_PATHS_FILE contains no usable asset paths.');
  }

  for (const path of paths) {
    if (!/^\/assets\/[A-Za-z0-9._/-]+$/.test(path) || path.includes('..')) {
      throw new Error(
        `Unsafe asset path ${path}. Only relative /assets/... paths are allowed.`,
      );
    }
  }

  return [...new Set(paths)];
});

const assetEnabled = assetPaths.length > 0;
const assetShare = assetEnabled
  ? readFraction('ASSET_SHARE', __ENV.ASSET_SHARE, 0.2)
  : 0;

if (!authEnabled && (__ENV.AUTH_SHARE || '').trim()) {
  throw new Error('AUTH_SHARE requires AUTH_TOKENS_FILE.');
}

if (!assetEnabled && (__ENV.ASSET_SHARE || '').trim()) {
  throw new Error('ASSET_SHARE requires ASSET_PATHS_FILE.');
}

if (
  profileName === 'online' &&
  authEnabled &&
  authTokens.length < 1000 &&
  __ENV.ALLOW_TOKEN_REUSE !== '1'
) {
  throw new Error(
    'The online profile needs at least 1000 unique tokens. Set ALLOW_TOKEN_REUSE=1 only for a deliberate shared-account diagnostic.',
  );
}

const publicDuration = new Trend('webfish_public_duration', true);
const publicFailed = new Rate('webfish_public_failed');
const authenticatedDuration = new Trend(
  'webfish_authenticated_duration',
  true,
);
const authenticatedFailed = new Rate('webfish_authenticated_failed');
const assetDuration = new Trend('webfish_asset_duration', true);
const assetFailed = new Rate('webfish_asset_failed');

export const options = {
  discardResponseBodies: true,
  scenarios: buildScenarios(profile, authEnabled, authShare),
  thresholds: buildThresholds(authEnabled, assetEnabled, profileName),
  tags: {
    application: 'webfish',
    profile: profileName,
  },
  userAgent: 'WebFish-capacity-test/1.0',
};

export function setup() {
  console.log(
    [
      `WebFish load test: profile=${profileName}`,
      `target=${baseUrl}`,
      `auth=${authEnabled ? `enabled (${Math.round(authShare * 100)}%)` : 'disabled'}`,
      `assets=${assetEnabled ? `enabled (${Math.round(assetShare * 100)}% of public traffic)` : 'disabled'}`,
      'state-changing endpoints=disabled',
    ].join(' | '),
  );
}

export function publicTraffic() {
  requestPublicRoute();
}

export function authenticatedTraffic() {
  requestAuthenticatedRoute();
}

export function onlineSession() {
  const startedAt = Date.now();

  if (authEnabled && Math.random() < authShare) {
    requestAuthenticatedRoute();
  } else {
    requestPublicRoute();
  }

  // 1000 active VUs, each issuing one request every 2.5 seconds, models
  // roughly 400 RPS while preserving a closed 1000-session population.
  const elapsedSeconds = (Date.now() - startedAt) / 1000;
  sleep(Math.max(0, 2.5 - elapsedSeconds));
}

function requestPublicRoute() {
  if (assetEnabled && Math.random() < assetShare) {
    requestStaticAsset();
    return;
  }

  const route = pickWeighted(PUBLIC_ROUTES);
  const response = http.get(`${baseUrl}${route.path}`, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
    },
    redirects: 0,
    tags: {
      flow: 'public',
      endpoint: route.path,
    },
  });
  const ok = response.status === 200;

  publicDuration.add(response.timings.duration, { endpoint: route.path });
  publicFailed.add(!ok, { endpoint: route.path });
  check(
    response,
    { 'public response is HTTP 200': () => ok },
    { flow: 'public', endpoint: route.path },
  );
}

function requestStaticAsset() {
  const path = assetPaths[Math.floor(Math.random() * assetPaths.length)];
  const response = http.get(`${baseUrl}${path}`, {
    headers: { Accept: '*/*' },
    redirects: 0,
    tags: {
      flow: 'asset',
      // Keep the metric cardinality bounded even when build hashes change.
      endpoint: 'static-asset',
    },
  });
  const ok = response.status === 200;

  assetDuration.add(response.timings.duration);
  assetFailed.add(!ok);
  check(
    response,
    { 'static asset response is HTTP 200': () => ok },
    { flow: 'asset', endpoint: 'static-asset' },
  );
}

function requestAuthenticatedRoute() {
  if (!authEnabled) {
    throw new Error('Authenticated traffic started without AUTH_TOKENS_FILE.');
  }

  const route = pickWeighted(AUTHENTICATED_ROUTES);
  const token = authTokens[(__VU - 1) % authTokens.length];
  const response = http.get(`${baseUrl}${route.path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    redirects: 0,
    tags: {
      flow: 'authenticated',
      endpoint: route.path,
    },
  });
  const ok = response.status === 200;

  authenticatedDuration.add(response.timings.duration, {
    endpoint: route.path,
  });
  authenticatedFailed.add(!ok, { endpoint: route.path });
  check(
    response,
    { 'authenticated response is HTTP 200': () => ok },
    { flow: 'authenticated', endpoint: route.path },
  );
}

function buildScenarios(selectedProfile, withAuth, selectedAuthShare) {
  if (selectedProfile.kind === 'ramping-vus') {
    return {
      online_sessions: {
        executor: 'ramping-vus',
        exec: 'onlineSession',
        startVUs: 0,
        stages: selectedProfile.stages,
        gracefulRampDown: '30s',
        tags: { workload: 'online-sessions' },
      },
    };
  }

  const publicShare = withAuth ? 1 - selectedAuthShare : 1;
  const scenarios = {
    public_traffic: arrivalScenario(
      selectedProfile,
      publicShare,
      'publicTraffic',
      'public',
    ),
  };

  if (withAuth) {
    scenarios.authenticated_traffic = arrivalScenario(
      selectedProfile,
      selectedAuthShare,
      'authenticatedTraffic',
      'authenticated',
    );
  }

  return scenarios;
}

function arrivalScenario(selectedProfile, share, exec, workload) {
  const base = {
    executor: selectedProfile.kind,
    exec,
    timeUnit: '1s',
    preAllocatedVUs: splitPositive(selectedProfile.preAllocatedVUs, share),
    maxVUs: splitPositive(selectedProfile.maxVUs, share),
    gracefulStop: '30s',
    tags: { workload },
  };

  if (selectedProfile.kind === 'constant-arrival-rate') {
    return {
      ...base,
      rate: splitPositive(selectedProfile.rate, share),
      duration: selectedProfile.duration,
    };
  }

  return {
    ...base,
    startRate: splitPositive(selectedProfile.startRate, share),
    stages: selectedProfile.stages.map((stage) => ({
      duration: stage.duration,
      target: splitPositive(stage.target, share),
    })),
  };
}

function buildThresholds(withAuth, withAssets, selectedProfileName) {
  const thresholds = {
    checks: ['rate>0.995'],
    http_req_failed: ['rate<0.01'],
    webfish_public_failed: ['rate<0.005'],
    webfish_public_duration: ['p(95)<500', 'p(99)<1000'],
  };

  if (selectedProfileName !== 'online') {
    thresholds.dropped_iterations = ['count==0'];
  }

  if (withAuth) {
    thresholds.webfish_authenticated_failed = ['rate<0.01'];
    thresholds.webfish_authenticated_duration = [
      'p(95)<800',
      'p(99)<1500',
    ];
  }

  if (withAssets) {
    thresholds.webfish_asset_failed = ['rate<0.005'];
    thresholds.webfish_asset_duration = ['p(95)<1000', 'p(99)<2000'];
  }

  return thresholds;
}

function splitPositive(value, share) {
  return Math.max(1, Math.round(value * share));
}

function pickWeighted(routes) {
  const roll = Math.random() * 100;
  let cursor = 0;

  for (const route of routes) {
    cursor += route.weight;
    if (roll < cursor) {
      return route;
    }
  }

  return routes[routes.length - 1];
}

function readFraction(name, rawValue, fallback) {
  const value = rawValue === undefined || rawValue === ''
    ? fallback
    : Number(rawValue);

  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    throw new Error(`${name} must be a number greater than 0 and less than 1.`);
  }

  return value;
}

function parseAndValidateTarget(rawValue) {
  const value = rawValue.trim().replace(/\/+$/, '');
  const match = /^(https?):\/\/(\[[^\]]+\]|[^/:?#@]+)(?::\d+)?$/i.exec(value);

  if (!match) {
    throw new Error(
      'BASE_URL must be an http(s) origin without credentials, path, query or fragment.',
    );
  }

  const hostValue = match[2].replace(/^\[|\]$/g, '').toLowerCase();
  const local =
    hostValue === 'localhost' ||
    hostValue === '127.0.0.1' ||
    hostValue === '::1' ||
    hostValue === 'host.docker.internal';

  return { baseUrl: value, host: hostValue, isLoopback: local };
}

function guardRemoteTarget(targetHost, targetIsLoopback) {
  if (!targetIsLoopback && __ENV.ALLOW_REMOTE !== '1') {
    throw new Error(
      'Remote targets are disabled. Use an isolated load-test environment and set ALLOW_REMOTE=1 explicitly.',
    );
  }

  if (
    PRODUCTION_HOSTS.has(targetHost) &&
    __ENV.ALLOW_PRODUCTION !== 'I_ACCEPT_PRODUCTION_LOAD'
  ) {
    throw new Error(
      'The production domain is blocked. A scheduled production test additionally requires ALLOW_PRODUCTION=I_ACCEPT_PRODUCTION_LOAD.',
    );
  }
}
