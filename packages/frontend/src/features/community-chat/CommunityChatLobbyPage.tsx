import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';

import {
  COMMUNITY_CHAT_ROOM_DEFINITIONS,
  communityChatApi,
  communityChatErrorMessage,
  type CommunityChatPresenceBand,
  type CommunityChatRoom,
} from '../../api/community';
import { Button, Card, PageHeader, Tag } from '../../components/ui';
import { CommunityExperienceNav } from './CommunityExperienceNav';
import styles from './CommunityChat.module.css';

export const CHAT_PRESENCE_LABELS: Record<CommunityChatPresenceBand, string> = {
  quiet: '较安静',
  active: '有人交流',
  busy: '交流活跃',
  very_busy: '当前繁忙',
  unavailable: '状态不可用',
};

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

  const roomBySlug = useMemo(
    () => new Map(rooms.map((room) => [room.slug, room])),
    [rooms],
  );

  return (
    <main className={styles.page}>
      <CommunityExperienceNav />
      <PageHeader
        title="固定聊天室"
        subtitle="选择感兴趣的话题，和站内伙伴一起聊聊。每个房间保留最近 200 条消息。"
        actions={<Tag color="neutral">纯文本实时交流</Tag>}
      />

      {error ? (
        <div className={styles.error} role="alert">
          <p>{error}</p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>重新加载</Button>
        </div>
      ) : null}
      {loading ? <p role="status">正在加载聊天室…</p> : null}

      <section className={styles.roomGrid} aria-label="六个固定聊天室">
        {COMMUNITY_CHAT_ROOM_DEFINITIONS.map((definition) => {
          const room = roomBySlug.get(definition.slug);
          const unavailable = !room;
          const closed = room?.closed ?? true;
          return (
            <Card
              key={definition.slug}
              className={styles.roomCard}
              title={definition.name}
              headerActions={
                <Tag color={closed ? 'danger' : room?.readOnly ? 'neutral' : 'success'}>
                  {unavailable ? '状态不可用' : closed ? '已关闭' : room?.readOnly ? '只读' : '可交流'}
                </Tag>
              }
            >
              <p>{room?.description || definition.shortDescription}</p>
              <dl>
                <div><dt>当前活跃</dt><dd>{CHAT_PRESENCE_LABELS[room?.presenceBand ?? 'unavailable']}</dd></div>
                <div><dt>发言间隔</dt><dd>{room ? room.slowModeSeconds > 0 ? `${room.slowModeSeconds} 秒` : '无额外间隔' : '未知'}</dd></div>
              </dl>
              {room?.retryAfterSeconds ? <p className={styles.warning}>请等待约 {room.retryAfterSeconds} 秒后再发言。</p> : null}
              {!unavailable && !closed ? (
                <Link className={styles.primaryLink} to={`/community/chat/${definition.slug}`}>
                  {room.readOnly ? '进入阅读' : '进入房间'}
                </Link>
              ) : <span className={styles.disabledAction}>当前不能进入</span>}
            </Card>
          );
        })}
      </section>

      <Card title="聊天室须知">
        <ul className={styles.rulesList}>
          <li>只支持 1–500 字符纯文本，不支持图片、文件、富文本或支付信息。</li>
          <li>可以回复或 @ 房间成员，请勿公开他人的隐私信息。</li>
          <li>网络波动时会自动重连；发送失败的消息可以手动重试。</li>
          <li>请勿发布个人隐私、骚扰、违法内容或未经授权的公司信息。</li>
        </ul>
      </Card>
    </main>
  );
}
