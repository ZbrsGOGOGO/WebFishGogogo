import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fishProgressView } from '@stealth-reader/shared';
import { DEFAULT_PET, parsePet, petBounds, petFocusPath, petStorageKey, preparePetImage, rasterDimensions } from './pet-model';
import { DeskPetProvider } from './DeskPetContext';
import { DeskPet, DeskPetSession } from './DeskPet';
import { DeskPetPage } from './DeskPetPage';
import { FISH_EVENT } from '../community-progression/useFishActivity';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../app/store/community-auth-store';
import { TOWER_TEST_USER } from '../games/demon-tower/test-fixtures';

const png = 'data:image/png;base64,iVBORw0KGgo=';
const show = (path = '/desk-pet', owner = 'guest') => render(<MemoryRouter initialEntries={[path]}><DeskPetProvider owner={owner}><DeskPetPage /><DeskPet /></DeskPetProvider></MemoryRouter>);
const header = (w = 256, h = 256): Uint8Array => {
  const bytes = new Uint8Array(32); bytes.set([137,80,78,71,13,10,26,10]); bytes.set([73,72,68,82],12);
  const view = new DataView(bytes.buffer); view.setUint32(16,w); view.setUint32(20,h); return bytes;
};
describe('desk pet local format and image boundaries', () => {
  afterEach(() => vi.restoreAllMocks());
  it('starts disabled and rejects corrupt/version-mismatched storage', () => {
    for (const value of [null, 'oops', '{}', 'null', JSON.stringify({ ...DEFAULT_PET, version: 2 }), 'x'.repeat(810001)]) expect(parsePet(value)).toEqual(DEFAULT_PET);
  });
  it('validates numbers, styles, names and forbids remote/SVG URLs', () => {
    const result = parsePet(JSON.stringify({ ...DEFAULT_PET, name: 'a'.repeat(60), size: 900, style: 'javascript', preset: 'bad', image: 'https://example.com/private.jpg', pixelImage: png, position: { x: -100, y: 88 } }));
    expect(result).toMatchObject({ name: 'a'.repeat(16), size: 144, style: 'sticker', preset: 'fish', image: null, pixelImage: null, position: { x: 0, y: 1 } });
    expect(parsePet(JSON.stringify({ ...DEFAULT_PET, image: 'data:image/svg+xml,<svg/>', pixelImage: png })).image).toBeNull();
    expect(parsePet(JSON.stringify({ ...DEFAULT_PET, image: png, pixelImage: png })).image).toBe(png);
    expect(petStorageKey('user:a')).not.toBe(petStorageKey('guest'));
  });
  it('checks PNG/JPEG/WebP headers and limits before decoding', () => {
    expect(rasterDimensions(header())).toEqual({ width: 256, height: 256, mime: 'image/png' });
    const jpeg = new Uint8Array([255,216,255,192,0,17,8,0,40,0,32,3,1,0,0,2,0,0,3,0,0]);
    expect(rasterDimensions(jpeg)).toEqual({ width: 32, height: 40, mime: 'image/jpeg' });
    const webp = new Uint8Array(30); webp.set(new TextEncoder().encode('RIFF'),0); webp.set(new TextEncoder().encode('WEBPVP8X'),8); webp[24]=31; webp[27]=39;
    expect(rasterDimensions(webp)).toEqual({ width: 32, height: 40, mime: 'image/webp' });
    webp[20]=2; expect(() => rasterDimensions(webp)).toThrow(/动画/);
    for (const invalid of [header(9000,1), header(4096,4096), header(0,5), new TextEncoder().encode('<svg onload="alert(1)"/>'), new Uint8Array([255,216,255])]) expect(() => rasterDimensions(invalid)).toThrow();
  });
  it('rejects empty and oversized input without decoding', async () => {
    await expect(preparePetImage(new File([], 'empty.png'))).rejects.toThrow(/4 MB/);
    await expect(preparePetImage(new File([new Uint8Array(4*1024*1024+1)], 'huge.png'))).rejects.toThrow(/4 MB/);
  });
  it('normalizes to two PNG sizes and always releases source blob URLs', async () => {
    const create = vi.fn(() => 'blob:synthetic'), revoke = vi.fn();
    vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = revoke; });
    class FakeImage { naturalWidth=200; naturalHeight=100; onload: (()=>void)|null=null; onerror: (()=>void)|null=null; set src(value: string) { if (value) queueMicrotask(() => this.onload?.()); } }
    vi.stubGlobal('Image', FakeImage);
    const draw = vi.fn(); vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({ drawImage: draw } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue(png);
    const file = { size: 100, type: 'image/png', slice: () => ({ arrayBuffer: async () => header().buffer }) } as unknown as File;
    expect(await preparePetImage(file)).toEqual({ image: png, pixelImage: png }); expect(draw).toHaveBeenCalledTimes(2);
    expect(draw.mock.calls[0].slice(1)).toEqual([0,64,256,128]); expect(draw.mock.calls[1].slice(1)).toEqual([0,8,32,16]);
    expect(revoke).toHaveBeenCalledWith('blob:synthetic');
    await expect(preparePetImage({ ...file, type: 'image/svg+xml' } as File)).rejects.toThrow(/格式/);
    vi.unstubAllGlobals();
  });
  it('clamps layout and identifies focus-sensitive paths', () => {
    expect(petBounds(390,844,144)).toEqual({ left:8, top:88, width:206, height:460 });
    expect(petBounds(100,200,144)).toMatchObject({ width:0,height:0 });
    for (const path of ['/games','/games/rooms/a','/tower-defense','/messages','/community/chat/office']) expect(petFocusPath(path)).toBe(true);
    for (const path of ['/desk-pet','/tools','/community','/me']) expect(petFocusPath(path)).toBe(false);
  });
});

