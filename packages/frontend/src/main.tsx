import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SITE_META_DESCRIPTION, SITE_NAME } from './app/site-config';
import './styles/tokens.css';
import './styles/app-shell.css';

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
