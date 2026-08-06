import type { JSX } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { ReviewLandingPage } from '../features/compliance/ReviewLandingPage';
import { ReviewPrivacyPolicyPage } from '../features/compliance/ReviewPrivacyPolicyPage';
import { ReviewTermsOfServicePage } from '../features/compliance/ReviewTermsOfServicePage';
import { PublicToolsPage } from '../features/tools/PublicToolsPage';

export function ReviewModeRouter(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<ReviewLandingPage />} />
      <Route path="/tools" element={<PublicToolsPage />} />
      <Route path="/tools/:toolId" element={<PublicToolsPage />} />
      <Route path="/privacy-policy" element={<ReviewPrivacyPolicyPage />} />
      <Route path="/terms-of-service" element={<ReviewTermsOfServicePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export const RuntimeRouter = ReviewModeRouter;