describe('desk pet privacy, settings and interactions', () => {
  beforeEach(() => { localStorage.clear(); resetCommunityAuthStoreForTests(); vi.spyOn(document,'hidden','get').mockReturnValue(false); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
  it('is opt-in, supports interaction/sleep/collapse and persists reload', () => {
    const result = show(); expect(screen.queryByRole('complementary', { name: '我的工位搭子' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'领养到我的工位'}));
    fireEvent.click(screen.getByRole('button',{name:/摸摸摸摸/})); expect(screen.getByRole('status')).toHaveTextContent('劳逸结合');
    fireEvent.click(screen.getByRole('button',{name:'喂食'})); expect(screen.getByRole('status')).toHaveTextContent('不花办公币');
    fireEvent.click(screen.getByRole('button',{name:'睡觉'})); expect(screen.getByRole('button',{name:'喂食'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'叫醒'})); expect(screen.getByRole('button',{name:'喂食'})).toBeEnabled();
    fireEvent.change(screen.getByLabelText('搭子名字'),{target:{value:'小鱼同事'}});
    fireEvent.click(screen.getByRole('button',{name:'收起工位搭子'})); expect(screen.getByRole('link',{name:/已收起/})).toBeVisible();
    result.unmount(); show(); expect(screen.getByLabelText('搭子名字')).toHaveValue('小鱼同事');
    fireEvent.click(screen.getByRole('button',{name:'召回桌宠'})); expect(screen.getByRole('complementary',{name:'我的工位搭子'})).toBeVisible();
    fireEvent.click(screen.getByRole('button',{name:'关闭桌宠'})); expect(screen.queryByRole('link',{name:/已收起/})).not.toBeInTheDocument();
  });
  it('renders four styles and three presets without any network calls', () => {
    const network = vi.spyOn(globalThis,'fetch'); show();
    for (const name of ['原图贴纸','像素搭子','黑白纸片','拍立得']) { const button = screen.getByRole('button',{name:new RegExp(name)}); fireEvent.click(button); expect(button).toHaveAttribute('aria-pressed','true'); }
    fireEvent.click(screen.getByRole('button',{name:'打工喵'})); expect(parsePet(localStorage.getItem(petStorageKey('guest'))).preset).toBe('cat');
    expect(network).not.toHaveBeenCalled();
  });
  it('reports persistence failures instead of claiming saved', () => {
    show(); vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => { throw new DOMException('full','QuotaExceededError'); });
    fireEvent.change(screen.getByLabelText('搭子名字'),{target:{value:'临时搭子'}});
    expect(screen.getByRole('alert')).toHaveTextContent('刷新后可能丢失'); expect(screen.getByLabelText('搭子名字')).toHaveValue('临时搭子');
  });
  it('requires confirmation and clears only this pet archive', () => {
    localStorage.setItem('other-user-data','keep'); show(); fireEvent.click(screen.getByRole('button',{name:'领养到我的工位'}));
    fireEvent.click(screen.getByText('互动、隐私与清除')); fireEvent.click(screen.getByRole('button',{name:'清除本机桌宠数据'}));
    expect(localStorage.getItem(petStorageKey('guest'))).not.toBeNull(); fireEvent.click(screen.getByRole('button',{name:'确认清除桌宠数据'}));
    expect(localStorage.getItem(petStorageKey('guest'))).toBeNull(); expect(localStorage.getItem('other-user-data')).toBe('keep');
  });
  it('hides by default in games/chat and can explicitly opt out', () => {
    localStorage.setItem(petStorageKey('guest'),JSON.stringify({...DEFAULT_PET,enabled:true})); show('/messages');
    expect(screen.queryByRole('complementary',{name:'我的工位搭子'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/专注避让/)); expect(screen.getByRole('complementary',{name:'我的工位搭子'})).toBeVisible();
    vi.spyOn(document,'hidden','get').mockReturnValue(true); fireEvent(document,new Event('visibilitychange'));
    expect(screen.queryByRole('complementary',{name:'我的工位搭子'})).not.toBeInTheDocument();
  });
  it('supports keyboard movement/escape and syncs matching storage changes', () => {
    show(); fireEvent.click(screen.getByRole('button',{name:'领养到我的工位'}));
    fireEvent.keyDown(screen.getByRole('button',{name:/摸摸摸摸/}),{key:'ArrowLeft'});
    expect(parsePet(localStorage.getItem(petStorageKey('guest'))).position?.x).toBeLessThan(1);
    fireEvent.keyDown(screen.getByRole('button',{name:/摸摸摸摸/}),{key:'Escape'}); expect(screen.getByRole('link',{name:/已收起/})).toBeVisible();
    fireEvent(window,new StorageEvent('storage',{key:petStorageKey('someone-else'),newValue:JSON.stringify({...DEFAULT_PET,name:'wrong'}),storageArea:localStorage}));
    expect(screen.getByLabelText('搭子名字')).toHaveValue('摸摸');
    fireEvent(window,new StorageEvent('storage',{key:petStorageKey('guest'),newValue:null,storageArea:localStorage}));
    expect(screen.queryByRole('link',{name:/已收起/})).not.toBeInTheDocument();
  });
  it('celebrates only subsequent own-account rank increases, not grants or first load', () => {
    localStorage.setItem(petStorageKey('user:one'),JSON.stringify({...DEFAULT_PET,enabled:true})); show('/desk-pet','user:one');
    const event = (owner:string, xp:number) => fireEvent(window,new CustomEvent(FISH_EVENT,{detail:{owner,progress:fishProgressView(xp)}}));
    event('one',1); expect(screen.queryByRole('status')).not.toBeInTheDocument(); event('else',600); expect(screen.queryByRole('status')).not.toBeInTheDocument();
    event('one',120); expect(screen.getByRole('status')).toHaveTextContent('摸鱼小将');
    expect(parsePet(localStorage.getItem(petStorageKey('user:one')))).toEqual({...DEFAULT_PET,enabled:true});
  });
  it('unmounts private pictures instantly on account switch/logout', async () => {
    useCommunityAuthStore.setState({phase:'active',user:TOWER_TEST_USER});
    localStorage.setItem(petStorageKey(`user:${TOWER_TEST_USER.publicId}`),JSON.stringify({...DEFAULT_PET,enabled:true,name:'仅我的搭子',image:png,pixelImage:png}));
    render(<MemoryRouter><DeskPetSession><DeskPetPage /></DeskPetSession></MemoryRouter>);
    expect(screen.getByLabelText('搭子名字')).toHaveValue('仅我的搭子');
    act(() => useCommunityAuthStore.setState({phase:'guest',user:null}));
    await waitFor(() => expect(screen.getByLabelText('搭子名字')).toHaveValue('摸摸'));
    expect(document.querySelector(`img[src="${png}"]`)).toBeNull();
  });
});
