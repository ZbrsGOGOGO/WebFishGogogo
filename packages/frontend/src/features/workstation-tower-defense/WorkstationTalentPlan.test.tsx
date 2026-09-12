import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkstationTalentPlan } from './WorkstationTalentPlan';
import type { WorkstationTalents } from '@stealth-reader/shared';

const zero={output:0,control:0,economy:0};
function props(saved:WorkstationTalents=zero) { return {saved,points:1,writesEnabled:true,busy:false,onSave:vi.fn().mockResolvedValue(true),onReload:vi.fn().mockResolvedValue(true)}; }
function change(name:string,value:number) { fireEvent.change(screen.getByRole('spinbutton',{name}),{target:{value:String(value)}}); }
afterEach(cleanup);
describe('next-run talent draft',()=>{
  it('shows remaining points, dirty state and sends an acknowledged CAS plan while the current run stays explicit',async()=>{
    const p=props(),view=render(<WorkstationTalentPlan {...p} currentRun={{output:0,control:1,economy:0}}/>);
    expect(screen.getByRole('button',{name:'保存天赋'})).toBeDisabled();expect(screen.getByLabelText('天赋点分配')).toHaveTextContent('剩余 1 点');
    change('出力',1);expect(screen.getByRole('status')).toHaveTextContent('有未保存修改');expect(screen.getByLabelText('天赋点分配')).toHaveTextContent('剩余 0 点');
    await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'保存天赋'}));});
    expect(p.onSave).toHaveBeenCalledWith({output:1,control:0,economy:0,expectedTalents:zero});
    view.rerender(<WorkstationTalentPlan {...p} saved={{output:1,control:0,economy:0}} currentRun={{output:0,control:1,economy:0}}/>);
    expect(screen.getByRole('status')).toHaveTextContent('下一局方案已保存');expect(screen.getByLabelText('当前局天赋')).toHaveTextContent('出力 0 / 控制 1 / 经济 0');
    expect(screen.getByRole('button',{name:'保存天赋'})).toBeDisabled();
  });
  it.each([-1,.5,2,6])('rejects invalid or excess point value %s before any request',value=>{
    const p=props();render(<WorkstationTalentPlan {...p}/>);change('出力',value);
    expect(screen.getByRole('alert')).toHaveTextContent('每系须为');expect(screen.getByRole('button',{name:'保存天赋'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'保存天赋'}));expect(p.onSave).not.toHaveBeenCalled();
  });
  it('preserves dirty input across polling, failed save and failed reread, and reverts only explicitly',async()=>{
    const p=props();p.onSave.mockResolvedValue(false);p.onReload.mockRejectedValue(new Error('offline'));
    const view=render(<WorkstationTalentPlan {...p}/>);change('出力',1);view.rerender(<WorkstationTalentPlan {...p} saved={{...zero}}/>);
    expect(screen.getByRole('spinbutton',{name:'出力'})).toHaveValue(1);
    await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'保存天赋'}));});
    expect(screen.getByRole('status')).toHaveTextContent('保存未确认');expect(screen.getByLabelText('服务端天赋方案')).toHaveTextContent('出力 0');
    await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'同步存档'}));});
    expect(screen.getByRole('status')).toHaveTextContent('同步未完成');expect(screen.getByRole('spinbutton',{name:'出力'})).toHaveValue(1);
    fireEvent.click(screen.getByRole('button',{name:'载入已保存方案'}));expect(screen.getByRole('spinbutton',{name:'出力'})).toHaveValue(0);
  });
  it('blocks overwriting an externally changed plan until the user loads that exact baseline',async()=>{
    const p=props(),view=render(<WorkstationTalentPlan {...p}/>);change('出力',1);
    const saved={output:0,control:1,economy:0};view.rerender(<WorkstationTalentPlan {...p} saved={saved}/>);
    expect(screen.getByRole('alert')).toHaveTextContent('另一页面已更新');expect(screen.getByRole('button',{name:'保存天赋'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'载入已保存方案'}));change('控制',0);change('经济',1);
    await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'保存天赋'}));});
    expect(p.onSave).toHaveBeenCalledWith({output:0,control:0,economy:1,expectedTalents:saved});
  });
  it('accepts an independently reread exact desired plan after a lost response without resending',async()=>{
    const p=props();p.onSave.mockResolvedValue(false);const view=render(<WorkstationTalentPlan {...p}/>);change('出力',1);
    await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'保存天赋'}));});
    view.rerender(<WorkstationTalentPlan {...p} saved={{output:1,control:0,economy:0}}/>);
    expect(screen.getByRole('button',{name:'保存天赋'})).toBeDisabled();expect(screen.getByLabelText('服务端天赋方案')).toHaveTextContent('出力 1');expect(p.onSave).toHaveBeenCalledTimes(1);
  });
  it('does not issue duplicate saves or publish a late response after unmount',async()=>{
    const p=props();let finish!:(value:boolean)=>void;p.onSave.mockImplementation(()=>new Promise<boolean>(resolve=>{finish=resolve;}));
    const view=render(<WorkstationTalentPlan {...p}/>);change('出力',1);fireEvent.click(screen.getByRole('button',{name:'保存天赋'}));fireEvent.click(screen.getByRole('button',{name:'保存天赋'}));expect(p.onSave).toHaveBeenCalledTimes(1);
    view.unmount();render(<WorkstationTalentPlan {...props()}/>);await act(async()=>{finish(true);});
    expect(screen.getByRole('spinbutton',{name:'出力'})).toHaveValue(0);expect(screen.getByRole('status')).not.toHaveTextContent('下一局方案已保存');
  });
  it('keeps a read-only plan readable and makes no save request',()=>{
    const p=props({output:1,control:0,economy:0});render(<WorkstationTalentPlan {...p} writesEnabled={false}/>);
    expect(screen.getByRole('spinbutton',{name:'出力'})).toBeDisabled();expect(screen.getByRole('button',{name:'保存天赋'})).toBeDisabled();expect(p.onSave).not.toHaveBeenCalled();
  });
});
