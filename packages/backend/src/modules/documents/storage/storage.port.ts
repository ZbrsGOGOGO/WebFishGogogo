/**
 * 对象存储抽象接口（Storage Port）。
 *
 * 见 design.md 关切点 6.2：正文按章节存放于对象存储，Service 层只依赖此抽象，
 * 具体实现（AWS S3 / MinIO / 本地）可通过配置切换而不影响上层逻辑。
 */
export interface StoragePort {
  /** 保存单个章节正文，返回该章节的 storageKey。 */
  putChapter(docId: string, idx: number, content: string): Promise<string>;
  /** 读取章节正文。 */
  getChapter(storageKey: string): Promise<string>;
  /** 删除文档的全部正文。 */
  deleteDocument(docId: string): Promise<void>;
}

/**
 * StoragePort 的 DI 注入令牌。
 * 由于接口在运行时被擦除，使用该字符串令牌进行 NestJS 依赖注入。
 */
export const STORAGE_PORT = Symbol('STORAGE_PORT');
