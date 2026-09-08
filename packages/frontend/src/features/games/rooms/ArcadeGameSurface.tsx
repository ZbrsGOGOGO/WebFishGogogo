import { useEffect, useRef, useState, type FormEvent, type JSX, type PointerEvent } from 'react';
import type { ArcadeDirection, ArcadeGameAction, ArcadeGameView, ArcadePoint, ArcadeStroke } from '@stealth-reader/shared';

import { shouldIgnoreGameKeyboard } from '../game-input';
import { useGameWorkspaceHidden } from './CommunityGameWorkspaceLayout';
import styles from './GameRooms.module.css';

interface GameSurfaceProps {
  view: ArcadeGameView;
  onAction: (action: ArcadeGameAction) => Promise<boolean>;
  disabled?: boolean;
}

const DIRECTIONS: Readonly<Record<string, ArcadeDirection>> = {
  ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
};

function playerName(view: ArcadeGameView, id: string): string {
  const player = view.players.find((item) => item.id === id);
  return player ? `${player.displayName}${player.isBot ? '（系统练习搭档）' : ''}` : '房间成员';
}

function MovementControls({ view, disabled, send }: { view: ArcadeGameView; disabled: boolean; send: (action: ArcadeGameAction) => void }): JSX.Element | null {
  if (view.gameKey === 'tetris') return (
    <div className={styles.controls} aria-label="俄罗斯方块操作">
      {([['left', '← 左移'], ['rotate', '↑ 旋转'], ['right', '右移 →'], ['softDrop', '↓ 软降'], ['hardDrop', '硬降']] as const).map(([move, label]) => <button className={styles.quietButton} type="button" disabled={disabled} key={move} onClick={() => send({ kind: 'tetris', payload: { move } })}>{label}</button>)}
    </div>
  );
  if (view.gameKey !== 'snake' && view.gameKey !== 'tank') return null;
  return <div className={styles.controls} aria-label="方向操作">{([['left', '← 左'], ['up', '↑ 上'], ['down', '↓ 下'], ['right', '右 →']] as const).map(([direction, label]) => <button className={styles.quietButton} disabled={disabled} type="button" key={direction} onClick={() => send({ kind: 'direction', payload: { direction } })}>{label}</button>)}{view.gameKey === 'tank' ? <button className={styles.quietButton} type="button" disabled={disabled} onClick={() => send({ kind: 'fire', payload: {} })}>发射 · 空格</button> : null}</div>;
}

function ClassicBoard({ view }: { view: ArcadeGameView }): JSX.Element | null {
  if (view.gameKey === 'snake') {
    const { board } = view;
    return <svg className={styles.board} viewBox={`0 0 ${board.width * 20} ${board.height * 20}`} role="img" aria-label={`贪食蛇棋盘，蛇身 ${board.snake.length} 格`}>
      <defs><pattern id="room-snake-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e3e9ef" strokeWidth=".6" /></pattern></defs>
      <rect width="100%" height="100%" fill="url(#room-snake-grid)" />
      {board.food ? <circle cx={board.food.x * 20 + 10} cy={board.food.y * 20 + 10} r="5" fill="#a38b66" /> : null}
      {board.snake.map((point, index) => <rect key={`${point.x}:${point.y}`} x={point.x * 20 + 1.5} y={point.y * 20 + 1.5} width="17" height="17" rx="3" fill={index === 0 ? '#415a70' : '#8498a9'} />)}
    </svg>;
  }
  if (view.gameKey === 'tetris') {
    const { board } = view;
    const cols = board.board[0]?.length ?? 10;
    const rows = board.board.length;
    return <svg className={styles.board} style={{ maxWidth: 310 }} viewBox={`0 0 ${cols * 20} ${rows * 20}`} role="img" aria-label={`俄罗斯方块棋盘，已消除 ${board.lines} 行`}>
      {board.board.flatMap((row, y) => row.map((cell, x) => <rect key={`${x}:${y}`} x={x * 20 + 1} y={y * 20 + 1} width="18" height="18" rx="2" fill={cell ? '#7d91a3' : '#edf1f5'} />))}
      {board.activePiece.shape.flatMap((row, y) => row.map((cell, x) => cell && board.activePiece.row + y >= 0 ? <rect key={`active:${x}:${y}`} x={(board.activePiece.column + x) * 20 + 1} y={(board.activePiece.row + y) * 20 + 1} width="18" height="18" rx="2" fill="#435f77" /> : null))}
    </svg>;
  }
  if (view.gameKey === 'tank') {
    const { board } = view;
    const rotation: Record<ArcadeDirection, number> = { up: 0, right: 90, down: 180, left: 270 };
    const unit = (point: ArcadePoint & { direction: ArcadeDirection }, key: string, color: string): JSX.Element => <g key={key} transform={`translate(${point.x * 24 + 12} ${point.y * 24 + 12}) rotate(${rotation[point.direction]})`}><rect x="-8" y="-8" width="16" height="17" rx="3" fill={color} /><path d="M 0 0 L 0 -12" stroke={color} strokeWidth="4" /><rect x="-3" y="-3" width="6" height="7" rx="1" fill="#edf3f8" opacity=".6" /></g>;
    return <svg className={styles.board} viewBox={`0 0 ${board.width * 24} ${board.height * 24}`} role="img" aria-label={`坦克棋盘，剩余 ${board.player.lives} 条生命，${board.enemies.length} 个敌方坦克`}>
      {board.walls.map((point) => <rect key={`${point.x}:${point.y}`} x={point.x * 24 + 1} y={point.y * 24 + 1} width="22" height="22" rx="2" fill="#c6cdd5" />)}
      {board.enemies.map((enemy) => unit(enemy, enemy.id, '#9b8a77'))}
      {unit(board.player, 'player', '#536e84')}
      {board.bullets.map((bullet) => <circle key={bullet.id} cx={bullet.x * 24 + 12} cy={bullet.y * 24 + 12} r="3" fill={bullet.owner === 'player' ? '#3f6688' : '#a77865'} />)}
    </svg>;
  }
  return null;
}

