import { useEffect, useRef, useState, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCommunityAuthStore } from '../../../app/store/community-auth-store';
import styles from './ZhaoRescueSourcePage.module.css';

type ZhaoMessage = { type?:string; path?:string; mode?:string; score?:number };

/** Same-origin, self-hosted adaptation of the owner's supplied MIT game source. */
export function ZhaoRescueSourcePage():JSX.Element {
  const frame=useRef<HTMLIFrameElement>(null),navigate=useNavigate(),[notice,setNotice]=useState<string|null>(null);
  const auth=useCommunityAuthStore(),publicId=auth.phase==='active'?auth.user?.publicId:null;
  useEffect(()=>{const receive=(event:MessageEvent<ZhaoMessage>)=>{if(event.origin!==location.origin||event.source!==frame.current?.contentWindow||!event.data)return;
    if(event.data.type==='momo:zhao:navigate'&&typeof event.data.path==='string'&&event.data.path.startsWith('/tower-defense/word-front/'))navigate(event.data.path);
    if(event.data.type==='momo:zhao:score')setNotice(`本局${event.data.mode==='endless'?'无尽':'对战'}成绩 ${Number(event.data.score)||0} 已保留在源码存档；全站验真榜仍可从“V4 赛季”查看。`);
  };addEventListener('message',receive);return()=>removeEventListener('message',receive)},[navigate]);
  if(!publicId)return <main className={styles.page}><h1>赵云救阿斗</h1><p>{auth.phase==='bootstrapping'?'正在核对账号…':<>登录后进入游戏。<Link to="/login">前往登录</Link></>}</p></main>;
  return <main className={styles.page}><header><div><span>SOURCE EDITION / V7</span><h1>赵云救阿斗</h1><p>最新版源码已同源自托管：幸运字、五组阵容羁绊、智能武将拖动、三秒一格节奏与新版打击反馈均已接入。</p></div><nav><Link to="/tower-defense">工位塔防</Link><Link to="/tower-defense/word-front/rooms">玩家房间</Link><Link to="/tower-defense/word-front/v4">V4 赛季与排行</Link><Link to="/games">小游戏</Link></nav></header>
    <section className={styles.note}><strong>本站适配</strong><span>存档按当前账号隔离；神秘商人的“战利券”是本玩法资源，不冒充办公币；PVP 使用本站服务端房间。</span></section>{notice?<p role="status" className={styles.notice}>{notice}</p>:null}
    <iframe ref={frame} className={styles.frame} title="赵云救阿斗源码版" src={`/games/zhao-rescue/index.html?player=${encodeURIComponent(publicId)}`} sandbox="allow-scripts allow-same-origin" />
  </main>;
}
