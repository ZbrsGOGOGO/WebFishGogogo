import { useState, type FormEvent, type JSX } from 'react';

import {
  communityContentApi,
  createCommunityIdempotencyKey,
  type CommunityReportReason,
} from '../../api/community';
import { Button } from '../../components/ui';
import { communityRequestErrorMessage } from '../community/request-error';
import styles from './CommunityContent.module.css';

const REASONS: Array<{ value: CommunityReportReason; label: string }> = [
  { value: 'illegal', label: '违法违规' },
  { value: 'harassment', label: '骚扰或人身攻击' },
  { value: 'spam', label: '垃圾广告' },
  { value: 'misinformation', label: '疑似不实信息' },
  { value: 'privacy', label: '泄露个人信息' },
  { value: 'other', label: '其他' },
];

export function ContentReportForm({
  targetType,
  targetId,
  onClose,
}: {
  targetType: 'post' | 'comment';
  targetId: string;
  onClose: () => void;
}): JSX.Element {
  const [reason, setReason] = useState<CommunityReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [receipt, setReceipt] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!reason) {
      setError('请选择举报原因');
      return;
    }
    if (Array.from(details.trim()).length > 500) {
      setError('补充说明最多 500 个字符');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const result = await communityContentApi.report(
        targetType,
        targetId,
        reason,
        details.trim(),
        createCommunityIdempotencyKey(`report:${targetType}:${targetId}`),
      );
      setReceipt(result.reportId);
    } catch (requestError) {
      setError(communityRequestErrorMessage(requestError, '举报提交失败'));
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    return (
      <div className={styles.reportBox} role="status">
        <strong>举报已由服务端确认接收</strong>
        <p>受理编号：{receipt}</p>
        <Button variant="secondary" size="sm" onClick={onClose}>关闭</Button>
      </div>
    );
  }

  return (
    <form className={styles.reportBox} onSubmit={submit}>
      <strong>举报{targetType === 'post' ? '帖子' : '评论'}</strong>
      <label>
        原因
        <select value={reason} onChange={(event) => setReason(event.target.value as CommunityReportReason)}>
          <option value="">请选择</option>
          {REASONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label>
        补充说明（可选）
        <textarea value={details} maxLength={500} onChange={(event) => setDetails(event.target.value)} />
      </label>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.actions}>
        <Button type="submit" size="sm" loading={busy}>提交举报</Button>
        <Button variant="ghost" size="sm" onClick={onClose}>取消</Button>
      </div>
    </form>
  );
}
