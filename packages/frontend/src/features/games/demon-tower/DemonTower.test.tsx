import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DemonTowerLeaderboard, DemonTowerLeaderboardEntry } from '@stealth-reader/shared';

import { communityDemonTowerApi } from '../../../api/community-demon-tower';
import { setCommunitySessionTokens } from '../../../api/community-http';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../../app/store/community-auth-store';
import * as wallet from '../../../app/store/community-wallet-store';
import { GamePrivacyProvider } from '../GamePrivacyContext';
import { DemonTowerPage } from './DemonTowerPage';
import { DemonTowerAttributeReset } from './DemonTowerAttributeReset';
import { TowerEnemyArt } from './DemonTowerEnemyArt';
import { DemonTowerBattle, DemonTowerDaily, TowerCombatLog } from './DemonTowerBattle';
import { DemonTowerInventory } from './DemonTowerInventory';
import { DemonTowerWorld, TowerContributionList } from './DemonTowerWorld';
import { DemonTowerLeaderboardPage, towerDateValid } from './DemonTowerLeaderboardPage';
import { TowerModal, revealTowerControl } from './TowerElements';
import { TOWER_TEST_NOW, TOWER_TEST_USER, towerBattle, towerCatalog, towerOverview, towerProfile, towerReceipt, towerWorld } from './test-fixtures';

const entry = (overrides: Partial<DemonTowerLeaderboardEntry> = {}): DemonTowerLeaderboardEntry => ({ rank: 1, publicId: 'public-other', displayName: '合成寻道者乙', level: 10, bossDamage: 321, passageContribution: 800, score: 321, ...overrides });
const board = (overrides: Partial<DemonTowerLeaderboard> = {}): DemonTowerLeaderboard => ({ serverNow: TOWER_TEST_NOW, serviceDate: '2026-09-09', entries: [entry()], me: null, rewardDescription: '按有效首领伤害排名。', award: { officeCoins: 0, status: 'pending', winnerPublicId: null }, ...overrides });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; }
function RouteProbe() { const location = useLocation(); const navigate = useNavigate(); return <><output aria-label="当前位置">{location.search}</output><button onClick={() => navigate(-1)}>历史后退</button><button onClick={() => navigate(1)}>历史前进</button></>; }
const wrap = (element: React.ReactNode, path = '/games/demon-tower') => render(<MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>);
function weaponCard(id: string): HTMLElement { const name = towerCatalog().weapons.find((item) => item.id === id)!.name; return screen.getByRole('heading', { name: new RegExp('^' + name) }).closest('article')!; }

