import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import {UnderrunPage} from './UnderrunPage';
import {announceLocalGameForeground} from '../game-input';
const mocks=vi.hoisted(()=>({identity:'a',create:vi.fn(),ready:Promise.resolve(),resume:vi.fn(),pause:vi.fn(),dispose:vi.fn(),key:vi.fn(),pointer:vi.fn()}));
vi.mock('./runtime',()=>({createUnderrunRuntime:mocks.create}));
vi.mock('../../../app/store/community-auth-store',()=>({useCommunityAuthStore:(select:(s:unknown)=>unknown)=>select({phase:'authenticated',user:{publicId:mocks.identity}})}));
beforeEach(()=>{vi.clearAllMocks();mocks.identity='a';mocks.ready=Promise.resolve();mocks.create.mockImplementation(()=>mocks);});
const page=()=>render(<MemoryRouter><UnderrunPage/></MemoryRouter>);
describe('Underrun controlled local work draft lifecycle',()=>{
 it('does not initialize a graphics runtime until explicitly opened',()=>{page();expect(mocks.create).not.toHaveBeenCalled();expect(screen.getByText(/不计官方排行榜/)).toBeInTheDocument();});
 it('starts locally, scopes input, pauses on Esc and disposes on route unmount',async()=>{const view=page();fireEvent.click(screen.getByRole('button',{name:'继续巡检'}));await waitFor(()=>expect(mocks.resume).toHaveBeenCalledOnce());fireEvent.keyDown(document,{key:'w'});expect(mocks.key).not.toHaveBeenCalled();const c=screen.getByLabelText(/机房巡检画布/);fireEvent.keyDown(c,{key:'w'});expect(mocks.key).toHaveBeenCalledWith(87,true);fireEvent.keyDown(c,{key:'Escape'});expect(mocks.pause).toHaveBeenCalled();view.unmount();expect(mocks.dispose).toHaveBeenCalledOnce();});
 it('does not resume if focus was lost while assets were still loading',async()=>{let resolve!:()=>void;mocks.ready=new Promise<void>(r=>{resolve=r;});page();fireEvent.click(screen.getByRole('button',{name:'继续巡检'}));await waitFor(()=>expect(mocks.create).toHaveBeenCalled());fireEvent.blur(window);resolve();await waitFor(()=>expect(screen.getByRole('button',{name:'继续巡检'})).not.toBeDisabled());expect(mocks.resume).not.toHaveBeenCalled();});
 it('pauses on competing game, and destroys previous account graphics on identity change',async()=>{const view=page();fireEvent.click(screen.getByRole('button',{name:'继续巡检'}));await waitFor(()=>expect(mocks.resume).toHaveBeenCalled());announceLocalGameForeground('ballpoint');await waitFor(()=>expect(mocks.pause).toHaveBeenCalled());mocks.identity='b';view.rerender(<MemoryRouter><UnderrunPage/></MemoryRouter>);expect(mocks.dispose).toHaveBeenCalled();expect(screen.getByText('巡检记录已收起')).toBeInTheDocument();});
 it('handles unavailable WebGL as a recoverable status rather than crashing the website',async()=>{mocks.create.mockImplementation(()=>{throw new Error('no WebGL');});page();fireEvent.click(screen.getByRole('button',{name:'继续巡检'}));expect(await screen.findByRole('button',{name:'重新尝试'})).toBeInTheDocument();});
});
