import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type JSX,
  type KeyboardEvent,
} from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';

import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import {
  communityChatApi,
  communityChatErrorMessage,
  createCommunityIdempotencyKey,
  isCommunityChatRoomSlug,
  type CommunityChatMentionCandidate,
  type CommunityChatMessage,
  type CommunityChatReportReason,
  type CommunityChatRoom,
  type CommunityChatRoomSlug,
} from '../../api/community';
import { Button, Card, EmptyState, PageHeader, Tag, Textarea } from '../../components/ui';
import {
  collectCommunityChatMentionCandidates,
  canWithdrawCommunityChatMessage,
  communityChatBodyError,
  communityChatGapStart,
  latestCommunityChatSequence,
  mergeCommunityChatMessages,
  loadCommunityChatGap,
  normalizeCommunityChatBody,
  oldestCommunityChatSequence,
} from './chat-message-state';
import type {
  ChatAckEvent,
  ChatErrorEvent,
  ChatReadyEvent,
} from './chat-protocol';
import {
  acquireCommunityChatConnection,
  releaseCommunityChatConnection,
  type CommunityChatConnection,
  type CommunityChatConnectionSnapshot,
} from './community-chat-connection';
import { CHAT_PRESENCE_LABELS } from './CommunityChatLobbyPage';
import { CommunityExperienceNav } from './CommunityExperienceNav';
import styles from './CommunityChat.module.css';

interface PendingChatMessage {
  clientMessageId: string;
  requestId: string;
  body: string;
  replyToMessageId?: string;
  mentionPublicIds: string[];
  state: 'pending' | 'acked' | 'failed';
  error?: string;
  messageId?: string;
}

const REPORT_REASON_LABELS: Record<CommunityChatReportReason, string> = {
  harassment: '骚扰或人身攻击',
  spam: '垃圾广告或刷屏',
  privacy: '泄露个人隐私',
  illegal: '违法或危险内容',
  other: '其他问题',
};

const CONNECTION_LABELS: Record<CommunityChatConnectionSnapshot['status'], string> = {
  idle: '准备连接',
  ticketing: '正在连接',
  connecting: '正在连接',
  authenticating: '正在连接',
  ready: '在线',
  reconnecting: '网络波动，正在重连',
  failed: '连接失败',
  closed: '已离线',
};

function formatMessageTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function visibleBody(message: CommunityChatMessage): string | null {
  if (message.visibility === 'blocked_placeholder') return '已拉黑用户的消息已隐藏';
  if (message.visibility === 'withdrawn_placeholder') return '这条消息已撤回';
  if (message.visibility === 'moderated_placeholder') return '这条消息已被社区治理隐藏';
  return message.body;
}

