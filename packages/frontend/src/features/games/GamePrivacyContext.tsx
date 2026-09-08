import { createContext, useContext, type JSX, type ReactNode } from 'react';

export interface GamePrivacyState {
  covered: boolean;
  /** Public/local builds do not install a community privacy shortcut. */
  toggleCover: (() => void) | null;
}

const GamePrivacyContext = createContext<GamePrivacyState>({ covered: false, toggleCover: null });

export function GamePrivacyProvider({ value, children }: { value: GamePrivacyState; children: ReactNode }): JSX.Element {
  return <GamePrivacyContext.Provider value={value}>{children}</GamePrivacyContext.Provider>;
}

export function useGamePrivacy(): GamePrivacyState {
  return useContext(GamePrivacyContext);
}