function DrawSurface({ view, onAction, disabled }: GameSurfaceProps & { view: Extract<ArcadeGameView, { gameKey: 'draw' }> }): JSX.Element {
  const { board } = view;
  const drawing = view.viewerId === board.drawerId && !board.practicePartner;
  const [text, setText] = useState('');
  const [color, setColor] = useState<ArcadeStroke['color']>('#334155');
  const [width, setWidth] = useState<ArcadeStroke['width']>(4);
  const [draft, setDraft] = useState<ArcadePoint[]>([]);
  const draftRef = useRef<ArcadePoint[]>([]);
  const pointerRef = useRef<number | null>(null);
  const [sending, setSending] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const context = `${view.viewerId}:${board.round}:${board.drawerId}`;
  const latestContext = useRef(context); latestContext.current = context;
  useEffect(() => { setText(''); setDraft([]); setSending(false); draftRef.current = []; pointerRef.current = null; }, [context]);
  useEffect(() => { if (disabled) { pointerRef.current = null; draftRef.current = []; setDraft([]); } }, [disabled]);
  const position = (event: PointerEvent<SVGSVGElement>): ArcadePoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.round(Math.max(0, Math.min(1000, (event.clientX - rect.left) / Math.max(rect.width, 1) * 1000))), y: Math.round(Math.max(0, Math.min(1000, (event.clientY - rect.top) / Math.max(rect.height, 1) * 1000))) };
  };
  const finishStroke = (): void => {
    if (pointerRef.current === null) return;
    pointerRef.current = null;
    const points = draftRef.current;
    draftRef.current = [];
    if (points.length < 2 || disabled) { setDraft([]); return; }
    setSending(true);
    void onAction({ kind: 'stroke', payload: { points, color, width, round: board.round } }).finally(() => { if (latestContext.current === context) { setSending(false); setDraft([]); } });
  };
  const guess = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (disabled || sending || !text.trim()) return;
    const value = text.trim();
    setSending(true);
    try { if (await onAction({ kind: 'guess', payload: { text: value, round: board.round } }) && latestContext.current === context) setText(''); }
    finally { if (latestContext.current === context) setSending(false); }
  };
  const stroke = (item: ArcadeStroke, key: string): JSX.Element => <polyline key={key} points={item.points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={item.color} strokeWidth={item.width * 2} strokeLinecap="round" strokeLinejoin="round" />;
  return <div className={styles.stack}>
    {board.practicePartner ? <p className={styles.info}>单机练习：画面由系统题库提供，没有真人画师。根据线索猜词。</p> : null}
    {drawing && board.word ? <div className={styles.privateWord}>只有你能看到本轮题目<strong>{board.word}</strong><span>请用画面表达，不要直接写出答案文字。</span></div> : <p className={styles.muted}>{playerName(view, board.drawerId)} 正在绘画 · 答案共 {board.wordLength} 个字</p>}
    <svg ref={svgRef} className={styles.board} style={{ aspectRatio: '1', maxWidth: 520 }} viewBox="0 0 1000 1000" role="img" aria-label={drawing ? '你的画板，拖动画图' : '你画我猜实时画板'}
      onPointerDown={(event) => {
        if (!drawing || disabled || sending || pointerRef.current !== null || event.button !== 0) return;
        event.preventDefault(); pointerRef.current = event.pointerId; draftRef.current = [position(event)]; setDraft(draftRef.current); event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (pointerRef.current !== event.pointerId || disabled) return;
        const point = position(event); const previous = draftRef.current.at(-1);
        if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 3) return;
        if (draftRef.current.length >= 64) draftRef.current = draftRef.current.filter((_, index) => index % 2 === 0);
        draftRef.current = [...draftRef.current, point]; setDraft(draftRef.current);
      }}
      onPointerUp={finishStroke} onPointerCancel={() => { pointerRef.current = null; draftRef.current = []; setDraft([]); }}>
      <rect width="1000" height="1000" fill="#fff" />{board.strokes.map((item, index) => stroke(item, String(index)))}{draft.length > 0 ? stroke({ points: draft, width, color }, 'draft') : null}
    </svg>
    {drawing ? <div className={styles.controls} aria-label="画笔工具">
      {(['#334155', '#dc2626', '#2563eb', '#16a34a'] as const).map((value, index) => <button type="button" key={value} className={styles.quietButton} disabled={disabled || sending} aria-pressed={color === value} onClick={() => setColor(value)} style={{ color: value }}>{['黑笔', '红笔', '蓝笔', '绿笔'][index]}</button>)}
      <label className={styles.field}>线宽<select aria-label="画笔线宽" value={width} onChange={(event) => setWidth(Number(event.target.value) as ArcadeStroke['width'])}>{([2, 4, 8] as const).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <button type="button" className={styles.quietButton} disabled={disabled || sending || board.strokes.length === 0} onClick={() => { void onAction({ kind: 'clear', payload: { round: board.round } }); }}>清空本轮画板</button>
    </div> : <form className={styles.inlineForm} onSubmit={(event) => { void guess(event); }}><input className={styles.input} aria-label="猜词答案" value={text} maxLength={40} onChange={(event) => setText(event.target.value)} disabled={disabled || board.guessedPlayerIds.includes(view.viewerId)} placeholder={board.guessedPlayerIds.includes(view.viewerId) ? '本轮已猜对，等待下一轮' : '输入你的猜测…'} /><button className={styles.quietButton} type="submit" disabled={disabled || sending || !text.trim() || board.guessedPlayerIds.includes(view.viewerId)}>提交猜词</button></form>}
    <ol className={styles.log} aria-label="本轮猜词记录">{board.messages.map((message, index) => <li key={`${message.playerId}:${index}`}><strong>{playerName(view, message.playerId)}</strong>{message.correct ? '猜对了' : message.text}</li>)}</ol>
  </div>;
}

