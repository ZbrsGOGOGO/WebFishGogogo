import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SITE_META_DESCRIPTION, SITE_NAME, SITE_MODE } from './app/site-config';
import { initializeCommunityTheme } from './app/store/community-theme-store';
import './styles/tokens.css';
import './styles/app-shell.css';
import './styles/community-theme.css';

document.documentElement.dataset.siteMode = SITE_MODE;
if (SITE_MODE === 'community') initializeCommunityTheme();
document.title = SITE_NAME;
document
  .querySelector('meta[name="description"]')
  ?.setAttribute('content', SITE_META_DESCRIPTION);

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
