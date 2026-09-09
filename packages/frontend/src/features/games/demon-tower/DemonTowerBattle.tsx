import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react';
import type { DemonTowerAction, DemonTowerBattleReport, DemonTowerBattleView, DemonTowerCatalog, DemonTowerCombatantView, DemonTowerCombatLog, DemonTowerProfileView, DemonTowerSkillDefinition } from '@stealth-reader/shared';

import { TowerIcon } from './DemonTowerArt';
import { TowerEnemyArt } from './DemonTowerEnemyArt';
import { TowerMeter, TowerModal, TowerPanel, revealTowerControl, towerTime } from './TowerElements';
import styles from './DemonTower.module.css';

export function TowerCombatLog({ entries, limit }: { entries: DemonTowerCombatLog[]; limit?: number }): JSX.Element {
  const visible = limit ? entries.slice(-limit) : entries;
  return <ol className={styles.battleLog} aria-label="战斗记录">{visible.map((entry, index) => <li key={`${index}-${entry.turn}`} data-kind={entry.kind}><span>{String(entry.turn).padStart(2, '0')}</span>{entry.text}</li>)}</ol>;
}

function Fighter({ actor, enemy = false, children }: { actor: DemonTowerCombatantView; enemy?: boolean; children?: JSX.Element }): JSX.Element {
  return <div className={styles.fighter} data-enemy={enemy} data-elite={enemy && actor.name.startsWith('精英·')}><div className={styles.fighterHeading}>{enemy ? <TowerEnemyArt name={actor.name} className={styles.fighterImage} /> : <span className={styles.fighterAvatar}><TowerIcon name="profile" /></span>}<div><h3>{actor.name}</h3>{enemy && actor.name.startsWith('精英·') ? <small className={styles.eliteLabel}>精英遭遇</small> : null}</div></div>{children}<TowerMeter label={enemy ? '目标生命' : '我的生命'} value={actor.hp} max={actor.maxHp} tone={enemy ? 'clay' : 'sage'} /><div className={styles.shield}><TowerIcon name="shield" /><span>护盾 {actor.shield}</span></div>{actor.effects.length ? <div className={styles.effects}>{actor.effects.map((effect) => <span key={effect.id} className={styles.effect} data-warning={['charge_warning', 'charge_ready', 'venom_warning', 'venom_ready', 'guard_warning'].includes(effect.id)} title={`强度 ${effect.magnitude}`}>{effect.name} · {effect.remainingTurns} 回合</span>)}</div> : null}</div>;
}

