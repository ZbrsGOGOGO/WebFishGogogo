import { useCallback, useEffect, useRef, useState, type FormEvent, type JSX } from 'react';
import { Link } from 'react-router-dom';
import { WORD_FRONT_V2_CHAPTERS, WORD_FRONT_V2_UNITS, wordFrontV2DrawCost, wordFrontV2HeroForLetters, wordFrontV2Terrain, wordFrontV2UnitForLetter, type WordFrontV2State } from '@stealth-reader/shared';
import { getCommunitySessionGeneration } from '../../../api/community-http';
import { wordFrontRoomError, wordFrontRoomsApi, type WordFrontRoomList, type WordFrontRoomMove, type WordFrontRoomView } from '../../../api/word-front-rooms';
import { useCommunityAuthStore } from '../../../app/store/community-auth-store';
import styles from './WordFrontRoomsPage.module.css';

const ENEMY: Record<string, string> = { routine: '需', mail: '催', approval: '审', bug: '错', boss: '考' };
type VisibleBoard = Omit<WordFrontV2State, 'seed'>;
function terrain(board: VisibleBoard, slot: number): ReturnType<typeof wordFrontV2Terrain> {
  // Terrain uses only chapter, routes, and unlocked cells; the server intentionally omits the RNG seed.
  return wordFrontV2Terrain(board as WordFrontV2State, slot);
}
function eligibleResponse(userId: string | undefined, generation: number): boolean {
  return generation === getCommunitySessionGeneration() && useCommunityAuthStore.getState().user?.publicId === userId;
}

