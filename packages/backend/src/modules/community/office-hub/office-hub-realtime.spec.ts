import type { EntityManager } from 'typeorm';
import type { PlayRoom, PlayRoomMember } from '../../../database/entities';
import { create } from '../play/engines';
import { recordOfficeRealtimeUndercover } from './office-hub-realtime';

describe('same-department real-time undercover reward bridge',()=>{
  const original=process.env.FEATURE_OFFICE_HUB_ENABLED;
  afterEach(()=>{if(original===undefined)delete process.env.FEATURE_OFFICE_HUB_ENABLED;else process.env.FEATURE_OFFICE_HUB_ENABLED=original;});
  function fixture(count=6){
    const start=2_000_000;const members=Array.from({length:count},(_,i)=>({userId:`user-${i}`,leftAt:null,user:{publicId:`p${i}`,accountStatus:'active'}})) as unknown as PlayRoomMember[];
    const state=create('undercover',members.map((m,i)=>({id:m.user.publicId,displayName:`同事${i}`})),'room',start,'office-test');
    state.phase='finished';state.undercover!.phase='finished';state.undercover!.outcome='undercover';for(const p of state.players)p.actionCount=2;
    const room={id:'room-1',gameKey:'undercover',mode:'room',startedAt:new Date(start),engineState:state} as unknown as PlayRoom;
    const memberships=members.map(m=>({user_id:m.userId,guild_id:'guild-1',joined_at:new Date(start-1000)}));
    const query=jest.fn().mockImplementation((sql:string)=>Promise.resolve(sql.startsWith('SELECT user_id')?memberships:[]));
    return{members,state,room,memberships,query,manager:{query} as unknown as EntityManager};
  }
  it('does nothing with the feature disabled or for solo practice',async()=>{
    const f=fixture();process.env.FEATURE_OFFICE_HUB_ENABLED='false';await recordOfficeRealtimeUndercover(f.manager,f.room,f.members);expect(f.query).not.toHaveBeenCalled();process.env.FEATURE_OFFICE_HUB_ENABLED='true';f.room.mode='solo';await recordOfficeRealtimeUndercover(f.manager,f.room,f.members);expect(f.query).not.toHaveBeenCalled();
  });
  it('awards both winning undercover players from actual roles and keeps the same stable event keys',async()=>{
    process.env.FEATURE_OFFICE_HUB_ENABLED='true';const f=fixture();expect(f.state.players.filter(p=>f.state.undercover!.roles[p.id]==='undercover')).toHaveLength(2);
    await recordOfficeRealtimeUndercover(f.manager,f.room,f.members);const writes=f.query.mock.calls.filter(([sql])=>String(sql).startsWith('INSERT'));expect(writes).toHaveLength(4);expect(writes.map(([,args])=>args[1]).sort()).toEqual(['department-spy:realtime:room-1','department-spy:realtime:room-1','spy:realtime:room-1','spy:realtime:room-1']);expect(writes.every(([sql])=>String(sql).includes('ON CONFLICT DO NOTHING'))).toBe(true);
  });
  it('rejects mixed departments and memberships acquired after game start',async()=>{
    process.env.FEATURE_OFFICE_HUB_ENABLED='true';for(const altered of ['mixed','late'] as const){const f=fixture();if(altered==='mixed')f.memberships[1].guild_id='another';else f.memberships[1].joined_at=new Date(f.room.startedAt!.getTime()+1);await recordOfficeRealtimeUndercover(f.manager,f.room,f.members);expect(f.query).toHaveBeenCalledTimes(1);}
  });
  it('does not reward absent, forfeited or inactive winners',async()=>{
    process.env.FEATURE_OFFICE_HUB_ENABLED='true';const f=fixture();for(const p of f.state.players)if(f.state.undercover!.roles[p.id]==='undercover')p.actionCount=0;await recordOfficeRealtimeUndercover(f.manager,f.room,f.members);expect(f.query).toHaveBeenCalledTimes(1);
  });
});
