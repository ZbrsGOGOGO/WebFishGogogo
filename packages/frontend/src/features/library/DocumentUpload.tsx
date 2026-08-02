// packages/frontend/src/features/library/DocumentUpload.tsx
// 文档上传组件：选择 .txt 文件 + 强制勾选自有内容声明，未勾选禁止上传。
//
// - 自有合法内容声明（Req 13.1）在上传界面明确展示，须用户主动确认。
// - 上传按钮在「已选择文件」且「已勾选声明」前保持禁用（Req 2.2）。
// - 提交时通过 documentsApi.uploadDocument 传递 ownedContentDeclarationConfirmed（Req 2.1）。

import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type JSX,
} from 'react';

import { ApiError, documentsApi } from '../../api';
import { SelfOwnedContentDeclaration } from '../../components/compliance/SelfOwnedContentDeclaration';
import { Button } from '../../components/ui';
import styles from './LibraryPage.module.css';

export interface DocumentUploadProps {
  /** 上传成功回调：供父组件刷新库列表。 */
  onUploaded?: () => void;
}

export function DocumentUpload({ onUploaded }: DocumentUploadProps): JSX.Element {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [declarationConfirmed, setDeclarationConfirmed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 未选择文件、未勾选声明或上传进行中时禁止上传（Req 2.2 / 13.1）。
  const canUpload = file !== null && declarationConfirmed && !uploading;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    selectFile(event.target.files?.[0] ?? null);
  }

  function selectFile(nextFile: File | null): void {
    if (
      nextFile &&
      !nextFile.name.toLowerCase().endsWith('.txt') &&
      nextFile.type !== 'text/plain'
    ) {
      setFile(null);
      setError('当前仅支持 .txt 文本文档。');
      setSuccess(null);
      return;
    }
    setFile(nextFile);
    setError(null);
    setSuccess(null);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    selectFile(event.dataTransfer.files?.[0] ?? null);
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
    <section className={styles.uploadPanel} aria-labelledby="upload-title">
      <div className={styles.panelHeading}>
        <span className={styles.eyebrow}>本机安全导入</span>
        <h2 id="upload-title">选择 TXT 文档</h2>
        <p>导入后自动解析章节；文档仅对当前账户可见。</p>
      </div>
      <form className={styles.uploadForm} onSubmit={handleSubmit} noValidate>
        <div
          className={`${styles.dropZone} ${file ? styles.hasFile : ''}`}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            id={inputId}
            className={styles.fileInput}
            type="file"
            name="file"
            aria-label="选择 .txt 文件"
            accept=".txt,text/plain"
            onChange={handleFileChange}
          />
          <label htmlFor={inputId}>
            <span className={styles.uploadIcon} aria-hidden="true">
              {file ? '✓' : '↑'}
            </span>
            <strong>{file ? file.name : '拖放 TXT 文件到这里'}</strong>
            <span>
              {file
                ? `${Math.max(1, Math.ceil(file.size / 1024))} KB · 已准备上传`
                : '或点击选择本地文件'}
            </span>
          </label>
        </div>

        {/* 自有合法内容声明（Req 13.1）：明确展示并须用户主动确认。 */}
        <div className={styles.declarationBox}>
          <SelfOwnedContentDeclaration />
        </div>
        <label className={styles.confirmation}>
          <input
            type="checkbox"
            name="ownedContentDeclarationConfirmed"
            checked={declarationConfirmed}
            onChange={(e) => setDeclarationConfirmed(e.target.checked)}
          />
          我确认上传的内容为本人自有且合法拥有，不侵犯任何第三方权利。
        </label>

        {error ? (
          <p className={styles.uploadError} role="alert">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className={styles.uploadSuccess} role="status">
            {success}
          </p>
        ) : null}

        <Button
          type="submit"
          fullWidth
          loading={uploading}
          disabled={!canUpload}
          aria-label="上传"
        >
          {uploading ? '正在导入…' : '确认导入'}
        </Button>
      </form>
    </section>
  );
}
