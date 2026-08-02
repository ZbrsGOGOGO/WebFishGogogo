// packages/frontend/src/api/documents.ts
// 文档库领域 API 客户端（对齐 backend DocumentsController）。

import type { DocumentMeta } from '@stealth-reader/shared';

import { http } from './http';

/** 分页文档列表视图（对齐 backend PaginatedDocumentView）。 */
export interface PaginatedDocuments {
  items: DocumentMeta[];
  total: number;
  page: number;
  pageSize: number;
}

/** 列表 / 搜索分页参数。 */
export interface ListDocumentsQuery {
  page?: number;
  pageSize?: number;
  /** 标题关键字；提供时后端按标题搜索（限本人）。 */
  q?: string;
}

/**
 * POST /documents：multipart 上传 .txt 文档。
 *
 * ownedContentDeclarationConfirmed 表单字段对应自有内容声明勾选（Req 2.1/2.2）。
 * ownerId 由后端从 JWT 派生，无需前端传入（Req 2.4）。
 * _Requirements: 2.1_
 */
export function uploadDocument(
  file: File,
  ownedContentDeclarationConfirmed: boolean,
): Promise<DocumentMeta> {
  const form = new FormData();
  form.append('file', file);
  form.append(
    'ownedContentDeclarationConfirmed',
    String(ownedContentDeclarationConfirmed),
  );
  return http.post<DocumentMeta>('/documents', form);
}

/**
 * GET /documents：分页浏览或按标题搜索当前用户文档库。
 * _Requirements: 3.1, 3.2, 3.3_
 */
export function listDocuments(
  query: ListDocumentsQuery = {},
): Promise<PaginatedDocuments> {
  return http.get<PaginatedDocuments>('/documents', {
    query: { page: query.page, pageSize: query.pageSize, q: query.q },
  });
}

/**
 * DELETE /documents/:id：软删除自有文档（非本人由后端返回 403）。
 * _Requirements: 3.4, 3.5_
 */
export function deleteDocument(id: string): Promise<void> {
  return http.delete<void>(`/documents/${encodeURIComponent(id)}`);
}

export const documentsApi = { uploadDocument, listDocuments, deleteDocument };
