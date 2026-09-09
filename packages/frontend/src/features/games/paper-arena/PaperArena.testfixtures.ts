import { PAPER_ARENA_PROTOCOL_VERSION,PAPER_ARENA_MAP_VERSION,PAPER_ARENA_WEAPONS,type PaperArenaPlayer,type PaperArenaRoomView } from '@stealth-reader/shared';

export function paperPlayerFixture(overrides:Partial<PaperArenaPlayer>={}):PaperArenaPlayer{
  return {id:'seat-1',name:'本人',publicId:'public',team:'red',isBot:false,connected:true,x:1,y:0,z:1,vy:0,grounded:true,yaw:0,pitch:0,hp:100,ammo:30,reserve:150,
    weapon:'rifle',arsenal:Object.fromEntries(Object.values(PAPER_ARENA_WEAPONS).map(definition=>[definition.id,{ammo:definition.magazineSize??0,reserve:definition.initialReserve??0}])) as PaperArenaPlayer['arsenal'],
    aiming:false,blocking:false,sprinting:false,blockStamina:100,lastBlockAt:0,switchingUntil:0,actionUntil:0,lastShotAt:-1000,reloadingUntil:0,respawnAt:0,protectedUntil:0,kills:0,deaths:0,shotSeq:0,...overrides};
}
export function paperRoomFixture(overrides:Partial<PaperArenaRoomView>={}):PaperArenaRoomView{
  return {id:'room-test',name:'测试演练',protocolVersion:PAPER_ARENA_PROTOCOL_VERSION,mapVersion:PAPER_ARENA_MAP_VERSION,maxPlayers:4,targetKills:30,requiresPassword:false,status:'running',humans:1,expiresAt:Date.now()+600000,
    hostPlayerId:'seat-1',myPlayerId:'seat-1',serverNow:Date.now(),players:[paperPlayerFixture()],game:{tick:0,elapsedMs:0,scores:{red:0,blue:0},winner:null,shots:[]},rules:'服务器模拟',...overrides};
}
