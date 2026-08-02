import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { Link } from 'react-router-dom';

import { Button, Card, Input, PageHeader, Tag } from '../../../components/ui';
import {
  createThreeNumbers,
  isCorrectAnswer,
  totalOf,
  type ThreeNumbers,
} from './logic';
import styles from './ThreeSumGamePage.module.css';

interface AnswerResult {
  correct: boolean;
  expected: number;
}

const BEST_STREAK_KEY = 'zbrs.games.three-sum.best-streak.v1';

function loadBestStreak(): number {
  try {
    const value = Number(window.localStorage.getItem(BEST_STREAK_KEY));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

export function ThreeSumGamePage(): JSX.Element {
  const [numbers, setNumbers] = useState<ThreeNumbers>(() =>
    createThreeNumbers(),
  );
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [questions, setQuestions] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(loadBestStreak);

  useEffect(() => {
    try {
      window.localStorage.setItem(BEST_STREAK_KEY, String(bestStreak));
    } catch {
      // 存储不可用时只影响本机最高记录，不影响答题。
    }
  }, [bestStreak]);

  const submitAnswer = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (result || answer.trim() === '') return;

    const parsed = Number(answer);
    const correct = isCorrectAnswer(numbers, parsed);
    setResult({ correct, expected: totalOf(numbers) });
    setQuestions((value) => value + 1);

    if (correct) {
      setCorrectAnswers((value) => value + 1);
      setStreak((value) => {
        const next = value + 1;
        setBestStreak((best) => Math.max(best, next));
        return next;
      });
    } else {
      setStreak(0);
    }
  };

  const nextQuestion = (): void => {
    setNumbers(createThreeNumbers());
    setAnswer('');
    setResult(null);
  };

  const reset = (): void => {
    setNumbers(createThreeNumbers());
    setAnswer('');
    setResult(null);
    setQuestions(0);
    setCorrectAnswers(0);
    setStreak(0);
  };

  const accuracy =
    questions === 0 ? 0 : Math.round((correctAnswers / questions) * 100);

  return (
    <section aria-label="三数之和">
      <PageHeader
        title="三数之和"
        subtitle="每轮随机生成三个 1–10 的数字，快速算出它们的总和。"
        actions={
          <Link className={styles.backLink} to="/games">
            ← 返回游戏中心
          </Link>
        }
      />

      <div className={styles.stats} aria-label="答题统计">
        <Card>
          <span>答对</span>
          <strong>{correctAnswers}</strong>
          <small>/ {questions} 题</small>
        </Card>
        <Card>
          <span>正确率</span>
          <strong>{accuracy}%</strong>
          <small>持续挑战</small>
        </Card>
        <Card>
          <span>连续答对</span>
          <strong>{streak}</strong>
          <small>本机最高 {bestStreak}</small>
        </Card>
      </div>

      <Card className={styles.challengeCard}>
        <div className={styles.numberRow} aria-label="本题数字">
          {numbers.map((number, index) => (
            <div key={`${index}-${number}`}>
              <span>{number}</span>
              {index < numbers.length - 1 && (
                <strong aria-hidden="true">＋</strong>
              )}
            </div>
          ))}
          <em aria-hidden="true">＝</em>
          <div className={styles.unknown}>?</div>
        </div>

        <form className={styles.answerForm} onSubmit={submitAnswer}>
          <Input
            type="number"
            inputMode="numeric"
            min={3}
            max={30}
            step={1}
            label="输入三个数字的总和"
            value={answer}
            disabled={result != null}
            autoFocus
            onChange={(event) => setAnswer(event.target.value)}
          />
          {result ? (
            <Button type="button" onClick={nextQuestion}>
              下一题
            </Button>
          ) : (
            <Button type="submit" disabled={answer.trim() === ''}>
              提交答案
            </Button>
          )}
        </form>

        {result && (
          <div
            className={`${styles.result} ${
              result.correct ? styles.correct : styles.incorrect
            }`}
            role="status"
            aria-live="polite"
          >
            <Tag color={result.correct ? 'success' : 'danger'}>
              {result.correct ? '回答正确' : '再接再厉'}
            </Tag>
            <strong>
              {numbers.join(' + ')} = {result.expected}
            </strong>
            {!result.correct && <p>你的答案是 {answer || '空白'}。</p>}
          </div>
        )}
      </Card>

      <Card className={styles.rules} title="玩法规则">
        <p>
          三个数字都会独立从 1–10 中随机产生，答案范围为 3–30。
          每次提交后会记录正确率和连对次数，按 Enter 也可以快速提交。
        </p>
        <Button variant="ghost" size="sm" onClick={reset}>
          重置本局
        </Button>
      </Card>
    </section>
  );
}
