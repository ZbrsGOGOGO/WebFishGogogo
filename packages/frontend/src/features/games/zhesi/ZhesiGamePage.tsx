import { useEffect, useRef, useState, type JSX } from 'react';

import { Card, PageHeader, Tag } from '../../../components/ui';
import { ArcadeLeaderboard } from '../ArcadeLeaderboard';
import { GameBackLink } from '../GameBackLink';
import { useArcadeRun } from '../useArcadeRun';
import styles from './ZhesiGamePage.module.css';

const EMBED_URL = '/games/zhengdao/index.html?embedded=1';
const FINISHED_EVENT = 'momo.zhesi.run.finished';
const READY_EVENT = 'momo.zhesi.ready';
const READY_REQUEST_EVENT = 'momo.zhesi.ready.request';
const STARTED_EVENT = 'momo.zhesi.run.started';

interface ZhesiFinishedMessage {
  type: typeof FINISHED_EVENT;
  score: number;
  metrics: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function finishedMessage(value: unknown): ZhesiFinishedMessage | null {
  if (!isRecord(value) || value.type !== FINISHED_EVENT) return null;
  if (
    !Number.isSafeInteger(value.score) ||
    Number(value.score) < 0 ||
    Number(value.score) > 100_000 ||
    !isRecord(value.metrics)
  ) {
    return null;
  }
  return value as unknown as ZhesiFinishedMessage;
}

export function ZhesiGamePage(): JSX.Element {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const arcade = useArcadeRun('zhesi');
  const [frameReady, setFrameReady] = useState(false);
  const [runState, setRunState] = useState<'idle' | 'running' | 'finished'>('idle');

  useEffect(() => {
    const receive = (event: MessageEvent<unknown>): void => {
      if (
        event.origin !== window.location.origin ||
        event.source !== frameRef.current?.contentWindow ||
        !isRecord(event.data)
      ) {
        return;
      }
      if (event.data.type === READY_EVENT) {
        setFrameReady(true);
        return;
      }
      if (event.data.type === STARTED_EVENT) {
        setRunState('running');
        arcade.begin();
        return;
      }
      const result = finishedMessage(event.data);
      if (!result) return;
      setRunState('finished');
      void arcade.finish(result.score, result.metrics);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [arcade.begin, arcade.finish]);

  return (
    <section className={styles.page} aria-labelledby="zhesi-title">
      <GameBackLink />
      <PageHeader
        title="遮司"
        subtitle="抽取一世命格，在选择与机缘中走出自己的修行之路。"
        actions={(
          <Tag color={frameReady ? 'success' : 'neutral'}>
            {frameReady ? '游戏已就绪' : '正在载入'}
          </Tag>
        )}
      />

      <div className={styles.layout}>
        <div className={styles.gameFrame}>
          <iframe
            ref={frameRef}
            src={EMBED_URL}
            title="遮司命格模拟游戏"
            sandbox="allow-scripts allow-same-origin"
            referrerPolicy="same-origin"
            onLoad={() => {
              setFrameReady(false);
              frameRef.current?.contentWindow?.postMessage(
                { type: READY_REQUEST_EVENT },
                window.location.origin,
              );
            }}
          />
        </div>

        <aside className={styles.sidebar} aria-label="遮司账号成绩">
          {arcade.notice ? <p className={styles.notice} role="status">{arcade.notice}</p> : null}
          <Card title="账号成绩">
            <p>
              {arcade.signedIn
                ? '每次投生会建立独立赛局；走完一世后，服务端校验战力构成并更新个人最佳。'
                : '当前按游客模式游玩，命格录保存在本机；登录后才会同步最佳战力。'}
            </p>
            <dl className={styles.statusList}>
              <div><dt>当前状态</dt><dd>{runState === 'running' ? '此世进行中' : runState === 'finished' ? '此世已结算' : '等待投生'}</dd></div>
              <div><dt>正式资产</dt><dd>不发放</dd></div>
              <div><dt>本机记录</dt><dd>最多 200 世</dd></div>
            </dl>
          </Card>
          <ArcadeLeaderboard gameKey="zhesi" refreshKey={arcade.revision} />
          <Card title="数据说明">
            <p>排行榜只保存账号最佳战力和结算摘要，不上传完整人生事件、抉择文本或本机命格录。</p>
          </Card>
        </aside>
      </div>
    </section>
  );
}
