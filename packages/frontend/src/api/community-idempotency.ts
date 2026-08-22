/**
 * 为一次明确的用户写操作创建幂等键。键只用于请求去重，不作为业务数据持久化。
 */
export function createCommunityIdempotencyKey(scope: string): string {
  const randomPart =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)))
          .map((value) => value.toString(16).padStart(2, '0'))
          .join('');
  return `${scope}:${randomPart}`;
}

export function communityIdempotencyHeaders(key: string): HeadersInit {
  return { 'Idempotency-Key': key };
}
