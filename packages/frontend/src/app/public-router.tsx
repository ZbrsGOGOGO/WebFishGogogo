import { lazy, Suspense, type JSX } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { PublicLandingPage } from '../features/compliance/PublicLandingPage';
import { PublicSiteLayout } from '../components/layout/PublicSiteLayout';
import { ReviewPrivacyPolicyPage } from '../features/compliance/ReviewPrivacyPolicyPage';
import { ReviewTermsOfServicePage } from '../features/compliance/ReviewTermsOfServicePage';
import { PublicGameLayout } from '../features/games/PublicGameLayout';
import { PublicToolsPage } from '../features/tools/PublicToolsPage';

const PublicGamesPage = lazy(() =>
  import('../features/games/PublicGamesPage').then((module) => ({
    default: module.PublicGamesPage,
  })),
);
const TetrisGamePage = lazy(() =>
  import('../features/games/tetris/TetrisGamePage').then((module) => ({
    default: module.TetrisGamePage,
  })),
);
const TankBattlePage = lazy(() =>
  import('../features/games/tank/TankBattlePage').then((module) => ({
    default: module.TankBattlePage,
  })),
);
const SnakeGamePage = lazy(() =>
  import('../features/games/snake/SnakeGamePage').then((module) => ({
    default: module.SnakeGamePage,
  })),
);
const WorkstationTowerDefensePage = lazy(() =>
  import('../features/workstation-tower-defense').then((module) => ({
    default: module.WorkstationTowerDefensePage,
  })),
);

function loading(element: JSX.Element): JSX.Element {
  return (
    <Suspense fallback={<p role="status">页面加载中…</p>}>
      {element}
    </Suspense>
  );
}

export function PublicModeRouter(): JSX.Element {
  return (
    <Routes>
      <Route element={<PublicSiteLayout />}>
        <Route path="/" element={<PublicLandingPage />} />
        <Route path="/tower-defense" element={loading(<WorkstationTowerDefensePage />)} />
        <Route path="/ledou" element={<Navigate to="/tower-defense" replace />} />
        <Route path="/battle" element={<Navigate to="/tower-defense" replace />} />
      </Route>
      <Route path="/tools" element={<PublicToolsPage />} />
      <Route path="/tools/:toolId" element={<PublicToolsPage />} />
      <Route path="/games" element={<PublicGameLayout />}>
        <Route index element={loading(<PublicGamesPage />)} />
        <Route path="snake" element={loading(<SnakeGamePage />)} />
        <Route path="tetris" element={loading(<TetrisGamePage />)} />
        <Route path="tank" element={loading(<TankBattlePage />)} />
        <Route path="three-sum" element={<Navigate to="/games" replace />} />
      </Route>
      <Route
        path="/privacy-policy"
        element={<ReviewPrivacyPolicyPage includeGames />}
      />
      <Route
        path="/terms-of-service"
        element={<ReviewTermsOfServicePage includeGames />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export const RuntimeRouter = PublicModeRouter;
