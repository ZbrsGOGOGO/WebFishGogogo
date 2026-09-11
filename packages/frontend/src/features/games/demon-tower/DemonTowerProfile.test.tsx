import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMON_TOWER_APPEARANCE_OPTIONS, DEMON_TOWER_APPEARANCE_SLOTS, DEMON_TOWER_DEFAULT_APPEARANCE, type DemonTowerAppearance } from '@stealth-reader/shared';
import { GamePrivacyProvider } from '../GamePrivacyContext';
import { DemonTowerAppearancePanel, DemonTowerPower } from './DemonTowerProfile';
import { TowerPortrait } from './DemonTowerArt';
import { towerProfile } from './test-fixtures';

const session = vi.hoisted(() => ({ generation: 1 }));
vi.mock('../../../api/community-http', () => ({ getCommunitySessionGeneration: () => session.generation }));
const profile = () => towerProfile({ appearance: { ...DEMON_TOWER_DEFAULT_APPEARANCE }, availableActions: ['set_appearance'] });
const props = () => ({ profile: profile(), ownerId: 'alice', name: '寻道者甲', disabled: false, showSkins: false, onAction: vi.fn().mockResolvedValue(true) });
const open = () => { fireEvent.click(screen.getByRole('button', { name: '编辑人物形象' })); return screen.getByRole('dialog', { name: '编辑人物形象' }); };

