import type { JSX } from 'react';

import { Card, PageHeader, Tag } from '../../components/ui';
import styles from './CommunityPages.module.css';

function configuredAfdianPage(): string | null {
  const raw = import.meta.env.VITE_AFDIAN_PAGE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLocaleLowerCase('en-US');
    if (url.protocol !== 'https:' || !['afdian.com', 'www.afdian.com', 'ifdian.net', 'www.ifdian.net'].includes(host)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function CommunityFeedPage(): JSX.Element {
  const afdianPage = configuredAfdianPage();

  return (
    <main className={styles.page}>
      <PageHeader
        title="投喂站长"
        subtitle="如果这个小站对你有用，可以自愿支持服务器和后续开发。"
      />

      <div className={styles.twoColumn}>
        <Card title="给小站加一份续航" headerActions={<Tag color="neutral">完全自愿</Tag>}>
          <div className={styles.stack}>
            <p>支持会用于服务器、域名、内容维护与新玩法开发。无论是否支持，现有免费功能和正常游戏体验都不会被区别对待。</p>
            {afdianPage ? (
              <a
                className={styles.primaryLink}
                href={afdianPage}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                前往爱发电
              </a>
            ) : (
              <div className={styles.heroAside}>
                <strong>爱发电接入中</strong>
                <p>入口尚未配置，本页不会展示二维码、收款账号或模拟支付按钮。</p>
              </div>
            )}
          </div>
        </Card>

        <Card title="投喂说明">
          <ul className={styles.plainList}>
            <li>投喂对象是网站维护者，不是好友或游戏角色</li>
            <li>订单和支付由爱发电页面处理</li>
            <li>暂不赠送办公币、装备、属性或排行榜优势</li>
            <li>本网站当前不接收、保存支付卡或支付密码</li>
          </ul>
        </Card>
      </div>
    </main>
  );
}
