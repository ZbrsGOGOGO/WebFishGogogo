import type {
  CommunityChatMentionCandidate,
  CommunityChatMessage,
  CommunityChatMessagePage,
  CommunityChatRoomSlug,
} from '../../api/community';

function sequenceKey(message: CommunityChatMessage): string {
  return `${message.roomSlug}:${message.sequence}`;
}

/** 同一 messageId 或同一房间 sequence 都只能保留一份，updated 帧覆盖旧版本。 */
export function mergeCommunityChatMessages(
  current: readonly CommunityChatMessage[],
  incoming: readonly CommunityChatMessage[],
): CommunityChatMessage[] {
  const byId = new Map<string, CommunityChatMessage>();
  const idBySequence = new Map<string, string>();

  for (const message of [...current, ...incoming]) {
    const existingById = byId.get(message.id);
    if (existingById && existingById.version > message.version) continue;

    const key = sequenceKey(message);
    const collidingId = idBySequence.get(key);
    if (collidingId && collidingId !== message.id) byId.delete(collidingId);

    if (existingById) idBySequence.delete(sequenceKey(existingById));
    byId.set(message.id, message);
    idBySequence.set(key, message.id);
  }

  return [...byId.values()].sort((left, right) =>
    left.roomSlug.localeCompare(right.roomSlug) || left.sequence - right.sequence,
  );
}

export function latestCommunityChatSequence(
  messages: readonly CommunityChatMessage[],
  roomSlug: CommunityChatRoomSlug,
): number {
  return messages.reduce(
    (latest, message) => message.roomSlug === roomSlug ? Math.max(latest, message.sequence) : latest,
    0,
  );
}

export function oldestCommunityChatSequence(
  messages: readonly CommunityChatMessage[],
  roomSlug: CommunityChatRoomSlug,
): number | undefined {
  const sequences = messages
    .filter((message) => message.roomSlug === roomSlug)
    .map((message) => message.sequence);
  return sequences.length > 0 ? Math.min(...sequences) : undefined;
}

export function normalizeCommunityChatBody(value: string): string {
  return value.trim();
}

export function communityChatBodyError(value: string): string | null {
  const normalized = normalizeCommunityChatBody(value);
  if (!normalized) return '请输入 1–500 个字符的纯文本消息';
  if ([...normalized].length > 500) return '消息最多 500 个字符';
  return null;
}

export function canWithdrawCommunityChatMessage(
  message: CommunityChatMessage,
  now: number,
): boolean {
  if (!message.permissions.canWithdraw || !message.permissions.withdrawUntil) return false;
  const serverDeadline = new Date(message.permissions.withdrawUntil).getTime();
  const createdAt = new Date(message.createdAt).getTime();
  if (!Number.isFinite(serverDeadline) || !Number.isFinite(createdAt)) return false;
  return now < Math.min(serverDeadline, createdAt + 2 * 60 * 1000);
}

export function communityChatGapStart(
  ready: { latestSequence: number; gapAfterSequence?: number },
  localLatestSequence: number,
): number | null {
  if (ready.gapAfterSequence != null) return Math.max(0, ready.gapAfterSequence);
  return ready.latestSequence > localLatestSequence
    ? Math.max(0, localLatestSequence)
    : null;
}

/** 按 nextAfterSequence 连续拉取缺口；上限防止异常服务端游标造成无限循环。 */
export async function loadCommunityChatGap(
  roomSlug: CommunityChatRoomSlug,
  afterSequence: number,
  fetchPage: (
    room: CommunityChatRoomSlug,
    options: { afterSequence: number; limit: number },
  ) => Promise<CommunityChatMessagePage>,
  onPage?: (items: readonly CommunityChatMessage[]) => void,
): Promise<CommunityChatMessage[]> {
  let cursor = Math.max(0, afterSequence);
  let collected: CommunityChatMessage[] = [];
  for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
    const page = await fetchPage(roomSlug, { afterSequence: cursor, limit: 100 });
    collected = mergeCommunityChatMessages(collected, page.items ?? []);
    onPage?.(page.items ?? []);
    const nextCursor = page.nextAfterSequence ?? page.latestSequence;
    if (!page.hasMoreAfter || nextCursor <= cursor) break;
    cursor = nextCursor;
  }
  return collected;
}

/** @ 候选只来自服务端允许名单或已经由服务端返回的本房间消息作者。 */
export function collectCommunityChatMentionCandidates(
  allowed: readonly CommunityChatMentionCandidate[],
  messages: readonly CommunityChatMessage[],
  roomSlug: CommunityChatRoomSlug,
  ownPublicId?: string,
): CommunityChatMentionCandidate[] {
  const candidates = new Map<string, CommunityChatMentionCandidate>();
  for (const candidate of allowed) candidates.set(candidate.publicId, candidate);
  for (const message of messages) {
    if (message.roomSlug !== roomSlug || message.visibility !== 'visible') continue;
    candidates.set(message.author.publicId, {
      publicId: message.author.publicId,
      displayName: message.author.displayName,
      avatarKey: message.author.avatarKey,
    });
  }
  if (ownPublicId) candidates.delete(ownPublicId);
  return [...candidates.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName, 'zh-CN'),
  );
}
