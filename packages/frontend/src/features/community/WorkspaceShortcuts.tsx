import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { PUBLIC_TOOLS } from '../tools/PublicToolsPage';
import styles from './Workspace.module.css';

export const WORKSPACE_LINKS = [
  ...PUBLIC_TOOLS.map(tool => ({ path: `/tools/${tool.slug}`, label: tool.name, kind: 'tool' })),
  { path: '/games/ballpoint-breach', label: '纸上突围', kind: 'game' },
  { path: '/games/demon-tower', label: '九层妖塔', kind: 'game' },
  { path: '/tower-defense', label: '工位塔防', kind: 'game' },
  { path: '/games/zhesi', label: '遮司', kind: 'game' },
  { path: '/games/snake', label: '贪吃蛇', kind: 'game' },
  { path: '/games/tetris', label: '俄罗斯方块', kind: 'game' },
  { path: '/games/tank', label: '坦克大战', kind: 'game' },
  { path: '/games/office-2048', label: '数字整理', kind: 'game' },
  { path: '/games/underrun', label: '终端巡检', kind: 'game' },
  { path: '/games/rail', label: '轨道难题', kind: 'game' },
];
const key = (owner: string) => `webfish:workspace:v1:${encodeURIComponent(owner)}`;
const EVENT = 'workspace:shortcuts';
export function readShortcuts(owner: string): { favorites: string[]; recent: string[]; error: string } {
  try {
    const raw = localStorage.getItem(key(owner));
    if (raw && raw.length > 5000) return { favorites: [], recent: [], error: '本机快捷记录格式不受支持。' };
    const parsed = JSON.parse(raw ?? '{}');
    const valid = (values: unknown): string[] => Array.isArray(values) ? [...new Set(values.filter((v): v is string => typeof v === 'string' && WORKSPACE_LINKS.some(l => l.path === v)))].slice(0,8) : [];
    return { favorites: valid(parsed?.favorites), recent: valid(parsed?.recent), error: '' };
  } catch { return { favorites: [], recent: [], error: '本机快捷记录不可用，请检查浏览器存储权限。' }; }
}
function save(owner: string, value: { favorites: string[]; recent: string[] }): boolean {
  try { localStorage.setItem(key(owner), JSON.stringify(value)); window.dispatchEvent(new CustomEvent(EVENT)); return true; } catch { return false; }
}
export function WorkspaceVisitTracker(): null {
  const path = useLocation().pathname;
  const owner = useCommunityAuthStore(s => s.phase === 'active' ? s.user?.publicId : null);
  useEffect(() => {
    if (!owner || !WORKSPACE_LINKS.some(l => l.path === path)) return;
    const current = readShortcuts(owner); if (current.error) return;
    save(owner, { favorites: current.favorites, recent: [path, ...current.recent.filter(p => p !== path)].slice(0, 8) });
  }, [owner, path]);
  return null;
}
export function WorkspaceShortcuts({ owner }: { owner: string }) {
  const [state, setState] = useState(() => readShortcuts(owner));
  useEffect(() => {
    const read = (): void => setState(readShortcuts(owner));
    read(); window.addEventListener(EVENT, read); window.addEventListener('storage', read);
    return () => { window.removeEventListener(EVENT, read); window.removeEventListener('storage', read); };
  }, [owner]);
  const update = (next: { favorites: string[]; recent: string[] }): void => {
    if (useCommunityAuthStore.getState().user?.publicId !== owner) return;
    if (!save(owner, next)) setState(s => ({ ...s, error: '快捷记录未能保存，请检查浏览器存储权限。' }));
  };
  const links = (paths: string[]) => paths.map(path => WORKSPACE_LINKS.find(l => l.path === path)!).filter(Boolean).map(l => <Link key={l.path} to={l.path}>{l.label}</Link>);
  return <section className={styles.shortcuts} aria-label="个人快捷入口">
    <div><h2>常用工具</h2><nav aria-label="收藏工具">{state.favorites.length ? links(state.favorites) : <p>在下方选择常用工具，下次直接打开。</p>}</nav>
      <details><summary>管理常用工具（最多 8 个）</summary><div className={styles.options}>{WORKSPACE_LINKS.filter(l => l.kind === 'tool').map(l => <label key={l.path}><input type="checkbox" checked={state.favorites.includes(l.path)} disabled={!state.favorites.includes(l.path) && state.favorites.length >= 8} onChange={e => update({ recent: state.recent, favorites: e.target.checked ? [...state.favorites, l.path] : state.favorites.filter(p => p !== l.path) })} />{l.label}</label>)}</div></details>
    </div><div><h2>最近使用</h2><nav aria-label="最近使用">{state.recent.length ? links(state.recent) : <p>打开工具或休闲项目后，这里会保留快捷入口。</p>}</nav><button type="button" disabled={!state.recent.length} onClick={() => update({ favorites: state.favorites, recent: [] })}>清空最近使用</button></div>
    <p className={styles.note}>仅保存在此浏览器、当前账号下，最多各 8 条；不记录输入内容，不同步到公开主页。</p>{state.error ? <p role="status">{state.error}</p> : null}
  </section>;
}
