import { useEffect, useRef, useState } from 'react';
import type { OfficeHubOverview, OfficeReliefTool } from '@stealth-reader/shared';
import { useGamePrivacy } from '../games/GamePrivacyContext';
import { OfficeBossArt } from './OfficeBossArt';
import styles from './OfficeBossWorkspace.module.css';

export function OfficeBossDailyPanel({ view, busy, command }: {
  view: OfficeHubOverview;
  busy: boolean;
  command: (action: string, data?: Record<string, unknown>) => Promise<boolean>;
}) {
  const { covered } = useGamePrivacy();
  const [clock, setClock] = useState(Date.now()), [tool, setTool] = useState<OfficeReliefTool>('keyboard');
  const [pulse, setPulse] = useState<number | null>(null);
  const lastHit = useRef(view.boss.hits);
  const serverOffset = useRef(Date.parse(view.serverTime) - Date.now());
  useEffect(() => { serverOffset.current = Date.parse(view.serverTime) - Date.now(); setClock(Date.now()); }, [view.serverTime]);
  useEffect(() => {
    if (covered) return;
    const timer = window.setInterval(() => setClock(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [covered]);
  useEffect(() => {
    const changed = lastHit.current !== view.boss.hits;
    lastHit.current = view.boss.hits;
    if (covered || document.hidden) { setPulse(null); return; }
    if (changed && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) setPulse(view.boss.hits);
  }, [view.boss.hits, covered]);
  useEffect(() => {
    if (pulse === null) return;
    const clear = (): void => setPulse(null);
    const timer = window.setTimeout(clear, 600);
    window.addEventListener('blur', clear); document.addEventListener('visibilitychange', clear);
    return () => { window.clearTimeout(timer); window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', clear); };
  }, [pulse]);
  const b = view.boss;
  const remaining = b.endsAt ? Math.max(0, Math.ceil((Date.parse(b.endsAt) - clock - serverOffset.current) / 1000)) : 30;
  return <div className={styles.workspace}><section className={`${styles.panel} ${styles.stage}`} aria-label="每日巡视">
    <div className={styles.stageTop}><span className={styles.eyebrow}>DAILY / 固定日常</span><h2>暴打小老板</h2><p>虚构的纸片人，不影射真实个人。每天 30 秒，手动只改变演出，不改变奖励；不消耗机会挑战次数。</p></div>
    <OfficeBossArt key={pulse ?? 'daily-rest'} tool={tool} skin={null} effect={!covered && pulse !== null ? 'tap' : null} />
    <div className={styles.stageBody}><p>{b.claimed ? '今天辛苦了，准点下班。' : b.startedAt ? `${remaining} 秒 · 已释放 ${b.damage} 点压力` : '有一叠待办想占用你的下班时间。'}</p>
      <progress aria-label="巡视剩余时间" value={b.startedAt ? 30 - remaining : 0} max={30} />
      <div className={styles.actions}><label>解压工具<select value={tool} disabled={busy || covered} onChange={e => setTool(e.target.value as OfficeReliefTool)}><option value="keyboard">键盘拍打</option><option value="stapler">订书机连击</option><option value="coffee">咖啡泼洒</option></select></label>
        {!b.startedAt ? <button className={styles.primary} disabled={busy || covered || b.claimed} onClick={() => void command('boss_start')}>开始今日巡视</button> : remaining > 0 ? <button className={styles.primary} disabled={busy || covered || b.claimed} onClick={() => void command('boss_hit', { tool })}>释放压力</button> : <button className={styles.primary} disabled={busy || covered || b.claimed} onClick={() => void command('boss_claim')}>{b.claimed ? '今日奖励已领取' : '收工：领取 20 办公币 +5 经验'}</button>}
      </div><p className={styles.muted}>不点也有同等奖励，离开后计时继续。北京时间 00:00 更新；固定奖励进入全站办公币钱包，不是解压币。</p>
    </div>
  </section></div>;
}
