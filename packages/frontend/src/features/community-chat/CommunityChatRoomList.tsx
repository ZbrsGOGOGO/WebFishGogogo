import { type JSX } from 'react';
import { Link } from 'react-router-dom';

import {
  COMMUNITY_CHAT_ROOM_DEFINITIONS,
  type CommunityChatPresenceBand,
  type CommunityChatRoom,
  type CommunityChatRoomSlug,
} from '../../api/community';
import styles from './CommunityChat.module.css';

export const CHAT_PRESENCE_LABELS: Record<CommunityChatPresenceBand, string> = {
  quiet: '较安静',
  active: '有人交流',
  busy: '交流活跃',
  very_busy: '当前繁忙',
  unavailable: '状态不可用',
};

const ROOM_MARKS: Record<CommunityChatRoomSlug, string> = {
  general: '茶',
  developer: '研',
  product: '品',
  qa: '测',
  sales: '客',
  hr: '组',
};

interface CommunityChatRoomListProps {
  rooms: readonly CommunityChatRoom[];
  activeSlug?: CommunityChatRoomSlug | null;
  label?: string;
}

export function CommunityChatRoomList({
  rooms,
  activeSlug,
  label = '群聊会话',
}: CommunityChatRoomListProps): JSX.Element {
  const roomBySlug = new Map(rooms.map((room) => [room.slug, room]));

  return (
    <nav className={styles.roomConversationList} aria-label={label}>
      {COMMUNITY_CHAT_ROOM_DEFINITIONS.map((definition) => {
        const room = roomBySlug.get(definition.slug);
        const unavailable = !room;
        const closed = room?.closed ?? true;
        const status = unavailable
          ? '状态不可用'
          : closed
            ? '已关闭'
            : room.readOnly
              ? '只读'
              : '可交流';
        const row = (
          <>
            <span className={styles.roomConversationMark} aria-hidden="true">
              {ROOM_MARKS[definition.slug]}
            </span>
            <span className={styles.roomConversationCopy}>
              <strong>{definition.name}</strong>
              <small>{room?.description || definition.shortDescription}</small>
            </span>
            <span className={styles.roomConversationMeta}>
              <b data-state={unavailable || closed ? 'closed' : room.readOnly ? 'readonly' : 'open'}>
                {status}
              </b>
              <small>{CHAT_PRESENCE_LABELS[room?.presenceBand ?? 'unavailable']}</small>
            </span>
          </>
        );

        return !unavailable && !closed ? (
          <Link
            key={definition.slug}
            to={`/community/chat/${definition.slug}`}
            aria-current={activeSlug === definition.slug ? 'page' : undefined}
          >
            {row}
          </Link>
        ) : (
          <div key={definition.slug} aria-disabled="true">
            {row}
          </div>
        );
      })}
    </nav>
  );
}
