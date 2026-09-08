import { useEffect, useRef, useState, type JSX } from 'react';
import type { RailChatChannel, RailChatPage, RailChatSendInput, RailRoomView } from '@stealth-reader/shared';

import { getCommunitySessionGeneration } from '../../../api/community-http';
import { communityRailApi, railErrorMessage } from '../../../api/community-rail';
import { useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { useGamePrivacy } from '../GamePrivacyContext';
import styles from './Rail.module.css';

export function RailRoomChat({ room }: { room: RailRoomView }): JSX.Element {
  const { covered } = useGamePrivacy();
  const userId = useCommunityAuthStore((state) => state.phase === 'active' ? state.user?.publicId ?? null : null);
  const generation = getCommunitySessionGeneration();
  const key = `${generation}:${userId}:${room.id}`;
  const latest = useRef(key); latest.current = key;
  const alive = useRef(true);
  const ownChannel: RailChatChannel = room.me.role === 'participant' ? 'player' : 'spectator';
  const [channel, setChannel] = useState<RailChatChannel>(ownChannel);
  const [snapshot, setSnapshot] = useState<{ key: string; data: RailChatPage } | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [cooling, setCooling] = useState(false);
  const coolingUntil = useRef(0);
  const coolingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const busy = useRef(false);
  const request = useRef<RailChatSendInput | null>(null);
  const withdrawn = useRef(new Set<string>());
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const current = (requestKey: string): boolean => alive.current && latest.current === requestKey && generation === getCommunitySessionGeneration() && useCommunityAuthStore.getState().phase === 'active' && useCommunityAuthStore.getState().user?.publicId === userId;
  useEffect(() => {
    setSnapshot(null); setText(''); setError(null); setReadError(null); setPending(false); setCooling(false); setChannel(ownChannel); busy.current = false; request.current = null; withdrawn.current = new Set(); coolingUntil.current = 0; if (coolingTimer.current) clearTimeout(coolingTimer.current);
    if (!userId || room.me.left || !room.chatEnabled) return undefined;
    let active = true; let controller: AbortController | undefined; let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async (): Promise<void> => {
      controller = new AbortController();
      try {
        // Re-read the latest bounded page so withdrawals cannot leave stale text.
        const data = await communityRailApi.chat(room.id, undefined, controller.signal);
        if (active && current(key)) { setSnapshot({ key, data: { ...data, items: data.items.map((message) => withdrawn.current.has(message.id) ? { ...message, status: 'withdrawn', body: null } : message) } }); setReadError(null); }
      } catch (reason) { if (active && current(key) && !controller.signal.aborted) setReadError(railErrorMessage(reason)); }
      finally { if (active && current(key)) timer = setTimeout(() => { void poll(); }, document.hidden ? 4000 : 1200); }
    };
    void poll(); return () => { active = false; controller?.abort(); if (timer) clearTimeout(timer); if (coolingTimer.current) clearTimeout(coolingTimer.current); };
  }, [key, ownChannel, room.chatEnabled, room.id, room.me.left, userId]);
  const data = snapshot?.key === key ? snapshot.data : null;
  const messages = data?.items.filter((message) => message.channel === channel) ?? [];
  useEffect(() => { stickToBottom.current = true; if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [channel]);
  useEffect(() => { if (stickToBottom.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [data?.latestSequence, channel]);
  const canWrite = room.chatEnabled && room.chatCanWrite && !room.me.left && channel === ownChannel;
  const withdraw = async (messageId: string): Promise<void> => {
    if (busy.current || !current(key) || covered) return;
    busy.current = true; setPending(true); setError(null);
    try {
      const message = await communityRailApi.withdrawChat(room.id, messageId);
      if (!current(key)) return;
      withdrawn.current.add(messageId);
      setSnapshot((value) => value?.key === key ? { key, data: { ...value.data, items: value.data.items.map((item) => item.id === messageId ? message : item) } } : value);
    } catch (reason) { if (current(key)) setError(railErrorMessage(reason)); }
    finally { if (current(key)) { busy.current = false; setPending(false); } }
  };
  const send = async (): Promise<void> => {
    const body = text.trim();
    if (!body || busy.current || !current(key) || !canWrite || covered || Date.now() < coolingUntil.current) return;
    if (!request.current || request.current.body !== body || request.current.channel !== channel) request.current = { clientMessageId: crypto.randomUUID(), channel, body };
    busy.current = true; setPending(true); setError(null);
    try {
      await communityRailApi.sendChat(room.id, request.current);
      if (!current(key)) return;
      request.current = null; setText(''); stickToBottom.current = true;
      coolingUntil.current = Date.now() + 3000; setCooling(true);
      coolingTimer.current = setTimeout(() => { if (current(key)) setCooling(false); }, 3000);
      // The non-overlapping poll picks up the message within one cycle.
    } catch (reason) { if (current(key)) setError(railErrorMessage(reason)); }
    finally { if (current(key)) { busy.current = false; setPending(false); } }
  };
  return <section id="rail-discussion" className={styles.panel} aria-label="房间讨论"><div className={styles.panelTitle}><h2>房间讨论</h2><span className={styles.muted}>双方频道都可阅读</span><div className={styles.chatTabs} role="tablist" aria-label="讨论频道"><button type="button" role="tab" aria-selected={channel === 'player'} onClick={() => setChannel('player')}>玩家讨论</button><button type="button" role="tab" aria-selected={channel === 'spectator'} onClick={() => setChannel('spectator')}>观众讨论</button></div></div>
    <div ref={scrollRef} className={styles.chatLog} role="log" aria-label={channel === 'player' ? '玩家消息' : '观众消息'} aria-live="polite" onScroll={() => { const element = scrollRef.current; if (element) stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 45; }}>
      {messages.length ? messages.map((message) => <article className={styles.message} key={message.id}><small>{message.author.displayName} · {new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}{message.author.publicId === userId && message.status === 'visible' && !room.me.left ? <button className={styles.button} style={{ minHeight: 24, padding: '2px 6px', marginLeft: 8, fontSize: 10 }} disabled={pending || covered} type="button" onClick={() => { void withdraw(message.id); }}>撤回</button> : null}</small><p>{message.status === 'withdrawn' ? '这条消息已撤回' : message.body}</p></article>) : <p className={styles.empty}>{room.chatEnabled ? '还没有消息，讨论会在这里出现。' : '当前房间未开启讨论。'}</p>}
      {data?.hasMore ? <p className={styles.muted}>显示最近的房间消息。</p> : null}
    </div>
    <div className={styles.body}>{error || readError ? <p className={styles.error} role="alert">{error ?? readError}</p> : null}{canWrite ? <form onSubmit={(event) => { event.preventDefault(); void send(); }}><textarea className={styles.chatInput} aria-label={channel === 'player' ? '玩家讨论消息' : '观众讨论消息'} value={text} onChange={(event) => setText(event.target.value)} maxLength={600} disabled={pending || covered} rows={2} placeholder="聊聊你对这次选择的看法…" /><div className={styles.actions}><span className={styles.muted}>{text.length}/600 · 文明交流</span><button className={styles.primary} type="submit" disabled={pending || cooling || covered || !text.trim()}>{pending ? '发送中…' : cooling ? '请稍候…' : '发送'}</button></div></form> : <p className={styles.muted} style={{ margin: 0 }}>{room.me.left ? '你已离开房间。' : channel !== ownChannel ? `当前频道只读。你可以切换到${ownChannel === 'player' ? '玩家' : '观众'}讨论发言。` : '当前暂时不能发言。'}</p>}</div>
  </section>;
}
