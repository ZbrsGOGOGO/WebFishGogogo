import { useCallback, useEffect, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';

import { COMMUNITY_FEATURE_FLAGS } from '../../app/community-nav';
import {
  communityChatApi,
  communityChatErrorMessage,
  type CommunityChatRoom,
} from '../../api/community';
import { Button, PageHeader } from '../../components/ui';
import { CommunityChatRoomList } from './CommunityChatRoomList';
import { CommunityExperienceNav } from './CommunityExperienceNav';
import styles from './CommunityChat.module.css';

export function CommunityChatLobbyPage(): JSX.Element {
  const [rooms, setRooms] = useState<CommunityChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const page = await communityChatApi.listRooms();
      setRooms(page.items ?? []);
    } catch (requestError) {
      setError(communityChatErrorMessage(requestError));
      setRooms([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className={styles.page}>
      <CommunityExperienceNav />
      <PageHeader
        title="同事群聊"
        subtitle="像打开工作群一样选择会话，进入后可以连续查看和发送消息。"
        actions={COMMUNITY_FEATURE_FLAGS.friends ? <Link to="/messages">查看私人消息</Link> : undefined}
      />

      {error ? (
        <div className={styles.error} role="alert">
          <p>{error}</p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>重新加载</Button>
        </div>
      ) : null}
      {loading ? <p role="status">正在加载聊天室…</p> : null}

      <section className={styles.chatDirectory} aria-label="六个固定聊天室">
        <header className={styles.chatDirectoryHeader}>
          <div>
            <h2>群聊会话</h2>
            <p>点击一行即可切换话题。初次进入只加载最近消息，需要时可继续向前查看。</p>
          </div>
          <span>纯文本实时交流</span>
        </header>
        <CommunityChatRoomList rooms={rooms} label="六个固定聊天室" />
      </section>

      {COMMUNITY_FEATURE_FLAGS.friends ? (
        <section className={styles.chatShortcuts} aria-label="聊天快捷入口">
          <Link to="/messages">
            <strong>私人消息</strong>
            <span>在一个列表里切换好友会话</span>
          </Link>
          <Link to="/friends">
            <strong>好友与申请</strong>
            <span>查找账号、添加好友后发起私聊</span>
          </Link>
        </section>
      ) : null}

      <section className={styles.chatRules} aria-labelledby="chat-rules-title">
        <h2 id="chat-rules-title">聊天室须知</h2>
        <ul className={styles.rulesList}>
          <li>只支持 1–500 字符纯文本，不支持图片、文件、富文本或支付信息。</li>
          <li>可以回复或 @ 房间成员，请勿公开他人的隐私信息。</li>
          <li>网络波动时会自动重连；发送失败的消息可以手动重试。</li>
          <li>请勿发布个人隐私、骚扰、违法内容或未经授权的公司信息。</li>
        </ul>
      </section>
    </main>
  );
}
