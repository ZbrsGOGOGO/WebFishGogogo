import { buildDatabaseConfig } from './database.config';

describe('buildDatabaseConfig', () => {
  it('provides bounded connection-pool and query timeout defaults', () => {
    expect(buildDatabaseConfig({})).toMatchObject({
      type: 'postgres',
      port: 5432,
      poolSize: 15,
      connectTimeoutMS: 5_000,
      extra: {
        idleTimeoutMillis: 30_000,
        statement_timeout: 15_000,
        query_timeout: 20_000,
        lock_timeout: 5_000,
        idle_in_transaction_session_timeout: 30_000,
      },
    });
  });

  it('maps explicit environment values to TypeORM and node-postgres options', () => {
    expect(
      buildDatabaseConfig({
        DB_PORT: '6543',
        DB_POOL_MAX: '48',
        DB_CONNECT_TIMEOUT_MS: '8000',
        DB_POOL_IDLE_TIMEOUT_MS: '45000',
        DB_STATEMENT_TIMEOUT_MS: '12000',
        DB_QUERY_TIMEOUT_MS: '18000',
        DB_LOCK_TIMEOUT_MS: '2500',
        DB_IDLE_TRANSACTION_TIMEOUT_MS: '24000',
      }),
    ).toMatchObject({
      port: 6543,
      poolSize: 48,
      connectTimeoutMS: 8_000,
      extra: {
        idleTimeoutMillis: 45_000,
        statement_timeout: 12_000,
        query_timeout: 18_000,
        lock_timeout: 2_500,
        idle_in_transaction_session_timeout: 24_000,
      },
    });
  });

  it.each([
    ['DB_PORT', '5432.5'],
    ['DB_POOL_MAX', '0'],
    ['DB_POOL_MAX', '201'],
    ['DB_CONNECT_TIMEOUT_MS', 'not-a-number'],
    ['DB_STATEMENT_TIMEOUT_MS', '-1'],
  ])('rejects an invalid %s value', (key, value) => {
    expect(() => buildDatabaseConfig({ [key]: value })).toThrow(key);
  });
});
