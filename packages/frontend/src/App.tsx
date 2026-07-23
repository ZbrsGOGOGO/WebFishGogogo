import type { JSX } from 'react';

import { AppProviders } from './app/providers';
import { AppRouter } from './app/router';
import { Footer } from './components';

export function App(): JSX.Element {
  // 全站布局：主内容区 + 站点级页脚（页脚在所有页面底部展示，Req 13.4/13.5）。
  return (
    <AppProviders>
      <div className="app-shell">
        <main className="app-main">
          <AppRouter />
        </main>
        <Footer />
      </div>
    </AppProviders>
  );
}
