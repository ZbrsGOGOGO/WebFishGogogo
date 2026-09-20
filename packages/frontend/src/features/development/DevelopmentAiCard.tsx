import { useState, type FormEvent, type JSX } from 'react';
import {
  DEVELOPMENT_LIMITS,
  type DevelopmentAiAccess,
  type DevelopmentAiMessage,
} from '@stealth-reader/shared';

import { communityDevelopmentApi } from '../../api/community-development';
import { Button, Card, Textarea } from '../../components/ui';
import { developmentError } from './development-format';
import styles from './Development.module.css';

export function DevelopmentAiCard({
  requestId,
  access,
  onUseAsComment,
}: {
  requestId: string;
  access: DevelopmentAiAccess;
  onUseAsComment: (message: string) => void;
}): JSX.Element | null {
  const [consent, setConsent] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<DevelopmentAiMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [remaining, setRemaining] = useState<number>();

  if (!access.enabled) return null;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const question = prompt.trim();
    if (!consent) {
      setError('请先确认本轮会把提案文字和聊天内容发送给 Groq。');
      return;
    }
    if (!question) {
      setError('请先填写想讨论的问题。');
      return;
    }
    setSending(true);
    setError(undefined);
    try {
      const history = messages.slice(-DEVELOPMENT_LIMITS.aiHistoryMessages);
      const result = await communityDevelopmentApi.chatWithAi(requestId, {
        prompt: question,
        history,
        consent: true,
      });
      setMessages((current) => [
        ...current,
        { role: 'user', content: question },
        { role: 'assistant', content: result.message },
      ]);
      setPrompt('');
      setRemaining(result.remainingToday);
    } catch (requestError) {
      setError(developmentError(requestError, '免费 AI 暂时无法回答，请稍后再试。'));
    } finally {
      setSending(false);
    }
  }

  return (
    <Card title="免费 AI 讨论（试运行）" bodyClassName={styles.cardBody}>
      <div className={styles.aiIntro}>
        <strong>产品与研发建议助手</strong>
        <span>Groq 免费层 · GPT-OSS 20B · 不会自动转付费</span>
      </div>
      <p className={styles.muted}>
        AI 只给临时建议，不代表站长审核、代码已修改或已经部署。它会读取本提案正文和最近人工评论，但不会读取或上传附件。
      </p>
      <label className={styles.aiConsent}>
        <input
          type="checkbox"
          checked={consent}
          disabled={sending}
          onChange={(event) => setConsent(event.target.checked)}
        />
        <span>我知道本轮提案文字与聊天内容会发送给 Groq 生成回答，不包含附件。</span>
      </label>
      {messages.length > 0 ? (
        <div className={styles.aiMessages} aria-live="polite">
          {messages.map((message, index) => (
            <article className={message.role === 'user' ? styles.aiUser : styles.aiAssistant} key={`${index}:${message.role}`}>
              <strong>{message.role === 'user' ? '我' : 'AI 建议'}</strong>
              <p>{message.content}</p>
              {message.role === 'assistant' ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onUseAsComment(message.content.slice(0, DEVELOPMENT_LIMITS.commentChars))}
                >
                  填入正式评论
                </Button>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className={styles.scopeNote}>可以请 AI 梳理需求、补充验收点、分析风险或提出界面改进。聊天仅保留在当前页面。</p>
      )}
      <form className={styles.form} onSubmit={submit}>
        <Textarea
          label="想和 AI 讨论什么"
          rows={4}
          maxLength={DEVELOPMENT_LIMITS.aiPromptChars}
          value={prompt}
          disabled={sending}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <small className={styles.muted}>
          每账号每天 {access.userDailyLimit} 次{remaining === undefined ? '' : ` · 今日还可使用 ${remaining} 次`}
        </small>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <div className={styles.aiActions}>
          <Button type="submit" loading={sending}>发送给免费 AI</Button>
          {messages.length > 0 ? (
            <Button type="button" variant="secondary" disabled={sending} onClick={() => { setMessages([]); setError(undefined); }}>
              清空临时聊天
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
