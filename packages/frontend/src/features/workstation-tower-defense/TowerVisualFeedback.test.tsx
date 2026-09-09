import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {RollingNumber,coinFlight} from './TowerVisualFeedback';
import {OfficeHeroArt} from './OfficeTowerArt';
import {WorkstationTowerDefensePage} from './WorkstationTowerDefensePage';
import {createWorkstationCampaign} from './tower-defense-logic';
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
describe('real tower presentation, independent of simulation authority',()=>{
  it('interpolates visible counter frames but exposes only one exact accessible value',()=>{
    vi.useFakeTimers();let pending:FrameRequestCallback|undefined;vi.stubGlobal('requestAnimationFrame',vi.fn(fn=>{pending=fn;return 1;}));vi.stubGlobal('cancelAnimationFrame',vi.fn());vi.spyOn(performance,'now').mockReturnValue(0);
    const page=render(<RollingNumber value={100}/>);page.rerender(<RollingNumber value={200}/>);act(()=>pending?.(110));const value=Number(page.container.querySelector('[data-rolling-value]')?.getAttribute('data-rolling-value'));expect(value).toBeGreaterThan(100);expect(value).toBeLessThan(200);expect(page.container.textContent).toBe('200');act(()=>pending?.(220));expect(page.container.querySelector('[data-rolling-value]')).toHaveAttribute('data-rolling-value','200');
  });
  it('computes an actual kill-to-plant trajectory rather than a hard-coded corner animation',()=>{expect(coinFlight({x:40,y:80},{x:300,y:400})).toEqual({left:'40px',top:'80px','--coin-x':'260px','--coin-y':'320px'});});
  it.each(['snack','phone','glasses'] as const)('draws articulated %s props and hands, not only a caption',pose=>{const {container}=render(<OfficeHeroArt mark="守" pose={pose}/>);expect(container.querySelector(`[data-hero-hand="${pose}"]`)).toBeInTheDocument();expect(container.querySelector('[data-hero-pose]')).toHaveAttribute('data-hero-pose',pose);expect(container.querySelectorAll('path,rect,circle').length).toBeGreaterThan(10);});
  it('official snapshots trigger gold beam, 200ms shake and three-second refresh feedback through the shared practice view',()=>{
    vi.useFakeTimers();const state=createWorkstationCampaign(4,{mode:'story',chapter:1,job:'it',promotionTier:0,talents:{output:0,control:0,economy:0},weekday:1});const session={state,pending:false,onCommand:vi.fn(),onRestart:vi.fn()};const page=render(<WorkstationTowerDefensePage session={session}/>);
    page.rerender(<WorkstationTowerDefensePage session={{...session,state:{...state,nextOfferId:state.nextOfferId+5,inventory:[{id:'three',type:'single',tier:3,invested:162}]}}}/>);
    expect(page.container.querySelector('[data-evolution-shake=true]')).toBeInTheDocument();expect(screen.getByText('★★★ 满级进化！')).toBeInTheDocument();expect(page.container.querySelector('[data-refreshing=true]')).toBeInTheDocument();act(()=>vi.advanceTimersByTime(1300));expect(screen.queryByText('★★★ 满级进化！')).not.toBeInTheDocument();expect(page.container.querySelector('[data-refreshing=true]')).toBeInTheDocument();act(()=>vi.advanceTimersByTime(1800));expect(page.container.querySelector('[data-refreshing=true]')).not.toBeInTheDocument();
  });
});
