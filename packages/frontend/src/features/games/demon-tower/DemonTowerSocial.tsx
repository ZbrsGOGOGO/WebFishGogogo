import { useEffect, useRef, useState, type JSX } from 'react';
import { DEMON_TOWER_ARENA_SKILLS, type DemonTowerAction, type DemonTowerArenaSkillId, type DemonTowerProfileView, type DemonTowerSocialView } from '@stealth-reader/shared';
import { communityDemonTowerApi, demonTowerReadErrorMessage } from '../../../api/community-demon-tower';
import { getCommunitySessionGeneration } from '../../../api/community-http';
import { TowerModal, TowerPanel } from './TowerElements';
import styles from './DemonTower.module.css';

export function DemonTowerSocial({ profile, ownerId, disabled, onAction }: { profile: DemonTowerProfileView; ownerId: string | null; disabled: boolean; onAction: (action: DemonTowerAction) => Promise<boolean> }): JSX.Element | null {
  const generation = getCommunitySessionGeneration();
  const scope = `${ownerId}:${generation}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  const [response, setResponse] = useState<{ scope: string; value: DemonTowerSocialView } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [confirm, setConfirm] = useState<DemonTowerAction | null>(null);
  useEffect(() => {
    if (!ownerId || !profile.expansion) return;
    let alive = true, timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const read = async () => {
      try { const value = await communityDemonTowerApi.social(controller.signal); if (alive && currentScope.current === scope && generation === getCommunitySessionGeneration()) { setResponse({ scope, value }); setError(null); } }
      catch (reason) { if (alive && currentScope.current === scope) setError(demonTowerReadErrorMessage(reason, true)); }
      finally { if (alive) timer = setTimeout(() => void read(), document.hidden ? 30_000 : 5000); }
    };
    void read(); return () => { alive = false; controller.abort(); if (timer) clearTimeout(timer); };
  }, [scope, ownerId, generation, Boolean(profile.expansion), refresh, profile.version]);
  const expansion = profile.expansion;
  if (!expansion) return null;
  const social = response?.scope === scope ? response.value : null, arena = expansion.arena;
  const can = (kind: DemonTowerAction['kind']) => !disabled && profile.availableActions.includes(kind);
  const perform = async (action: DemonTowerAction) => { const ok = await onAction(action); if (ok) { setRefresh(value => value + 1); setConfirm(null); } };
  const squad = social?.squads.find(row => row.id === expansion.squadId);
  const me = squad?.members.find(member => member.publicId === ownerId);
  const changeSkill = (id: DemonTowerArenaSkillId) => {
    if (!arena) return;
    const skills = arena.loadout.includes(id) ? arena.loadout.filter(value => value !== id) : [...arena.loadout, id];
    void perform({ kind: 'arena_equip', payload: { skills } });
  };
  return <div className={styles.stack}>
    <TowerPanel title="演武场 · 异步论道" detail={<button type="button" className={styles.button} onClick={() => setRefresh(value => value + 1)}>刷新同伴</button>}>
      <p>自愿加入后公开昵称、等级与段位。切磋由服务器按双方当前配装快照结算，最多30回合；不会改变对手血量、办公币或共同世界。</p>
      {error ? <p className={styles.notice} role="status">同伴资料待同步：{error}</p> : null}
      <button type="button" className={styles.button} disabled={!can('arena_enroll')} onClick={() => setConfirm({ kind: 'arena_enroll', payload: { enabled: !arena?.enabled } })}>{arena?.enabled ? '退出公开论道池' : '自愿加入论道池'}</button>
      {arena ? <>
        <p>{arena.rank} · 积分 {arena.rating} · 荣誉 {arena.honor} · SP {arena.skillPoints} · 今日 {arena.attemptsToday}/5</p>
        <p className={styles.muted}>每天最多挑战5名不同对手，不能重复刷同人。胜利20积分/10荣誉/2SP，失败最多减10积分、仍得3荣誉/1SP；每日首胜额外10荣誉和2SP。首次段位提升再得3SP，退池重入不重发初始SP。</p>
        <details><summary>五系技能树与论道配装（1终极＋2主动＋1被动）</summary><div className={styles.itemGrid} style={{ marginTop: 12 }}>{DEMON_TOWER_ARENA_SKILLS.map(skill => {
          const learned = arena.learned.includes(skill.id), equipped = arena.loadout.includes(skill.id);
          return <article key={skill.id} className={styles.item}><h3>{skill.name} <span className={styles.badge}>{skill.kind === 'ultimate' ? '终极' : skill.kind === 'passive' ? '被动' : '主动'}</span></h3><p>{skill.description}</p><p>Lv{skill.requiredLevel} · {skill.cost}SP · 需同系前招</p><button type="button" className={styles.button} disabled={learned ? !can('arena_equip') : !can('arena_learn') || profile.level < skill.requiredLevel || arena.skillPoints < skill.cost} onClick={() => learned ? changeSkill(skill.id) : void perform({ kind: 'arena_learn', payload: { skillId: skill.id } })}>{learned ? equipped ? '从论道卸下' : '装入论道' : '领悟技能'}</button></article>;
        })}</div></details>
        <div className={styles.itemGrid} style={{ marginTop: 16 }}>{social?.opponents.map(opponent => <article className={styles.item} key={opponent.publicId}><h3>{opponent.displayName}</h3><p>Lv{opponent.level} · {opponent.rank} {opponent.rating}</p><button type="button" className={styles.button} disabled={!can('arena_challenge') || !arena.enabled || arena.attemptsToday >= 5} onClick={() => void perform({ kind: 'arena_challenge', payload: { opponentPublicId: opponent.publicId } })}>友好切磋</button></article>)}</div>
        {social && social.opponents.length === 0 ? <p className={styles.muted}>目前没有其他自愿加入的玩家，可以邀请同事从此处加入。</p> : null}
        <div className={styles.buttonRow} style={{ marginTop: 12 }}>{([{ offer: 'skin', label: '雅士外观与称号', cost: 60 }, { offer: 'essence', label: '精魄×1', cost: 20 }, { offer: 'materials', label: '矿石/药草各5', cost: 10 }] as const).map(item => <button key={item.offer} type="button" className={styles.button} disabled={!can('honor_exchange') || arena.honor < item.cost || item.offer === 'skin' && arena.skinUnlocked} onClick={() => setConfirm({ kind: 'honor_exchange', payload: { offer: item.offer } })}>{item.label} · {item.cost}荣誉</button>)}</div>
        {arena.lastReport ? <details style={{ marginTop: 12 }}><summary>最近论道：{arena.lastReport.opponentName} · {({ victory: '获胜', defeat: '落败', draw: '平局' })[arena.lastReport.outcome]} · {arena.lastReport.rounds}回合</summary><ol>{arena.lastReport.log.map((line, index) => <li key={index}>{line}</li>)}</ol></details> : null}
      </> : null}
    </TowerPanel>
    <TowerPanel title="2—4人同心小队" detail={<span className={styles.badge}>独立首领 · 不占共同血池</span>}>
      <p>每位成员点击“准备”才会扣本人3体力、消耗今日一次小队次数并冻结配装。全员准备后开始，任何成员可推进一回合；服务器保存进度，不要求同时盯着页面。</p>
      <p className={styles.muted}>准备次数今日 {expansion.squadReadyToday ?? 0}/3；建房24小时内限5次，房间24小时过期。小队受伤只发生在本次快照，含召唤助灵、群攻、队友分摊、治疗和复活。胜利后每人领取一次绑定材料，未准备不领，不发办公币。</p>
      {!expansion.squadId ? <><button className={styles.button} type="button" disabled={!can('squad_create')} onClick={() => void perform({ kind: 'squad_create', payload: { floor: profile.selectedFloor } })}>创建第{profile.selectedFloor}层小队</button><div className={styles.itemGrid} style={{ marginTop: 12 }}>{social?.squads.filter(row => row.status === 'waiting').map(row => <article className={styles.item} key={row.id}><h3>第{row.floor}层 · {row.members[0]?.displayName ?? '同事'}的小队</h3><p>{row.members.length}/4人 · {row.members.map(member => member.displayName).join('、')}</p><button className={styles.button} type="button" disabled={!can('squad_join') || row.members.length >= 4} onClick={() => void perform({ kind: 'squad_join', payload: { squadId: row.id } })}>加入小队</button></article>)}</div></> : <>
        {squad ? <><p>第{squad.floor}层 · {({ waiting: '等待准备', active: '协作进行中', victory: '挑战成功', defeat: '挑战结束', closed: '已关闭' })[squad.status]} · 第{squad.round}/20回合</p><p>首领 {squad.boss.hp}/{squad.boss.maxHp} · 助灵 {squad.boss.minions}</p><div className={styles.itemGrid}>{squad.members.map(member => <article className={styles.item} key={member.publicId}><h3>{member.displayName}</h3><p>{member.ready ? `生命 ${member.hp}/${member.maxHp} · 伤害 ${member.damage}` : '尚未准备'}</p></article>)}</div>
          <div className={styles.buttonRow} style={{ marginTop: 12 }}><button className={styles.button} type="button" disabled={!can('squad_ready') || squad.status !== 'waiting' || me?.ready || profile.stamina < 3 || profile.hp <= 0 || (expansion.squadReadyToday ?? 0) >= 3} onClick={() => setConfirm({ kind: 'squad_ready', payload: {} })}>准备 · 3体力</button><button className={styles.button} type="button" disabled={!can('squad_step') || squad.status !== 'active'} onClick={() => void perform({ kind: 'squad_step', payload: {} })}>推进一回合</button><button className={styles.button} type="button" disabled={!can('squad_claim') || squad.status !== 'victory' || me?.claimed} onClick={() => void perform({ kind: 'squad_claim', payload: {} })}>{me?.claimed ? '本场已领取' : '领取小队奖励'}</button></div>
          <details style={{ marginTop: 12 }}><summary>小队回合战报</summary><ol>{squad.log.map((line, index) => <li key={index}>{line}</li>)}</ol></details>
        </> : <p className={styles.notice}>小队资料尚在同步；如果队伍已失效，可离队清除旧关联。</p>}
        <button className={styles.button} type="button" disabled={!can('squad_leave') || squad?.status === 'active' || squad?.status === 'victory' && !me?.claimed} onClick={() => setConfirm({ kind: 'squad_leave', payload: {} })}>离开当前小队</button>
      </>}
    </TowerPanel>
    {confirm ? <TowerModal title="确认协作操作" onClose={() => setConfirm(null)} footer={<div className={styles.actionsRight}><button type="button" className={styles.button} disabled={disabled} onClick={() => setConfirm(null)}>取消</button><button type="button" className={styles.primary} disabled={!can(confirm.kind)} onClick={() => void perform(confirm)}>确认</button></div>}><p>{confirm.kind === 'arena_enroll' ? confirm.payload.enabled ? '加入后其他玩家可看到你的公开昵称、等级、段位，并与你的配装快照切磋。你可以随时退出公开对手池，资产不会被对方操作。' : '退出公开对手池，保留技能、荣誉与段位。' : confirm.kind === 'squad_ready' ? '消耗本人3体力和今日一次小队次数，冻结当前配装与生命快照。退出不会退还准备消耗，其他成员全员准备后即可推进共同战斗。' : confirm.kind === 'squad_leave' ? '离开此小队，已经消耗的准备体力与次数不退；请先领取尚未领取的胜利奖励。' : '按按钮标注消耗绑定荣誉兑换物品，不涉及充值或办公币。'}</p></TowerModal> : null}
  </div>;
}
