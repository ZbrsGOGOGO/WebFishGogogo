import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { CommunityPrivacyPolicyPage, CommunityTermsOfServicePage } from './CommunityCompliancePages';

const renderPage = (page: ReactNode) => render(<MemoryRouter>{page}</MemoryRouter>);

describe('community compliance for the source-replacement tower', () => {
  it('documents opaque saves, redacted friend projections and deletion cleanup', () => {
    renderPage(<CommunityPrivacyPolicyPage />);
    expect(screen.getByText('版本：2026-10-16')).toBeVisible();
    expect(screen.getByText(/不透明 JSON/)).toHaveTextContent('不据此发放全站资产');
    expect(screen.getByText(/好友列表只返回已建立双向好友/)).toHaveTextContent('脱敏投影');
    expect(screen.getByText(/完成账号注销时清理个人不透明存档/)).toHaveTextContent('不发网站办公币');
  });

  it('states that source gameplay is independent of the wallet, holder identity and achievements', () => {
    renderPage(<CommunityTermsOfServicePage />);
    expect(screen.getByText('版本：2026-10-16')).toBeVisible();
    expect(screen.getByText(/塔内等级、装备和“办公币”/)).toHaveTextContent('与网站办公币、全站钱包、期权持有者身份和成就进度不互通');
    expect(screen.getByText(/排行榜不发网站奖励/)).toBeVisible();
  });
});
