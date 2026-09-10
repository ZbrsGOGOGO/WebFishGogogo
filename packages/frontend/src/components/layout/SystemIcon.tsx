import type { JSX } from 'react';
import type { CommunitySystemId } from '../../app/community-nav';

const paths: Record<CommunitySystemId | 'development' | 'menu', string> = {
  home: 'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  news: 'M4 4h16v16H4ZM8 8h8M8 12h8M8 16h4',
  community: 'M4 4h16v12H9l-5 4ZM8 8h8M8 12h5',
  messages: 'M3 5h18v14H3ZM3 6l9 7 9-7',
  farm: 'M12 21v-9M12 16C4 16 3 11 3 7c6 0 9 3 9 9ZM12 12c0-6 3-9 9-9 0 6-3 9-9 9Z',
  games: 'M8 7h8c3 0 4 2 5 8 1 5-2 6-5 2H8c-3 4-6 3-5-2 1-6 2-8 5-8ZM7 10v5M4.5 12.5h5M16 11h.01M18 14h.01',
  tools: 'M14 4a6 6 0 0 0-7 7l-4 7a2 2 0 0 0 3 3l7-7a6 6 0 0 0 7-7l-4 4-3-3 4-4Z',
  deskPet: 'M5 10 3 3l7 4h4l7-4-2 7c3 7-1 11-7 11S2 17 5 10ZM8 13h.01M16 13h.01M10 17l2 1 2-1',
  officeHub: 'M4 21V7h8v14M12 3h8v18M2 21h20M7 11h2M7 15h2M15 7h2M15 11h2M15 15h2',
  towerDefense: 'M12 3 3 7v5c0 5 5 8 9 10 4-2 9-5 9-10V7ZM8 12l3 3 5-6',
  demonTower: 'M5 21V10h14v11M3 10l9-7 9 7M9 21v-6h6v6M2 21h20',
  leaderboards: 'M3 21V11h5v10M10 21V3h5v18M17 21v-7h5v7',
  feed: 'M5 4h14v17H5ZM8 8h8M8 12h8M8 16h5',
  invite: 'M3 8h18v4H3ZM5 12v9h14v-9M12 8v13M12 8C3 8 5 1 9 3l3 5ZM12 8c9 0 7-7 3-5l-3 5Z',
  profile: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',
  achievements: 'M7 3h10v5a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 4 4M17 5h4v3a4 4 0 0 1-4 4M12 13v5M7 21h10l-2-3H9Z',
  friends: 'M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM2 21v-2a8 8 0 0 1 16 0v2M17 3a4 4 0 0 1 0 8M20 15a5 5 0 0 1 2 4v2',
  development: 'M8 5 2 12l6 7M16 5l6 7-6 7M14 3l-4 18',
  menu: 'M4 6h16M4 12h16M4 18h16',
};

export function SystemIcon({ name }: { name: keyof typeof paths }): JSX.Element {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}