export function WordFrontRoomsPage(): JSX.Element {
  const userId = useCommunityAuthStore(state => state.user?.publicId);
  const [list, setList] = useState<WordFrontRoomList | null>(null);
  const [room, setRoom] = useState<WordFrontRoomView | null>(null);
  const [name, setName] = useState('双线演练');
  const [chapter, setChapter] = useState(1);
  const [password, setPassword] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [joinTarget, setJoinTarget] = useState<string | null>(null);
  const [selectedCards, setSelectedCards] = useState<number[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const createRequest = useRef<string | null>(null);
  const busyRef = useRef(false);
  const mutationEpoch = useRef(0);
  const roomRef = useRef<WordFrontRoomView | null>(null);
  roomRef.current = room;

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!userId) return;
    const generation = getCommunitySessionGeneration();
    const epoch = mutationEpoch.current;
    try {
      const nextList = await wordFrontRoomsApi.list(signal);
      if (!eligibleResponse(userId, generation) || signal?.aborted || epoch !== mutationEpoch.current) return;
      setList(nextList);
      if (nextList.currentRoomId) {
        const nextRoom = await wordFrontRoomsApi.get(nextList.currentRoomId, signal);
        if (!eligibleResponse(userId, generation) || signal?.aborted || epoch !== mutationEpoch.current) return;
        setRoom(current => current && current.id === nextRoom.id && current.sequence > nextRoom.sequence ? current : nextRoom);
      } else setRoom(null);
    } catch (reason) {
      if (!signal?.aborted && epoch === mutationEpoch.current && eligibleResponse(userId, generation)) setError(wordFrontRoomError(reason));
    } finally { if (!signal?.aborted && epoch === mutationEpoch.current && eligibleResponse(userId, generation)) setRefreshing(false); }
  }, [userId]);
  useEffect(() => {
    setList(null); setRoom(null); setSelectedCards([]); setSelectedUnit(null); setError(null); setRefreshing(true);
    const abort = new AbortController();
    void refresh(abort.signal);
    const timer = window.setInterval(() => { if (!busyRef.current) void refresh(abort.signal); }, 1_500);
    return () => { abort.abort(); window.clearInterval(timer); };
  }, [refresh]);

  async function mutate(work: () => Promise<WordFrontRoomView | { left: true }>): Promise<void> {
    if (busyRef.current || !userId) return;
    const generation = getCommunitySessionGeneration();
    mutationEpoch.current += 1; busyRef.current = true; setBusy(true); setError(null);
    try {
      const result = await work();
      if (!eligibleResponse(userId, generation)) return;
      if ('left' in result) { setRoom(null); setList(current => current ? { ...current, currentRoomId: null } : null); }
      else setRoom(result);
      setSelectedCards([]); setSelectedUnit(null);
      void refresh();
    } catch (reason) {
      if (eligibleResponse(userId, generation)) { setError(wordFrontRoomError(reason)); void refresh(); }
    } finally { busyRef.current = false; if (eligibleResponse(userId, generation)) setBusy(false); }
  }
  function create(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!createRequest.current) createRequest.current = crypto.randomUUID();
    const requestId = createRequest.current;
    void mutate(async () => {
      const next = await wordFrontRoomsApi.create({ requestId, name: name.trim(), chapter, password });
      createRequest.current = null; setPassword(''); return next;
    });
  }
  function join(id: string): void {
    const pass = joinTarget === id ? joinPassword : '';
    void mutate(async () => { const next = await wordFrontRoomsApi.join(id, pass); setJoinPassword(''); setJoinTarget(null); return next; });
  }
  function prepareJoin(id: string): void { setJoinPassword(''); setJoinTarget(id); }
  function act(action: WordFrontRoomMove): void {
    const current = roomRef.current;
    if (!current || current.status !== 'running') return;
    void mutate(() => wordFrontRoomsApi.action(current.id, action, crypto.randomUUID()));
  }
  function chooseCard(index: number): void {
    setSelectedUnit(null);
    setSelectedCards(current => current.includes(index) ? current.filter(value => value !== index) : current.length >= 2 ? [index] : [...current, index]);
  }
  function chooseCell(board: VisibleBoard, slot: number): void {
    const cellTerrain = terrain(board, slot);
    if (cellTerrain === 'waste') { if (board.shovels > 0) act({ type: 'unlock', slot }); else setError('需要铲子才能解封荒地。'); return; }
    if (cellTerrain === 'path' || cellTerrain === 'slow' || cellTerrain === 'obstacle') return;
    const occupied = board.units.find(unit => unit.slot === slot);
    if (selectedCards.length && !occupied) {
      const action: WordFrontRoomMove = selectedCards.length === 2
        ? { type: 'deploy_hero', first: selectedCards[0]!, second: selectedCards[1]!, slot }
        : { type: 'deploy_basic', card: selectedCards[0]!, slot };
      act(action); return;
    }
    if (occupied && selectedUnit !== null && selectedUnit !== slot) { act({ type: 'merge', from: selectedUnit, to: slot }); return; }
    setSelectedUnit(occupied ? slot : null);
  }
  const board = room?.board;
  const map = board ? WORD_FRONT_V2_CHAPTERS[board.chapter - 1]! : null;
  const selectedName = board && selectedCards.length === 2 ? wordFrontV2HeroForLetters(board.hand[selectedCards[0]!] ?? '', board.hand[selectedCards[1]!] ?? '')
    : board && selectedCards.length === 1 ? wordFrontV2UnitForLetter(board.hand[selectedCards[0]!] ?? '') : null;
  const outcome = room?.winner === 'draw' ? '平局' : room?.winner ? room.winner === room.mySide ? '我方胜利' : '对方胜利' : null;
  return <main className={styles.page}>
    <header className={styles.header}><div><span className={styles.kicker}>WORD FRONT / TWO LANES</span><h1>文字战线 · 玩家房间</h1><p>两位真人，红蓝双线对攻。服务端实时推进，每次击败五名来客会向对方投递一名援军。</p></div><nav><Link to="/tower-defense/word-front">新版单机</Link><Link to="/tower-defense/word-front/v2">V2 六章</Link><Link to="/tower-defense">原工位塔防</Link></nav></header>
    <p className={styles.notice}>房间采用 V2 对战规则，不是 V3 单机规则；只使用局内资源，不计正式排行榜、办公币、成就或存档。房间为临时会话，服务重启后会结束。</p>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {refreshing ? <p role="status">正在同步房间…</p> : null}
    {!room ? <div className={styles.lobby}>
      <section className={styles.panel}><h2>建立双线房间</h2><form onSubmit={create} className={styles.form}>
        <label>房间名称<input value={name} maxLength={32} required onChange={event => { setName(event.target.value); createRequest.current = null; }} /></label>
        <label>章节<select value={chapter} onChange={event => { setChapter(Number(event.target.value)); createRequest.current = null; }}>{WORD_FRONT_V2_CHAPTERS.map(item => <option key={item.id} value={item.id}>{item.id}. {item.name}</option>)}</select></label>
        <label>可选密码<input type="password" autoComplete="new-password" value={password} minLength={password ? 4 : undefined} maxLength={64} placeholder="留空则公开" onChange={event => { setPassword(event.target.value); createRequest.current = null; }} /></label>
        <button type="submit" disabled={busy || !name.trim()}>创建房间</button>
      </form></section>
      <section className={styles.panel}><h2>等待中的房间</h2>{list?.rooms.length ? <ul className={styles.roomList}>{list.rooms.map(item => <li key={item.id}><div><strong>{item.name}</strong><span>第 {item.chapter} 章 · {item.players}/{item.capacity} 人 {item.requiresPassword ? '· 需密码' : '· 公开'}</span></div>{item.requiresPassword && joinTarget === item.id ? <label>房间密码<input type="password" value={joinPassword} maxLength={64} onChange={event => setJoinPassword(event.target.value)} /></label> : null}<button type="button" disabled={busy} onClick={() => item.requiresPassword && joinTarget !== item.id ? prepareJoin(item.id) : join(item.id)}>{item.requiresPassword && joinTarget !== item.id ? '输入密码' : '加入'}</button></li>)}</ul> : <p>暂无等待中的房间。你可以先建一局，等另一位同事加入。</p>}
        <button type="button" disabled={busy} onClick={() => void refresh()}>刷新列表</button></section>
    </div> : <div className={styles.playLayout}>
      <section className={styles.panel}><div className={styles.roomHeading}><div><span className={styles.kicker}>#{room.id.slice(0, 8)} · {room.mySide === 'red' ? '红方' : '蓝方'}</span><h2>{room.name}</h2><p>第 {room.chapter} 章 · {room.status === 'waiting' ? '等待对手' : room.status === 'running' ? '对局中' : outcome ?? '已结束'}</p></div><button type="button" disabled={busy} onClick={() => void mutate(() => wordFrontRoomsApi.leave(room.id))}>退出房间</button></div>
        <div className={styles.score}><span>我方 <b>{board?.coreHp ?? 5}/5</b> 核心 · {board?.score ?? 0} 分</span><span>对方 <b>{room.opposingBoard?.coreHp ?? 5}/5</b> 核心 · {room.opposingBoard?.score ?? 0} 分</span></div>
        {room.status === 'waiting' ? <div className={styles.waiting}><p>{room.opponent ? `${room.opponent.displayName}已加入，可以开始。` : '等待一位同事加入。'} 房间容量 2 人，不使用邀请码。</p>{room.isHost ? <button type="button" disabled={busy || !room.opponent} onClick={() => void mutate(() => wordFrontRoomsApi.start(room.id))}>开始双线对攻</button> : <p>房主开始后会自动进入棋盘。</p>}</div> : null}
        {board && map ? <><div className={styles.metrics}><span>波次 <b>{board.wave}</b></span><span>击败 <b>{board.kills}</b></span><span>经费 <b>{board.credits}/40</b></span><span>局内金币 <b>{board.gold}</b></span><span>铲子 <b>{board.shovels}</b></span><span>当前拍 <b>{board.tick}</b></span></div><div className={styles.boardViewport}><div className={styles.board} role="group" aria-label="我方 V2 对战棋盘">{Array.from({ length: 48 }, (_, slot) => {
          const terrain = wordFrontV2Terrain(board as WordFrontV2State, slot), unit = board.units.find(item => item.slot === slot);
          const pathIndex = (map.path as readonly number[]).indexOf(slot), enemies = pathIndex < 0 ? [] : board.enemies.filter(item => item.pathIndex === pathIndex);
          const label = `${Math.floor(slot / 8) + 1}行${slot % 8 + 1}列，${unit ? WORD_FRONT_V2_UNITS[unit.kind].name : terrain === 'waste' ? '荒地' : terrain === 'path' ? '路线' : terrain === 'obstacle' ? '障碍' : terrain === 'buff' ? '增益工位' : '工位'}${enemies.length ? `，${enemies.length}名来客` : ''}`;
          return <button key={slot} type="button" className={styles.cell} data-terrain={terrain} data-selected={selectedUnit === slot} aria-pressed={unit ? selectedUnit === slot : undefined} aria-label={label} disabled={busy || room.status !== 'running' || terrain === 'path' || terrain === 'slow' || terrain === 'obstacle'} onClick={() => chooseCell(board, slot)}>{unit ? <b>{WORD_FRONT_V2_UNITS[unit.kind].glyph}<small>{unit.level}阶</small></b> : terrain === 'waste' ? '锁' : terrain === 'obstacle' ? '柜' : terrain === 'buff' ? '充' : pathIndex === 0 ? '入' : pathIndex === map.path.length - 1 ? '鱼' : terrain === 'path' || terrain === 'slow' ? '·' : '+'}{enemies.length ? <span className={styles.enemy}>{enemies.length > 1 ? enemies.length : ENEMY[enemies[0]!.kind]}</span> : null}</button>;
        })}</div></div><p className={styles.hint}>选字后点击空工位部署；点击两名同角色同阶成员合并；荒地用铲子解封。窄屏可横向滚动棋盘。对手棋盘只展示概况，不泄露手牌。</p><p role="status">{board.message}</p></> : null}
      </section>
      <aside className={styles.panel}><h2>双线信息</h2><p>{room.me.displayName} 对阵 {room.opponent?.displayName ?? '等待加入…'}</p><p>对方波次 {room.opposingBoard?.wave ?? '—'} · 击败 {room.opposingBoard?.kills ?? '—'} · 场上来客 {room.opposingBoard?.enemies.length ?? '—'}</p>{outcome ? <p className={styles.outcome}>{outcome}</p> : null}
        {board && room.status === 'running' ? <><h3>字卡工作台</h3><button type="button" disabled={busy || board.credits < wordFrontV2DrawCost(board.drawCount)} onClick={() => act({ type: 'recruit' })}>招募五张 · {wordFrontV2DrawCost(board.drawCount)} 经费</button><div className={styles.hand} role="group" aria-label="房间手牌">{board.hand.map((letter, index) => <button type="button" key={`${index}-${letter}`} data-selected={selectedCards.includes(index)} aria-pressed={selectedCards.includes(index)} aria-label={`第 ${index + 1} 张：${letter}`} disabled={busy} onClick={() => chooseCard(index)}>{letter}</button>)}</div><p>{selectedName ? `已选 ${WORD_FRONT_V2_UNITS[selectedName].name}，点击工位部署。` : selectedCards.length ? '双字需配成完整职业。' : '首抽已保底一组完整双字。'}</p><h3>局内商人</h3><div className={styles.actions}><button type="button" disabled={busy || board.gold < 12 || board.attackBoost >= 3} onClick={() => act({ type: 'buy_boost', boost: 'attack' })}>输出 +15% · 12 金</button><button type="button" disabled={busy || board.gold < 12 || board.coreHp >= 5} onClick={() => act({ type: 'buy_boost', boost: 'heal' })}>核心 +1 · 12 金</button></div></> : null}
        <p className={styles.rules}>{room.rules}</p>
      </aside>
    </div>}
  </main>;
}
