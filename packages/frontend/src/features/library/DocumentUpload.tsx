// packages/frontend/src/features/library/DocumentUpload.tsx
// 文档上传组件：选择 .txt 文件 + 强制勾选自有内容声明，未勾选禁止上传。
//
// - 自有合法内容声明（Req 13.1）在上传界面明确展示，须用户主动确认。
// - 上传按钮在「已选择文件」且「已勾选声明」前保持禁用（Req 2.2）。
// - 提交时通过 documentsApi.uploadDocument 传递 ownedContentDeclarationConfirmed（Req 2.1）。

import { useRef, useState, type ChangeEvent, type FormEvent, type JSX } from 'react';

import { ApiError, documentsApi } from '../../api';
import { SelfOwnedContentDeclaration } from '../../components/compliance/SelfOwnedContentDeclaration';

export interface DocumentUploadProps {
  /** 上传成功回调：供父组件刷新库列表。 */
  onUploaded?: () => void;
}

export function DocumentUpload({ onUploaded }: DocumentUploadProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [declarationConfirmed, setDeclarationConfirmed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 未选择文件、未勾选声明或上传进行中时禁止上传（Req 2.2 / 13.1）。
  const canUpload = file !== null && declarationConfirmed && !uploading;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    setFile(event.target.files?.[0] ?? null);
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canUpload || file === null) {
      return;
    }
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const doc = await documentsApi.uploadDocument(file, declarationConfirmed);
      setSuccess(`已上传：${doc.title}`);
      // 重置表单，声明勾选亦复位，确保下次上传需重新确认。
      setFile(null);
      setDeclarationConfirmed(false);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      onUploaded?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '上传失败，请稍后重试');
    } finally {
      setUploading(false);
    }
  }

  return (
    <section aria-labelledby="upload-title">
      <h2 id="upload-title">上传文档</h2>
      <form onSubmit={handleSubmit} noValidate>
        <label>
          选择 .txt 文件
          <input
            ref={inputRef}
            type="file"
            name="file"
            accept=".txt,text/plain"
            onChange={handleFileChange}
          />
        </label>

        {/* 自有合法内容声明（Req 13.1）：明确展示并须用户主动确认。 */}
        <SelfOwnedContentDeclaration />
        <label>
          <input
            type="checkbox"
            name="ownedContentDeclarationConfirmed"
            checked={declarationConfirmed}
            onChange={(e) => setDeclarationConfirmed(e.target.checked)}
          />
          我确认上传的内容为本人自有且合法拥有，不侵犯任何第三方权利。
        </label>

        {error ? (
          <p role="alert" style={{ color: 'crimson' }}>
            {error}
          </p>
        ) : null}
        {success ? (
          <p role="status" style={{ color: 'green' }}>
            {success}
          </p>
        ) : null}

        <button type="submit" disabled={!canUpload}>
          {uploading ? '上传中…' : '上传'}
        </button>
      </form>
    </section>
  );
}
