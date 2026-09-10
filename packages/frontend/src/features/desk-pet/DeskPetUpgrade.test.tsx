import { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeskPetProvider, petImageKey, readPet, useDeskPet } from './DeskPetContext';
import { DeskPetSession, DeskPet } from './DeskPet';
import { DeskPetPage } from './DeskPetPage';
import { DEFAULT_PET, petStorageKey } from './pet-model';
import { exportPet, importPet } from './pet-backup';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../app/store/community-auth-store';
import { TOWER_TEST_USER } from '../games/demon-tower/test-fixtures';

const png = 'data:image/png;base64,iVBORw0KGgo=';
const other = 'data:image/png;base64,iVBORw0KGg==';
describe('workspace pet upgrade regressions', () => {
  beforeEach(() => { localStorage.clear(); resetCommunityAuthStoreForTests(); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });
  it('preserves tool input and a single mount across bootstrap/login/logout while clearing private pet UI', async () => {
    const mounted = vi.fn();
    function Tool() { const [value, setValue] = useState(''); useEffect(() => { mounted(); }, []); return <input aria-label="工具草稿" value={value} onChange={e => setValue(e.target.value)} />; }
    vi.spyOn(useCommunityAuthStore.getState(), 'restoreSession').mockResolvedValue(undefined);
    render(<MemoryRouter><DeskPetSession><Tool /><DeskPetPage /></DeskPetSession></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('工具草稿'), { target: { value: '保留计时和输入' } });
    for (const phase of ['active', 'guest', 'active'] as const) {
      act(() => useCommunityAuthStore.setState({ phase, user: phase === 'active' ? TOWER_TEST_USER : null }));
      expect(screen.getByLabelText('工具草稿')).toHaveValue('保留计时和输入');
    }
    expect(mounted).toHaveBeenCalledOnce();
  });
  it('lazily splits old picture storage and never rewrites it for names/position/style', () => {
    localStorage.setItem(petStorageKey('guest'), JSON.stringify({ ...DEFAULT_PET, image: png, pixelImage: png }));
    render(<MemoryRouter><DeskPetProvider owner="guest"><DeskPetPage /></DeskPetProvider></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('搭子名字'), { target: { value: '新名字' } });
    expect(readPet('guest').prefs).toMatchObject({ image: png, name: '新名字' });
    expect(localStorage.getItem(petStorageKey('guest'))).not.toContain(png);
    const set = vi.spyOn(Storage.prototype, 'setItem');
    fireEvent.change(screen.getByLabelText('搭子名字'), { target: { value: '再改名字' } });
    fireEvent.click(screen.getByRole('button', { name: /黑白纸片/ }));
    expect(set.mock.calls.every(([key, value]) => key !== petImageKey('guest') && !value.includes(png))).toBe(true);
  });
  it('restores the last saved image if the second storage write fails', () => {
    localStorage.setItem(petStorageKey('guest'), JSON.stringify({ ...DEFAULT_PET, separateImages: true }));
    localStorage.setItem(petImageKey('guest'), JSON.stringify({ ...DEFAULT_PET, image: png, pixelImage: png }));
    function Control() { const { update } = useDeskPet(); return <button onClick={() => update({ image: other, pixelImage: other })}>换图片</button>; }
    render(<DeskPetProvider owner="guest"><Control /></DeskPetProvider>);
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) { if (key === petStorageKey('guest')) throw new Error('full'); original.call(this, key, value); });
    fireEvent.click(screen.getByText('换图片'));
    expect(readPet('guest').prefs.image).toBe(png);
  });
  it('does not let an old owner callback overwrite either account after a switch', () => {
    let oldUpdate!: ReturnType<typeof useDeskPet>['update'];
    function Control() { const ctx = useDeskPet(); if (ctx.owner === 'a') oldUpdate = ctx.update; return <p>{ctx.prefs.name}</p>; }
    const result = render(<DeskPetProvider owner="a"><Control /></DeskPetProvider>);
    result.rerender(<DeskPetProvider owner="b"><Control /></DeskPetProvider>);
    act(() => oldUpdate({ name: '泄漏' }));
    expect(localStorage.getItem(petStorageKey('a'))).toBeNull(); expect(localStorage.getItem(petStorageKey('b'))).toBeNull(); expect(screen.queryByText('泄漏')).toBeNull();
  });
  it('avoids focused text inputs without changing saved visibility', async () => {
    localStorage.setItem(petStorageKey('guest'), JSON.stringify({ ...DEFAULT_PET, enabled: true }));
    render(<MemoryRouter><DeskPetProvider owner="guest"><input aria-label="正文" /><DeskPet /></DeskPetProvider></MemoryRouter>);
    act(() => screen.getByLabelText('正文').focus());
    expect(screen.queryByRole('complementary')).toBeNull();
    act(() => screen.getByLabelText('正文').blur());
    await waitFor(() => expect(screen.getByRole('complementary')).toBeVisible());
    expect(readPet('guest').prefs.enabled).toBe(true);
  });
  it('validates backup format, bounds and restores disabled without account or asset data', async () => {
    const content = exportPet({ ...DEFAULT_PET, enabled: true, position: { x: 1, y: 1 }, name: '备份搭子' });
    const file = { size: content.length, text: async () => content } as File;
    expect(await importPet(file)).toMatchObject({ name: '备份搭子', enabled: false, position: null });
    for (const content of ['null', '{}', '{"format":"desk-buddy-backup","version":9}', 'bad']) await expect(importPet({ size: 100, text: async () => content } as File)).rejects.toThrow();
    await expect(importPet({ size: 900_000 } as File)).rejects.toThrow(/820 KB/);
    expect(content).not.toMatch(/account|wallet|publicId|token/);
  });
});
