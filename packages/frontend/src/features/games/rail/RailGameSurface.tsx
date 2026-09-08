import { useEffect, useRef, useState, type JSX } from 'react';
import type { RailActionInput, RailCardKind, RailGameView, RailPhase, RailTrack } from '@stealth-reader/shared';

import { useGamePrivacy } from '../GamePrivacyContext';
import styles from './Rail.module.css';

export type RailAction = Pick<RailActionInput, 'kind' | 'payload'>;
export const RAIL_PHASE_LABELS: Record<RailPhase, string> = { placement: '铺设人物', buff: '追加条件', decision: '列车长选择', rating: '评价本轮', round_end: '回合小结', finished: '本局结算' };
const PHASE_ORDER: RailPhase[] = ['placement', 'buff', 'decision', 'rating', 'round_end'];
const CARD_LABELS: Record<RailCardKind, string> = { good: '善牌 · 己方', bad: '恶牌 · 对方', buff: '条件牌' };
const percentage = (basisPoints: number): string => `${(basisPoints / 100).toFixed(basisPoints % 100 === 0 ? 0 : 1)}%`;

export function RailGameSurface({ view, onAction, disabled = false }: { view: RailGameView; onAction: (input: RailAction) => Promise<boolean>; disabled?: boolean }): JSX.Element {
  const { covered } = useGamePrivacy();
  const [kind, setKind] = useState<RailCardKind>('good');
  const [cardId, setCardId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const context = `${view.roundToken}:${view.phase}:${view.me?.id ?? 'spectator'}`;
  const latest = useRef(context); latest.current = context;
  useEffect(() => {
    setCardId(''); setTargetId(''); setRating(null); setPending(false); sending.current = false;
    setKind(view.phase === 'buff' ? 'buff' : view.me?.availableActions.includes('place_good') ? 'good' : 'bad');
  }, [context]);
  const locked = disabled || covered || pending;
  const available = view.me?.availableActions ?? [];
  const can = (action: RailAction['kind']): boolean => !locked && available.includes(action);
  const name = (id: string): string => view.players.find((player) => player.id === id)?.displayName ?? '本局玩家';
  const submit = async (action: RailAction): Promise<void> => {
    if (locked || sending.current || !available.includes(action.kind)) return;
    const key = context; sending.current = true; setPending(true);
    try {
      if (await onAction(action)) {
        if (latest.current === key) { setCardId(''); setTargetId(''); setRating(null); }
      }
    } finally { if (latest.current === key) { sending.current = false; setPending(false); } }
  };
  const selectedHand = view.me?.hand[kind] ?? [];
  const selectedKind: RailAction['kind'] = kind === 'good' ? 'place_good' : kind === 'bad' ? 'place_bad' : 'place_buff';
  const targets = [...view.tracks.A, ...view.tracks.B].filter((character) => !character.buff);
  const amConductor = view.me?.id === view.conductorId;

  return <div className={styles.stack} aria-label="轨道难题赛局">
    <section className={styles.panel}>
      <div className={styles.panelTitle}><h2>{RAIL_PHASE_LABELS[view.phase]}</h2><span className={styles.pill}>{view.phase === 'finished' ? '全部回合结束' : `第 ${view.round} / ${view.totalRounds} 回合`}</span></div>
      <div className={styles.body}>
        <div className={styles.roundInfo}><strong>列车长：{name(view.conductorId)}{amConductor ? '（我）' : ''}</strong><span className={styles.pill}>{view.viewerRole === 'spectator' ? '旁观中 · 无手牌' : amConductor ? '本轮负责选轨' : `你在 ${view.me?.team ?? '—'} 轨阵营`}</span></div>
        {view.phase !== 'finished' ? <ol className={styles.steps} aria-label="本回合阶段">{PHASE_ORDER.map((phase) => <li key={phase} aria-current={view.phase === phase ? 'step' : undefined}>{RAIL_PHASE_LABELS[phase]}</li>)}</ol> : null}
        <details style={{ marginTop: 14 }}><summary className={styles.summary}>查看规则与计分说明</summary><p className={styles.muted} style={{ marginTop: 10 }}>{view.rules}</p><p className={styles.muted}>列车经过所选轨道，另一轨阵营本轮生存。每人轮流当一次列车长；该回合不计入自己的生存率。恶魔评分只是趣味评价，不决定办公币奖励。</p></details>
      </div>
    </section>

    <div id="rail-tracks" className={styles.tracks} aria-label="两条轨道">
      {(['A', 'B'] as RailTrack[]).map((track) => <section className={styles.track} data-chosen={view.chosenTrack === track} key={track} aria-label={`${track} 轨`}>
        <div className={styles.trackHeader}><h3>{track} 轨 <span className={styles.muted}>{view.me?.team === track ? '· 己方' : ''}</span></h3><span className={styles.pill}>{view.chosenTrack === track ? '列车经过' : view.chosenTrack ? '本轮生存' : `${view.players.filter((player) => player.team === track).length} 位成员`}</span></div>
        {view.tracks[track].length ? view.tracks[track].map((character) => <article className={styles.character} key={character.id}>
          <small>{character.card.kind === 'good' ? '善牌' : '恶牌'} · {name(character.ownerId)}{character.automatic ? ' · 超时托管' : ''}</small><strong>{character.card.title}</strong><p>{character.card.description}</p>
          {character.buff ? <p className={styles.buff}><strong>条件：{character.buff.card.title}</strong>{character.buff.card.description}<small style={{ display: 'block', marginTop: 5 }}>{name(character.buff.ownerId)}{character.buff.automatic ? ' · 超时托管' : ''}</small></p> : null}
        </article>) : <p className={styles.muted} style={{ padding: '16px 0', margin: 0 }}>等待成员铺设人物…</p>}
      </section>)}
    </div>

    {view.me && (view.phase === 'placement' || view.phase === 'buff') && !amConductor ? <section id="rail-actions" className={styles.panel} aria-label="自己的手牌">
      <div className={styles.panelTitle}><h2>我的手牌</h2><span className={styles.muted}>只有你能看到</span></div>
      <div className={styles.body}>
        <div className={styles.handTab} role="tablist" aria-label="选择牌类">{(view.phase === 'buff' ? ['buff'] : ['good', 'bad']).map((value) => <button role="tab" aria-selected={kind === value} type="button" key={value} disabled={locked} onClick={() => { setKind(value as RailCardKind); setCardId(''); setTargetId(''); }}>{CARD_LABELS[value as RailCardKind]}{!available.includes(value === 'good' ? 'place_good' : value === 'bad' ? 'place_bad' : 'place_buff') ? ' · 已完成' : ''}</button>)}</div>
        {available.includes(selectedKind) ? <>
          <div className={styles.cards}>{selectedHand.map((card) => <button className={styles.card} type="button" key={card.id} aria-pressed={card.id === cardId} disabled={locked} onClick={() => setCardId(card.id)}><strong>{card.title}</strong><span>{card.description}</span></button>)}</div>
          {kind === 'buff' ? <label className={styles.field}>附加给哪一位人物<select aria-label="条件牌目标" value={targetId} disabled={locked} onChange={(event) => setTargetId(event.target.value)}><option value="">请选择尚无条件的人物</option>{targets.map((target) => <option value={target.id} key={target.id}>{target.track} 轨 · {target.card.title}（{name(target.ownerId)}）</option>)}</select></label> : <p className={styles.muted}>{kind === 'good' ? '善牌放在己方轨道。' : '恶牌放在对方轨道。'}本阶段需要分别打一张善牌和一张恶牌。</p>}
          <button style={{ marginTop: 12 }} className={styles.primary} type="button" disabled={!can(selectedKind) || !cardId || (kind === 'buff' && !targetId)} onClick={() => { void submit({ kind: selectedKind, payload: kind === 'buff' ? { roundToken: view.roundToken, cardId, targetId } : { roundToken: view.roundToken, cardId } }); }}>{pending ? '正在提交…' : kind === 'buff' ? '追加这一条件' : kind === 'good' ? '放置善牌' : '放置恶牌'}</button>
        </> : <p className={styles.notice}>{kind === 'good' && available.includes('place_bad') ? '善牌已放置，请切换“恶牌”完成另一张。' : kind === 'bad' && available.includes('place_good') ? '恶牌已放置，请切换“善牌”完成另一张。' : '你在这个阶段的操作已完成，等待其他成员。'}</p>}
      </div>
    </section> : null}

    {view.phase === 'decision' ? <section id="rail-actions" className={styles.panel}><div className={styles.panelTitle}><h2>{amConductor ? '由你决定列车的方向' : '等待列车长做决定'}</h2></div><div className={styles.body}><p className={styles.muted}>{amConductor ? '综合两轨人物与追加条件，选择列车经过哪一轨。提交后不能更改。' : `${name(view.conductorId)} 正在权衡两条轨道。你可以在玩家讨论中表达看法。`}</p>{amConductor ? <div className={styles.actions} style={{ justifyContent: 'flex-start' }}>{(['A', 'B'] as RailTrack[]).map((track) => <button key={track} className={styles.primary} disabled={!can('choose_track')} type="button" onClick={() => { void submit({ kind: 'choose_track', payload: { roundToken: view.roundToken, track } }); }}>列车经过 {track} 轨</button>)}</div> : null}</div></section> : null}

    {view.phase === 'rating' ? <section id="rail-actions" className={styles.panel}><div className={styles.panelTitle}><h2>给本轮列车长打个趣味分</h2></div><div className={styles.body}><p className={styles.muted}>1 分最温和，10 分最有“恶魔气质”。只评这次选择，不评价玩家本人；这项评分不发放办公币。</p>{available.includes('rate') ? <><div className={styles.ratings} aria-label="恶魔评分">{Array.from({ length: 10 }, (_, index) => index + 1).map((value) => <button className={styles.rating} type="button" aria-pressed={rating === value} key={value} disabled={locked} onClick={() => setRating(value)}>{value}</button>)}</div><button type="button" className={styles.primary} disabled={!can('rate') || rating === null} onClick={() => { if (rating !== null) void submit({ kind: 'rate', payload: { roundToken: view.roundToken, value: rating } }); }}>提交评分</button></> : <p className={styles.notice}>{view.viewerRole === 'spectator' ? '观众不参与评分，可在观众讨论中交流。' : amConductor ? '列车长不能为自己评分，请等待其他成员。' : view.me?.myRating !== null ? `你已给出 ${view.me?.myRating} 分，等待其他成员。` : '本轮评分已结束。'}</p>}</div></section> : null}

    {(view.phase === 'round_end' || view.phase === 'finished') && view.roundResult ? <section id="rail-actions" className={styles.panel}><div className={styles.panelTitle}><h2>第 {view.roundResult.round} 回合记录</h2></div><div className={styles.body}><p>列车经过 {view.roundResult.chosenTrack} 轨{view.roundResult.automaticDecision ? '（超时自动选择）' : ''}；{view.roundResult.survivedPlayerIds.map(name).join('、') || '无人'}生存。</p><p className={styles.muted}>本轮恶魔评分合计 {view.roundResult.demonScore}。{view.roundResult.ratings.filter((item) => item.automatic).length ? '超时未评分按弃评处理，不替玩家打分。' : ''}</p>{available.includes('next_round') ? <button type="button" className={styles.primary} disabled={!can('next_round')} onClick={() => { void submit({ kind: 'next_round', payload: { roundToken: view.roundToken } }); }}>进入下一回合</button> : view.phase !== 'finished' ? <span className={styles.muted}>等待进入下一回合。</span> : null}</div></section> : null}

    {view.result ? <section className={styles.panel}><div className={styles.panelTitle}><h2>本局表现</h2><span className={styles.pill}>服务器结算</span></div><div className={styles.body}><p>生存 MVP：{view.result.survivorMvpIds.map(name).join('、') || '暂无符合条件的玩家'}</p><p className={styles.muted}>恶魔 MVP：{view.result.demonMvpIds.map(name).join('、') || '暂无'}（趣味称号，不发币）</p></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>玩家</th><th>生存</th><th>生存率</th><th>恶魔评分</th></tr></thead><tbody>{view.result.players.map((player) => <tr key={player.id}><td>{player.displayName}{player.isBot ? ' · 机器人' : ''}<small className={styles.muted} style={{ display: 'block' }}>{player.left ? '中途离开 · 不上榜' : !player.eligible ? player.isBot ? '练习搭档 · 不上榜' : '含超时托管 · 不上榜' : '完整参与'}</small></td><td>{player.survived}/{player.eligibleRounds}</td><td>{percentage(player.rateBasisPoints)}</td><td>{player.demonTotal}</td></tr>)}</tbody></table></div></section> : null}
  </div>;
}