function UndercoverSurface({ view, onAction, disabled }: GameSurfaceProps & { view: Extract<ArcadeGameView, { gameKey: 'undercover' }> }): JSX.Element {
  const { board } = view;
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const context = `${view.viewerId}:${board.round}:${board.phase}`;
  const latestContext = useRef(context); latestContext.current = context;
  useEffect(() => { setText(''); setSending(false); }, [context]);
  const alive = board.alivePlayerIds.includes(view.viewerId);
  const described = board.descriptions.some((item) => item.round === board.round && item.playerId === view.viewerId);
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault(); if (disabled || sending || !text.trim()) return;
    setSending(true);
    try { if (await onAction({ kind: 'describe', payload: { text: text.trim(), round: board.round } }) && latestContext.current === context) setText(''); }
    finally { if (latestContext.current === context) setSending(false); }
  };
  return <div className={styles.stack}>
    {board.practicePartner ? <p className={styles.info}>单机练习：另外 3 位为系统练习搭档，不是真人玩家。</p> : null}
    {board.word ? <div className={styles.privateWord}>你的词语 · 仅自己可见<strong>{board.word}</strong><span>用相关描述交流，不要直接说出词语，也无法提前知道自己的阵营。</span></div> : null}
    {!alive && board.phase !== 'finished' ? <p className={styles.info}>你已出局，可以继续旁观本局。</p> : null}
    <div><h3>{board.phase === 'describe' ? '描述阶段' : board.phase === 'vote' ? '投票阶段' : '本局结果'}</h3><ol className={styles.log} aria-label="玩家描述">{board.descriptions.map((item, index) => <li key={`${item.playerId}:${item.round}:${index}`}><strong>第 {item.round} 轮 · {playerName(view, item.playerId)}</strong>{item.text}</li>)}</ol></div>
    {board.phase === 'describe' && alive ? <form className={styles.inlineForm} onSubmit={(event) => { void submit(event); }}><input className={styles.input} aria-label="你的描述" value={text} maxLength={80} onChange={(event) => setText(event.target.value)} disabled={disabled || described} placeholder={described ? '本轮已描述，等待其他玩家' : '写一句与词语相关的描述'} /><button className={styles.quietButton} type="submit" disabled={disabled || sending || described || !text.trim()}>提交描述</button></form> : null}
    {board.phase === 'vote' && alive ? <div className={styles.options} aria-label="投票候选人">{view.players.filter((player) => board.alivePlayerIds.includes(player.id) && player.id !== view.viewerId).map((player) => <button key={player.id} type="button" className={styles.option} disabled={disabled || sending || board.myVote !== null} onClick={() => { setSending(true); void onAction({ kind: 'vote', payload: { targetId: player.id, round: board.round } }).finally(() => { if (latestContext.current === context) setSending(false); }); }}>{playerName(view, player.id)}{board.myVote === player.id ? ' · 已投票' : ''}</button>)}{board.myVote ? <p className={styles.muted}>投票已提交，等待本轮结束。</p> : null}</div> : null}
    {board.phase === 'finished' ? <div className={styles.info}><strong>{board.outcome === 'civilian' ? '平民阵营获胜' : board.outcome === 'undercover' ? '卧底阵营获胜' : '本局已结束'}</strong><ul>{board.reveals.map((item) => <li key={item.playerId}>{playerName(view, item.playerId)}：{item.word} · {item.role === 'undercover' ? '卧底' : '平民'}</li>)}</ul></div> : null}
  </div>;
}