export function DemonTowerBattle({ battle, catalog, disabled, onAction }: { battle: DemonTowerBattleView; catalog: DemonTowerCatalog; disabled: boolean; onAction: (action: DemonTowerAction) => Promise<boolean> }): JSX.Element {
  const enemies = battle.enemies.filter((enemy) => enemy.hp > 0);
  const [selectedId, setSelectedId] = useState(enemies[0]?.id ?? '');
  const target = enemies.find((enemy) => enemy.id === selectedId) ?? enemies[0];
  const [skillDetail, setSkillDetail] = useState<DemonTowerSkillDefinition | null>(null);
  const [confirmFlee, setConfirmFlee] = useState(false);
  const actionArea = useRef<HTMLDivElement>(null);
  useEffect(() => { setSelectedId(battle.enemies.find((enemy) => enemy.hp > 0)?.id ?? ''); setSkillDetail(null); setConfirmFlee(false); }, [battle.id]);
  useLayoutEffect(() => {
    if (window.innerWidth > 760) return undefined;
    // Resume at the actionable area once per encounter, not on each round.
    const frame = requestAnimationFrame(() => { if (actionArea.current) revealTowerControl(actionArea.current); });
    return () => cancelAnimationFrame(frame);
  }, [battle.id]);
  const doSkill = (skill: DemonTowerSkillDefinition): void => {
    const hasTarget = skill.category === '伤害';
    void onAction({ kind: 'skill', payload: { skillId: skill.id, ...(hasTarget && target ? { targetId: target.id } : {}) } });
  };
  return <section className={styles.panel} aria-label="当前探索战斗"><div className={styles.panelBody}>
    <div className={styles.battleHeader}><div><span className={styles.eyebrow}>ENCOUNTER / 回合制行动</span><h2>{battle.source === 'rift' ? '小秘境遭遇' : battle.source === 'weekly_boss' ? '周常守关挑战' : '现场遭遇'}</h2><span className={styles.muted}>第 {battle.turn + 1} / {battle.roundLimit} 回合 · 无实时倒计时</span></div><span className={styles.badge}>服务器保存进度</span></div>
    <div className={styles.combatants}><Fighter actor={battle.player} /><span className={styles.versus}>VS</span>{target ? <Fighter actor={target} enemy>{enemies.length > 1 ? <select className={styles.enemySelect} aria-label="当前攻击目标" value={target.id} disabled={disabled} onChange={(event) => setSelectedId(event.target.value)}>{enemies.map((enemy) => <option key={enemy.id} value={enemy.id}>{enemy.name} · {enemy.hp} HP</option>)}</select> : <span className={styles.muted}>{battle.enemies.length > 1 ? `${enemies.length} / ${battle.enemies.length} 位敌人仍存活` : '单个目标'}</span>}</Fighter> : <p className={styles.notice}>目标已结束，正在同步战报。</p>}</div>
    <div className={styles.battleActions} ref={actionArea}><div className={styles.buttonRow}><button type="button" className={styles.primary} disabled={disabled || !target} onClick={() => { if (target) void onAction({ kind: 'attack', payload: { targetId: target.id } }); }}><TowerIcon name="loadout" />普通攻击</button><button type="button" className={styles.textButton} disabled={disabled} onClick={() => setConfirmFlee(true)}>撤离战斗</button></div>
      <div className={styles.skillActions}>{battle.availableSkills.map((available) => { const skill = catalog.skills.find((entry) => entry.id === available.id); if (!skill) return null; return <div key={skill.id}><button type="button" className={styles.skillAction} disabled={disabled || !available.usable || !target} onClick={() => doSkill(skill)} aria-label={`${skill.name}${available.cooldownRemaining ? `，冷却 ${available.cooldownRemaining} 回合` : ''}`}><strong>{skill.name}</strong><small>{available.cooldownRemaining > 0 ? `冷却 ${available.cooldownRemaining} 回合` : !available.usable ? '本场已使用 / 暂不可用' : `${skill.category} · 可使用`}</small></button><button type="button" className={styles.textButton} aria-label={`查看${skill.name}效果`} onClick={() => setSkillDetail(skill)}>效果说明</button></div>; })}</div>
      <p className={styles.muted} style={{ margin: '12px 0 0' }}>每次攻击或技能推进一个回合，敌方也会行动。恢复、护盾和持续效果按剩余回合结算。</p>
    </div>
    <TowerCombatLog entries={battle.log} limit={6} />
  </div>{skillDetail ? <TowerModal title={skillDetail.name} onClose={() => setSkillDetail(null)}><span className={styles.badge}>{skillDetail.rarity} · {skillDetail.category}</span><p style={{ marginTop: 16 }}>{skillDetail.description}</p><p className={styles.muted}>基础冷却 {skillDetail.cooldown} 回合；品质提升可能缩短冷却，具体是否可用以当前战斗按钮为准。技能品质可能改变基础效果，战报显示实际结算值。</p></TowerModal> : null}
    {confirmFlee ? <TowerModal title="确认撤离" onClose={() => setConfirmFlee(false)} footer={<div className={styles.actionsRight}><button type="button" className={styles.button} disabled={disabled} onClick={() => setConfirmFlee(false)}>继续战斗</button><button type="button" className={styles.dangerButton} disabled={disabled} onClick={() => { void onAction({ kind: 'flee', payload: {} }).then((success) => { if (success) setConfirmFlee(false); }); }}>确认撤离</button></div>}><p>撤离会结束当前遭遇，已消耗的探索体力不会退还。现有角色和物品不会清空。</p><p className={styles.muted}>如果只是暂时离开工位，使用 Esc 便签即可，无需撤离。</p></TowerModal> : null}
  </section>;
}

