import type { JSX } from 'react';

import { AppProviders } from './app/providers';
import { AppRouter } from './app/router';
import { Footer } from './components';

export function App(): JSX.Element {
  return (
    <AppProviders>
      <div className="app-shell">
        <div className="app-main">
          <AppRouter />
        </div>
        <Footer />
      </div>
    </AppProviders>
  );
}
