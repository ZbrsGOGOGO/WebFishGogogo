import { useEffect, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';

import { Button, Card, PageHeader, Tag } from '../../../components/ui';
import {
  cardLabel,
  playHighLowRound,
  type HighLowPrediction,
  type HighLowRound,
} from './logic';
import styles from './HighLowGamePage.module.css';

const PREDICTIONS: Array<{
  value: HighLowPrediction;
  label: string;
  hint: string;
}> = [
  { value: 'player', label: '我更大', hint: '预测左侧点数更高' },
  { value: 'computer', label: '电脑更大', hint: '预测右侧点数更高' },
  { value: 'tie', label: '一样大', hint: '预测双方点数相同' },
];

const BEST_STREAK_KEY = 'zbrs.games.high-low.best-streak.v1';
const SUITS = ['♠', '♥', '♣', '♦'] as const;

function loadBestStreak(): number {
  try {
    const value = Number(window.localStorage.getItem(BEST_STREAK_KEY));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

function cardSuit(value: number, offset: number): (typeof SUITS)[number] {
  return SUITS[(value + offset) % SUITS.length];
}

function outcomeText(outcome: HighLowPrediction): string {
  if (outcome === 'tie') return '双方一样大';
  return outcome === 'player' ? '你的牌更大' : '电脑的牌更大';
}

export function HighLowGamePage(): JSX.Element {
  const [prediction, setPrediction] = useState<HighLowPrediction | null>(null);
  const [round, setRound] = useState<HighLowRound | null>(null);
  const [rounds, setRounds] = useState(0);
  const [wins, setWins] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(loadBestStreak);

  useEffect(() => {
    try {
      window.localStorage.setItem(BEST_STREAK_KEY, String(bestStreak));
    } catch {
      // 隐私模式禁用存储时仍可正常完成本局。
    }
  }, [bestStreak]);

  const reveal = (): void => {
    if (!prediction || round) return;
    const nextRound = playHighLowRound(prediction);
    setRound(nextRound);
    setRounds((value) => value + 1);
    if (nextRound.won) {
      setWins((value) => value + 1);
      setStreak((value) => {
        const next = value + 1;
        setBestStreak((best) => Math.max(best, next));
        return next;
      });
    } else {
      setStreak(0);
    }
  };

  const nextRound = (): void => {
    setPrediction(null);
    setRound(null);
  };

  const reset = (): void => {
    setPrediction(null);
    setRound(null);
    setRounds(0);
    setWins(0);
    setStreak(0);
  };

  return (
    <section aria-label="比大小">
      <PageHeader
        title="比大小"
        subtitle="先预测结果，再翻开双方的 1–13 点牌，看看判断是否准确。"
        actions={
          <Link className={styles.backLink} to="/games">
            ← 返回游戏中心
          </Link>
        }
      />

      <div className={styles.stats} aria-label="游戏统计">
        <Card>
          <span>已玩</span>
          <strong>{rounds}</strong>
          <small>局</small>
        </Card>
        <Card>
          <span>猜中</span>
          <strong>{wins}</strong>
          <small>局</small>
        </Card>
        <Card>
          <span>当前连胜</span>
          <strong>{streak}</strong>
          <small>本机最高 {bestStreak}</small>
        </Card>
      </div>

      <Card className={styles.gameCard}>
        <div className={styles.table}>
          <article>
            <span>你的牌</span>
            <div className={`${styles.playingCard} ${round ? styles.flipped : ''}`}>
              {round ? (
                <span
                  className={
                    ['♥', '♦'].includes(cardSuit(round.playerCard, 0))
                      ? styles.redSuit
                      : undefined
                  }
                >
                  <small>{cardSuit(round.playerCard, 0)}</small>
                  {cardLabel(round.playerCard)}
                </span>
              ) : (
                '?'
              )}
            </div>
          </article>
          <div className={styles.versus}>VS</div>
          <article>
            <span>电脑牌</span>
            <div className={`${styles.playingCard} ${round ? styles.flipped : ''}`}>
              {round ? (
                <span
                  className={
                    ['♥', '♦'].includes(cardSuit(round.computerCard, 1))
                      ? styles.redSuit
                      : undefined
                  }
                >
                  <small>{cardSuit(round.computerCard, 1)}</small>
                  {cardLabel(round.computerCard)}
                </span>
              ) : (
                '?'
              )}
            </div>
          </article>
        </div>

        {round ? (
          <div
            className={`${styles.result} ${
              round.won ? styles.win : styles.loss
            }`}
            role="status"
            aria-live="polite"
          >
            <Tag color={round.won ? 'success' : 'danger'}>
              {round.won ? '预测正确' : '预测错误'}
            </Tag>
            <strong>{outcomeText(round.outcome)}</strong>
            <p>
              你的预测：
              {PREDICTIONS.find((item) => item.value === prediction)?.label}
            </p>
          </div>
        ) : (
          <div className={styles.predictionPanel}>
            <h2>先选一个结果</h2>
            <div className={styles.predictionGrid}>
              {PREDICTIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={
                    prediction === item.value ? styles.selectedPrediction : ''
                  }
                  aria-pressed={prediction === item.value}
                  onClick={() => setPrediction(item.value)}
                >
                  <strong>{item.label}</strong>
                  <span>{item.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={styles.actions}>
          {round ? (
            <Button onClick={nextRound}>再来一局</Button>
          ) : (
            <Button disabled={!prediction} onClick={reveal}>
              揭晓结果
            </Button>
          )}
          <Button variant="ghost" onClick={reset}>
            重置本局
          </Button>
        </div>
      </Card>

      <Card className={styles.rules} title="玩法规则">
        <p>
          A 视为 1 点，J、Q、K 分别为 11、12、13 点。每局双方各抽一张牌；
          翻牌前预测谁更大或是否相同，猜中即可累计连胜。
        </p>
      </Card>
    </section>
  );
}
