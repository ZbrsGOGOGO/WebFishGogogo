import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../../../..');
const source = (path: string): string => readFileSync(resolve(root, path), 'utf8');

describe('private development deployment boundaries', () => {
  it('normalizes copied public asset permissions independently of the release checkout umask', () => {
    const webStage = source('Dockerfile').split(' AS community-web')[1];
    expect(webStage).toContain('find /usr/share/nginx/html -type d -exec chmod 755 {} +');
    expect(webStage).toContain('find /usr/share/nginx/html -type f -exec chmod 644 {} +');
    expect(webStage.indexOf('COPY --from=community-build')).toBeLessThan(webStage.indexOf('RUN find'));
    expect(webStage).not.toContain('chmod 777');
  });

  it('opts in at runtime and keeps existing deployments disabled by default', () => {
    expect(source('deploy/docker-compose.community.yml')).toContain(
      'FEATURE_DEVELOPMENT_WORKSPACE_ENABLED: ${FEATURE_DEVELOPMENT_WORKSPACE_ENABLED:-false}',
    );
    expect(source('deploy/.env.community.example')).toContain('FEATURE_DEVELOPMENT_WORKSPACE_ENABLED=false');
  });

  it('raises the body limit only on the bounded attachment upload route', () => {
    const nginx = source('deploy/community.nginx.conf');
    const upload = nginx.match(/location ~ "(\^\/api\/v1\/development\/requests\/[^\n]+)" \{([\s\S]*?)\n    \}/);
    expect(upload).not.toBeNull();
    const matcher = new RegExp(upload![1]);
    expect(matcher.test('/api/v1/development/requests/12345678-1234-4123-8123-123456789012/attachments')).toBe(true);
    expect(matcher.test('/api/v1/development/requests/12345678-1234-4123-8123-123456789012/attachments/file/content')).toBe(false);
    expect(matcher.test('/api/v1/auth/account/register')).toBe(false);
    expect(upload![2]).toContain('client_max_body_size 6m;');
    expect(upload![2]).toContain('limit_req zone=community_development_upload_ip');
    expect(upload![2]).toContain('limit_conn community_development_upload_connections 2;');
    expect(upload![2]).toContain('proxy_pass http://community_api;');
    expect(upload![2]).not.toContain('try_files');
    expect(nginx.match(/client_max_body_size 6m;/g)).toHaveLength(1);
    expect(nginx).toContain('client_max_body_size 1m;');
  });

  it('allows development APIs without reopening legacy document APIs', () => {
    const nginx = source('deploy/community.nginx.conf');
    const allowlist = nginx.split('\n').find((line) => line.includes('location ~ ^/api/(?:health'))!;
    const pattern = allowlist.trim().slice('location ~ '.length, -2);
    const matcher = new RegExp(pattern);
    expect(matcher.test('/api/v1/development/access')).toBe(true);
    expect(matcher.test('/api/v1/development/review-export')).toBe(true);
    expect(matcher.test('/api/documents')).toBe(false);
    expect(matcher.test('/api/v1/development-elsewhere')).toBe(false);
  });

  it('preserves targeted 0026/0025 rollback checks after the newer additive migrations', () => {
    const rehearsal = source('deploy/community-migration-rehearsal.sh');
    const migration = source(
      'packages/backend/src/database/migrations/1700000000026-AddDevelopmentWorkspace.ts',
    );

    expect(rehearsal).toContain('DEVELOPMENT_TIMESTAMP=1700000000026');
    expect(rehearsal).toContain('LATEST_TIMESTAMP=1700000000029');
    expect(rehearsal.indexOf('assert_rail_reverted rehearsal_clean')).toBeLessThan(rehearsal.indexOf('assert_trending_reverted rehearsal_clean'));
    expect(rehearsal.indexOf('assert_trending_reverted rehearsal_clean')).toBeLessThan(rehearsal.indexOf('assert_play_reverted rehearsal_clean'));
    expect(rehearsal.indexOf('assert_play_reverted rehearsal_clean')).toBeLessThan(rehearsal.indexOf('assert_development_reverted rehearsal_clean'));
    expect(rehearsal).toContain(
      "conname = 'chk_development_attachments_content_bytes'",
    );
    expect(migration).toContain(
      'CONSTRAINT "chk_development_attachments_content_bytes"',
    );
    expect(rehearsal).toContain(
      "table_name IN ('development_members', 'development_requests', 'development_events', 'development_attachments')",
    );

    const developmentRevert = rehearsal.indexOf(
      '>"$REHEARSAL_TMP/development-revert.log"',
    );
    const developmentAssertion = rehearsal.indexOf(
      'assert_development_reverted rehearsal_clean',
    );
    const zhesiRevert = rehearsal.indexOf(
      '>"$REHEARSAL_TMP/zhesi-revert.log"',
    );
    const zhesiAssertion = rehearsal.indexOf(
      'assert_zhesi_arcade_reverted rehearsal_clean',
    );
    const reapply = rehearsal.indexOf(
      '>"$REHEARSAL_TMP/zhesi-reapply.log"',
    );
    const fullRollback = rehearsal.indexOf('higher_count=$(pg_scalar rehearsal_clean');

    expect([
      developmentRevert,
      developmentAssertion,
      zhesiRevert,
      zhesiAssertion,
      reapply,
      fullRollback,
    ].every((position) => position >= 0)).toBe(true);
    expect(developmentRevert).toBeLessThan(developmentAssertion);
    expect(developmentAssertion).toBeLessThan(zhesiRevert);
    expect(zhesiRevert).toBeLessThan(zhesiAssertion);
    expect(zhesiAssertion).toBeLessThan(reapply);
    expect(reapply).toBeLessThan(fullRollback);
  });
});
