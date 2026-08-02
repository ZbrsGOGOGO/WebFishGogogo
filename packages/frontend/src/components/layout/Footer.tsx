// packages/frontend/src/components/layout/Footer.tsx
// 全站页脚：展示 ICP/备案友好信息、"内容为用户上传且合法"声明，
// 以及隐私政策 / 服务条款链接（Req 13.4, 13.5）。
//
// 该页脚被接入应用布局，在所有页面底部展示。

import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import {
  ICP_BEIAN_NUMBER,
  ICP_BEIAN_URL,
  USER_CONTENT_FOOTER_STATEMENT,
} from '../compliance/content-declaration';

/** 备案号是否仍为未替换的占位符（含 X 占位字符）。 */
function isBeianPlaceholder(value: string): boolean {
  return value.includes('X');
}

/**
 * 全站页脚组件。
 *
 * - ICP/备案友好信息：展示备案号并链接至工信部备案查询官网；
 *   备案号为占位符时展示"备案信息待补充"提示（Req 13.4）。
 * - "内容为用户上传且合法"声明（Req 13.4）。
 * - 隐私政策 / 服务条款链接（Req 13.5，路由由任务 19.1 提供）。
 *
 * _Requirements: 13.4, 13.5_
 */
export function Footer(): JSX.Element {
  const currentYear = new Date().getFullYear();
  const beianPending = isBeianPlaceholder(ICP_BEIAN_NUMBER);

  return (
    <footer className="site-footer" role="contentinfo" aria-label="站点信息">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <strong>ZBRS 技术工具工坊</strong>
          <span>本机版 · 数据由您的本地服务保存</span>
        </div>
        <p className="site-footer__statement">{USER_CONTENT_FOOTER_STATEMENT}</p>
        <nav className="site-footer__links" aria-label="合规页面">
          <Link to="/privacy-policy">隐私政策</Link>
          <Link to="/terms-of-service">服务条款</Link>
          {!beianPending ? (
            <a href={ICP_BEIAN_URL} target="_blank" rel="noreferrer noopener">
              {ICP_BEIAN_NUMBER}
            </a>
          ) : null}
          <span>© {currentYear} ZBRS</span>
        </nav>
      </div>
    </footer>
  );
}
