import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { COMMUNITY_FEATURE_FLAGS } from '../../../app/community-nav';
import type { BallpointBreachStatus } from './BallpointBreachGame';
import { announceLocalGameForeground } from '../game-input';
import './ballpoint-window.css';

// Neither Three.js nor the runtime is imported until a user opens the window.
const LazyGame = lazy(() => import('./BallpointBreachGame'));
interface WindowContext { openWindow: () => void; coverWindow: () => void; isOpen: boolean; isPlaying: boolean }
const BallpointWindowContext = createContext<WindowContext>({ openWindow: () => undefined, coverWindow: () => undefined, isOpen: false, isPlaying: false });
export const useBallpointWindow = () => useContext(BallpointWindowContext);

/** One instance above all community layouts, including tools/game routes. */
export function BallpointWindowProvider({ children }: { children: ReactNode }) {
  const phase = useCommunityAuthStore(state => state.phase);
  const userId = useCommunityAuthStore(state => state.user?.publicId);
  const identity = `${phase}:${userId ?? 'guest'}`;
  const location = useLocation();
  const [owner, setOwner] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [covered, setCovered] = useState(false);
  const [large, setLarge] = useState(false);
  const [status, setStatus] = useState<BallpointBreachStatus>('idle');
  const [notes, setNotes] = useState('');
  const isOpen = owner !== null && owner === identity;
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const openWindow = useCallback(() => {
    announceLocalGameForeground('ballpoint');
    setOwner(identity);
    setMinimized(false);
    setCovered(false);
  }, [identity]);
  const coverWindow = useCallback(() => setCovered(true), []);
  const closeWindow = useCallback(() => {
    setOwner(null);
    setMinimized(false);
    setCovered(false);
    setLarge(false);
    setNotes('');
    setStatus('idle');
  }, []);
  useEffect(() => { closeWindow(); }, [identity, closeWindow]);
  useEffect(() => {
    if (isOpenRef.current) setCovered(true);
  }, [location.pathname, location.search]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (!isOpenRef.current || event.key !== 'Escape' || event.isComposing) return;
      // Do not prevent/stop: the site's existing game-workspace cover may also react.
      setCovered(true);
    };
    const hide = () => { if (document.hidden && isOpenRef.current) setCovered(true); };
    window.addEventListener('keydown', escape);
    window.addEventListener('blur', coverWindow);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('keydown', escape);
      window.removeEventListener('blur', coverWindow);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [coverWindow]);
  const isPlaying = isOpen && !covered && !minimized && status === 'playing';
  const value = useMemo(() => ({ openWindow, coverWindow, isOpen, isPlaying }), [openWindow, coverWindow, isOpen, isPlaying]);

  return <BallpointWindowContext.Provider value={value}>
    {children}
    {isOpen && <aside className={`bp-window${large ? ' bp-window-large' : ''}${minimized ? ' bp-window-minimized' : ''}`} aria-label="纸上突围工作稿小窗" data-status={status}>
      <header className="bp-window-header">
        <strong>工作稿 <span>· 本地</span></strong>
        <div>
          {!minimized && <>
            <button type="button" onClick={() => setCovered(value => !value)} aria-pressed={covered}>{covered ? '返回练习' : '便签'}</button>
            <button type="button" onClick={() => setLarge(value => !value)} aria-label={large ? '缩小工作稿' : '放大工作稿'}>{large ? '缩小' : '放大'}</button>
          </>}
          <button type="button" onClick={() => setMinimized(value => !value)} aria-label={minimized ? '恢复工作稿' : '最小化工作稿'}>{minimized ? '恢复' : '收起'}</button>
          <button type="button" onClick={closeWindow} aria-label="关闭工作稿并结束本轮">关闭</button>
        </div>
      </header>
      <div className="bp-window-body" hidden={minimized}>
        <div className="bp-window-game" hidden={covered}>
          <Suspense fallback={<p className="bp-window-loading" role="status">正在打开工作稿…</p>}>
            <LazyGame active={!covered && !minimized} onStatusChange={setStatus} onPrivacyPause={coverWindow} />
          </Suspense>
        </div>
        {covered && <section className="bp-window-notes" aria-label="工作稿临时便签">
          <label htmlFor="ballpoint-working-notes">随手记录</label>
          <textarea id="ballpoint-working-notes" value={notes} onChange={event => setNotes(event.target.value)} placeholder="待办与想法，仅当前窗口保存…" />
          <p>练习已暂停。便签不上传；关闭窗口会清空。</p>
          <button type="button" onClick={() => setCovered(false)}>返回练习</button>
        </section>}
      </div>
      {!minimized && <footer>静音 · 键盘鼠标操作 · Esc 收起画面 · 不计官方奖励</footer>}
    </aside>}
  </BallpointWindowContext.Provider>;
}

export function BallpointBreachEntryPage() {
  const { openWindow, isOpen } = useBallpointWindow();
  return <section className="bp-entry" aria-label="纸上突围单机游戏">
    <Link to="/games">← 返回小游戏专区</Link>
    <p>本地单机 / Ballpoint Breach</p>
    <h1>纸上突围</h1>
    <p>纸笔风格的五轮生存练习，五种工具与抓钩。通过右下角工作稿小窗打开，浏览站内页面时保留本轮。</p>
    <p>默认静音，点击开始后才操作游戏。Esc、切换页面或隐藏浏览器都会暂停；需手动返回继续。关闭、刷新页面、退出或切换账号会结束本轮。</p>
    <p>需要支持 WebGL 2 的桌面浏览器与键盘鼠标，暂未提供触屏玩法。下方生存练习为本地单机，不计排行榜、成就或办公币奖励。</p>
    <button type="button" onClick={openWindow}>{isOpen ? '恢复工作稿小窗' : '打开工作稿小窗'}</button>
    {COMMUNITY_FEATURE_FLAGS.paperArena && <p><Link to="/games/ballpoint-breach/arena">红蓝房间对战 →</Link> · 4–8 席，AI 补齐，20–100 击败目标，房主可设密码。联机沿用原版人物与五种武器，场景扩建至 96×102；全员相同初始装备，收起后整局继续，不与本地五轮练习混算。</p>}
    <p>基于开源项目 <a href="https://github.com/promptwhisper/ballpoint-breach" target="_blank" rel="noreferrer noopener">Ballpoint Breach</a> 本地改编，Apache-2.0；Three.js 为 MIT 许可。</p>
    <p>开源许可：<a href="/licenses/ballpoint-breach-Apache-2.0.txt" target="_blank" rel="noreferrer noopener">Apache-2.0 原文</a> · <a href="/licenses/ballpoint-breach-THIRD-PARTY.txt" target="_blank" rel="noreferrer noopener">第三方归属</a> · <a href="/licenses/ballpoint-breach-video2threejs-MIT.txt" target="_blank" rel="noreferrer noopener">video2threejs MIT</a> · <a href="/licenses/ballpoint-breach-three-MIT.txt" target="_blank" rel="noreferrer noopener">Three.js MIT</a></p>
  </section>;
}
