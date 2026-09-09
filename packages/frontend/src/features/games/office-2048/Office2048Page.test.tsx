import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import {Office2048Page} from './Office2048Page';
import {announceLocalGameForeground} from '../game-input';
const auth=vi.hoisted(()=>({identity:'a'}));
vi.mock('../../../app/store/community-auth-store',()=>({useCommunityAuthStore:(select:(s:unknown)=>unknown)=>select({phase:'authenticated',user:{publicId:auth.identity}})}));
beforeEach(()=>{auth.identity='a';});
const page=()=>render(<MemoryRouter><Office2048Page/></MemoryRouter>);
describe('2048 scoped private local sheet',()=>{
 it('does not move before activation or from unrelated document keyboard input',()=>{page();fireEvent.keyDown(document,{key:'ArrowRight'});expect(screen.getByText('调整 0 次')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'继续整理'}));fireEvent.keyDown(document,{key:'ArrowRight'});expect(screen.getByText('调整 0 次')).toBeInTheDocument();});
 it('moves only the focused board, covers on Esc and competing foreground game',async()=>{page();fireEvent.click(screen.getByRole('button',{name:'继续整理'}));const board=screen.getByRole('group',{name:/数值棋盘/});fireEvent.keyDown(board,{key:'ArrowRight'});expect(screen.queryByText('工作记录已收起')).not.toBeInTheDocument();fireEvent.keyDown(board,{key:'Escape'});expect(screen.getByText('工作记录已收起')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'继续整理'}));announceLocalGameForeground('some-other-window');await waitFor(()=>expect(screen.getByText('工作记录已收起')).toBeInTheDocument());});
 it('accepts a mobile swipe and stops after window blur',()=>{page();fireEvent.click(screen.getByRole('button',{name:'继续整理'}));const board=screen.getByRole('group',{name:/数值棋盘/});fireEvent.pointerDown(board,{pointerId:1,isPrimary:true,clientX:100,clientY:100});fireEvent.pointerUp(board,{pointerId:1,isPrimary:true,clientX:20,clientY:100});fireEvent.blur(window);expect(screen.getByText('工作记录已收起')).toBeInTheDocument();});
 it('remounts blank local state when the authenticated account changes',()=>{const view=page();fireEvent.click(screen.getByRole('button',{name:'继续整理'}));auth.identity='b';view.rerender(<MemoryRouter><Office2048Page/></MemoryRouter>);expect(screen.getByText('调整 0 次')).toBeInTheDocument();expect(screen.getByText('工作记录已收起')).toBeInTheDocument();});
});
