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
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import {
  communityChatErrorMessage,
  communityDirectMessagesApi,
  createCommunityIdempotencyKey,
  type CommunityDirectConversation,
  type CommunityDirectMessage,
  type CommunityChatReportReason,
} from '../../api/community';
import { Button, Card, EmptyState, PageHeader, Tag, Textarea } from '../../components/ui';
import { communityAvatarMark } from '../community/profile-options';
import type { ChatAckEvent, ChatErrorEvent } from './chat-protocol';
import {
  acquireCommunityChatConnection,
  releaseCommunityChatConnection,
  type CommunityChatConnection,
  type CommunityChatConnectionSnapshot,
} from './community-chat-connection';
import { CommunityExperienceNav } from './CommunityExperienceNav';
import styles from './CommunityChat.module.css';

interface PendingDirectMessage {
  conversationId: string;
  clientMessageId: string;
  requestId: string;
  body: string;
  replyToMessageId?: string;
  state: 'pending' | 'acked' | 'failed';
  sentAt: number;
  error?: string;
  messageId?: string;
}

const CONNECTION_LABELS: Record<CommunityChatConnectionSnapshot['status'], string> = {
  idle: '准备连接',
  ticketing: '正在连接',
  connecting: '正在连接',
  authenticating: '正在连接',
  ready: '实时在线',
  reconnecting: '网络波动，正在重连',
  failed: '连接失败',
  closed: '已离线',
};

const REPORT_REASON_LABELS: Record<CommunityChatReportReason, string> = {
  harassment: '骚扰或人身攻击',
  spam: '垃圾广告或刷屏',
  privacy: '泄露个人隐私',
  illegal: '违法或危险内容',
  other: '其他问题',
};

function mergeDirectMessages(
  current: readonly CommunityDirectMessage[],
  incoming: readonly CommunityDirectMessage[],
): CommunityDirectMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const existing = byId.get(message.id);
    if (!existing || message.version >= existing.version) byId.set(message.id, message);
  }
  return [...byId.values()].sort((left, right) => left.sequence - right.sequence);
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
}

function visibleBody(message: CommunityDirectMessage): string {
  if (message.visibility === 'withdrawn_placeholder') return '这条消息已撤回';
  if (message.visibility === 'moderated_placeholder') return '这条消息已被隐藏';
  if (message.visibility === 'blocked_placeholder') return '该用户的消息已隐藏';
  return message.body ?? '';
}

function documentIsVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

function scrollerIsNearBottom(scroller: HTMLDivElement | null): boolean {
  if (!scroller) return false;
  return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 48;
}

const DELETED_USER_PUBLIC_ID = '00000000-0000-4000-8000-000000000000';