describe('Demon tower appearance and loadout reference', () => {
  beforeEach(() => { session.generation = 1; });
  afterEach(() => { vi.restoreAllMocks(); });
  it('previews all eight closed slots and submits exactly one explicitly saved appearance', async () => {
    const value = props(); render(<DemonTowerAppearancePanel {...value} />);
    const dialog = open(); expect(within(dialog).getAllByRole('combobox')).toHaveLength(8);
    expect(within(dialog).getByRole('button', { name: '保存形象' })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('帽子'), { target: { value: 'conical' } });
    fireEvent.change(within(dialog).getByLabelText('手持'), { target: { value: 'fan' } });
    expect(dialog.querySelector('[data-appearance-slot="hat"]')).toHaveAttribute('data-value', 'conical');
    expect(dialog.querySelector('[data-appearance-slot="held"]')).toHaveAttribute('data-value', 'fan');
    expect(value.onAction).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: '保存形象' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(value.onAction).toHaveBeenCalledExactlyOnceWith({ kind: 'set_appearance', payload: { appearance: { ...DEMON_TOWER_DEFAULT_APPEARANCE, hat: 'conical', held: 'fan' } } });
  });
  it('randomize/default/cancel never mutate a profile and profile polling never overwrites an unsaved draft', () => {
    const value = props(); const { rerender } = render(<DemonTowerAppearancePanel {...value} />);
    let dialog = open(); vi.spyOn(Math, 'random').mockReturnValue(.99);
    fireEvent.click(within(dialog).getByRole('button', { name: '随机搭配' }));
    expect(within(dialog).getByLabelText('帽子')).toHaveValue('helmet');
    rerender(<DemonTowerAppearancePanel {...value} profile={{ ...value.profile, version: 2 }} />);
    expect(within(dialog).getByLabelText('帽子')).toHaveValue('helmet');
    fireEvent.click(within(dialog).getByRole('button', { name: '预览默认形象' }));
    expect(within(dialog).getByLabelText('帽子')).toHaveValue('none');
    fireEvent.change(within(dialog).getByLabelText('帽子'), { target: { value: 'straw' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    dialog = open(); expect(within(dialog).getByLabelText('帽子')).toHaveValue('none');
    expect(value.onAction).not.toHaveBeenCalled(); expect(value.profile.appearance).toEqual(DEMON_TOWER_DEFAULT_APPEARANCE);
  });
  it('retains an unsuccessful save draft and never automatically retries', async () => {
    const value = props(); value.onAction.mockResolvedValue(false); render(<DemonTowerAppearancePanel {...value} />);
    const dialog = open(); fireEvent.change(within(dialog).getByLabelText('上衣'), { target: { value: 'armor' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存形象' }));
    await screen.findByRole('alert'); expect(within(dialog).getByLabelText('上衣')).toHaveValue('armor');
    expect(value.onAction).toHaveBeenCalledTimes(1);
  });
  it('does not display or reuse drafts and late saves after a switch to another account', async () => {
    let resolveSave!: (ok: boolean) => void;
    const value = props(); value.onAction.mockImplementation(() => new Promise<boolean>(resolve => { resolveSave = resolve; }));
    const { rerender } = render(<DemonTowerAppearancePanel {...value} />); let dialog = open();
    fireEvent.change(within(dialog).getByLabelText('帽子'), { target: { value: 'official' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存形象' }));
    const other = { ...value, ownerId: 'bob', name: '寻道者乙', onAction: vi.fn() };
    rerender(<DemonTowerAppearancePanel {...other} />); expect(screen.queryByRole('dialog')).toBeNull();
    dialog = open(); fireEvent.change(within(dialog).getByLabelText('帽子'), { target: { value: 'straw' } });
    await act(async () => resolveSave(true));
    expect(dialog).toBeVisible(); expect(within(dialog).getByLabelText('帽子')).toHaveValue('straw');
    expect(other.onAction).not.toHaveBeenCalled();
  });
  it('drops old-session drafts even when the public account id stays the same', () => {
    const value = props(); const { rerender } = render(<DemonTowerAppearancePanel {...value} />); open();
    session.generation = 2; rerender(<DemonTowerAppearancePanel {...value} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('can close an in-flight save, but a late completion does not reopen the editor', async () => {
    let resolveSave!: (ok: boolean) => void; const value = props();
    value.onAction.mockImplementation(() => new Promise<boolean>(resolve => { resolveSave = resolve; }));
    render(<DemonTowerAppearancePanel {...value} />); const dialog = open();
    fireEvent.change(within(dialog).getByLabelText('脸型'), { target: { value: 'square' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存形象' }));
    expect(within(dialog).getByLabelText('脸型')).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: '收起编辑' }));
    await act(async () => resolveSave(false)); expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('keeps previews usable but saving disabled in read-only, battle or automatic-exploration state', () => {
    const value = props(); render(<DemonTowerAppearancePanel {...value} disabled />); const dialog = open();
    fireEvent.change(within(dialog).getByLabelText('发型'), { target: { value: 'bald' } });
    expect(within(dialog).getByRole('button', { name: '保存形象' })).toBeDisabled();
    expect(value.onAction).not.toHaveBeenCalled();
  });
  it('uses the existing workspace-owned modal and privacy-aware focus restoration', () => {
    const value = props();
    const { container, rerender } = render(<GamePrivacyProvider value={{ covered: false, toggleCover: null }}><DemonTowerAppearancePanel {...value} /></GamePrivacyProvider>);
    const trigger = screen.getByRole('button', { name: '编辑人物形象' }); trigger.focus(); const dialog = open();
    expect(container.contains(dialog)).toBe(true); expect(within(dialog).getByRole('button', { name: '关闭编辑人物形象' })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' })); expect(trigger).toHaveFocus();
    open(); rerender(<GamePrivacyProvider value={{ covered: true, toggleCover: null }}><DemonTowerAppearancePanel {...value} /></GamePrivacyProvider>);
    expect(document.body.style.overflow).not.toBe('hidden'); expect(value.onAction).not.toHaveBeenCalled();
  });
  it('renders every option using distinct trusted SVG shapes, without remote images or user markup', () => {
    const { container, rerender } = render(<TowerPortrait name="<script>" appearance={{ ...DEMON_TOWER_DEFAULT_APPEARANCE }} />);
    for (const slot of DEMON_TOWER_APPEARANCE_SLOTS) {
      const shapes = new Set<string>();
      for (const option of DEMON_TOWER_APPEARANCE_OPTIONS[slot]) {
        rerender(<TowerPortrait name="<script>" appearance={{ ...DEMON_TOWER_DEFAULT_APPEARANCE, [slot]: option.id } as DemonTowerAppearance} />);
        const part = container.querySelector(`[data-appearance-slot="${slot}"]`)!;
        expect(part).toHaveAttribute('data-value', option.id);
        shapes.add((part.getAttribute('fill') ?? '') + part.innerHTML + (slot === 'hair' ? container.querySelector('[data-hair-front]')!.innerHTML : ''));
      }
      expect(shapes.size).toBe(DEMON_TOWER_APPEARANCE_OPTIONS[slot].length);
    }
    expect(container.querySelector('script,image,foreignObject')).toBeNull();
  });
  it('shows server-derived parts and separates temporary power from the loadout reference', () => {
    render(<DemonTowerPower power={{ total: 400, base: 370, temporary: 30, parts: { level: 60, attributes: 200, weapons: 40, skills: 55, innates: 15 } }} />);
    expect(screen.getByText('400')).toBeVisible(); expect(screen.getByText('基础 370 · 临时增益 +30')).toBeVisible();
    fireEvent.click(screen.getByText('评分构成与适用范围'));
    expect(screen.getByText(/未装备的收藏不计分/)).toBeVisible(); expect(screen.getByText(/不是实测 DPS/)).toBeVisible();
  });
  it('does not fabricate a combat score for an older profile', () => {
    const { container } = render(<DemonTowerPower />); expect(container).toBeEmptyDOMElement();
  });
});
