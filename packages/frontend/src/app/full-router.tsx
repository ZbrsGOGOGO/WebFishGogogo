import type { JSX } from 'react';
import { Route, Routes } from 'react-router-dom';

import { LoginPage, RegisterPage } from '../features/auth';
import { PrivacyPolicyPage, TermsOfServicePage } from '../features/compliance';
import { FarmPage } from '../features/farm';
import {
  ArenaPage,
  GamesPage,
  HighLowGamePage,
  SnakeGamePage,
  TankBattlePage,
  TetrisGamePage,
  ThreeSumGamePage,
} from '../features/games';
import { HomePage } from '../features/home/HomePage';
import { LibraryPage } from '../features/library';
import { ReaderPage } from '../features/reader';
import { ToolsPage } from '../features/tools';
import { ProtectedLayout } from './ProtectedLayout';

function NotFoundPage(): JSX.Element {
  return (
    <section className="not-found" aria-labelledby="not-found-title">
      <span className="not-found__code">404</span>
      <h1 id="not-found-title">没有找到这个页面</h1>
      <p>地址可能已变更，或这项功能尚未包含在当前本机版本中。</p>
      <a href="/">返回工作台</a>
    </section>
  );
}

export function RuntimeRouter(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
      <Route path="/terms-of-service" element={<TermsOfServicePage />} />

      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/blog/article/:docId" element={<ReaderPage />} />
        <Route path="/tools" element={<ToolsPage />} />
        <Route path="/farm" element={<FarmPage />} />
        <Route path="/games" element={<GamesPage />} />
        <Route path="/games/arena" element={<ArenaPage />} />
        <Route path="/games/snake" element={<SnakeGamePage />} />
        <Route path="/games/tetris" element={<TetrisGamePage />} />
        <Route path="/games/tank" element={<TankBattlePage />} />
        <Route path="/games/high-low" element={<HighLowGamePage />} />
        <Route path="/games/three-sum" element={<ThreeSumGamePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