export function CommunityDirectMessagesPage(): JSX.Element {
  const { conversationId, friendPublicId } = useParams();
  const navigate = useNavigate();
  const user = useCommunityAuthStore((state) => state.user);
  const [conversations, setConversations] = useState<CommunityDirectConversation[]>([]);
  const [conversationCursor, setConversationCursor] = useState<string | null>(null);
  const [loadingMoreConversations, setLoadingMoreConversations] = useState(false);
  const [messages, setMessages] = useState<CommunityDirectMessage[]>([]);
  const [pending, setPending] = useState<PendingDirectMessage[]>([]);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<CommunityDirectMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [opening, setOpening] = useState(Boolean(friendPublicId));
  const [hasMoreBefore, setHasMoreBefore] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [reportMessageId, setReportMessageId] = useState<string>();
  const [reportReason, setReportReason] = useState<CommunityChatReportReason>('harassment');
  const [reportDetail, setReportDetail] = useState('');
  const [reporting, setReporting] = useState(false);
  const [connection, setConnection] = useState<CommunityChatConnectionSnapshot>({
    status: 'idle', reconnectAttempt: 0, lastError: null,
  });
  const connectionRef = useRef<CommunityChatConnection | null>(null);
  const messageScrollerRef = useRef<HTMLDivElement | null>(null);
  const latestSequenceRef = useRef(0);
  const historyLoadedRef = useRef(false);
  const latestReadRequestedRef = useRef(0);
  const previousConnectionStatusRef = useRef<CommunityChatConnectionSnapshot['status']>('idle');
  const conversationLoadGenerationRef = useRef(0);
  const activeConversationIdRef = useRef(conversationId);
  const autoScrollToBottomRef = useRef(false);
  const autoReadSequenceRef = useRef(0);
  const recoveryRequestedRef = useRef(false);
  activeConversationIdRef.current = conversationId;

  const selected = useMemo(
    () => conversations.find((item) => item.id === conversationId) ?? null,
    [conversationId, conversations],
  );

  const loadConversations = useCallback(async (showLoading = true) => {
    const requestGeneration = ++conversationLoadGenerationRef.current;
    setLoadingMoreConversations(false);
    if (showLoading) setLoading(true);
    try {
      let page = await communityDirectMessagesApi.listConversations();
      const loaded = [...(page.items ?? [])];
      for (let pageCount = 1; conversationId && page.nextCursor && pageCount < 10; pageCount += 1) {
        if (loaded.some((item) => item.id === conversationId)) break;
        page = await communityDirectMessagesApi.listConversations(page.nextCursor);
        loaded.push(...(page.items ?? []));
      }
      if (requestGeneration !== conversationLoadGenerationRef.current) return;
      setConversations((current) => {
        if (showLoading) return loaded;
        const byId = new Map(loaded.map((item) => [item.id, item]));
        for (const item of current) {
          if (!byId.has(item.id)) byId.set(item.id, item);
        }
        return [...byId.values()];
      });
      setConversationCursor(page.nextCursor ?? null);
      setError(undefined);
    } catch (requestError) {
      if (requestGeneration === conversationLoadGenerationRef.current) {
        setError(communityChatErrorMessage(requestError));
      }
    } finally {
      if (showLoading && requestGeneration === conversationLoadGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [conversationId]);

  async function loadMoreConversations(): Promise<void> {
    if (!conversationCursor || loadingMoreConversations) return;
    const requestGeneration = ++conversationLoadGenerationRef.current;
    setLoadingMoreConversations(true);
    try {
      const page = await communityDirectMessagesApi.listConversations(conversationCursor);
      if (requestGeneration !== conversationLoadGenerationRef.current) return;
      setConversations((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        for (const item of page.items ?? []) byId.set(item.id, item);
        return [...byId.values()];
      });
      setConversationCursor(page.nextCursor ?? null);
    } catch (requestError) {
      if (requestGeneration === conversationLoadGenerationRef.current) {
        setError(communityChatErrorMessage(requestError));
      }
    } finally {
      if (requestGeneration === conversationLoadGenerationRef.current) {
        setLoadingMoreConversations(false);
      }
    }
  }

  const acceptMessages = useCallback((incoming: readonly CommunityDirectMessage[]) => {
    const clientIds = new Set(incoming.map((message) => message.clientMessageId).filter(Boolean));
    const messageIds = new Set(incoming.map((message) => message.id));
    setPending((current) => current.filter((item) =>
      !clientIds.has(item.clientMessageId) && !(item.messageId && messageIds.has(item.messageId)),
    ));
    const matching = conversationId && activeConversationIdRef.current === conversationId
      ? incoming.filter((message) => message.conversationId === conversationId)
      : [];
    if (matching.length === 0) return;
    setMessages((current) => {
      const next = mergeDirectMessages(current, matching);
      latestSequenceRef.current = next.at(-1)?.sequence ?? 0;
      return next;
    });
  }, [conversationId]);

  const markRead = useCallback(async (throughSequence: number) => {
    if (!conversationId || throughSequence <= 0) return;
    latestReadRequestedRef.current = Math.max(latestReadRequestedRef.current, throughSequence);
    setConversations((current) => current.map((item) =>
      item.id === conversationId ? { ...item, unreadCount: 0 } : item,
    ));
    const socket = connectionRef.current;
    if (socket?.getSnapshot().status === 'ready') {
      try {
        socket.markDirectRead({
          requestId: createCommunityIdempotencyKey('direct-read'),
          conversationId,
          throughSequence,
        });
        return;
      } catch {
        // ready 与 send 之间若恰好断线，立即改走有会话校验的 REST 路径。
      }
    }
    try {
      const result = await communityDirectMessagesApi.markRead(
        conversationId,
        throughSequence,
        createCommunityIdempotencyKey('direct-read'),
      );
      if (activeConversationIdRef.current === conversationId) {
        setConversations((current) => current.map((item) =>
          item.id === conversationId
            ? { ...item, unreadCount: Math.max(0, result.unreadCount) }
            : item,
        ));
      }
    } catch {
      // 已读回写失败不阻断阅读，下次进入会再次同步。
    }
  }, [conversationId]);

  const recoverConversation = useCallback(async (): Promise<void> => {
    if (!conversationId) {
      await loadConversations(false);
      return;
    }
    if (!historyLoadedRef.current) {
      recoveryRequestedRef.current = true;
      return;
    }
    try {
      const requestedConversationId = conversationId;
      const shouldFollowMessages = documentIsVisible() &&
        scrollerIsNearBottom(messageScrollerRef.current);
      let afterSequence = latestSequenceRef.current;
      for (let pageCount = 0; pageCount < 20; pageCount += 1) {
        const page = await communityDirectMessagesApi.listMessages(requestedConversationId, {
          afterSequence,
          limit: 200,
        });
        const incoming = page.items ?? [];
        if (activeConversationIdRef.current !== requestedConversationId) return;
        if (incoming.length > 0) {
          if (shouldFollowMessages) {
            autoScrollToBottomRef.current = true;
            autoReadSequenceRef.current = Math.max(
              autoReadSequenceRef.current,
              incoming.at(-1)?.sequence ?? 0,
            );
          }
          acceptMessages(incoming);
          afterSequence = incoming.at(-1)?.sequence ?? afterSequence;
        }
        if (!page.hasMoreAfter || incoming.length === 0) break;
      }
      if (activeConversationIdRef.current !== requestedConversationId) return;
      const latestWindow = await communityDirectMessagesApi.listMessages(
        requestedConversationId,
        { limit: 200 },
      );
      if (activeConversationIdRef.current !== requestedConversationId) return;
      if ((latestWindow.items ?? []).length > 0) {
        if (shouldFollowMessages) {
          autoScrollToBottomRef.current = true;
          autoReadSequenceRef.current = Math.max(
            autoReadSequenceRef.current,
            latestWindow.items.at(-1)?.sequence ?? 0,
          );
        }
        acceptMessages(latestWindow.items);
      }
      recoveryRequestedRef.current = false;
      await loadConversations(false);
    } catch (requestError) {
      if (activeConversationIdRef.current === conversationId) {
        setError(communityChatErrorMessage(requestError));
      }
    }
  }, [acceptMessages, conversationId, loadConversations]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!friendPublicId) return;
    let active = true;
    setOpening(true);
    setError(undefined);
    communityDirectMessagesApi.openConversation(friendPublicId)
      .then((opened) => {
        if (!active) return;
        conversationLoadGenerationRef.current += 1;
        setLoading(false);
        setLoadingMoreConversations(false);
        setConversations((current) => {
          const remaining = current.filter((item) => item.id !== opened.id);
          return [opened, ...remaining];
        });
        navigate(`/messages/${encodeURIComponent(opened.id)}`, { replace: true });
      })
      .catch((requestError) => {
        if (active) setError(communityChatErrorMessage(requestError));
      })
      .finally(() => {
        if (active) setOpening(false);
      });
    return () => { active = false; };
  }, [friendPublicId, navigate]);

  useEffect(() => {
    const socket = acquireCommunityChatConnection();
    connectionRef.current = socket;
    const removeListener = socket.addListener((connectionEvent) => {
      if (connectionEvent.kind === 'state') {
        setConnection(connectionEvent.snapshot);
        const previousStatus = previousConnectionStatusRef.current;
        previousConnectionStatusRef.current = connectionEvent.snapshot.status;
        if (
          previousStatus === 'ready' &&
          connectionEvent.snapshot.status !== 'ready'
        ) {
          setPending((current) => current.map((item) =>
            item.state === 'pending'
              ? { ...item, state: 'failed', error: '连接中断，请重试；重复点击不会重复发送' }
              : item,
          ));
        }
        if (connectionEvent.snapshot.status === 'ready' && previousStatus !== 'ready') {
          void recoverConversation();
        }
        return;
      }
      const event = connectionEvent.event;
      if (event.type === 'chat.ack' && event.action === 'direct-send') {
        setPending((current) => current.map((item) =>
          item.clientMessageId === event.clientMessageId || item.requestId === event.requestId
            ? { ...item, state: 'acked', messageId: event.messageId, error: undefined }
            : item,
        ));
        if (event.conversationId === conversationId) void recoverConversation();
      }
      if (event.type === 'chat.ack' && event.action === 'direct-read') {
        setConversations((current) => current.map((item) =>
          item.id === event.conversationId
            ? { ...item, unreadCount: Math.max(0, event.unreadCount ?? 0) }
            : item,
        ));
      }
      if (event.type === 'chat.error') {
        const directError = event as ChatErrorEvent;
        if (directError.conversationId || directError.clientMessageId) {
          setPending((current) => current.map((item) =>
            item.clientMessageId === directError.clientMessageId || item.requestId === directError.requestId
              ? { ...item, state: 'failed', error: directError.message }
              : item,
          ));
          setError(directError.message);
          if (
            conversationId &&
            directError.conversationId === conversationId &&
            !directError.clientMessageId &&
            latestReadRequestedRef.current > 0
          ) {
            void communityDirectMessagesApi.markRead(
              conversationId,
              latestReadRequestedRef.current,
              createCommunityIdempotencyKey('direct-read-recovery'),
            ).then(() => loadConversations(false)).catch(() => undefined);
          }
        }
      }
      if (
        event.type === 'chat.direct.message.created' ||
        event.type === 'chat.direct.message.updated'
      ) {
        if (event.message.conversationId === conversationId) {
          if (
            event.type === 'chat.direct.message.created' &&
            documentIsVisible() &&
            scrollerIsNearBottom(messageScrollerRef.current)
          ) {
            autoScrollToBottomRef.current = true;
            autoReadSequenceRef.current = Math.max(
              autoReadSequenceRef.current,
              event.message.sequence,
            );
          }
          acceptMessages([event.message]);
        } else {
          const clientMessageId = event.message.clientMessageId;
          setPending((current) => current.filter((item) =>
            item.messageId !== event.message.id &&
            (!clientMessageId || item.clientMessageId !== clientMessageId),
          ));
        }
        void loadConversations(false);
      }
      if (event.type === 'chat.direct.read.updated' && event.reader === 'self') {
        void loadConversations(false);
      }
    });
    socket.connect();
    return () => {
      removeListener();
      releaseCommunityChatConnection(socket);
      connectionRef.current = null;
    };
  }, [acceptMessages, conversationId, loadConversations, markRead, recoverConversation]);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      latestSequenceRef.current = 0;
      latestReadRequestedRef.current = 0;
      historyLoadedRef.current = false;
      autoScrollToBottomRef.current = false;
      autoReadSequenceRef.current = 0;
      recoveryRequestedRef.current = false;
      return;
    }
    let active = true;
    setLoadingMessages(true);
    setMessages([]);
    latestSequenceRef.current = 0;
    latestReadRequestedRef.current = 0;
    historyLoadedRef.current = false;
    autoScrollToBottomRef.current = false;
    autoReadSequenceRef.current = 0;
    recoveryRequestedRef.current = false;
    communityDirectMessagesApi.listMessages(conversationId, { limit: 50 })
      .then((page) => {
        if (!active || activeConversationIdRef.current !== conversationId) return;
        autoScrollToBottomRef.current = true;
        autoReadSequenceRef.current = Math.max(
          autoReadSequenceRef.current,
          page.latestSequence,
        );
        setMessages((current) => {
          const next = mergeDirectMessages(current, page.items ?? []);
          latestSequenceRef.current = next.at(-1)?.sequence ?? page.latestSequence ?? 0;
          return next;
        });
        historyLoadedRef.current = true;
        setHasMoreBefore(page.hasMoreBefore);
        if (
          recoveryRequestedRef.current ||
          connectionRef.current?.getSnapshot().status === 'ready'
        ) {
          void recoverConversation();
        }
      })
      .catch((requestError) => {
        if (active && activeConversationIdRef.current === conversationId) {
          historyLoadedRef.current = true;
          setError(communityChatErrorMessage(requestError));
          if (
            recoveryRequestedRef.current ||
            connectionRef.current?.getSnapshot().status === 'ready'
          ) {
            void recoverConversation();
          }
        }
      })
      .finally(() => {
        if (active) setLoadingMessages(false);
      });
    return () => { active = false; };
  }, [conversationId, markRead, recoverConversation]);

  useEffect(() => {
    if (loadingMessages || autoReadSequenceRef.current <= 0) return;
    const scroller = messageScrollerRef.current;
    if (!scroller || !documentIsVisible()) return;
    if (autoScrollToBottomRef.current) {
      scroller.scrollTop = scroller.scrollHeight;
      autoScrollToBottomRef.current = false;
    }
    if (!scrollerIsNearBottom(scroller)) return;
    const sequence = autoReadSequenceRef.current;
    autoReadSequenceRef.current = 0;
    void markRead(sequence);
  }, [conversationId, loadingMessages, markRead, messages]);

  useEffect(() => {
    const handleVisibility = (): void => {
      if (
        documentIsVisible() &&
        scrollerIsNearBottom(messageScrollerRef.current) &&
        latestSequenceRef.current > 0
      ) {
        void markRead(latestSequenceRef.current);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [markRead]);

  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      const now = Date.now();
      setPending((current) => {
        let changed = false;
        const next = current.map((item) => {
          if ((item.state === 'pending' || item.state === 'acked') && now - item.sentAt >= 10_000) {
            changed = true;
            return {
              ...item,
              state: 'failed' as const,
              error: item.state === 'acked'
                ? '消息已提交，但回执未同步；点击重试可安全核对'
                : '发送超时，请检查网络后重试',
            };
          }
          return item;
        });
        return changed ? next : current;
      });
    }, 1_000);
    return () => globalThis.clearInterval(timer);
  }, []);

  function transmit(item: PendingDirectMessage): void {
    try {
      const socket = connectionRef.current;
      if (!socket) throw new Error('私聊实时连接不存在');
      const requestId = createCommunityIdempotencyKey('direct-send');
      setPending((current) => current.map((candidate) =>
        candidate.clientMessageId === item.clientMessageId
          ? { ...candidate, requestId, state: 'pending', sentAt: Date.now(), error: undefined }
          : candidate,
      ));
      socket.sendDirectMessage({
        requestId,
        clientMessageId: item.clientMessageId,
        conversationId: item.conversationId,
        body: item.body,
        ...(item.replyToMessageId ? { replyToMessageId: item.replyToMessageId } : {}),
      });
    } catch (sendError) {
      setPending((current) => current.map((candidate) =>
        candidate.clientMessageId === item.clientMessageId
          ? { ...candidate, state: 'failed', error: sendError instanceof Error ? sendError.message : '发送失败' }
          : candidate,
      ));
    }
  }

  function send(event?: FormEvent<HTMLFormElement>): void {
    event?.preventDefault();
    const normalized = body.normalize('NFC').trim();
    const length = [...normalized].length;
    if (!conversationId || length < 1 || length > 500) {
      setError('消息需为 1–500 个字符');
      return;
    }
    const item: PendingDirectMessage = {
      conversationId,
      clientMessageId: createCommunityIdempotencyKey('direct-client-message'),
      requestId: createCommunityIdempotencyKey('direct-send'),
      body: normalized,
      ...(replyTo ? { replyToMessageId: replyTo.id } : {}),
      state: 'pending',
      sentAt: Date.now(),
    };
    setPending((current) => [...current, item]);
    setBody('');
    setReplyTo(null);
    setError(undefined);
    transmit(item);
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      if (connection.status === 'ready' && selected?.canSend) send();
    }
  }

  async function loadOlder(): Promise<void> {
    const beforeSequence = messages[0]?.sequence;
    if (!conversationId || beforeSequence == null) return;
    const requestedConversationId = conversationId;
    try {
      const page = await communityDirectMessagesApi.listMessages(requestedConversationId, {
        beforeSequence,
        limit: 50,
      });
      if (activeConversationIdRef.current !== requestedConversationId) return;
      acceptMessages(page.items ?? []);
      setHasMoreBefore(page.hasMoreBefore);
    } catch (requestError) {
      if (activeConversationIdRef.current === requestedConversationId) {
        setError(communityChatErrorMessage(requestError));
      }
    }
  }

  function withdraw(message: CommunityDirectMessage): void {
    try {
      const socket = connectionRef.current;
      if (!socket) throw new Error('私聊实时连接不存在');
      socket.withdrawDirectMessage(
        message.conversationId,
        message.id,
        createCommunityIdempotencyKey('direct-withdraw'),
      );
      setNotice('正在撤回消息…');
    } catch (withdrawError) {
      setError(withdrawError instanceof Error ? withdrawError.message : '撤回失败');
    }
  }

  async function reportMessage(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!reportMessageId) return;
    setReporting(true);
    setError(undefined);
    try {
      await communityDirectMessagesApi.reportMessage(
        reportMessageId,
        { reason: reportReason, detail: reportDetail.trim() || undefined },
        createCommunityIdempotencyKey('direct-report'),
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

  return (
    <main className={styles.page}>
      <CommunityExperienceNav />
      <PageHeader
        title="私人消息"
        subtitle="好友之间实时私聊；删除好友后保留历史，但不能继续发送。"
        actions={<Tag color={connection.status === 'ready' ? 'success' : 'neutral'}>{CONNECTION_LABELS[connection.status]}</Tag>}
      />

      {connection.lastError ? <p className={styles.warning}>{connection.lastError}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}

      <section className={styles.directLayout}>
        <aside className={styles.conversationSidebar} aria-label="私聊会话">
          <div className={styles.conversationSidebarHeader}>
            <strong>最近会话</strong>
            <Link to="/friends">发起私聊</Link>
          </div>
          {loading || opening ? <p role="status">正在加载会话…</p> : null}
          {!loading && conversations.length === 0 ? (
            <EmptyState title="还没有私聊" message="先去查找账号、添加好友，再从好友列表发起私聊。" />
          ) : null}
          <nav className={styles.conversationList}>
            {conversations.map((item) => (
              <Link
                key={item.id}
                to={`/messages/${encodeURIComponent(item.id)}`}
                aria-current={item.id === conversationId ? 'page' : undefined}
              >
                <span className={styles.directAvatar} aria-hidden="true">{communityAvatarMark(item.friend.avatarKey ?? undefined)}</span>
                <span>
                  <strong>{item.friend.displayName}</strong>
                  <small>{item.lastMessage?.body ?? '已建立好友私聊'}</small>
                </span>
                {item.unreadCount > 0 ? <b aria-label={`${item.unreadCount} 条未读`}>{Math.min(item.unreadCount, 99)}</b> : null}
              </Link>
            ))}
          </nav>
          {conversationCursor ? (
            <Button
              size="sm"
              variant="ghost"
              loading={loadingMoreConversations}
              onClick={() => void loadMoreConversations()}
            >加载更多会话</Button>
          ) : null}
        </aside>

        <section className={styles.directConversation} aria-label="消息内容">
          {!conversationId ? (
            <EmptyState title="选择一位好友" message="选择左侧会话，或去好友页发起新私聊。" />
          ) : (
            <>
              <header className={styles.directConversationHeader}>
                <div>
                  <strong>{selected?.friend.displayName ?? '好友私聊'}</strong>
                  <small>{selected?.friend.username ? `@${selected.friend.username}` : '只有你和对方可见'}</small>
                </div>
                {selected && selected.friend.publicId !== DELETED_USER_PUBLIC_ID ? (
                  <Link to={`/users/${encodeURIComponent(selected.friend.publicId)}`}>查看主页</Link>
                ) : null}
              </header>

              <div
                ref={messageScrollerRef}
                className={styles.directMessageScroller}
                aria-label="消息记录"
                onScroll={() => {
                  if (
                    documentIsVisible() &&
                    scrollerIsNearBottom(messageScrollerRef.current) &&
                    latestSequenceRef.current > 0
                  ) {
                    void markRead(latestSequenceRef.current);
                  }
                }}
              >
                {hasMoreBefore ? <Button variant="ghost" size="sm" onClick={() => void loadOlder()}>加载更早消息</Button> : null}
                {loadingMessages ? <p role="status">正在加载消息…</p> : null}
                {!loadingMessages && messages.length === 0 ? <p className={styles.directWelcome}>你们已是好友，打个招呼吧。</p> : null}
                <ol className={styles.directMessageList}>
                  {messages.map((message) => {
                    const mine = message.author.publicId === user?.publicId;
                    return (
                      <li key={message.id} data-mine={mine} data-visibility={message.visibility}>
                        <div>
                          <span>{mine ? '我' : message.author.displayName}</span>
                          <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                        </div>
                        {message.replyTo ? (
                          <blockquote>{message.replyTo.authorDisplayName}：{message.replyTo.bodyPreview ?? '原消息不可见'}</blockquote>
                        ) : null}
                        <p>{visibleBody(message)}</p>
                        {message.visibility === 'visible' ? (
                          <footer>
                            <button type="button" onClick={() => setReplyTo(message)}>回复</button>
                            {message.permissions.canWithdraw ? <button type="button" onClick={() => withdraw(message)}>撤回</button> : null}
                            {message.permissions.canReport ? <button type="button" onClick={() => setReportMessageId(message.id)}>举报</button> : null}
                          </footer>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
                {pending.some((item) => item.conversationId === conversationId) ? (
                  <div className={styles.directOutbox} aria-label="待发送消息">
                    {pending.filter((item) => item.conversationId === conversationId).map((item) => (
                      <article key={item.clientMessageId} data-state={item.state}>
                        <p>{item.body}</p>
                        <span>{item.state === 'failed' ? item.error ?? '发送失败' : item.state === 'acked' ? '已送达' : '发送中…'}</span>
                        {item.state === 'failed' ? <Button size="sm" variant="secondary" onClick={() => transmit(item)}>重试</Button> : null}
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>

              <form className={styles.directComposer} onSubmit={send}>
                {replyTo ? (
                  <div className={styles.replyingTo}>
                    <span>回复 {replyTo.author.displayName}：{replyTo.body?.slice(0, 50)}</span>
                    <button type="button" onClick={() => setReplyTo(null)}>取消</button>
                  </div>
                ) : null}
                {!selected?.canSend ? <p className={styles.warning}>当前不是可私聊的好友关系，历史消息仍可查看。</p> : null}
                <Textarea
                  label="消息"
                  value={body}
                  maxLength={500}
                  rows={3}
                  disabled={!selected?.canSend}
                  placeholder="输入消息，Ctrl / Cmd + Enter 发送"
                  onChange={(event) => setBody(event.target.value)}
                  onKeyDown={onComposerKeyDown}
                />
                <div className={styles.directComposerActions}>
                  <small>{[...body].length}/500 · 仅限好友可发送</small>
                  <Button
                    type="submit"
                    disabled={!selected?.canSend || connection.status !== 'ready' || !body.trim()}
                  >发送</Button>
                </div>
              </form>
            </>
          )}
        </section>
      </section>

      {reportMessageId ? (
        <Card title="举报私聊消息">
          <form className={styles.reportForm} onSubmit={(event) => void reportMessage(event)}>
            <label>
              举报原因
              <select value={reportReason} onChange={(event) => setReportReason(event.target.value as CommunityChatReportReason)}>
                {Object.entries(REPORT_REASON_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>
              补充说明（可选）
              <textarea value={reportDetail} maxLength={500} onChange={(event) => setReportDetail(event.target.value)} />
            </label>
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
