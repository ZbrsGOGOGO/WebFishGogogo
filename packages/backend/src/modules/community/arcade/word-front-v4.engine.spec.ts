import {
  WORD_FRONT_V4_MAPS, WORD_FRONT_V4_UNITS, applyWordFrontV4Action, createWordFrontV4State,
  replayWordFrontV4, stepWordFrontV4, wordFrontV4HeroForLetters, wordFrontV4Terrain,
  type WordFrontV4Action,
} from '@stealth-reader/shared';

describe('Word Front v4 deterministic Changban engine', () => {
  it('uses three valid 8x10 maps without putting obstacles on the route', () => {
    expect(WORD_FRONT_V4_MAPS).toHaveLength(3);
    for (const map of WORD_FRONT_V4_MAPS) {
      expect(new Set(map.path).size).toBe(map.path.length); expect(map.path.every(slot => slot >= 0 && slot < 80)).toBe(true);
      expect(map.obstacles.some(slot => map.path.includes(slot))).toBe(false);
    }
  });
  it('guarantees Zhao Yun, consumes the finite pool and rejects forged ticks', () => {
    const base = createWordFrontV4State('story', 1, 17), before = { ...base.pool };
    const state = applyWordFrontV4Action(base, { tick:0,type:'recruit' })!;
    expect(wordFrontV4HeroForLetters(state.hand[0]!,state.hand[1]!)).toBe('zhaoyun');
    expect(state.pool['赵']).toBeLessThanOrEqual(before['赵']!-1); expect(state.pool['云']).toBeLessThanOrEqual(before['云']!-1);
    expect(Object.values(state.pool).reduce((a,b)=>a+b,0)).toBe(Object.values(before).reduce((a,b)=>a+b,0)-state.hand.length);
    expect(applyWordFrontV4Action(state,{tick:1,type:'recruit'})).toBeNull(); expect(base.pool).toEqual(before);
  });
  it('replays a complete server-verifiable trace exactly', () => {
    const seed=91,actions:WordFrontV4Action[]=[{tick:0,type:'recruit'}]; let state=applyWordFrontV4Action(createWordFrontV4State('story',1,seed),actions[0]!)!;
    const first=0,second=1,hero=wordFrontV4HeroForLetters(state.hand[first]!,state.hand[second]!)!; const range=WORD_FRONT_V4_UNITS[hero].range;
    const slot=Array.from({length:80},(_,value)=>value).filter(value=>['open','buff'].includes(wordFrontV4Terrain(state,value))).sort((a,b)=>WORD_FRONT_V4_MAPS[0]!.path.filter(cell=>Math.abs(a%8-cell%8)+Math.abs(Math.floor(a/8)-Math.floor(cell/8))<=range).length<WORD_FRONT_V4_MAPS[0]!.path.filter(cell=>Math.abs(b%8-cell%8)+Math.abs(Math.floor(b/8)-Math.floor(cell/8))<=range).length?1:-1)[0]!;
    actions.push({tick:0,type:'deploy_hero',first,second,slot}); state=applyWordFrontV4Action(state,actions[1]!)!; actions.push({tick:0,type:'start'}); state=applyWordFrontV4Action(state,actions[2]!)!;
    while(state.status==='running'&&state.tick<5_000)state=stepWordFrontV4(state);
    expect(['won','lost']).toContain(state.status); const replay=replayWordFrontV4('story',1,seed,actions,state.tick); expect(replay).toMatchObject({status:state.status,score:state.score,kills:state.kills,coreHp:state.coreHp});
  });
});
