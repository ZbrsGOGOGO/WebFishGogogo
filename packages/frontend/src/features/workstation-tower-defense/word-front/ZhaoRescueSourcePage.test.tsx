import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { ZhaoRescueSourcePage } from './ZhaoRescueSourcePage';

const navigate=vi.fn();
vi.mock('react-router-dom',async original=>{const actual=await original<typeof import('react-router-dom')>();return{...actual,useNavigate:()=>navigate}});
describe('ZhaoRescueSourcePage',()=>{
  beforeEach(()=>{navigate.mockReset();resetCommunityAuthStoreForTests();useCommunityAuthStore.setState({phase:'active',sessionReady:true,user:{id:'u1',publicId:'member-a',email:'a@example.com',displayName:'甲',accountStatus:'active',onboardingCompleted:true,socialVerificationStatus:'unverified'}})});
  it('embeds the supplied source on the same origin with an account-scoped key',()=>{render(<MemoryRouter><ZhaoRescueSourcePage/></MemoryRouter>);const frame=screen.getByTitle('赵云救阿斗源码版');expect(frame).toHaveAttribute('src','/games/zhao-rescue/index.html?player=member-a');expect(frame).toHaveAttribute('sandbox','allow-scripts allow-same-origin');expect(screen.getByRole('link',{name:'V4 赛季与排行'})).toHaveAttribute('href','/tower-defense/word-front/v4')});
  it('accepts navigation only from its own frame and same origin',()=>{render(<MemoryRouter><ZhaoRescueSourcePage/></MemoryRouter>);const frame=screen.getByTitle('赵云救阿斗源码版') as HTMLIFrameElement;fireEvent(window,new MessageEvent('message',{origin:location.origin,source:frame.contentWindow,data:{type:'momo:zhao:navigate',path:'/tower-defense/word-front/rooms'}}));expect(navigate).toHaveBeenCalledWith('/tower-defense/word-front/rooms');});
});
