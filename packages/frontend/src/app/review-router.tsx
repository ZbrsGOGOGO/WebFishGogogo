import type { JSX } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import {
  PrivacyPolicyPage,
  ReviewLandingPage,
  TermsOfServicePage,
} from '../features/compliance';

export function ReviewModeRouter(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<ReviewLandingPage />} />
      <Route path="/privacy-policy" element={<PrivacyPolicyPage reviewMode />} />
      <Route path="/terms-of-service" element={<TermsOfServicePage reviewMode />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export const RuntimeRouter = ReviewModeRouter;