export function ArcadeGameSurface({ view, onAction, disabled = false }: GameSurfaceProps): JSX.Element {
  const covered = useGameWorkspaceHidden();
  const me = view.players.find((player) => player.id === view.viewerId);
  const blocked = disabled || covered || view.phase === 'finished' || Boolean(me?.finished);
  const actionRef = useRef(onAction);
  const lastKeyboardAction = useRef(0);
  actionRef.current = onAction;
  useEffect(() => {
    if (blocked || !['snake', 'tank', 'tetris'].includes(view.gameKey)) return undefined;
    const keyboard = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || shouldIgnoreGameKeyboard(event.target)) return;
      let action: ArcadeGameAction | null = null;
      const direction = DIRECTIONS[event.key];
      if (view.gameKey === 'tetris') {
        const moves = { up: 'rotate', down: 'softDrop', left: 'left', right: 'right' } as const;
        if (direction) action = { kind: 'tetris', payload: { move: moves[direction] } };
        if (event.code === 'Space' || event.key === ' ') action = { kind: 'tetris', payload: { move: 'hardDrop' } };
      } else if (direction) action = { kind: 'direction', payload: { direction } };
      else if (view.gameKey === 'tank' && (event.code === 'Space' || event.key === ' ')) action = { kind: 'fire', payload: {} };
      if (action) {
        event.preventDefault();
        const now = performance.now();
        // Browser key-repeat can exceed 30 Hz; keep accepted transport below
        // the server's 12/s budget without queueing obsolete held-key actions.
        if (lastKeyboardAction.current && now - lastKeyboardAction.current < 100) return;
        lastKeyboardAction.current = now;
        void actionRef.current(action);
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [blocked, view.gameKey]);
  const send = (action: ArcadeGameAction): void => { if (!blocked) void onAction(action); };
  if (view.gameKey === 'draw') return <DrawSurface view={view} onAction={onAction} disabled={blocked} />;
  if (view.gameKey === 'undercover') return <UndercoverSurface view={view} onAction={onAction} disabled={blocked} />;
  if (view.gameKey === 'zhesi') {
    const { board } = view;
    return <div className={styles.stack}><p className={styles.muted}>命格短局与原命格录分开。所有参与者从同一起点出发，不读取旧存档。</p><dl className={styles.stats}>{[['回合', `${board.turn} / ${board.maxTurns}`], ['生命', board.health], ['灵力', board.energy], ['战力', board.power], ['对手生命', board.enemyHealth]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className={styles.info}>对手意图：{board.enemyIntent === 'attack' ? '攻击' : board.enemyIntent === 'charge' ? '蓄力' : '恢复'}{board.chosen ? ' · 你的选择已提交' : ' · 请在本回合结束前选择'}</p><div className={styles.options}>{([['strike', '出击', '消耗灵力，主动交锋'], ['guard', '守势', '抵挡攻势，稳住节奏'], ['train', '修炼', '积累力量，准备下一回合']] as const).map(([choice, label, detail]) => <button key={choice} type="button" className={styles.option} disabled={blocked || board.chosen} onClick={() => send({ kind: 'choice', payload: { choice, turn: board.turn } })}><strong>{label}</strong> · {detail}</button>)}</div><ol className={styles.log} aria-label="命格短局记录">{board.log.map((line, index) => <li key={index}>{line}</li>)}</ol></div>;
  }
  return <div><ClassicBoard view={view} />{view.gameKey === 'tetris' ? <p className={styles.muted}>等级 {view.board.level} · 已消行 {view.board.lines} · 下一块 {view.board.nextPiece}</p> : null}<MovementControls view={view} disabled={blocked} send={send} /><p className={styles.muted}>支持方向键 / WASD{view.gameKey !== 'snake' ? ' 和空格' : ''}。棋盘与积分由服务器更新，切换窗口不会暂停线上赛局。</p></div>;
}
