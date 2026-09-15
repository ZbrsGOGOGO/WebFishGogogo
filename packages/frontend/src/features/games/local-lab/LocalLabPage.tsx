import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCommunitySessionGeneration } from '../../../api/community-http';
import { useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { announceLocalGameForeground, listenForOtherLocalGame } from '../game-input';
import { useGamePrivacy } from '../GamePrivacyContext';
import { findLocalLabGame, LOCAL_LAB_GAMES, type LocalLabGame } from './local-games';
import styles from './LocalLabPage.module.css';

const CHANNEL = 'momo-local-lab';
type Phase = 'idle' | 'loading' | 'ready' | 'error';

export function LocalLabPage() {
  const { slug } = useParams();
  const auth = useCommunityAuthStore();
  const game = findLocalLabGame(slug);
  if (!game) return <section className={styles.page}><h1>没有找到这份工作稿</h1><p>请选择已审阅的本地小游戏。</p><Link to="/games">返回游戏大厅</Link></section>;
  return <LocalWorkDraft key={`${game.slug}:${auth.phase}:${auth.user?.publicId ?? 'guest'}:${getCommunitySessionGeneration()}`} game={game} />;
}

function LocalWorkDraft({ game }: { game: LocalLabGame }) {
  const { covered, toggleCover } = useGamePrivacy();
  const frame = useRef<HTMLIFrameElement>(null);
  const nonce = useRef(crypto.randomUUID()).current;
  const owner = `local-lab-${nonce}`;
  const wanted = useRef(false);
  const ready = useRef(false);
  const coverRef = useRef(covered);
  coverRef.current = covered;
  const toggleRef = useRef(toggleCover);
  toggleRef.current = toggleCover;
  const [phase, setPhase] = useState<Phase>('idle');
  const [playing, setPlaying] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const send = (command: 'hello' | 'resume' | 'pause') => frame.current?.contentWindow?.postMessage({ channel: CHANNEL, nonce, command }, '*');
  const pause = () => { wanted.current = false; send('pause'); setPlaying(false); };
  const begin = () => {
    if (!ready.current || coverRef.current || document.hidden) return;
    wanted.current = true;
    announceLocalGameForeground(owner);
    send('resume');
    setPlaying(true);
  };
  const start = () => {
    wanted.current = true;
    if (phase === 'idle' || phase === 'error') { ready.current = false; setPhase('loading'); setAttempt(value => value + 1); }
    else if (phase === 'ready') begin();
  };
  useEffect(() => {
    let alive = true;
    let blurCheck: number | undefined;
    const message = (event: MessageEvent) => {
      // The opaque sandbox has origin "null". Bind to this exact frame and
      // round nonce; no user data, storage operations or scores cross the bridge.
      if (!alive || event.source !== frame.current?.contentWindow || event.origin !== 'null' || event.data?.channel !== CHANNEL || event.data?.nonce !== nonce) return;
      if (event.data.type === 'ready') {
        if (ready.current) return;
        ready.current = true; setPhase('ready');
        if (wanted.current) begin();
      } else if (event.data.type === 'error') {
        ready.current = false; wanted.current = false; setPlaying(false); setPhase('error');
      } else if (event.data.type === 'paused') {
        wanted.current = false; setPlaying(false);
      } else if (event.data.type === 'escape') {
        pause(); if (!coverRef.current) toggleRef.current?.();
      }
    };
    const hidden = () => { if (document.hidden) pause(); };
    // Entering a focused iframe also blurs the parent; its own blur handler
    // handles real focus loss. Do not immediately pause a player entering it.
    const blur = () => {
      window.clearTimeout(blurCheck);
      // Firefox updates activeElement after the focus-transfer blur event.
      // Wait one task, so clicking into the child is not mistaken for leaving.
      blurCheck = window.setTimeout(() => { if (alive && document.activeElement !== frame.current) pause(); }, 0);
    };
    const off = listenForOtherLocalGame(owner, pause);
    window.addEventListener('message', message);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', hidden);
    return () => { alive = false; window.clearTimeout(blurCheck); wanted.current = false; send('pause'); off(); window.removeEventListener('message', message); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', hidden); };
  }, [nonce, owner]);
  useEffect(() => { if (covered) pause(); }, [covered]);
  useEffect(() => {
    if (phase !== 'loading') return;
    const timeout = window.setTimeout(() => { ready.current = false; wanted.current = false; setPlaying(false); setPhase('error'); }, 25000);
    return () => window.clearTimeout(timeout);
  }, [phase, attempt]);

  return <section className={styles.page}>
    <header className={styles.heading}><div><p>本地实验室 / {game.genre}</p><h1>{game.draftTitle}</h1></div><Link to="/games">返回游戏大厅 ↗</Link></header>
    <p className={styles.description}>{game.title} · {game.description}</p>
    <div className={styles.facts}><span>无需登录</span><span>默认静音</span><span>仅本轮进度</span><span>{game.device}</span></div>
    <section className={styles.draft} data-game={game.slug} data-expanded={expanded} aria-label={`${game.title}工作稿`}>
      <div className={styles.toolbar}><span>{game.mark} / 工作记录</span><span>{playing ? '正在操作' : '已收起'}</span></div>
      <div className={styles.surface}>
        {phase === 'loading' || phase === 'ready' ? <iframe key={attempt} ref={frame} title={`${game.title}本地画面`} src={`/games/local-lab/${game.slug}/index.html#momo=${nonce}`} sandbox="allow-scripts" allow="autoplay 'none'; fullscreen 'none'; camera 'none'; microphone 'none'; geolocation 'none'" data-paused={!playing} aria-hidden={!playing} tabIndex={playing ? 0 : -1} onLoad={() => send('hello')} onError={() => { ready.current = false; wanted.current = false; setPlaying(false); setPhase('error'); }} /> : null}
        {!playing ? <div className={styles.cover}><span className={styles.mark}>{game.mark}</span><h2>{phase === 'loading' ? '正在打开本地工作稿…' : phase === 'error' ? '这份工作稿暂时无法启动' : '给思路换个频道'}</h2><p>{phase === 'error' ? '资源加载或浏览器图形环境异常。可明确重试，网站其他功能不受影响。' : phase === 'loading' ? '仅加载当前这款游戏，不预载其他游戏；等待完整资源就绪。' : game.controls}</p><span>收起冻结本轮，继续不会自动开新局。</span></div> : null}
      </div>
      <div className={styles.actions}><button type="button" onClick={start} disabled={playing || phase === 'loading'}>{phase === 'error' ? '重新尝试' : phase === 'idle' ? '打开工作稿' : '继续本轮'}</button><button type="button" disabled={!playing} onClick={pause}>收起本轮</button><button type="button" aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? '小窗模式' : '放大工作稿'}</button><button type="button" disabled={phase === 'idle' || phase === 'loading'} onClick={() => { pause(); ready.current = false; setPhase('idle'); }}>结束本轮</button></div>
      <p className={styles.notice} role="status">{playing ? '点击画面操作；画面内按 Esc 可切换便签遮罩。' : phase === 'loading' ? '正在读取本地资源…' : '暂停时不推进游戏。失焦、便签遮罩和切到其他本地小窗都会收起；恢复需要主动点击。'}</p>
    </section>
    <details className={styles.details}><summary>操作、存档与来源说明</summary><p>{game.controls}</p><p>本游戏只在隔离工作稿内运行，不读取账号资料或 Cookie，不接外站广告、支付、追踪和成绩上传。收起保留本轮；结束、刷新、离开页面或切换会话会结束本轮。原版的浏览器持久保存、分享或联网入口在这里不提供，不把不可用按钮当成功。</p><p>不进入正式游戏奖励榜，不发办公币；全站活跃与成长规则不变。同屏两人或 AI 对弈不等于本站玩家建房。桌面限定的游戏不伪装成手机可玩。</p><p>来源：<a href={game.source} target="_blank" rel="noreferrer">{game.author} / 原项目</a> · <a href={game.licensePath} target="_blank" rel="noreferrer">{game.license} 许可</a> · <a href={game.slug === 'whatajong' || game.slug === 'hextris' ? `/games/local-lab/${game.slug}/SOURCE.md` : `https://github.com/ZbrsGOGOGO/WebFishGogogo/tree/main/third_party/${game.slug}`} target="_blank" rel="noreferrer">本站修改后源码与重编译说明</a>。本站调整加载、静音、联网入口和低调展示，原规则与开源归属保留。</p></details>
    <nav className={styles.next} aria-label="换一种玩法"><h2>换一种玩法</h2>{LOCAL_LAB_GAMES.filter(item => item.slug !== game.slug).map(item => <Link key={item.slug} to={`/games/lab/${item.slug}`}><span>{item.genre}</span>{item.title}<span aria-hidden="true">↗</span></Link>)}</nav>
  </section>;
}
