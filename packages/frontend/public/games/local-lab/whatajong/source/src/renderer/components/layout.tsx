import { GlobalStateProvider, createGlobalState } from '@/state/globalState';
import { type ParentProps } from 'solid-js';
import { RunStateProvider, createRunState } from '../state/runState';
import { Defs } from './game/defs';
// Retain the original responsive board, not the rotate-device gate in a small
// desktop window. No separately licensed font is imported or served.
export function Layout(props: ParentProps) {
  const globalState = createGlobalState();
  const run = createRunState();
  return <GlobalStateProvider globalState={globalState}><RunStateProvider run={run}><Defs />{props.children}</RunStateProvider></GlobalStateProvider>;
}
