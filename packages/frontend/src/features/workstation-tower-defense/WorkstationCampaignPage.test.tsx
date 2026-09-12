import { act,cleanup,fireEvent,render,screen } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { createWorkstationCampaign,type WorkstationOverview } from '@stealth-reader/shared';
import { workstationApi } from './workstation-api';
import { WorkstationCampaignPage,WorkstationLeaderboardPage } from './WorkstationCampaignPage';
import { WorkstationTowerDefensePage } from './WorkstationTowerDefensePage';
import { useCommunityAuthStore } from '../../app/store/community-auth-store';
import { setCommunitySessionTokens } from '../../api/community-http';
vi.mock('./workstation-api',()=>({workstationApi:{overview:vi.fn(),start:vi.fn(),sync:vi.fn(),command:vi.fn(),talents:vi.fn(),formation:vi.fn(),leaderboard:vi.fn()}}));
function snapshot():WorkstationOverview{return {profile:{experience:0,promotionTier:0,unlockedChapter:1,talents:{output:0,control:0,economy:0},talentPoints:1,formation:[],stats:{runs:0,wins:0,waves:0,bestScore:0,bestStreak:0,totalScore:0,achievements:[]}},run:null,reports:[],writesEnabled:true,rules:'服务器保存，失败 30%'};}
describe('account campaign interface',()=>{
  beforeEach(()=>{vi.resetAllMocks();window.localStorage.clear();useCommunityAuthStore.getState().reset();vi.mocked(workstationApi.overview).mockResolvedValue(snapshot());});
  afterEach(()=>{cleanup();vi.useRealTimers();});
  it('shows six chapters, four jobs, three modes, independent local practice and official ranking',async()=>{
    render(<MemoryRouter><WorkstationCampaignPage/></MemoryRouter>);
    expect(await screen.findByRole('heading',{name:'入职第一天'})).toBeInTheDocument();expect(screen.getByRole('heading',{name:'年终盘点'})).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'本地练习'})).toHaveAttribute('href','/tower-defense/practice');expect(screen.getByRole('link',{name:'正式排行榜'})).toHaveAttribute('href','/tower-defense/leaderboard');
    expect(screen.getByRole('option',{name:'IT'})).toBeInTheDocument();expect(screen.getByRole('option',{name:'极限资格'})).toBeInTheDocument();
    expect(screen.getAllByRole('button',{name:'完成前章后解锁'})).toHaveLength(5);
  });
  it('keeps server snapshot authoritative, sends actions only, and never mixes official score into local record',()=>{
    vi.useFakeTimers();const state=createWorkstationCampaign(1,{job:'it',mode:'story',chapter:1,promotionTier:0,talents:{output:0,control:0,economy:0},weekday:1});const onCommand=vi.fn();
    window.localStorage.setItem('momo.workstation-tower-defense.settings.v4',JSON.stringify({bestScore:17}));
    const rendered=render(<WorkstationTowerDefensePage session={{state,pending:false,onCommand,onRestart:vi.fn()}}/>);
    fireEvent.click(screen.getByRole('button',{name:'购买办公桌绿植'}));expect(onCommand).toHaveBeenCalledWith({type:'plant'});expect(screen.getByLabelText('局内金币')).toHaveTextContent('110');
    act(()=>vi.advanceTimersByTime(10000));expect(screen.getByLabelText('本局得分')).toHaveTextContent('0');
    rendered.rerender(<WorkstationTowerDefensePage session={{state:{...state,status:'won',score:9000},pending:false,onCommand,onRestart:vi.fn()}}/>);
    expect(JSON.parse(window.localStorage.getItem('momo.workstation-tower-defense.settings.v4')!).bestScore).toBe(17);
  });
  it('does not silently claim network failure succeeded and presents a practice fallback',async()=>{
    vi.mocked(workstationApi.overview).mockRejectedValue(new Error('offline'));
    render(<MemoryRouter><WorkstationCampaignPage/></MemoryRouter>);
    expect(await screen.findByText(/未假定操作成功/)).toBeInTheDocument();expect(screen.getByRole('link',{name:'先去本地练习'})).toBeInTheDocument();
  });
  it('saves the next-run plan during an active run and sends the exact previously read CAS baseline',async()=>{
    const state=createWorkstationCampaign(1972,{job:'it',mode:'story',chapter:1,promotionTier:0,talents:{output:0,control:0,economy:0},weekday:1});
    const initial={...snapshot(),run:{id:'current-run',revision:1,state,catchupPending:false}};
    vi.mocked(workstationApi.overview).mockResolvedValue(initial);
    vi.mocked(workstationApi.talents).mockResolvedValue({...initial,profile:{...initial.profile,talents:{output:1,control:0,economy:0}}});
    render(<MemoryRouter><WorkstationCampaignPage/></MemoryRouter>);await screen.findByLabelText('当前局天赋');
    fireEvent.change(screen.getByRole('spinbutton',{name:'出力'}),{target:{value:'1'}});
    await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'保存天赋'}));});
    expect(workstationApi.talents).toHaveBeenCalledWith({output:1,control:0,economy:0,expectedTalents:{output:0,control:0,economy:0}});
    expect(screen.getByLabelText('服务端天赋方案')).toHaveTextContent('出力 1');expect(screen.getByLabelText('当前局天赋')).toHaveTextContent('出力 0');
    expect(workstationApi.command).not.toHaveBeenCalled();expect(workstationApi.start).not.toHaveBeenCalled();
  });
  it('rereads on failed saving without deleting the draft or pretending the persisted value changed',async()=>{
    vi.mocked(workstationApi.talents).mockRejectedValue(new Error('offline'));
    render(<MemoryRouter><WorkstationCampaignPage/></MemoryRouter>);await screen.findByLabelText('服务端天赋方案');
    fireEvent.change(screen.getByRole('spinbutton',{name:'出力'}),{target:{value:'1'}});
    await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'保存天赋'}));});
    expect(workstationApi.overview).toHaveBeenCalledTimes(2);expect(screen.getByRole('alert')).toHaveTextContent('未假定操作成功');
    expect(screen.getByLabelText('服务端天赋方案')).toHaveTextContent('出力 0');expect(screen.getByRole('spinbutton',{name:'出力'})).toHaveValue(1);
  });
  it('drops the previous session draft and ignores its late save response even for the same owner',async()=>{
    let finish!:(value:WorkstationOverview)=>void;
    vi.mocked(workstationApi.talents).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    render(<MemoryRouter><WorkstationCampaignPage/></MemoryRouter>);await screen.findByLabelText('服务端天赋方案');
    fireEvent.change(screen.getByRole('spinbutton',{name:'出力'}),{target:{value:'1'}});fireEvent.click(screen.getByRole('button',{name:'保存天赋'}));
    const fresh=snapshot();fresh.profile.talents={output:0,control:0,economy:1};vi.mocked(workstationApi.overview).mockResolvedValue(fresh);
    await act(async()=>{setCommunitySessionTokens('synthetic-new-session');useCommunityAuthStore.setState({loading:false});});
    expect(screen.getByRole('spinbutton',{name:'出力'})).toHaveValue(0);expect(screen.getByRole('spinbutton',{name:'经济'})).toHaveValue(1);
    const old=snapshot();old.profile.talents={output:1,control:0,economy:0};await act(async()=>{finish(old);});
    expect(screen.getByLabelText('服务端天赋方案')).toHaveTextContent('出力 0 / 控制 0 / 经济 1');expect(screen.queryByText(/下一局方案已保存/)).not.toBeInTheDocument();
  });
  it('normal store rerenders keep an unsaved plan rather than remounting the task',async()=>{
    render(<MemoryRouter><WorkstationCampaignPage/></MemoryRouter>);await screen.findByLabelText('服务端天赋方案');
    fireEvent.change(screen.getByRole('spinbutton',{name:'出力'}),{target:{value:'1'}});act(()=>{useCommunityAuthStore.setState({loading:false});});
    expect(screen.getByRole('spinbutton',{name:'出力'})).toHaveValue(1);expect(workstationApi.overview).toHaveBeenCalledTimes(1);
  });
  it('keeps next-run saves and the deployed-tower move control disabled in read-only maintenance',async()=>{
    const state=createWorkstationCampaign(1972,{job:'it',mode:'story',chapter:1,promotionTier:0,talents:{output:0,control:0,economy:0},weekday:1});
    state.towers=[{id:'owned',type:'single',level:2,slotIndex:4,cooldown:9,invested:54}];
    vi.mocked(workstationApi.overview).mockResolvedValue({...snapshot(),writesEnabled:false,run:{id:'read-only-run',revision:1,state,catchupPending:false}});
    render(<MemoryRouter><WorkstationCampaignPage/></MemoryRouter>);await screen.findByLabelText('服务端天赋方案');
    expect(screen.getByRole('button',{name:'保存天赋'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'继续这份存档'}));
    fireEvent.click(screen.getByRole('button',{name:'塔位 5，订书机 2 阶'}));expect(screen.getByRole('button',{name:'移动防御塔'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'移动防御塔'}));expect(workstationApi.command).not.toHaveBeenCalled();
  });
  it('discards queued commands once the server says that run has ended',async()=>{
    vi.useFakeTimers();const state=createWorkstationCampaign(1,{job:'it',mode:'story',chapter:1,promotionTier:0,talents:{output:0,control:0,economy:0},weekday:1});const initial={...snapshot(),run:{id:'run-old',revision:1,state,catchupPending:false}};
    vi.mocked(workstationApi.overview).mockResolvedValue(initial);vi.mocked(workstationApi.command).mockResolvedValue({...initial,run:{...initial.run,revision:2,state:{...state,status:'lost'}}});
    render(<MemoryRouter><WorkstationCampaignPage/></MemoryRouter>);await act(async()=>{await Promise.resolve();});fireEvent.click(screen.getByRole('button',{name:'继续这份存档'}));fireEvent.click(screen.getByRole('button',{name:'购买办公桌绿植'}));fireEvent.click(screen.getByRole('button',{name:'购买办公桌绿植'}));
    await act(async()=>{vi.advanceTimersByTime(350);await Promise.resolve();});expect(workstationApi.command).toHaveBeenCalledTimes(1);expect(workstationApi.command).toHaveBeenCalledWith('run-old',1,{type:'plant'});
    await act(async()=>{vi.advanceTimersByTime(700);await Promise.resolve();});expect(workstationApi.command).toHaveBeenCalledTimes(1);
  });
  it('renders server-ranked daily winners and prizes without importing browser score',async()=>{
    vi.mocked(workstationApi.leaderboard).mockResolvedValue({mode:'story',date:'2026-09-09',dailyChampionCoins:12,rules:'server',items:[{publicId:'person',displayName:'测试同事',score:1234,waves:2,streak:2,rank:1}]});
    render(<MemoryRouter><WorkstationLeaderboardPage/></MemoryRouter>);expect(await screen.findByText('测试同事')).toBeInTheDocument();expect(screen.getByText(/每日冠军 12 办公币/)).toBeInTheDocument();expect(workstationApi.leaderboard).toHaveBeenCalledWith('story',undefined,expect.any(AbortSignal));
  });
  it('renders real report comparisons/formations and an explicit clipboard-unavailable fallback',async()=>{
    const initial=snapshot();initial.profile.stats.bestScore=1000;initial.reports=[{id:'report',mode:'story',chapter:1,score:750,successfulWaves:2,stars:3,streak:2,coins:9,outcome:'won',settledAt:'2026-09-09T01:00:00Z',formation:[{type:'single',slotIndex:4,level:3}]}];vi.mocked(workstationApi.overview).mockResolvedValue(initial);const original=Object.getOwnPropertyDescriptor(navigator,'clipboard');Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});
    try{render(<MemoryRouter><WorkstationCampaignPage/></MemoryRouter>);expect(await screen.findByText('距个人最高还差 25%')).toBeInTheDocument();expect(screen.getByLabelText('与个人最高分对比')).toHaveAttribute('value','750');expect(screen.getByText(/5号位.*★★★/)).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'复制分享战报'}));expect(await screen.findByText('当前浏览器不支持剪贴板，可直接截图这张战报卡片。')).toBeInTheDocument();}finally{if(original)Object.defineProperty(navigator,'clipboard',original);else delete (navigator as unknown as Record<string,unknown>).clipboard;}
  });
});
