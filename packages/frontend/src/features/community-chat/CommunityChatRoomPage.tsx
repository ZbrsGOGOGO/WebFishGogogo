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
  roomSlug: CommunityChatRoomSlug;
  clientMessageId: string;
  requestId: string;
  body: string;
  replyToMessageId?: string;
  mentionPublicIds: string[];
  state: 'pending' | 'acked' | 'failed';
  sentAt: number;
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
  const activeRoomSlugRef = useRef(roomSlug);
  const roomGenerationRef = useRef(0);
  const initialLoadGenerationRef = useRef(0);
  const gapRequestRef = useRef<{
    roomSlug: CommunityChatRoomSlug;
    generation: number;
    promise: Promise<void>;
  } | null>(null);
  const slowModeSecondsRef = useRef(0);
  const previousConnectionStatusRef = useRef<CommunityChatConnectionSnapshot['status']>('idle');

  if (activeRoomSlugRef.current !== roomSlug) {
    activeRoomSlugRef.current = roomSlug;
    roomGenerationRef.current += 1;
    latestSequenceRef.current = 0;
    slowModeSecondsRef.current = 0;
  }

  useEffect(() => () => {
    roomGenerationRef.current += 1;
    initialLoadGenerationRef.current += 1;
  }, []);

  useEffect(() => {
    slowModeSecondsRef.current = room?.slug === roomSlug ? room.slowModeSeconds : 0;
  }, [room, roomSlug]);

  const acceptMessages = useCallback((
    incoming: readonly CommunityChatMessage[],
    expectedGeneration = roomGenerationRef.current,
  ) => {
    if (
      !roomSlug ||
      activeRoomSlugRef.current !== roomSlug ||
      roomGenerationRef.current !== expectedGeneration
    ) return;
    const matching = incoming.filter((message) => message.roomSlug === roomSlug);
    if (matching.length === 0) return;
    setMessages((current) => {
      if (
        activeRoomSlugRef.current !== roomSlug ||
        roomGenerationRef.current !== expectedGeneration
      ) return current;
      const next = mergeCommunityChatMessages(
        current.filter((message) => message.roomSlug === roomSlug),
        matching,
      );
      const latest = latestCommunityChatSequence(next, roomSlug);
      latestSequenceRef.current = latest;
      connectionRef.current?.updateRoomCursor(roomSlug, latest);
      return next;
    });
    const clientIds = new Set(matching.map((message) => message.clientMessageId).filter(Boolean));
    const messageIds = new Set(matching.map((message) => message.id));
    setPendingMessages((current) => current.filter((pending) =>
      !clientIds.has(pending.clientMessageId) && !(pending.messageId && messageIds.has(pending.messageId)),
    ));
  }, [roomSlug]);

  const fillGap = useCallback((afterSequence: number): Promise<void> => {
    if (!roomSlug) return Promise.resolve();
    const requestedGeneration = roomGenerationRef.current;
    if (
      gapRequestRef.current?.roomSlug === roomSlug &&
      gapRequestRef.current.generation === requestedGeneration
    ) return gapRequestRef.current.promise;
    const requestedRoomSlug = roomSlug;
    let request!: Promise<void>;
    request = (async () => {
      setGapLoading(true);
      await loadCommunityChatGap(
        requestedRoomSlug,
        afterSequence,
        communityChatApi.listMessages,
        (items) => acceptMessages(items, requestedGeneration),
      );
    })()
      .catch((requestError) => {
        if (
          activeRoomSlugRef.current === requestedRoomSlug &&
          roomGenerationRef.current === requestedGeneration
        ) {
          setError(`消息补齐失败：${communityChatErrorMessage(requestError)}`);
        }
      })
      .finally(() => {
        if (gapRequestRef.current?.promise !== request) return;
        gapRequestRef.current = null;
        if (
          activeRoomSlugRef.current === requestedRoomSlug &&
          roomGenerationRef.current === requestedGeneration
        ) setGapLoading(false);
      });
    gapRequestRef.current = {
      roomSlug: requestedRoomSlug,
      generation: requestedGeneration,
      promise: request,
    };
    return request;
  }, [acceptMessages, roomSlug]);

  const handleAck = useCallback((event: ChatAckEvent) => {
    if (event.action === 'send') {
      setPendingMessages((current) => current.map((pending) =>
        pending.clientMessageId === event.clientMessageId || pending.requestId === event.requestId
          ? { ...pending, state: 'acked', messageId: event.messageId ?? pending.messageId, error: undefined }
          : pending,
      ));
      const ackIsForActiveRoom = activeRoomSlugRef.current === roomSlug &&
        event.roomSlug === roomSlug;
      if (ackIsForActiveRoom && slowModeSecondsRef.current > 0) {
        setRetryUntil(Date.now() + slowModeSecondsRef.current * 1000);
      }
      if (
        ackIsForActiveRoom &&
        typeof event.sequence === 'number' &&
        event.sequence > latestSequenceRef.current
      ) {
        // ACK 先于广播帧返回。立即用 REST 核对，即使 created 帧丢失也不会
        // 让已提交的消息永久留在发件箱中。
        const expectedSequence = event.sequence;
        void fillGap(latestSequenceRef.current).then(() => {
          if (
            activeRoomSlugRef.current === roomSlug &&
            latestSequenceRef.current < expectedSequence
          ) {
            void fillGap(latestSequenceRef.current);
          }
        });
      }
    }
    if (
      event.action === 'withdraw' &&
      activeRoomSlugRef.current === roomSlug &&
      (!event.roomSlug || event.roomSlug === roomSlug)
    ) {
      setNotice('消息已撤回');
    }
  }, [fillGap, roomSlug]);

  const handleSocketError = useCallback((event: ChatErrorEvent) => {
    if (event.clientMessageId || event.requestId) {
      setPendingMessages((current) => current.map((pending) =>
        pending.clientMessageId === event.clientMessageId || pending.requestId === event.requestId
          ? { ...pending, state: 'failed', error: event.message }
          : pending,
      ));
    }
    const affectsCurrentRoom = activeRoomSlugRef.current === roomSlug &&
      !event.conversationId &&
      (!event.roomSlug || event.roomSlug === roomSlug);
    if (affectsCurrentRoom && event.retryAfterSeconds && event.retryAfterSeconds > 0) {
      setRetryUntil(Date.now() + event.retryAfterSeconds * 1000);
    }
    if (affectsCurrentRoom) setError(event.message);
  }, [roomSlug]);

  const handleReady = useCallback((event: ChatReadyEvent) => {
    if (!roomSlug || activeRoomSlugRef.current !== roomSlug) return;
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
    const connectionGeneration = roomGenerationRef.current;
    const connection = acquireCommunityChatConnection();
    connectionRef.current = connection;
    const removeListener = connection.addListener((connectionEvent) => {
      if (roomGenerationRef.current !== connectionGeneration) return;
      if (connectionEvent.kind === 'state') {
        setConnectionSnapshot(connectionEvent.snapshot);
        const previousStatus = previousConnectionStatusRef.current;
        previousConnectionStatusRef.current = connectionEvent.snapshot.status;
        if (previousStatus === 'ready' && connectionEvent.snapshot.status !== 'ready') {
          setPendingMessages((current) => current.map((pending) => {
            if (pending.state === 'failed') return pending;
            return {
              ...pending,
              state: 'failed',
              error: pending.state === 'acked'
                ? '消息已提交，但实时回执中断；重试可安全核对'
                : '连接中断，请重试；不会重复发送',
            };
          }));
        }
        return;
      }
      const event = connectionEvent.event;
      if (event.type === 'chat.ready') handleReady(event);
      if (event.type === 'chat.ack') handleAck(event);
      if (event.type === 'chat.error') handleSocketError(event);
      if (event.type === 'chat.message.created' || event.type === 'chat.message.updated') {
        const clientMessageId = event.message.clientMessageId;
        setPendingMessages((current) => current.filter((pending) =>
          pending.messageId !== event.message.id &&
          (!clientMessageId || pending.clientMessageId !== clientMessageId),
        ));
        if (event.message.roomSlug === roomSlug) {
          acceptMessages([event.message], connectionGeneration);
        }
      }
      if (event.type === 'chat.presence' && event.roomSlug === roomSlug) {
        if (activeRoomSlugRef.current === roomSlug) {
          setRoom((current) => current ? { ...current, presenceBand: event.presenceBand } : current);
        }
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
    const requestedRoomSlug = roomSlug;
    const requestedRoomGeneration = roomGenerationRef.current;
    const requestGeneration = ++initialLoadGenerationRef.current;
    const isCurrentRequest = (): boolean =>
      activeRoomSlugRef.current === requestedRoomSlug &&
      roomGenerationRef.current === requestedRoomGeneration &&
      initialLoadGenerationRef.current === requestGeneration;
    setLoading(true);
    setError(undefined);
    setRoom(null);
    setMessages([]);
    setSocketMentionCandidates([]);
    setBody('');
    setReplyTo(null);
    setMentionPublicIds([]);
    setHasMoreBefore(false);
    setLoadingOlder(false);
    setGapLoading(false);
    setRetryUntil(0);
    setNotice(undefined);
    setReportMessageId(undefined);
    try {
      const [roomPage, messagePage] = await Promise.all([
        communityChatApi.listRooms(),
        communityChatApi.listMessages(requestedRoomSlug, { limit: 50 }),
      ]);
      if (!isCurrentRequest()) return;
      const selectedRoom = roomPage.items.find((item) => item.slug === requestedRoomSlug);
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
      // REST 首屏与 WebSocket 同时启动。如果实时帧先到，这里必须合并，
      // 不能用 REST 快照覆盖已接收的更新消息。
      acceptMessages(messagePage.items ?? [], requestedRoomGeneration);
      setHasMoreBefore(messagePage.hasMoreBefore);
    } catch (requestError) {
      if (isCurrentRequest()) {
        setError(communityChatErrorMessage(requestError));
      }
    } finally {
      if (isCurrentRequest()) setLoading(false);
    }
  }, [acceptMessages, roomSlug]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    const timer = globalThis.setInterval(() => setClock(Date.now()), 1_000);
    return () => globalThis.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      const now = Date.now();
      setPendingMessages((current) => {
        let changed = false;
        const next = current.map((pending) => {
          if (pending.state === 'failed' || now - pending.sentAt < 10_000) return pending;
          changed = true;
          return {
            ...pending,
            state: 'failed' as const,
            error: pending.state === 'acked'
              ? '消息已提交，但未同步到消息列表；重试可安全核对'
              : '发送超时，请检查网络后重试',
          };
        });
        return changed ? next : current;
      });
    }, 1_000);
    return () => globalThis.clearInterval(timer);
  }, []);

  const activeRoom = room?.slug === roomSlug ? room : null;
  const visibleMessages = useMemo(
    () => roomSlug ? messages.filter((message) => message.roomSlug === roomSlug) : [],
    [messages, roomSlug],
  );
  const mentionCandidates = useMemo(() => collectCommunityChatMentionCandidates(
    [
      ...(activeRoom?.mentionCandidates ?? []),
      ...(activeRoom ? socketMentionCandidates : []),
    ],
    user?.publicId,
  ), [activeRoom?.mentionCandidates, socketMentionCandidates, user?.publicId]);

  const retrySeconds = Math.max(0, Math.ceil((retryUntil - clock) / 1000));
  const composerDisabled = !activeRoom || activeRoom.closed || activeRoom.readOnly ||
    connectionSnapshot.status !== 'ready' || retrySeconds > 0;

  function transmitPending(pending: PendingChatMessage): void {
    const requestId = createCommunityIdempotencyKey('chat-send');
    setPendingMessages((current) => current.map((item) => item.clientMessageId === pending.clientMessageId
      ? { ...item, requestId, state: 'pending', sentAt: Date.now(), error: undefined }
      : item));
    try {
      const connection = connectionRef.current;
      if (!connection) throw new Error('聊天室实时连接不存在，消息没有发送');
      connection.sendMessage({
        requestId,
        clientMessageId: pending.clientMessageId,
        roomSlug: pending.roomSlug,
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
      roomSlug,
      clientMessageId: createCommunityIdempotencyKey('chat-client-message'),
      requestId: createCommunityIdempotencyKey('chat-send'),
      body: normalizeCommunityChatBody(body),
      replyToMessageId: replyTo?.id,
      mentionPublicIds,
      state: 'pending',
      sentAt: Date.now(),
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
    const requestedRoomSlug = roomSlug;
    const requestedGeneration = roomGenerationRef.current;
    const beforeSequence = oldestCommunityChatSequence(messages, requestedRoomSlug);
    if (beforeSequence == null) return;
    setLoadingOlder(true);
    setError(undefined);
    try {
      const page = await communityChatApi.listMessages(requestedRoomSlug, { beforeSequence, limit: 50 });
      if (
        activeRoomSlugRef.current !== requestedRoomSlug ||
        roomGenerationRef.current !== requestedGeneration
      ) return;
      acceptMessages(page.items ?? [], requestedGeneration);
      setHasMoreBefore(page.hasMoreBefore);
    } catch (requestError) {
      if (
        activeRoomSlugRef.current === requestedRoomSlug &&
        roomGenerationRef.current === requestedGeneration
      ) {
        setError(communityChatErrorMessage(requestError));
      }
    } finally {
      if (
        activeRoomSlugRef.current === requestedRoomSlug &&
        roomGenerationRef.current === requestedGeneration
      ) setLoadingOlder(false);
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
      const connection = connectionRef.current;
      if (!connection) throw new Error('聊天室实时连接不存在，撤回请求没有发送');
      connection.withdrawMessage(
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
        title={activeRoom?.name ?? '聊天室'}
        subtitle={activeRoom?.description ?? '正在进入聊天室'}
        actions={<Link to="/community/chat">返回六房间大厅</Link>}
      />

      <div className={styles.roomStatusBar}>
        <span data-status={connectionSnapshot.status}>{CONNECTION_LABELS[connectionSnapshot.status]}</span>
        <span>活跃档位：{CHAT_PRESENCE_LABELS[activeRoom?.presenceBand ?? 'unavailable']}</span>
        {activeRoom?.slowModeSeconds ? <span>慢速模式：{activeRoom.slowModeSeconds} 秒</span> : null}
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
      {activeRoom?.closed ? <p className={styles.error} role="alert">房间当前关闭，不能读取实时消息或发言。</p> : null}
      {activeRoom?.readOnly && !activeRoom.closed ? <p className={styles.warning}>房间当前只读，可以查看消息但不能发言。</p> : null}
      {retrySeconds > 0 ? <p className={styles.warning}>请等待 {retrySeconds} 秒后再发言。</p> : null}

      <section className={styles.chatLayout} aria-label="聊天室内容">
        <div className={styles.messageColumn}>
          {hasMoreBefore ? (
            <Button variant="secondary" fullWidth loading={loadingOlder} onClick={() => void loadOlderMessages()}>
              加载更早消息
            </Button>
          ) : null}
          {loading ? <p role="status">正在加载消息…</p> : visibleMessages.length === 0 ? (
            <EmptyState title="还没有消息" message="来和大家说第一句话吧。" />
          ) : (
            <ol className={styles.messageList} aria-label="聊天室消息" aria-live="polite">
              {visibleMessages.map((message) => {
                const bodyText = visibleBody(message);
                const canWithdrawNow = canWithdrawCommunityChatMessage(message, clock);
                return (
                  <li key={`${message.roomSlug}:${message.sequence}:${message.id}`} id={`chat-message-${message.id}`} data-visibility={message.visibility}>
                    <header>
                      {message.visibility === 'blocked_placeholder' ? (
                        <strong>已拉黑用户</strong>
                      ) : (
                        <Link to={`/users/${encodeURIComponent(message.author.publicId)}`}>
                          <strong>{message.author.displayName}</strong>
                        </Link>
                      )}
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

          {pendingMessages.some((pending) => pending.roomSlug === roomSlug) ? (
            <section className={styles.outbox} aria-label="待发送消息">
              <h2>发送状态</h2>
              {pendingMessages.filter((pending) => pending.roomSlug === roomSlug).map((pending) => (
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
                disabled={activeRoom?.closed || activeRoom?.readOnly}
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
                {activeRoom?.closed ? '房间已关闭' : activeRoom?.readOnly ? '房间只读' : retrySeconds > 0 ? `等待 ${retrySeconds} 秒` : connectionSnapshot.status !== 'ready' ? '等待实时连接' : '发送消息'}
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