export const TOWER_OUTCOME_LABELS: Record<DemonTowerBattleReport['outcome'], string> = { victory: '探索胜利', defeat: '暂时受挫', fled: '主动撤离', timeout: '回合上限', contributed: '协作已记录' };

export function DemonTowerReport({ report, catalog, compact = false }: { report: DemonTowerBattleReport; catalog: DemonTowerCatalog; compact?: boolean }): JSX.Element {
  const source = report.source === 'rift' ? '小秘境探索' : report.source === 'weekly_boss' ? '周常独立守关' : report.kind === 'boss' ? '世界首领协作' : '普通探索';
  return <TowerPanel title={TOWER_OUTCOME_LABELS[report.outcome]} detail={<span className={styles.muted}>{towerTime(report.completedAt)}</span>}><p className={styles.muted}>{source} · 第 {report.floor} 层 · {report.turns} 回合</p><dl className={styles.reportStats}><div><dt>造成伤害</dt><dd>{report.damage.toLocaleString('zh-CN')}</dd></div><div><dt>妖塔经验</dt><dd>+{report.experience}</dd></div><div><dt>结算</dt><dd style={{ fontSize: 13 }}>{TOWER_OUTCOME_LABELS[report.outcome]}</dd></div></dl>{Object.entries(report.materials).some(([, amount]) => amount > 0) ? <div className={styles.effects}>{Object.entries(report.materials).filter(([, amount]) => amount > 0).map(([material, amount]) => <span className={styles.badge} key={material}>{catalog.materials[material as keyof typeof catalog.materials]} +{amount}</span>)}</div> : null}<p className={styles.muted} style={{ marginTop: 13 }}>此处记录战斗经验和材料。实际办公币到账、首领有效血池扣除以操作回执为准。</p><TowerCombatLog entries={report.log} limit={compact ? 5 : undefined} /></TowerPanel>;
}

export function DemonTowerDaily({ profile, catalog, disabled, onAction }: { profile: DemonTowerProfileView; catalog: DemonTowerCatalog; disabled: boolean; onAction: (action: DemonTowerAction) => Promise<boolean> }): JSX.Element {
  const daily = profile.daily;
  const rewardRemaining = Math.max(0, Math.min(catalog.rules.dailyActivityCoins, daily.officeCoinCap - daily.officeCoinsEarned));
  const rewardTitle = daily.rewardClaimed ? '今日活跃奖励已结算' : rewardRemaining > 0 ? `完成日常，最多获得 ${rewardRemaining} 办公币` : '今日日常办公币额度已用完';
  const canClaim = !disabled && profile.availableActions.includes('claim_reward') && !daily.rewardClaimed && daily.activity >= daily.activityTarget;
  return <TowerPanel title="今日工作小结" detail={<span className={styles.muted}>{daily.serviceDate}</span>}><div className={styles.daily}><div><h3>{rewardTitle}</h3><p>妖塔经验和绑定材料独立成长；办公币使用统一钱包，本次到账受今日剩余额度限制。</p><TowerMeter label="今日活跃" value={daily.activity} max={daily.activityTarget} /></div><button type="button" className={styles.button} disabled={!canClaim} onClick={() => { void onAction({ kind: 'claim_reward', payload: {} }); }}>{daily.rewardClaimed ? '今日已领取' : daily.activity >= daily.activityTarget ? '领取活跃奖励' : '继续积累活跃'}</button></div><p className={styles.muted} style={{ marginTop: 14 }}>今日妖塔日常已到账 {daily.officeCoinsEarned} / {daily.officeCoinCap} 办公币。北京时间自然日重置，不要求连续在线。</p></TowerPanel>;
}
