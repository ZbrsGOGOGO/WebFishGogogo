import { Readable } from 'node:stream';

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';

import type { StorageConfig } from '../../../config/storage.config';
import type { StoragePort } from './storage.port';

/**
 * 基于 AWS SDK v3 的 S3/MinIO 存储适配器。
 *
 * 同一实现同时兼容：
 * - AWS S3（默认 endpoint + 虚拟主机风格寻址）
 * - MinIO / 其他 S3 兼容服务（自定义 endpoint + 路径风格寻址）
 *
 * 切换只需调整 `StorageConfig`（由环境变量构建），无需改动业务代码，
 * 满足 design.md「Storage 适配器抽象可切换（S3/本地/MinIO）」的要求。
 */
export class S3StorageAdapter implements StoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly keyPrefix: string;

  constructor(config: StorageConfig, client?: S3Client) {
    this.bucket = config.bucket;
    // 规整前缀：去除首尾多余的斜杠，避免生成形如 `//` 的 key。
    this.keyPrefix = config.keyPrefix.replace(/^\/+|\/+$/g, '');

    if (client) {
      this.client = client;
    } else {
      const clientConfig: S3ClientConfig = {
        region: config.region,
        forcePathStyle: config.forcePathStyle,
      };
      if (config.endpoint) {
        clientConfig.endpoint = config.endpoint;
      }
      // 仅在显式提供凭据时设置；否则回退到 SDK 默认凭据链（IAM Role/环境变量等）。
      if (config.accessKeyId && config.secretAccessKey) {
        clientConfig.credentials = {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        };
      }
      this.client = new S3Client(clientConfig);
    }
  }

  /** 构造文档在对象存储中的 key 前缀（不含具体章节文件名）。 */
  private documentPrefix(docId: string): string {
    return `${this.keyPrefix}/${docId}`;
  }

  /** 构造单个章节的完整 storageKey。 */
  private chapterKey(docId: string, idx: number): string {
    return `${this.documentPrefix(docId)}/chapter-${idx}.txt`;
  }

  async putChapter(
    docId: string,
    idx: number,
    content: string,
  ): Promise<string> {
    const storageKey = this.chapterKey(docId, idx);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: content,
        ContentType: 'text/plain; charset=utf-8',
      }),
    );
    return storageKey;
  }

  async getChapter(storageKey: string): Promise<string> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }),
    );

    if (!result.Body) {
      return '';
    }

    // AWS SDK v3 的 Body 在 Node 环境下提供 transformToString；
    // 保留对可读流的回退处理以增强健壮性。
    const body = result.Body as {
      transformToString?: (encoding?: string) => Promise<string>;
    };
    if (typeof body.transformToString === 'function') {
      return body.transformToString('utf-8');
    }
    return this.streamToString(result.Body as Readable);
  }

  async deleteDocument(docId: string): Promise<void> {
    const prefix = `${this.documentPrefix(docId)}/`;
    let continuationToken: string | undefined;

    // 列出该文档前缀下的所有对象并分批删除（单次批量删除上限 1000）。
    do {
      const listed = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      const objects = (listed.Contents ?? [])
        .map((obj) => obj.Key)
        .filter((key): key is string => Boolean(key));

      if (objects.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: {
              Objects: objects.map((Key) => ({ Key })),
              Quiet: true,
            },
          }),
        );
      }

      continuationToken = listed.IsTruncated
        ? listed.NextContinuationToken
        : undefined;
    } while (continuationToken);
  }

  /** 将可读流读取为 UTF-8 字符串（transformToString 不可用时的回退）。 */
  private async streamToString(stream: Readable): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks).toString('utf-8');
  }
}
