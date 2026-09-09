import {useEffect,useRef,useState,type JSX} from 'react';
import styles from './WorkstationTowerDefensePage.module.css';

/** Presentation only: the exact server value remains available to assistive technology. */
export function RollingNumber({value}:{value:number}):JSX.Element{
  const [shown,setShown]=useState(value),current=useRef(value);
  useEffect(()=>{
    if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||typeof requestAnimationFrame!=='function'){current.current=value;setShown(value);return;}
    const from=current.current,start=performance.now();let frame=0;
    const draw=(now:number)=>{const fraction=Math.min(1,Math.max(0,(now-start)/220));current.current=Math.round(from+(value-from)*(1-Math.pow(1-fraction,3)));setShown(current.current);if(fraction<1)frame=requestAnimationFrame(draw);};
    frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);
  },[value]);
  return <><span className={styles.srOnly}>{value}</span><span className={styles.rollingDigits} aria-hidden="true" data-rolling-value={shown}/></>;
}

export function coinFlight(source:{x:number;y:number},target:{x:number;y:number}):Record<string,string>{
  return {left:`${source.x}px`,top:`${source.y}px`,'--coin-x':`${target.x-source.x}px`,'--coin-y':`${target.y-source.y}px`};
}