export function CommunityChatRoomPage(): JSX.Element {
  const { roomSlug: rawRoomSlug = '' } = useParams();
  const user = useCommunityAuthStore((state) => state.user);
  const roomSlug = isCommunityChatRoomSlug(rawRoomSlug) ? rawRoomSlug : null;
  const [room, setRoom] = useState<CommunityChatRoom | null>(null);
  const [messages, setMessages] = useState<CommunityChatMessage[]>([]);
  const [pendingMessages, setPendingMessages] = useState<PendingChatMessage[]>([]);
  const [connectionSnapshot, setConnectionSnapshot] = useState<CommunityChatConnectionSnapshot>({
    status: 'idle', reconnectAttempt: 0, lastError: null,
  });
  const [socketMentionCandidates, setSocketMentionCandidates] = useState<CommunityChatMentionCandidate[]>([]);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<CommunityChatMessage | null>(null);
  const [mentionPublicIds, setMentionPublicIds] = useState<string[]>([]);
  const [hasMoreBefore, setHasMoreBefore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [gapLoading, setGapLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [reportMessageId, setReportMessageId] = useState<string>();
  const [reportReason, setReportReason] = useState<CommunityChatReportReason>('harassment');
  const [reportDetail, setReportDetail] = useState('');
  const [reporting, setReporting] = useState(false);
  const [retryUntil, setRetryUntil] = useState<number>(0);
  const [clock, setClock] = useState(() => Date.now());
  const connectionRef = useRef<CommunityChatConnection | null>(null);
  const latestSequenceRef = useRef(0);
  const gapRequestRef = useRef<Promise<void> | null>(null);
  const slowModeSecondsRef = useRef(0);

  useEffect(() => {
    slowModeSecondsRef.current = room?.slowModeSeconds ?? 0;
  }, [room?.slowModeSeconds]);

  const acceptMessages = useCallback((incoming: readonly CommunityChatMessage[]) => {
    if (!roomSlug) return;
    setMessages((current) => {
      const next = mergeCommunityChatMessages(current, incoming);
      const latest = latestCommunityChatSequence(next, roomSlug);
      latestSequenceRef.current = latest;
      connectionRef.current?.updateRoomCursor(roomSlug, latest);
      return next;
    });
    const clientIds = new Set(incoming.map((message) => message.clientMessageId).filter(Boolean));
    const messageIds = new Set(incoming.map((message) => message.id));
    setPendingMessages((current) => current.filter((pending) =>
      !clientIds.has(pending.clientMessageId) && !(pending.messageId && messageIds.has(pending.messageId)),
    ));
  }, [roomSlug]);

  const fillGap = useCallback((afterSequence: number): Promise<void> => {
    if (!roomSlug) return Promise.resolve();
    if (gapRequestRef.current) return gapRequestRef.current;
    const request = (async () => {
      setGapLoading(true);
      await loadCommunityChatGap(
        roomSlug,
        afterSequence,
        communityChatApi.listMessages,
        acceptMessages,
      );
    })()
      .catch((requestError) => setError(`消息补齐失败：${communityChatErrorMessage(requestError)}`))
      .finally(() => {
        setGapLoading(false);
        gapRequestRef.current = null;
      });
    gapRequestRef.current = request;
    return request;
  }, [acceptMessages, roomSlug]);

  const handleAck = useCallback((event: ChatAckEvent) => {
    if (event.action === 'send') {
      setPendingMessages((current) => current.map((pending) =>
        pending.clientMessageId === event.clientMessageId || pending.requestId === event.requestId
          ? { ...pending, state: 'acked', messageId: event.messageId ?? pending.messageId, error: undefined }
          : pending,
      ));
      if (slowModeSecondsRef.current > 0) setRetryUntil(Date.now() + slowModeSecondsRef.current * 1000);
    }
    if (event.action === 'withdraw') setNotice('消息已撤回');
  }, []);

  const handleSocketError = useCallback((event: ChatErrorEvent) => {
    if (event.clientMessageId || event.requestId) {
      setPendingMessages((current) => current.map((pending) =>
        pending.clientMessageId === event.clientMessageId || pending.requestId === event.requestId
          ? { ...pending, state: 'failed', error: event.message }
          : pending,
      ));
    }
    if (event.retryAfterSeconds && event.retryAfterSeconds > 0) {
      setRetryUntil(Date.now() + event.retryAfterSeconds * 1000);
    }
    setError(event.message);
  }, []);

  const handleReady = useCallback((event: ChatReadyEvent) => {
    if (!roomSlug) return;
    const readyRoom = event.rooms.find((item) => item.roomSlug === roomSlug);
    if (!readyRoom) return;
    if (readyRoom.mentionCandidates) setSocketMentionCandidates(readyRoom.mentionCandidates);
    if (readyRoom.presenceBand) {
      setRoom((current) => current ? { ...current, presenceBand: readyRoom.presenceBand! } : current);
    }
    const localLatest = latestSequenceRef.current;
    const gapStart = communityChatGapStart(readyRoom, localLatest);
    if (gapStart != null) void fillGap(gapStart);
  }, [fillGap, roomSlug]);

  useEffect(() => {
    if (!roomSlug) return undefined;
    const connection = acquireCommunityChatConnection();
    connectionRef.current = connection;
    const removeListener = connection.addListener((connectionEvent) => {
      if (connectionEvent.kind === 'state') {
        setConnectionSnapshot(connectionEvent.snapshot);
        return;
      }
      const event = connectionEvent.event;
      if (event.type === 'chat.ready') handleReady(event);
      if (event.type === 'chat.ack') handleAck(event);
      if (event.type === 'chat.error') handleSocketError(event);
      if ((event.type === 'chat.message.created' || event.type === 'chat.message.updated') && event.message.roomSlug === roomSlug) {
        acceptMessages([event.message]);
      }
      if (event.type === 'chat.presence' && event.roomSlug === roomSlug) {
        setRoom((current) => current ? { ...current, presenceBand: event.presenceBand } : current);
      }
    });
    connection.subscribeRoom(roomSlug, latestSequenceRef.current);
    connection.connect();
    return () => {
      removeListener();
      connection.unsubscribeRoom(roomSlug);
      releaseCommunityChatConnection(connection);
      connectionRef.current = null;
    };
  }, [acceptMessages, handleAck, handleReady, handleSocketError, roomSlug]);

  const loadInitial = useCallback(async () => {
    if (!roomSlug) return;
    setLoading(true);
    setError(undefined);
    try {
      const [roomPage, messagePage] = await Promise.all([
        communityChatApi.listRooms(),
        communityChatApi.listMessages(roomSlug, { limit: 50 }),
      ]);
      const selectedRoom = roomPage.items.find((item) => item.slug === roomSlug);
      if (!selectedRoom) {
        setError('没有找到这个聊天室');
        setRoom(null);
        return;
      }
      setRoom(selectedRoom);
      setSocketMentionCandidates(selectedRoom.mentionCandidates ?? []);
      if (selectedRoom.retryAfterSeconds) {
        setRetryUntil(Date.now() + selectedRoom.retryAfterSeconds * 1000);
      }
      const next = mergeCommunityChatMessages([], messagePage.items ?? []);
      setMessages(next);
      const latest = latestCommunityChatSequence(next, roomSlug);
      latestSequenceRef.current = latest;
      connectionRef.current?.updateRoomCursor(roomSlug, latest);
      setHasMoreBefore(messagePage.hasMoreBefore);
    } catch (requestError) {
      setError(communityChatErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [roomSlug]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    const timer = globalThis.setInterval(() => setClock(Date.now()), 1_000);
    return () => globalThis.clearInterval(timer);
  }, []);

  const mentionCandidates = useMemo(() => collectCommunityChatMentionCandidates(
    [...(room?.mentionCandidates ?? []), ...socketMentionCandidates],
    messages,
    roomSlug ?? 'general',
    user?.publicId,
  ), [messages, room?.mentionCandidates, roomSlug, socketMentionCandidates, user?.publicId]);

  const retrySeconds = Math.max(0, Math.ceil((retryUntil - clock) / 1000));
  const composerDisabled = !room || room.closed || room.readOnly ||
    connectionSnapshot.status !== 'ready' || retrySeconds > 0;

  function transmitPending(pending: PendingChatMessage): void {
    const requestId = createCommunityIdempotencyKey('chat-send');
    setPendingMessages((current) => current.map((item) => item.clientMessageId === pending.clientMessageId
      ? { ...item, requestId, state: 'pending', error: undefined }
      : item));
    try {
      const connection = connectionRef.current;
      if (!connection) throw new Error('聊天室实时连接不存在，消息没有发送');
      connection.sendMessage({
        requestId,
        clientMessageId: pending.clientMessageId,
        roomSlug: roomSlug!,
        body: pending.body,
        replyToMessageId: pending.replyToMessageId,
        mentionPublicIds: pending.mentionPublicIds.length > 0 ? pending.mentionPublicIds : undefined,
      });
    } catch (sendError) {
      setPendingMessages((current) => current.map((item) => item.clientMessageId === pending.clientMessageId
        ? { ...item, requestId, state: 'failed', error: sendError instanceof Error ? sendError.message : '消息发送失败' }
        : item));
    }
  }

  function sendMessage(event?: FormEvent<HTMLFormElement>): void {
    event?.preventDefault();
    if (!roomSlug) return;
    const validationError = communityChatBodyError(body);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (mentionPublicIds.length > 5) {
      setError('每条消息最多 @ 5 人');
      return;
    }
    const pending: PendingChatMessage = {
      clientMessageId: createCommunityIdempotencyKey('chat-client-message'),
      requestId: createCommunityIdempotencyKey('chat-send'),
      body: normalizeCommunityChatBody(body),
      replyToMessageId: replyTo?.id,
      mentionPublicIds,
      state: 'pending',
    };
    setPendingMessages((current) => [...current, pending]);
    setBody('');
    setReplyTo(null);
    setMentionPublicIds([]);
    setError(undefined);
    transmitPending(pending);
  }

  function handleComposerKeys(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      if (!composerDisabled) sendMessage();
    }
  }

  async function loadOlderMessages(): Promise<void> {
    if (!roomSlug) return;
    const beforeSequence = oldestCommunityChatSequence(messages, roomSlug);
    if (beforeSequence == null) return;
    setLoadingOlder(true);
    setError(undefined);
    try {
      const page = await communityChatApi.listMessages(roomSlug, { beforeSequence, limit: 50 });
      acceptMessages(page.items ?? []);
      setHasMoreBefore(page.hasMoreBefore);
    } catch (requestError) {
      setError(communityChatErrorMessage(requestError));
    } finally {
      setLoadingOlder(false);
    }
  }

  async function copyMessage(message: CommunityChatMessage): Promise<void> {
    if (!message.body || message.visibility !== 'visible') return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('浏览器没有提供剪贴板权限');
      await navigator.clipboard.writeText(message.body);
      setNotice('消息文本已复制');
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : '复制失败');
    }
  }

  function withdrawMessage(message: CommunityChatMessage): void {
    try {
      connectionRef.current?.withdrawMessage(
        message.roomSlug,
        message.id,
        createCommunityIdempotencyKey('chat-withdraw'),
      );
      setNotice('正在撤回消息…');
    } catch (withdrawError) {
      setError(withdrawError instanceof Error ? withdrawError.message : '撤回请求发送失败');
    }
  }

  async function reportMessage(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!reportMessageId) return;
    setReporting(true);
    setError(undefined);
    try {
      await communityChatApi.reportMessage(
        reportMessageId,
        { reason: reportReason, detail: reportDetail.trim() || undefined },
        createCommunityIdempotencyKey('chat-report'),
      );
      setNotice('举报已提交');
      setReportMessageId(undefined);
      setReportDetail('');
    } catch (requestError) {
      setError(communityChatErrorMessage(requestError));
    } finally {
      setReporting(false);
    }
  }

  function addMention(publicId: string): void {
    if (!publicId || mentionPublicIds.includes(publicId)) return;
    if (mentionPublicIds.length >= 5) {
      setError('每条消息最多 @ 5 人');
      return;
    }
    setMentionPublicIds((current) => [...current, publicId]);
  }

  if (!roomSlug) return <Navigate to="/community/chat" replace />;

  return (
    <main className={styles.page}>
      <CommunityExperienceNav />
      <PageHeader
        title={room?.name ?? '聊天室'}
        subtitle={room?.description ?? '正在进入聊天室'}
        actions={<Link to="/community/chat">返回六房间大厅</Link>}
      />

      <div className={styles.roomStatusBar}>
        <span data-status={connectionSnapshot.status}>{CONNECTION_LABELS[connectionSnapshot.status]}</span>
        <span>活跃档位：{CHAT_PRESENCE_LABELS[room?.presenceBand ?? 'unavailable']}</span>
        {room?.slowModeSeconds ? <span>慢速模式：{room.slowModeSeconds} 秒</span> : null}
        {gapLoading ? <span role="status">正在同步新消息…</span> : null}
        {connectionSnapshot.status === 'failed' ? (
          <Button size="sm" variant="secondary" onClick={() => connectionRef.current?.reconnectNow()}>重新连接</Button>
        ) : null}
      </div>
      {connectionSnapshot.lastError ? <p className={styles.warning} role="status">{connectionSnapshot.lastError}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {!loading && !room && error ? (
        <Button variant="secondary" onClick={() => void loadInitial()}>重新加载房间</Button>
      ) : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      {room?.closed ? <p className={styles.error} role="alert">房间当前关闭，不能读取实时消息或发言。</p> : null}
      {room?.readOnly && !room.closed ? <p className={styles.warning}>房间当前只读，可以查看消息但不能发言。</p> : null}
      {retrySeconds > 0 ? <p className={styles.warning}>请等待 {retrySeconds} 秒后再发言。</p> : null}

      <section className={styles.chatLayout} aria-label="聊天室内容">
        <div className={styles.messageColumn}>
          {hasMoreBefore ? (
            <Button variant="secondary" fullWidth loading={loadingOlder} onClick={() => void loadOlderMessages()}>
              加载更早消息
            </Button>
          ) : null}
          {loading ? <p role="status">正在加载消息…</p> : messages.length === 0 ? (
            <EmptyState title="还没有消息" message="来和大家说第一句话吧。" />
          ) : (
            <ol className={styles.messageList} aria-label="聊天室消息" aria-live="polite">
              {messages.map((message) => {
                const bodyText = visibleBody(message);
                const canWithdrawNow = canWithdrawCommunityChatMessage(message, clock);
                return (
                  <li key={`${message.roomSlug}:${message.sequence}:${message.id}`} id={`chat-message-${message.id}`} data-visibility={message.visibility}>
                    <header>
                      <strong>{message.visibility === 'blocked_placeholder' ? '已拉黑用户' : message.author.displayName}</strong>
                      <span>#{message.sequence} · {formatMessageTime(message.createdAt)}</span>
                    </header>
                    {message.replyTo ? (
                      <blockquote>
                        回复 {message.replyTo.authorDisplayName}：{message.replyTo.bodyPreview ?? '原消息不可见'}
                      </blockquote>
                    ) : null}
                    <p>{bodyText || '消息内容不可见'}</p>
                    {message.visibility === 'visible' ? (
                      <footer className={styles.messageActions}>
                        <button type="button" onClick={() => setReplyTo(message)}>回复</button>
                        <button type="button" onClick={() => void copyMessage(message)}>复制</button>
                        {canWithdrawNow ? <button type="button" onClick={() => withdrawMessage(message)}>撤回</button> : null}
                        {message.permissions.canReport ? <button type="button" onClick={() => setReportMessageId(message.id)}>举报</button> : null}
                      </footer>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}

          {pendingMessages.length > 0 ? (
            <section className={styles.outbox} aria-label="待发送消息">
              <h2>发送状态</h2>
              {pendingMessages.map((pending) => (
                <article key={pending.clientMessageId} data-state={pending.state}>
                  <p>{pending.body}</p>
                  <span>
                    {pending.state === 'pending' ? '发送中' : pending.state === 'acked' ? '已发送' : `发送失败：${pending.error ?? '未知原因'}`}
                  </span>
                  {pending.state === 'failed' ? (
                    <Button size="sm" variant="secondary" disabled={connectionSnapshot.status !== 'ready'} onClick={() => transmitPending(pending)}>
                      重新发送
                    </Button>
                  ) : null}
                </article>
              ))}
            </section>
          ) : null}
        </div>

        <aside className={styles.composerColumn}>
          <Card title="发送纯文本消息">
            {replyTo ? (
              <div className={styles.replyingTo}>
                <span>回复 {replyTo.author.displayName}</span>
                <button type="button" onClick={() => setReplyTo(null)}>取消回复</button>
              </div>
            ) : null}
            <form className={styles.composer} onSubmit={sendMessage}>
              <Textarea
                label="消息内容"
                value={body}
                maxLength={500}
                rows={6}
                disabled={room?.closed || room?.readOnly}
                onChange={(event) => setBody(event.target.value)}
                onKeyDown={handleComposerKeys}
              />
              <div className={styles.composerMeta}><span>{[...body].length}/500</span><span>Ctrl/⌘ + Enter 发送</span></div>
              <label className={styles.mentionSelect}>
                添加 @ 候选（最多 5 人）
                <select value="" disabled={mentionPublicIds.length >= 5 || mentionCandidates.length === 0} onChange={(event) => addMention(event.target.value)}>
                  <option value="">选择想提醒的人</option>
                  {mentionCandidates.filter((candidate) => !mentionPublicIds.includes(candidate.publicId)).map((candidate) => (
                    <option key={candidate.publicId} value={candidate.publicId}>{candidate.displayName} · {candidate.publicId}</option>
                  ))}
                </select>
              </label>
              {mentionPublicIds.length > 0 ? (
                <div className={styles.mentionChips} aria-label="已选择的提醒对象">
                  {mentionPublicIds.map((publicId) => {
                    const candidate = mentionCandidates.find((item) => item.publicId === publicId);
                    return <button key={publicId} type="button" onClick={() => setMentionPublicIds((current) => current.filter((item) => item !== publicId))}>@{candidate?.displayName ?? publicId} ×</button>;
                  })}
                </div>
              ) : null}
              <Button type="submit" fullWidth disabled={composerDisabled || Boolean(communityChatBodyError(body))}>
                {room?.closed ? '房间已关闭' : room?.readOnly ? '房间只读' : retrySeconds > 0 ? `等待 ${retrySeconds} 秒` : connectionSnapshot.status !== 'ready' ? '等待实时连接' : '发送消息'}
              </Button>
            </form>
            <p className={styles.safetyNote}>请勿发送手机号、邮箱、住址或其他敏感信息。</p>
          </Card>
        </aside>
      </section>

      {reportMessageId ? (
        <Card title="举报消息">
          <form className={styles.reportForm} onSubmit={(event) => void reportMessage(event)}>
            <label>举报原因<select value={reportReason} onChange={(event) => setReportReason(event.target.value as CommunityChatReportReason)}>{Object.entries(REPORT_REASON_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>补充说明（可选）<textarea value={reportDetail} maxLength={500} onChange={(event) => setReportDetail(event.target.value)} /></label>
            <div className={styles.inlineActions}>
              <Button type="submit" loading={reporting}>提交举报</Button>
              <Button variant="secondary" onClick={() => setReportMessageId(undefined)}>取消</Button>
            </div>
          </form>
        </Card>
      ) : null}
    </main>
  );
}
