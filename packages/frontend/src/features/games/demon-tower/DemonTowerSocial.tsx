import { useEffect, useRef, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import { DEMON_TOWER_ARENA_SKILLS, type DemonTowerAction, type DemonTowerArenaSkillId, type DemonTowerProfileView, type DemonTowerSocialView } from '@stealth-reader/shared';
import { communityDemonTowerApi, demonTowerReadErrorMessage } from '../../../api/community-demon-tower';
import { getCommunitySessionGeneration } from '../../../api/community-http';
import { TowerModal, TowerPanel } from './TowerElements';
import styles from './DemonTower.module.css';
import socialStyles from './DemonTowerSocial.module.css';

type Props = { profile: DemonTowerProfileView; ownerId: string | null; disabled: boolean; onAction: (action: DemonTowerAction) => Promise<boolean> };
export function DemonTowerSocial(props: Props): JSX.Element {
  return <DemonTowerSocialWorkspace key={`${props.ownerId}:${getCommunitySessionGeneration()}`} {...props} />;
}

function DemonTowerSocialWorkspace({ profile, ownerId, disabled, onAction }: Props): JSX.Element | null {
  const generation = getCommunitySessionGeneration();
  const scope = `${ownerId}:${generation}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  const mounted = useRef(true);
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'public' | 'friends'>('public');
  const [response, setResponse] = useState<{ scope: string; value: DemonTowerSocialView } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [confirm, setConfirm] = useState<DemonTowerAction | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setActionNotice(null); }, [confirm]);
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
  const can = (kind: DemonTowerAction['kind']) => !disabled && !busy && profile.availableActions.includes(kind);
  const opponents = mode === 'friends' ? social?.friends ?? [] : social?.opponents ?? [];
  const getOpponent = (action: Extract<DemonTowerAction, { kind: 'arena_challenge' }>) => (action.payload.friendOnly ? social?.friends : social?.opponents)?.find(row => row.publicId === action.payload.opponentPublicId);
  const challengeReason = (opponent: DemonTowerSocialView['opponents'][number] | undefined): string | null => {
    if (!opponent) return '对手资料已变化，请刷新列表';
    if (error || !social?.enabled) return '同伴资料待同步，请刷新后再切磋';
    if (!arena?.enabled) return '请先自愿加入论道池';
    if (opponent.challengedToday) return '今日已与这位玩家切磋';
    if (arena.attemptsToday >= 5) return '今日五次切磋已用完';
    if (!can('arena_challenge')) return '请先结束当前操作或恢复可写状态';
    return null;
  };
  const perform = async (action: DemonTowerAction) => {
    if (!can(action.kind) || sending.current || action.kind === 'arena_challenge' && challengeReason(getOpponent(action))) return;
    sending.current = true; setBusy(true); setActionNotice(null);
    const failed = () => { if (mounted.current && currentScope.current === scope && generation === getCommunitySessionGeneration()) setActionNotice('操作尚未确认，未自动重试。请查看页面提示；如提示确认上次操作，请先关闭本窗口确认原操作。'); };
    try {
      const ok = await onAction(action);
      if (mounted.current && currentScope.current === scope && generation === getCommunitySessionGeneration() && ok) { setRefresh(value => value + 1); setConfirm(null); }
      if (!ok) failed();
    } catch { failed(); }
    finally { if (mounted.current && currentScope.current === scope && generation === getCommunitySessionGeneration()) { sending.current = false; setBusy(false); } }
  };
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
        <p className={styles.muted}>公开论道与好友切磋共享每日5名不同对手的次数，同一玩家每天一次。胜利20积分/10荣誉/2SP，失败最多减10积分、仍得3荣誉/1SP；每日首胜额外10荣誉和2SP。首次段位提升再得3SP，退池重入不重发初始SP。不发普通妖塔经验或办公币。</p>
        <details><summary>五系技能树与论道配装（1终极＋2主动＋1被动）</summary><div className={styles.itemGrid} style={{ marginTop: 12 }}>{DEMON_TOWER_ARENA_SKILLS.map(skill => {
          const learned = arena.learned.includes(skill.id), equipped = arena.loadout.includes(skill.id);
          return <article key={skill.id} className={styles.item}><h3>{skill.name} <span className={styles.badge}>{skill.kind === 'ultimate' ? '终极' : skill.kind === 'passive' ? '被动' : '主动'}</span></h3><p>{skill.description}</p><p>Lv{skill.requiredLevel} · {skill.cost}SP · 需同系前招</p><button type="button" className={styles.button} disabled={learned ? !can('arena_equip') : !can('arena_learn') || profile.level < skill.requiredLevel || arena.skillPoints < skill.cost} onClick={() => learned ? changeSkill(skill.id) : void perform({ kind: 'arena_learn', payload: { skillId: skill.id } })}>{learned ? equipped ? '从论道卸下' : '装入论道' : '领悟技能'}</button></article>;
        })}</div></details>
        <div className={socialStyles.opponentNav} role="group" aria-label="选择论道对手"><button type="button" aria-pressed={mode === 'public'} onClick={() => setMode('public')}>公开论道<small>{social?.opponents.length ?? '—'}</small></button><button type="button" aria-pressed={mode === 'friends'} onClick={() => setMode('friends')}>好友切磋<small>{social?.friends?.length ?? '—'}</small></button></div>
        <p className={socialStyles.opponentNote}>{mode === 'friends' ? '仅显示真实好友中自愿加入论道、且双方未屏蔽的玩家；对方无需同时在线。' : '这里是自愿公开的论道对手，不代表好友关系。已有好友会单独标记。'}</p>
        <div className={socialStyles.opponentList} aria-label={mode === 'friends' ? '好友论道对手' : '公开论道对手'}>{opponents.map(opponent => {
          const reason = challengeReason(opponent);
          return <article className={socialStyles.opponent} key={opponent.publicId}><div><h3><span>{opponent.displayName}</span>{opponent.isFriend ? <small className={socialStyles.friendBadge}>好友</small> : null}</h3><p>Lv{opponent.level} · {opponent.rank} · 积分 {opponent.rating}</p>{reason ? <small>{reason}</small> : null}</div><button type="button" className={styles.button} disabled={Boolean(reason)} onClick={() => setConfirm({ kind: 'arena_challenge', payload: { opponentPublicId: opponent.publicId, ...(mode === 'friends' ? { friendOnly: true as const } : {}) } })}>{opponent.challengedToday ? '今日已切磋' : mode === 'friends' ? '与好友切磋' : '公开切磋'}</button></article>;
        })}</div>
        {!social ? <p className={socialStyles.empty}>正在同步论道对手…</p> : opponents.length === 0 ? <div className={socialStyles.empty}>{mode === 'friends' ? social.friends ? <>暂无可切磋的好友。请邀请已添加的好友在妖塔自愿加入论道池；未加入、已屏蔽或不可用的账号不会展示。<br /><Link to="/friends" className={styles.button}>前往好友列表</Link></> : '好友对手资料暂不可用，请刷新后重试。' : '目前没有其他自愿加入的公开对手。'} </div> : null}
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
    {confirm ? <TowerModal title="确认协作操作" onClose={() => setConfirm(null)} footer={<div className={styles.actionsRight}><button type="button" className={styles.button} disabled={disabled} onClick={() => setConfirm(null)}>取消</button><button type="button" className={styles.primary} disabled={!can(confirm.kind) || confirm.kind === 'arena_challenge' && Boolean(challengeReason(getOpponent(confirm)))} onClick={() => void perform(confirm)}>确认</button></div>}><p>{confirm.kind === 'arena_challenge' ? getOpponent(confirm) ? `与${getOpponent(confirm)!.displayName}进行${confirm.payload.friendOnly ? '好友切磋' : '公开论道'}，消耗今日一次共享切磋次数。服务器会再次核验对手与好友关系；不会改变对方血量，奖励与公开论道相同，不发普通经验或办公币。` : '对手资料已变化，请关闭窗口并刷新对手列表。' : confirm.kind === 'arena_enroll' ? confirm.payload.enabled ? '加入后其他玩家可看到你的公开昵称、等级、段位，并与你的配装快照切磋。你可以随时退出公开对手池，资产不会被对方操作。' : '退出公开对手池，保留技能、荣誉与段位。' : confirm.kind === 'squad_ready' ? '消耗本人3体力和今日一次小队次数，冻结当前配装与生命快照。退出不会退还准备消耗，其他成员全员准备后即可推进共同战斗。' : confirm.kind === 'squad_leave' ? '离开此小队，已经消耗的准备体力与次数不退；请先领取尚未领取的胜利奖励。' : '按按钮标注消耗绑定荣誉兑换物品，不涉及充值或办公币。'}</p>{actionNotice ? <p className={styles.notice} role="alert">{actionNotice}</p> : null}</TowerModal> : null}
  </div>;
}