describe('demon tower native interface contracts', () => {
  beforeEach(() => {
    vi.restoreAllMocks(); resetCommunityAuthStoreForTests(); setCommunitySessionTokens('synthetic-ui-a');
    useCommunityAuthStore.setState({ phase: 'active', user: TOWER_TEST_USER, sessionReady: true });
    wallet.resetCommunityWalletStoreForTests(); vi.spyOn(wallet, 'refreshCommunityWallet').mockResolvedValue();
    vi.spyOn(communityDemonTowerApi, 'catalog').mockResolvedValue(towerCatalog());
    vi.spyOn(communityDemonTowerApi, 'overview').mockResolvedValue(towerOverview());
    vi.spyOn(communityDemonTowerApi, 'action').mockResolvedValue(towerReceipt());
    vi.spyOn(communityDemonTowerApi, 'leaderboard').mockResolvedValue(board());
    vi.spyOn(communityDemonTowerApi, 'contributions').mockResolvedValue({ serverNow: TOWER_TEST_NOW, floor: 1, entries: [], me: null, rewardDescription: '建设与伤害分开记录。' });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

  it('discloses account storage and public records before explicit free enrollment', async () => {
    vi.mocked(communityDemonTowerApi.overview).mockResolvedValue(towerOverview({ profile: null }));
    const { container } = wrap(<DemonTowerPage />);
    const enroll = await screen.findByRole('button', { name: '免费建立角色' });
    expect(screen.getByText(/角色存档保存在当前账号下/)).toBeTruthy();
    expect(screen.getByRole('link', { name: '隐私政策' })).toHaveProperty('pathname', '/privacy-policy');
    expect(communityDemonTowerApi.action).not.toHaveBeenCalled();
    fireEvent.click(enroll);
    await waitFor(() => expect(communityDemonTowerApi.action).toHaveBeenCalledOnce());
    expect(vi.mocked(communityDemonTowerApi.action).mock.calls[0][0]).toMatchObject({ kind: 'enroll', expectedVersion: 0, payload: {} });
    expect(container.querySelector('iframe,audio,video')).toBeNull();
    expect(container.textContent).not.toMatch(/充值入口|¥|￥|RMB/);
  });

  it('shows disabled feature honestly and makes no private request or enrollment', async () => {
    vi.mocked(communityDemonTowerApi.catalog).mockResolvedValue(towerCatalog({ enabled: false }));
    wrap(<DemonTowerPage />); expect(await screen.findByText(/九层妖塔暂未开放/)).toBeTruthy();
    expect(communityDemonTowerApi.overview).not.toHaveBeenCalled(); expect(communityDemonTowerApi.action).not.toHaveBeenCalled();
  });

  it('disables unaffordable exploration, training and rest without inventing resources', async () => {
    vi.mocked(communityDemonTowerApi.overview).mockResolvedValue(towerOverview({ profile: towerProfile({ stamina: 0, hp: 0 }) }));
    wrap(<DemonTowerPage />);
    expect(await screen.findByRole('button', { name: /开始探索/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /潜心修炼/ })).toBeDisabled(); expect(screen.getByRole('button', { name: /短暂休整/ })).toBeDisabled();
    expect(screen.getByRole('progressbar', { name: '体力' })).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getAllByText('待同步').length).toBeGreaterThan(0);
  });

  it('keeps every mutation disabled during maintenance, including initial enrollment', async () => {
    vi.mocked(communityDemonTowerApi.overview).mockResolvedValue(towerOverview({ writesEnabled: false }));
    const first = wrap(<DemonTowerPage />); expect(await screen.findByRole('button', { name: /开始探索/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /潜心修炼/ })).toBeDisabled(); first.unmount();
    vi.mocked(communityDemonTowerApi.overview).mockResolvedValue(towerOverview({ writesEnabled: false, profile: null }));
    wrap(<DemonTowerPage />); expect(await screen.findByRole('button', { name: '免费建立角色' })).toBeDisabled(); expect(communityDemonTowerApi.action).not.toHaveBeenCalled();
  });

  it('supports roving keyboard tabs and leaves only the selected workspace accessible', async () => {
    wrap(<DemonTowerPage />); const explore = await screen.findByRole('tab', { name: '探索任务' });
    expect(explore).toHaveAttribute('tabindex', '0'); explore.focus(); fireEvent.keyDown(explore, { key: 'ArrowRight' });
    const loadout = screen.getByRole('tab', { name: '装备技能' }); expect(loadout).toHaveFocus(); expect(loadout).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'tower-panel-loadout');
    fireEvent.keyDown(loadout, { key: 'End' }); expect(screen.getByRole('tab', { name: '行动战报' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Home' }); expect(screen.getByRole('tab', { name: /人物档案/ })).toHaveFocus();
    expect(screen.getAllByRole('tab').filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
  });

  it('does not move a mobile pointer target between press and release while retaining keyboard focus clearance', async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    try {
      wrap(<DemonTowerPage />);
      const button = await screen.findByRole('button', { name: /开始探索/ });
      const tabs = screen.getByRole('tablist', { name: '妖塔工作区' });
      vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({ top: 631, bottom: 675, width: 200, height: 44 } as DOMRect);
      vi.spyOn(tabs, 'getBoundingClientRect').mockReturnValue({ top: 679 } as DOMRect);
      const scroll = vi.fn(); button.scrollIntoView = scroll;
      fireEvent.pointerDown(button); fireEvent.focus(button);
      expect(scroll).not.toHaveBeenCalled();
      fireEvent.pointerUp(button); fireEvent.click(button);
      await waitFor(() => expect(communityDemonTowerApi.action).toHaveBeenCalledOnce());
      fireEvent.blur(button); fireEvent.keyDown(document, { key: 'Tab' }); fireEvent.focus(button);
      expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'instant' });
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    }
  });

  it('requires the server activity target before enabling daily claim', () => {
    const onAction = vi.fn().mockResolvedValue(true); const profile = towerProfile();
    const rendered = render(<DemonTowerDaily profile={profile} catalog={towerCatalog()} disabled={false} onAction={onAction} />);
    expect(screen.getByRole('button', { name: '继续积累活跃' })).toBeDisabled();
    rendered.rerender(<DemonTowerDaily profile={{ ...profile, daily: { ...profile.daily, activity: 3 } }} catalog={towerCatalog()} disabled={false} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: '领取活跃奖励' })); expect(onAction).toHaveBeenCalledWith({ kind: 'claim_reward', payload: {} });
    rendered.rerender(<DemonTowerDaily profile={{ ...profile, daily: { ...profile.daily, activity: 3, rewardClaimed: true } }} catalog={towerCatalog()} disabled={false} onAction={onAction} />);
    expect(screen.getByRole('button', { name: '今日已领取' })).toBeDisabled();
  });
  it('confirms the exact free reset without promising healing or charging resources', async () => {
    const onAction = vi.fn().mockResolvedValue(true);
    render(<DemonTowerAttributeReset profile={towerProfile({ attributeReset: { allocatedPoints: 7, eligibleAt: null } })} catalog={towerCatalog()} now={TOWER_TEST_NOW} disabled={false} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: '免费重置自由点' }));
    const dialog = screen.getByRole('dialog', { name: '确认免费重置自由点' });
    expect(onAction).not.toHaveBeenCalled(); expect(within(dialog).getByText(/不扣办公币、体力或绑定材料/)).toBeTruthy();
    expect(within(dialog).getByText(/不提供治疗；最大生命降低/)).toBeTruthy(); expect(within(dialog).getByText(/成功后间隔 24 小时/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '确认返还 7 点' }));
    await waitFor(() => expect(onAction).toHaveBeenCalledWith({ kind: 'reset_attributes', payload: {} }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('explains short-session activity costs and finite world rewards from the supplied catalog', async () => {
    const catalog = towerCatalog();
    vi.mocked(communityDemonTowerApi.catalog).mockResolvedValue({ ...catalog, rules: { ...catalog.rules, dailyActivityTarget: 4, trainCost: 7, dailyActivityCoins: 21, dailyOfficeCoinCap: 90 } });
    wrap(<DemonTowerPage />); await screen.findByRole('button', { name: /开始探索/ });
    fireEvent.click(screen.getByRole('button', { name: '查看九层妖塔帮助' }));
    const dialog = screen.getByRole('dialog', { name: '九层妖塔使用说明' });
    expect(within(dialog).getByText(/完成 4 次修炼，共消耗 28 体力/)).toHaveTextContent('手动领取最多 21 办公币');
    expect(within(dialog).getByText(/90 办公币是日常奖励总上限/)).toBeTruthy();
    expect(within(dialog).getByText(/北京时间 00:00/)).toHaveTextContent('全部 9 层联通后不再出现新的世界首领');
    expect(within(dialog).getByText(/不产生讨伐冠军或冠军奖励/)).toBeTruthy();
  });
  it('uses the server rolling reset deadline and enables only when the full cooldown has elapsed', () => {
    const profile = towerProfile({ attributeReset: { allocatedPoints: 2, eligibleAt: TOWER_TEST_NOW + 3_600_000 } });
    const props = { profile, catalog: towerCatalog(), disabled: false, onAction: vi.fn() };
    const result = render(<DemonTowerAttributeReset {...props} now={TOWER_TEST_NOW} />);
    expect(screen.getByRole('button', { name: '免费重置自由点' })).toBeDisabled(); expect(screen.getByText(/约剩 1 小时 0 分钟/)).toBeTruthy();
    result.rerender(<DemonTowerAttributeReset {...props} now={TOWER_TEST_NOW + 3_599_999} />);
    expect(screen.getByRole('button', { name: '免费重置自由点' })).toBeDisabled();
    result.rerender(<DemonTowerAttributeReset {...props} now={TOWER_TEST_NOW + 3_600_000} />);
    expect(screen.getByRole('button', { name: '免费重置自由点' })).toBeEnabled();
  });
  it('does not offer resets for zero allocation, active battles or read-only state', () => {
    const props = { catalog: towerCatalog(), now: TOWER_TEST_NOW, onAction: vi.fn() };
    const profile = towerProfile({ attributeReset: { allocatedPoints: 3, eligibleAt: null } });
    const result = render(<DemonTowerAttributeReset {...props} profile={towerProfile()} disabled={false} />);
    expect(screen.getByRole('button', { name: '免费重置自由点' })).toBeDisabled();
    result.rerender(<DemonTowerAttributeReset {...props} profile={{ ...profile, battle: towerBattle() }} disabled={false} />);
    expect(screen.getByRole('button', { name: '免费重置自由点' })).toBeDisabled(); expect(screen.getByText(/请先完成或撤离当前战斗/)).toBeTruthy();
    result.rerender(<DemonTowerAttributeReset {...props} profile={profile} disabled />);
    expect(screen.getByRole('button', { name: '免费重置自由点' })).toBeDisabled();
    expect(props.onAction).not.toHaveBeenCalled();
  });
  it('keeps a failed reset confirmation inspectable and disables it when refreshed state becomes ineligible', async () => {
    const props = { catalog: towerCatalog(), now: TOWER_TEST_NOW, onAction: vi.fn().mockResolvedValue(false) };
    const profile = towerProfile({ attributeReset: { allocatedPoints: 3, eligibleAt: null } });
    const result = render(<DemonTowerAttributeReset {...props} profile={profile} disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: '免费重置自由点' }));
    fireEvent.click(screen.getByRole('button', { name: '确认返还 3 点' }));
    await waitFor(() => expect(props.onAction).toHaveBeenCalledOnce());
    expect(screen.getByRole('dialog')).toBeTruthy();
    result.rerender(<DemonTowerAttributeReset {...props} profile={{ ...profile, attributeReset: { allocatedPoints: 3, eligibleAt: TOWER_TEST_NOW + 86_400_000 } }} disabled={false} />);
    expect(screen.getByRole('button', { name: '确认返还 3 点' })).toBeDisabled();
  });
  it('omits empty normal-turn receipts but retains replay confirmation and real rewards', async () => {
    const encounter = towerBattle();
    vi.mocked(communityDemonTowerApi.overview).mockResolvedValue(towerOverview({ profile: towerProfile({ battle: encounter, availableActions: ['attack', 'skill', 'flee'] }) }));
    const next = towerReceipt({ events: [], overview: towerOverview({ profile: towerProfile({ version: 2, battle: { ...encounter, turn: 3 }, availableActions: ['attack', 'skill', 'flee'] }) }) });
    vi.mocked(communityDemonTowerApi.action).mockResolvedValueOnce(next).mockResolvedValueOnce({ ...next, replayed: true }).mockResolvedValueOnce({ ...next, officeCoinsGranted: 3 });
    wrap(<DemonTowerPage />);
    fireEvent.click(await screen.findByRole('button', { name: '普通攻击' }));
    await waitFor(() => expect(screen.getByText(/第 4 \/ 12 回合/)).toBeTruthy());
    expect(screen.queryByText('行动已记录')).toBeNull(); expect(screen.queryByRole('button', { name: '收起回执' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '普通攻击' }));
    expect(await screen.findByText('上次操作已确认 · 没有重复结算')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '普通攻击' }));
    expect(await screen.findByText(/本次办公币到账 \+3/)).toBeTruthy();
  });
  it('renders local enemy sketches and actual elite warnings without external image resources', () => {
    const name = '精英·岩甲守卫'; const encounter = towerBattle();
    render(<DemonTowerBattle battle={{ ...encounter, enemies: [{ ...encounter.enemies[0], name, effects: [{ id: 'charge_ready', name: '下次行动重击（可震慑打断）', magnitude: 1.35, remainingTurns: 1 }] }] }} catalog={towerCatalog()} disabled={false} onAction={vi.fn()} />);
    const art = screen.getByRole('img', { name: `${name}的遭遇档案插图` }); expect(art.tagName.toLowerCase()).toBe('svg');
    expect(art.querySelector('image,use,script,animate')).toBeNull(); expect(screen.getByText('精英遭遇')).toBeTruthy();
    expect(screen.getByText('下次行动重击（可震慑打断） · 1 回合')).toHaveAttribute('data-warning', 'true');
  });
  it('describes agility as damage and evasion while luck controls critical probability', async () => {
    wrap(<DemonTowerPage />); fireEvent.click(await screen.findByRole('tab', { name: /人物档案/ }));
    expect(screen.getByText('敏捷影响轻兵伤害与闪避。')).not.toHaveTextContent('暴击');
    expect(screen.getByText('幸运影响法器、回复、暴击概率和部分探索收益。')).toBeTruthy();
  });
  it('unmounts an unsubmitted private bulk allocation draft when the account changes', async () => {
    vi.mocked(communityDemonTowerApi.overview).mockResolvedValue(towerOverview({ profile: towerProfile({ unspentPoints: 10 }) }));
    wrap(<DemonTowerPage />); fireEvent.click(await screen.findByRole('tab', { name: /人物档案/ }));
    fireEvent.click(screen.getByRole('button', { name: '批量分配自由点' }));
    fireEvent.change(screen.getByRole('textbox', { name: '分配数量' }), { target: { value: '8' } });
    act(() => { setCommunitySessionTokens('synthetic-ui-b'); useCommunityAuthStore.setState({ phase: 'active', user: { ...TOWER_TEST_USER, id: 'tower-user-b', publicId: 'tower-public-b', displayName: '隔离寻道者乙' } }); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(communityDemonTowerApi.action).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('tab', { name: /人物档案/ })); fireEvent.click(screen.getByRole('button', { name: '批量分配自由点' }));
    expect(screen.getByRole('textbox', { name: '分配数量' })).toHaveValue('1');
  });
  it('labels catalog skill cooldowns as base values without changing actual battle availability', () => {
    const first = render(<DemonTowerInventory profile={towerProfile()} catalog={towerCatalog()} disabled={false} onAction={vi.fn()} />);
    expect(screen.getAllByText(/优先 · 基础冷却/)).toHaveLength(3); first.unmount();
    render(<DemonTowerBattle battle={towerBattle()} catalog={towerCatalog()} disabled={false} onAction={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '查看回春术效果' }));
    expect(within(screen.getByRole('dialog')).getByText(/基础冷却 3 回合；品质提升可能缩短冷却/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '回春术，冷却 2 回合' })).toBeDisabled();
  });
  it('keeps six silhouette variants code-native and descriptive names escaped', () => {
    const rendered = render(<TowerEnemyArt name="荒原狼" />); const signatures = new Set<string>();
    for (const name of ['荒原狼', '石甲蜥', '幽蛛', '蛟龙', '青雀', '妖卫']) { rendered.rerender(<TowerEnemyArt name={name} />); signatures.add(screen.getByRole('img').innerHTML); }
    expect(signatures.size).toBe(6);
    rendered.rerender(<TowerEnemyArt name={'<img src=x onerror=alert(1)>'} />); expect(rendered.container.querySelector('img')).toBeNull();
  });

  it('uses actual cooldown, remaining turns and selected live enemy for combat actions', () => {
    const onAction = vi.fn().mockResolvedValue(true); const catalog = towerCatalog(); const battle = towerBattle();
    const rendered = render(<DemonTowerBattle battle={battle} catalog={catalog} disabled={false} onAction={onAction} />);
    expect(screen.getByRole('button', { name: `${catalog.skills[0].name}，冷却 2 回合` })).toBeDisabled();
    expect(screen.getByText('力之祝福 · 2 回合')).toBeTruthy(); expect(screen.getByText('护盾 12')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: '当前攻击目标' }), { target: { value: 'enemy-b' } });
    fireEvent.click(screen.getByRole('button', { name: '普通攻击' })); expect(onAction).toHaveBeenLastCalledWith({ kind: 'attack', payload: { targetId: 'enemy-b' } });
    fireEvent.click(screen.getByRole('button', { name: catalog.skills[1].name })); expect(onAction).toHaveBeenLastCalledWith({ kind: 'skill', payload: { skillId: 's2', targetId: 'enemy-b' } });
    rendered.rerender(<DemonTowerBattle battle={{ ...battle, enemies: battle.enemies.map((enemy) => enemy.id === 'enemy-b' ? { ...enemy, hp: 0 } : enemy) }} catalog={catalog} disabled={false} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: '普通攻击' })); expect(onAction).toHaveBeenLastCalledWith({ kind: 'attack', payload: { targetId: 'enemy-a' } });
  });
  it('shows the remaining daily wallet allowance instead of promising an uncapped reward', () => {
    const profile = towerProfile(); const props = { catalog: towerCatalog(), disabled: false, onAction: vi.fn() };
    const rendered = render(<DemonTowerDaily {...props} profile={{ ...profile, daily: { ...profile.daily, officeCoinsEarned: 190 } }} />);
    expect(screen.getByRole('heading', { name: '完成日常，最多获得 10 办公币' })).toBeTruthy();
    rendered.rerender(<DemonTowerDaily {...props} profile={{ ...profile, daily: { ...profile.daily, officeCoinsEarned: 200 } }} />);
    expect(screen.getByRole('heading', { name: '今日日常办公币额度已用完' })).toBeTruthy();
    rendered.rerender(<DemonTowerDaily {...props} profile={{ ...profile, daily: { ...profile.daily, rewardClaimed: true } }} />);
    expect(screen.getByRole('heading', { name: '今日活跃奖励已结算' })).toBeTruthy();
  });

  it('confirms fleeing and never mutates just by opening the confirmation', async () => {
    const onAction = vi.fn().mockResolvedValue(true); render(<DemonTowerBattle battle={towerBattle()} catalog={towerCatalog()} disabled={false} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: '撤离战斗' })); const dialog = screen.getByRole('dialog', { name: '确认撤离' });
    expect(onAction).not.toHaveBeenCalled(); expect(within(dialog).getByText(/探索体力不会退还/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '确认撤离' })); await waitFor(() => expect(onAction).toHaveBeenCalledWith({ kind: 'flee', payload: {} }));
  });

  it('escapes synthetic combat text instead of injecting markup', () => {
    const { container } = render(<TowerCombatLog entries={[{ turn: 1, actor: 'enemy', kind: 'damage', text: '<img src=x onerror=alert(1)>' }]} />);
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>'); expect(container.querySelector('img')).toBeNull();
  });

  it('allows a luck main hand and explicitly removes the same auxiliary artifact in the draft', async () => {
    const onAction = vi.fn().mockResolvedValue(true); render(<DemonTowerInventory profile={towerProfile()} catalog={towerCatalog()} disabled={false} onAction={onAction} />);
    fireEvent.click(within(weaponCard('w17')).getByRole('button', { name: '选作主手' }));
    expect(screen.getByRole('alert').textContent).toContain('从辅助槽位卸下'); expect(onAction).not.toHaveBeenCalled();
    expect(within(weaponCard('w17')).getByRole('button', { name: '主手不可重复' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '保存配装' }));
    await waitFor(() => expect(onAction).toHaveBeenCalledWith({ kind: 'equip', payload: { mainHand: 'w17', artifact: null, activeSkills: ['s1', 's2', 's3'], passiveSkills: [] } }));
  });

  it('keeps full 20-weapon and 16-skill catalogs inspectable without granting unowned items', () => {
    render(<DemonTowerInventory profile={towerProfile()} catalog={towerCatalog()} disabled={false} onAction={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '查看完整图鉴' })); expect(screen.getAllByRole('article')).toHaveLength(20);
    expect(within(weaponCard('w2')).getByRole('button', { name: /选作主手|需要 Lv/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '技能' })); expect(screen.getAllByRole('article')).toHaveLength(16);
  });

  it('uses duplicate copies before bound materials in an explicit upgrade confirmation', async () => {
    const onAction = vi.fn().mockResolvedValue(true); render(<DemonTowerInventory profile={towerProfile({ materials: { ore: 0, herb: 0, soul: 0, clue: 0 } })} catalog={towerCatalog()} disabled={false} onAction={onAction} />);
    fireEvent.click(within(weaponCard('w5')).getByRole('button', { name: '品质强化' }));
    const dialog = screen.getByRole('dialog'); expect(within(dialog).getByText(/消耗同名副本 ×1/)).toBeTruthy(); expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: '确认强化至 +2' }));
    await waitFor(() => expect(onAction).toHaveBeenCalledWith({ kind: 'upgrade', payload: { itemType: 'weapon', itemId: 'w5' } }));
  });

  it('blocks material-poor upgrades and does not offer a payment shortcut', () => {
    render(<DemonTowerInventory profile={towerProfile({ materials: { ore: 0, herb: 0, soul: 0, clue: 0 } })} catalog={towerCatalog()} disabled={false} onAction={vi.fn()} />);
    fireEvent.click(within(weaponCard('w1')).getByRole('button', { name: '品质强化' })); const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: '确认强化至 +2' })).toBeDisabled(); expect(dialog.textContent).toContain('当前绑定材料不足'); expect(dialog.textContent).not.toMatch(/充值|购买/);
  });

  it('does not silently overwrite a dirty loadout when another tab saved a different one', () => {
    const profile = towerProfile(); const onAction = vi.fn(); const rendered = render(<DemonTowerInventory profile={profile} catalog={towerCatalog()} disabled={false} onAction={onAction} />);
    fireEvent.click(within(weaponCard('w5')).getByRole('button', { name: '选作主手' }));
    rendered.rerender(<DemonTowerInventory profile={{ ...profile, version: 2, loadout: { ...profile.loadout, artifact: null } }} catalog={towerCatalog()} disabled={false} onAction={onAction} />);
    expect(screen.getByRole('alert').textContent).toContain('其他页面发生变化'); expect(screen.getByRole('button', { name: '保存配装' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '读取最新配装' })); expect(screen.queryByRole('alert')).toBeNull(); expect(screen.getByRole('button', { name: '保存配装' })).toBeDisabled();
  });
  it('treats active skill priority changes as meaningful and keeps exact order in the save', async () => {
    const onAction = vi.fn().mockResolvedValue(true); const catalog = towerCatalog();
    render(<DemonTowerInventory profile={towerProfile()} catalog={catalog} disabled={false} onAction={onAction} />);
    expect(screen.getByRole('button', { name: '保存配装' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: `${catalog.skills.find((skill) => skill.id === 's2')!.name}优先级上移` }));
    expect(screen.getByRole('button', { name: '保存配装' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '保存配装' }));
    await waitFor(() => expect(onAction).toHaveBeenCalledWith({ kind: 'equip', payload: { mainHand: 'w1', artifact: 'w17', activeSkills: ['s2', 's1', 's3'], passiveSkills: [] } }));
  });

  it('checks contribution quantity, bound materials and phase before sending', async () => {
    const onAction = vi.fn().mockResolvedValue(true);
    wrap(<DemonTowerWorld world={towerWorld({ phase: 'passage' })} profile={towerProfile()} catalog={towerCatalog()} ownerId={TOWER_TEST_USER.publicId} disabled={false} onAction={onAction} />);
    await screen.findByText('建设与伤害分开记录。'); const quantity = screen.getByRole('textbox', { name: '提交数量' }); const submit = screen.getByRole('button', { name: '确认投入建设' });
    for (const value of ['0', '-1', '1.5', '1001', '31']) { fireEvent.change(quantity, { target: { value } }); expect(submit).toBeDisabled(); }
    fireEvent.change(quantity, { target: { value: '2' } }); fireEvent.click(submit); expect(onAction).toHaveBeenCalledWith({ kind: 'donate', payload: { floor: 1, material: 'ore', amount: 2 } });
  });

  it('disables boss actions when attempts, level, stamina or health are insufficient', async () => {
    const profile = towerProfile(); const rendered = wrap(<DemonTowerWorld world={towerWorld()} profile={profile} catalog={towerCatalog()} ownerId={TOWER_TEST_USER.publicId} disabled={false} onAction={vi.fn()} />);
    await screen.findByText('建设与伤害分开记录。'); expect(screen.getByRole('button', { name: /参与首领协作/ })).toBeEnabled();
    for (const next of [{ ...profile, hp: 0 }, { ...profile, stamina: 0 }, { ...profile, daily: { ...profile.daily, bossAttempts: 3 } }]) {
      rendered.rerender(<MemoryRouter><DemonTowerWorld world={towerWorld()} profile={next} catalog={towerCatalog()} ownerId={TOWER_TEST_USER.publicId} disabled={false} onAction={vi.fn()} /></MemoryRouter>);
      expect(screen.getByRole('button', { name: /参与首领协作/ })).toBeDisabled();
    }
  });

  it('prioritizes the actual exhausted daily boss allowance over other eligibility reasons', async () => {
    const profile = towerProfile({ hp: 0, stamina: 0, level: 1, battle: towerBattle() });
    profile.daily = { ...profile.daily, bossAttempts: 7, bossAttemptsMax: 7 };
    const onAction = vi.fn();
    wrap(<DemonTowerWorld world={towerWorld({ currentFloor: 2 })} profile={profile} catalog={towerCatalog()} ownerId={TOWER_TEST_USER.publicId} disabled onAction={onAction} />);
    await screen.findByText('建设与伤害分开记录。');
    expect(screen.getByText(/今日首领协作次数已用完/)).toHaveTextContent('7 / 7');
    expect(screen.queryByText(/请先达到本层 Lv/)).toBeNull();
    expect(screen.queryByText(/请先结束当前探索战斗/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /参与首领协作/ }));
    expect(onAction).not.toHaveBeenCalled();
  });

  it('explains the current unmet boss requirement using catalog values, without implying every requirement failed', async () => {
    const catalog = towerCatalog();
    catalog.rules.bossCost = 17;
    catalog.floors = catalog.floors.map((floor) => floor.floor === 1 ? { ...floor, requiredLevel: 8 } : floor);
    const base = towerProfile({ level: 8 });
    const onAction = vi.fn();
    const renderWorld = (profile = base, disabled = false) => <MemoryRouter><DemonTowerWorld world={towerWorld()} profile={profile} catalog={catalog} ownerId={TOWER_TEST_USER.publicId} disabled={disabled} onAction={onAction} /></MemoryRouter>;
    const result = render(renderWorld({ ...base, level: 7 }));
    await screen.findByText('建设与伤害分开记录。');
    expect(screen.getByText(/请先达到本层 Lv8/)).toBeTruthy();
    result.rerender(renderWorld({ ...base, battle: towerBattle(), availableActions: [] }));
    expect(screen.getByText(/请先结束当前探索战斗/)).toBeTruthy();
    result.rerender(renderWorld({ ...base, hp: 0 }));
    expect(screen.getByText(/当前生命为 0/)).toBeTruthy();
    result.rerender(renderWorld({ ...base, stamina: 16 }));
    expect(screen.getByText(/体力不足/)).toHaveTextContent('需要 17 体力，当前 16');
    result.rerender(renderWorld(base, true));
    expect(screen.getByText(/请先查看上方同步或只读状态/)).toBeTruthy();
    result.rerender(renderWorld(base));
    expect(screen.getByRole('button', { name: /参与首领协作/ })).toBeEnabled();
    expect(screen.queryByText(/请先查看上方同步或只读状态/)).toBeNull();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('keeps daily damage separate from construction and adds a private rank outside the public top 50', () => {
    const me = entry({ publicId: TOWER_TEST_USER.publicId, displayName: '我的榜外档案', rank: 88, bossDamage: 2, passageContribution: 999 });
    const { container } = render(<TowerContributionList entries={[entry()]} ownerId={TOWER_TEST_USER.publicId} daily me={me} />);
    expect(screen.getByText('我的榜外档案 · 我')).toBeTruthy(); expect(screen.getByText('88')).toBeTruthy(); expect(container.textContent).not.toContain('800'); expect(container.textContent).not.toContain('999'); expect(container.textContent).not.toContain('贡献分');
  });

  it('reads notification dates from the URL and synchronizes query history and reward standard', async () => {
    vi.mocked(communityDemonTowerApi.leaderboard).mockImplementation(async (date) => board({ serviceDate: date || '2026-09-09' }));
    wrap(<><DemonTowerLeaderboardPage /><RouteProbe /></>, '/games/demon-tower/leaderboard?date=2026-09-08');
    expect(await screen.findByText('冠军奖励标准 100 办公币')).toBeTruthy(); expect(screen.getByText(/本日奖励实际到账 0 办公币/)).toBeTruthy();
    expect(communityDemonTowerApi.leaderboard).toHaveBeenLastCalledWith('2026-09-08', expect.any(AbortSignal));
    fireEvent.change(screen.getByLabelText('查询日期'), { target: { value: '2026-09-07' } }); fireEvent.click(screen.getByRole('button', { name: '查询' }));
    await waitFor(() => expect(communityDemonTowerApi.leaderboard).toHaveBeenLastCalledWith('2026-09-07', expect.any(AbortSignal)));
    expect(screen.getByLabelText('当前位置')).toHaveTextContent('?date=2026-09-07');
    fireEvent.click(screen.getByRole('button', { name: '历史后退' })); await waitFor(() => expect(screen.getByLabelText('查询日期')).toHaveValue('2026-09-08'));
    fireEvent.click(screen.getByRole('button', { name: '历史前进' })); await waitFor(() => expect(screen.getByLabelText('查询日期')).toHaveValue('2026-09-07'));
  });

  it('rejects invalid calendar dates without issuing a ranking request', async () => {
    expect(towerDateValid('2026-02-30')).toBe(false); expect(towerDateValid('2028-02-29')).toBe(true); expect(towerDateValid('2026-9-9')).toBe(false);
    wrap(<DemonTowerLeaderboardPage />, '/games/demon-tower/leaderboard?date=2026-02-30');
    expect(await screen.findByRole('alert')).toHaveTextContent('日期格式不正确'); expect(communityDemonTowerApi.leaderboard).not.toHaveBeenCalled();
  });
  it('makes a hanging public ranking read retryable after 25 seconds', async () => {
    vi.useFakeTimers();
    vi.mocked(communityDemonTowerApi.leaderboard).mockImplementation((_, signal) => new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
    wrap(<DemonTowerLeaderboardPage />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(25_000); });
    expect(screen.getByRole('alert')).toHaveTextContent('榜单读取超时');
    expect(screen.getByRole('button', { name: '查询' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '重新读取' })).toBeEnabled();
  });

  it('drops an old account ranking response and never renders its private me row', async () => {
    const old = deferred<DemonTowerLeaderboard>(); const next = deferred<DemonTowerLeaderboard>();
    vi.mocked(communityDemonTowerApi.leaderboard).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    wrap(<DemonTowerLeaderboardPage />); await waitFor(() => expect(communityDemonTowerApi.leaderboard).toHaveBeenCalledOnce());
    act(() => { setCommunitySessionTokens('synthetic-ui-b'); useCommunityAuthStore.setState({ user: { ...TOWER_TEST_USER, publicId: 'tower-public-b' } }); });
    await waitFor(() => expect(communityDemonTowerApi.leaderboard).toHaveBeenCalledTimes(2));
    await act(async () => { old.resolve(board({ entries: [], me: entry({ publicId: TOWER_TEST_USER.publicId, displayName: '旧账号私人名次' }) })); });
    expect(screen.queryByText(/旧账号私人名次/)).toBeNull();
    await act(async () => { next.resolve(board()); }); expect(await screen.findByText('合成寻道者乙')).toBeTruthy();
  });

  it('owns modal DOM inside the workspace and releases the focus trap for Esc privacy cover', () => {
    const close = vi.fn(); const view = (covered: boolean) => <GamePrivacyProvider value={{ covered, toggleCover: null }}><div hidden={covered} data-testid="workspace"><TowerModal title="隔离详情" onClose={close}><input aria-label="本地配装草稿" defaultValue="草稿仍在" /><button>最后一个按钮</button></TowerModal></div></GamePrivacyProvider>;
    const rendered = render(view(false)); const dialog = screen.getByRole('dialog'); expect(screen.getByTestId('workspace').contains(dialog)).toBe(true); expect(document.body.style.overflow).toBe('hidden');
    const last = within(dialog).getByRole('button', { name: '最后一个按钮' }); last.focus(); fireEvent.keyDown(document, { key: 'Tab' }); expect(within(dialog).getByRole('button', { name: '关闭隔离详情' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' }); expect(close).not.toHaveBeenCalled();
    rendered.rerender(view(true)); expect(screen.queryByRole('dialog')).toBeNull(); expect(document.body.style.overflow).not.toBe('hidden');
    rendered.rerender(view(false)); expect(screen.getByRole('textbox', { name: '本地配装草稿' })).toHaveValue('草稿仍在');
  });
  it('reveals mobile controls beneath fixed tabs without scrolling safe controls or modal content', () => {
    const viewport = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
    const rendered = render(<><nav role="tablist" aria-label="妖塔工作区" /><button>被遮挡的操作</button><div role="dialog"><button>弹窗操作</button></div></>);
    const nav = screen.getByRole('tablist'); const target = screen.getByRole('button', { name: '被遮挡的操作' });
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue({ top: 679 } as DOMRect);
    const rect = vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 704, bottom: 770, width: 100, height: 66 } as DOMRect);
    target.scrollIntoView = vi.fn(); revealTowerControl(target); expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'instant' });
    vi.mocked(target.scrollIntoView).mockClear(); rect.mockReturnValue({ top: 410, bottom: 476, width: 100, height: 66 } as DOMRect);
    revealTowerControl(target); expect(target.scrollIntoView).not.toHaveBeenCalled();
    const modalButton = screen.getByRole('button', { name: '弹窗操作' }); modalButton.scrollIntoView = vi.fn();
    revealTowerControl(modalButton); expect(modalButton.scrollIntoView).not.toHaveBeenCalled();
    rendered.unmount(); viewport.mockRestore();
  });
});
