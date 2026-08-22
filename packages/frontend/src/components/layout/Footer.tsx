// packages/frontend/src/components/layout/Footer.tsx
// 全站页脚：展示站点说明、备案信息以及隐私政策 / 服务条款链接。
//
// 该页脚被接入应用布局，在所有页面底部展示。

import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import {
  IS_COMMUNITY_MODE,
  IS_PUBLIC_MODE,
  IS_PUBLIC_SITE,
  SITE_NAME,
} from '../../app/site-config';

import {
  ICP_BEIAN_NUMBER,
  ICP_BEIAN_URL,
  PUBLIC_SECURITY_BEIAN_NUMBER,
  PUBLIC_SECURITY_BEIAN_URL,
} from '../compliance/content-declaration';

/** 备案号是否仍为未替换的占位符（含 X 占位字符）。 */
function isBeianPlaceholder(value: string): boolean {
  return !value || value.includes('X');
}

export interface FooterProps {
  reviewMode?: boolean;
  publicMode?: boolean;
  communityMode?: boolean;
}

/**
 * 全站页脚组件。
 *
 * - ICP/备案友好信息：展示备案号并链接至工信部备案查询官网；
 *   备案号为占位符时展示"备案信息待补充"提示（Req 13.4）。
 * - 隐私政策 / 服务条款链接（Req 13.5，路由由任务 19.1 提供）。
 *
 * _Requirements: 13.4, 13.5_
 */
export function Footer({
  reviewMode = IS_PUBLIC_SITE,
  publicMode = IS_PUBLIC_MODE,
  communityMode = IS_COMMUNITY_MODE,
}: FooterProps): JSX.Element {
  const currentYear = new Date().getFullYear();
  const beianPending = isBeianPlaceholder(ICP_BEIAN_NUMBER);
  const statement = publicMode
    ? '办公室乐斗、工具与单机游戏均在浏览器中运行，试玩进度只保存在本机。'
    : communityMode
      ? '账号、资料和社区互动由服务端保存；公开范围可在隐私设置中调整。'
    : reviewMode
      ? '专注轻量、实用的个人效率体验，产品内容与服务能力将持续完善。'
      : '个人资料与使用记录由您的本地服务保存，请仅处理本人合法拥有的内容。';

  return (
    <footer className="site-footer" role="contentinfo" aria-label="站点信息">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <strong>{SITE_NAME}</strong>
          <span>
            {publicMode
              ? '办公室轻社区 · 本机试玩版'
              : communityMode
                ? '办公室轻社区 · 社区版'
              : reviewMode
                ? '个人效率工作台 · 简单、清晰、可控'
                : '本机版 · 数据由您的本地服务保存'}
          </span>
        </div>
        <p className="site-footer__statement">{statement}</p>
        <nav className="site-footer__links" aria-label="合规页面">
          <Link to="/privacy-policy">隐私政策</Link>
          <Link to="/terms-of-service">服务条款</Link>
          {communityMode ? <Link to="/community-guidelines">社区规范</Link> : null}
          <span>© {currentYear} ZBRS</span>
        </nav>
        <div className="site-footer__records" aria-label="备案信息">
          {!beianPending ? (
            <a href={ICP_BEIAN_URL} target="_blank" rel="noreferrer noopener">
              {ICP_BEIAN_NUMBER}
            </a>
          ) : null}
          {PUBLIC_SECURITY_BEIAN_NUMBER && PUBLIC_SECURITY_BEIAN_URL ? (
            <a href={PUBLIC_SECURITY_BEIAN_URL} target="_blank" rel="noreferrer noopener">
              {PUBLIC_SECURITY_BEIAN_NUMBER}
            </a>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
