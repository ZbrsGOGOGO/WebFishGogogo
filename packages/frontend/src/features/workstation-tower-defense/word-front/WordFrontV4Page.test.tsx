import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommunityAuthUser } from '../../../api/community';
import { finishArcadeRun, getArcadeLeaderboard, startArcadeRun } from '../../../api/community-arcade';
import { resetCommunityAuthStoreForTests, useCommunityAuthStore } from '../../../app/store/community-auth-store';
import { WordFrontV4Page } from './WordFrontV4Page';

vi.mock('../../../api/community-arcade', () => ({ startArcadeRun: vi.fn(), finishArcadeRun: vi.fn(), getArcadeLeaderboard: vi.fn() }));
vi.mock('../../../app/community-nav',async original=>{const actual=await original<typeof import('../../../app/community-nav')>();return{...actual,COMMUNITY_FEATURE_FLAGS:{...actual.COMMUNITY_FEATURE_FLAGS,wordFrontRooms:true}}});
const user: CommunityAuthUser = { id:'member-a',publicId:'member-a',email:'a@example.com',displayName:'甲',accountStatus:'active',onboardingCompleted:true,socialVerificationStatus:'unverified' };
function page(){return render(<MemoryRouter><WordFrontV4Page/></MemoryRouter>)}

describe('WordFrontV4Page',()=>{
  beforeEach(()=>{vi.resetAllMocks();localStorage.clear();resetCommunityAuthStoreForTests();useCommunityAuthStore.setState({phase:'active',user,sessionReady:true,restoreSession:vi.fn()});
    vi.mocked(startArcadeRun).mockResolvedValue({runId:'run-v4',gameKey:'word_story_v4',rulesVersion:4,chapter:1,seed:17,startedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+2*60*60_000).toISOString()});
    vi.mocked(getArcadeLeaderboard).mockResolvedValue({gameKey:'word_story_v4',formulaVersion:'word-front-v4',items:[]});
    vi.mocked(finishArcadeRun).mockResolvedValue({gameKey:'word_story_v4',score:0,bestScore:0,isPersonalBest:false,rank:1});});
  afterEach(()=>{vi.restoreAllMocks();});

  it('shows three ten-row maps and keeps every older ruleset reachable',async()=>{page();expect(screen.getAllByRole('option')).toHaveLength(3);expect(screen.getByRole('group',{name:'长坂坡十行地图'}).querySelectorAll('button')).toHaveLength(80);
    expect(screen.getByRole('link',{name:'V3 旧版'})).toHaveAttribute('href','/tower-defense/word-front/v3');expect(screen.getByRole('link',{name:'玩家房间'})).toHaveAttribute('href','/tower-defense/word-front/rooms');expect(screen.getByRole('link',{name:'地图设计'})).toHaveAttribute('href','/tower-defense/word-front/maps');
    await screen.findByText('还没有上榜玩家，等你来创造第一条纪录。');expect(getArcadeLeaderboard).toHaveBeenCalledWith('word_story_v4');});

  it('binds ranked play to V4 and deploys the guaranteed Zhao Yun pair',async()=>{page();fireEvent.click(screen.getByRole('button',{name:'征兵五张 · 10 包子'}));await waitFor(()=>expect(startArcadeRun).toHaveBeenCalledExactlyOnceWith('word_story_v4',4,1));
    const cards=within(screen.getByRole('group',{name:'手中字卡'})).getAllByRole('button');expect(cards[0]).toHaveAccessibleName('第 1 张字卡：赵');expect(cards[1]).toHaveAccessibleName('第 2 张字卡：云');fireEvent.click(cards[0]!);fireEvent.click(cards[1]!);fireEvent.click(screen.getByRole('button',{name:'1行1列，空地'}));expect(screen.getByRole('button',{name:/1行1列，赵云1级/})).toBeInTheDocument();});

  it('keeps the run local when an old API does not return the V4 contract',async()=>{vi.mocked(startArcadeRun).mockResolvedValue({runId:'old',gameKey:'word_story_v4',seed:17,startedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+2*60*60_000).toISOString()});page();fireEvent.click(screen.getByRole('button',{name:'征兵五张 · 10 包子'}));await waitFor(()=>expect(screen.getByText(/当前为本机演练/)).toBeInTheDocument());expect(finishArcadeRun).not.toHaveBeenCalled();});
});
