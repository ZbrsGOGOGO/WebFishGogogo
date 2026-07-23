/**
 * 对象存储（S3 兼容）配置。
 *
 * 说明（见 design.md 关切点 2.2「正文与元数据分离」、关切点 6「Storage 适配器」）：
 * - 文档正文按章节存放于 S3 兼容对象存储，元数据/索引留在 PostgreSQL。
 * - 适配器面向 `StoragePort` 抽象，实现可在 AWS S3 / MinIO / 其他兼容服务间切换。
 * - MinIO / 自托管场景需 `forcePathStyle = true`（路径风格寻址）并显式指定 `endpoint`。
 */
export interface StorageConfig {
  /** 自定义 endpoint（MinIO / 兼容服务需要；留空则走 AWS 默认 endpoint）。 */
  endpoint?: string;
  /** 区域，AWS 必填；MinIO 可用任意占位值（如 `us-east-1`）。 */
  region: string;
  /** 存放文档正文的 bucket 名。 */
  bucket: string;
  /** 访问密钥；留空则回退到 SDK 默认凭据链（如 IAM Role、环境变量等）。 */
  accessKeyId?: string;
  /** 访问密钥 secret。 */
  secretAccessKey?: string;
  /** 是否使用路径风格寻址（MinIO / 自托管通常为 true）。 */
  forcePathStyle: boolean;
  /** 章节对象 key 前缀，最终 key 形如 `${keyPrefix}/${docId}/chapter-${idx}.txt`。 */
  keyPrefix: string;
}

/**
 * 从环境变量构建对象存储配置。
 *
 * 环境变量：
 * - `STORAGE_ENDPOINT`        自定义 endpoint（MinIO 如 `http://localhost:9000`）
 * - `STORAGE_REGION`          区域（默认 `us-east-1`）
 * - `STORAGE_BUCKET`          bucket 名（默认 `stealth-reader`）
 * - `STORAGE_ACCESS_KEY_ID`   访问密钥
 * - `STORAGE_SECRET_ACCESS_KEY` 访问密钥 secret
 * - `STORAGE_FORCE_PATH_STYLE`  `'true'` 启用路径风格（MinIO 建议开启）
 * - `STORAGE_KEY_PREFIX`      key 前缀（默认 `documents`）
 */
export function buildStorageConfig(
  env: NodeJS.ProcessEnv = process.env,
): StorageConfig {
  return {
    endpoint: env.STORAGE_ENDPOINT || undefined,
    region: env.STORAGE_REGION ?? 'us-east-1',
    bucket: env.STORAGE_BUCKET ?? 'stealth-reader',
    accessKeyId: env.STORAGE_ACCESS_KEY_ID || undefined,
    secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY || undefined,
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE === 'true',
    keyPrefix: env.STORAGE_KEY_PREFIX ?? 'documents',
  };
}
