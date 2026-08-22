import type { JSX, ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { SITE_NAME } from '../../app/site-config';
import { Card } from '../../components/ui';

export function CommunityAuthShell({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}): JSX.Element {
  const titleId = `community-auth-${title.replaceAll(/\s+/g, '-')}`;
  return (
    <main className="auth-page" aria-labelledby={titleId}>
      <div className="auth-card">
        <Link className="auth-card__brand" to="/">
          <span className="auth-card__logo" aria-hidden="true">Z</span>
          <strong className="auth-card__brand-name">{SITE_NAME}</strong>
        </Link>
        <Card>
          <h1 id={titleId} className="auth-card__title">{title}</h1>
          <p className="auth-card__intro">{intro}</p>
          {children}
          {footer ? <p className="auth-footer">{footer}</p> : null}
        </Card>
      </div>
    </main>
  );
}
