import type { EntityManager } from 'typeorm';
import { cleanupOfficeHubUser } from './office-hub.cleanup';

describe('office soft-deletion cleanup',()=>{
  it('leaves pre-migration databases alone',async()=>{const query=jest.fn().mockResolvedValue([]);await cleanupOfficeHubUser({query} as unknown as EntityManager,'u1');expect(query).toHaveBeenCalledTimes(1);});
  it('removes authored text, secret identity, all votes targeting a deleted identity and the no-FK pending queue',async()=>{
    const rows=[{id:'story',kind:'story',author_id:'u1',reports:['u1','u2'],state:{title:'私密旧名的私有标题',nodes:[{author:{userId:'u1',publicId:'p1',displayName:'私密旧名'},text:'私有创作',ratings:{u1:3,u2:4}},{author:{userId:'u2',publicId:'p2',displayName:'其他同事'},text:'保留的共同创作',ratings:{u1:4}}]}},{id:'spy',kind:'spy',author_id:'u1',reports:[],state:{title:'私密旧名的描述局',ownerId:'u1',members:[{userId:'u1',publicId:'p1',name:'私密旧名'},{userId:'u2',publicId:'p2',name:'其他同事'}],descriptions:[{playerId:'p1',text:'私有描述'},{playerId:'p2',text:'保留描述'}],votes:{u1:'p2',u2:'p1'}}}];
    const query=jest.fn().mockImplementation((sql:string)=>Promise.resolve(sql.includes('information_schema')?[{table_name:'office_hub_posts'}]:sql.startsWith('SELECT id,kind')?rows:[]));await cleanupOfficeHubUser({query} as unknown as EntityManager,'u1');
    const updates=query.mock.calls.filter(([sql])=>String(sql).startsWith('UPDATE office_hub_posts'));expect(JSON.stringify(updates)).not.toContain('私密旧名');expect(JSON.stringify(updates)).not.toContain('私有创作');expect(JSON.stringify(updates)).not.toContain('私有描述');expect(JSON.stringify(updates)).not.toContain('p1');expect(JSON.stringify(updates)).toContain('保留的共同创作');expect(query.mock.calls.some(([sql,args])=>sql==='DELETE FROM office_hub_social_awards WHERE user_id=$1'&&args[0]==='u1')).toBe(true);
  });
  it('removes only the deleted participant rating and guess while preserving unknown drawing state',async()=>{
    const state={author:{userId:'u2',publicId:'p2',displayName:'保留作者'},wordIndex:8,published:true,startedAt:123,strokes:[{points:[{x:1,y:2},{x:3,y:4}],color:'#334155',width:4}],guesses:{u1:{attempts:1,solved:false},u2:{attempts:2,solved:true}},ratings:{u1:1,u2:5},reports:['u1','u2'],futureExtension:{nested:['must','remain']}};
    const rows=[{id:'drawing',kind:'drawing',author_id:'u2',reports:['u1','u2'],state}];
    const query=jest.fn().mockImplementation((sql:string)=>Promise.resolve(sql.includes('information_schema')?[{table_name:'office_hub_posts'}]:sql.startsWith('SELECT id,kind')?rows:[]));
    await cleanupOfficeHubUser({query} as unknown as EntityManager,'u1');
    const update=query.mock.calls.find(([sql])=>String(sql).startsWith('UPDATE office_hub_posts'))!;
    const stored=JSON.parse(update[1][2]);
    expect(stored).toEqual({...state,guesses:{u2:{attempts:2,solved:true}},ratings:{u2:5},reports:['u2']});
    expect(JSON.stringify(stored)).not.toContain('u1');
    expect(stored.futureExtension).toEqual({nested:['must','remain']});
  });
  it('cleans legacy drawings without introducing a ratings property',async()=>{
    const state={guesses:{u1:{attempts:1,solved:false}},reports:[],published:true,wordIndex:8,unknown:'preserved'};
    const query=jest.fn().mockImplementation((sql:string)=>Promise.resolve(sql.includes('information_schema')?[{table_name:'office_hub_posts'}]:sql.startsWith('SELECT id,kind')?[{id:'drawing',kind:'drawing',author_id:'u2',reports:[],state}]:[]));
    await cleanupOfficeHubUser({query} as unknown as EntityManager,'u1');
    expect(state).toEqual({guesses:{},reports:[],published:true,wordIndex:8,unknown:'preserved'});
    expect(state).not.toHaveProperty('ratings');
  });
});
