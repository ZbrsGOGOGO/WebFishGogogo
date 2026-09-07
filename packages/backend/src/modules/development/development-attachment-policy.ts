import { isUtf8 } from 'node:buffer';
import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';

import { BadRequestException } from '@nestjs/common';
import {
  DEVELOPMENT_LIMITS,
  type DevelopmentAttachment,
} from '@stealth-reader/shared';
import * as yauzl from 'yauzl';

type InspectedDevelopmentAttachment = Omit<
  DevelopmentAttachment,
  'id' | 'createdAt'
>;

interface UploadFile {
  originalname: string;
  buffer: Buffer;
  mimetype?: string;
}

interface FormatDefinition {
  mediaType: string;
  mimeAliases: readonly string[];
  kind: 'text' | 'pdf' | 'docx' | 'zip' | 'png' | 'jpeg' | 'webp';
}

interface ArchiveInspection {
  excerpt: string;
  extraction: 'text' | 'metadata_only';
  warnings: string[];
}

const TEXT_EXCERPT_CHARS = 12_000;
const ARCHIVE_MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
const ARCHIVE_MAX_ENTRIES = 100;
const ARCHIVE_MAX_RATIO = 100;
const ARCHIVE_TIMEOUT_MS = 5_000;
const MAX_FILENAME_BYTES = 255;
const MAX_ARCHIVE_ENTRY_NAME_CHARS = 1_024;

const FORMATS: Readonly<Record<string, FormatDefinition>> = Object.freeze({
  txt: {
    mediaType: 'text/plain',
    mimeAliases: ['text/plain'],
    kind: 'text',
  },
  md: {
    mediaType: 'text/markdown',
    mimeAliases: ['text/markdown', 'text/plain'],
    kind: 'text',
  },
  csv: {
    mediaType: 'text/csv',
    mimeAliases: ['text/csv', 'application/csv', 'application/vnd.ms-excel'],
    kind: 'text',
  },
  json: {
    mediaType: 'application/json',
    mimeAliases: ['application/json', 'text/json', 'text/plain'],
    kind: 'text',
  },
  log: {
    mediaType: 'text/plain',
    mimeAliases: ['text/plain'],
    kind: 'text',
  },
  pdf: {
    mediaType: 'application/pdf',
    mimeAliases: ['application/pdf'],
    kind: 'pdf',
  },
  docx: {
    mediaType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    mimeAliases: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
    ],
    kind: 'docx',
  },
  zip: {
    mediaType: 'application/zip',
    mimeAliases: ['application/zip', 'application/x-zip-compressed'],
    kind: 'zip',
  },
  png: {
    mediaType: 'image/png',
    mimeAliases: ['image/png'],
    kind: 'png',
  },
  jpg: {
    mediaType: 'image/jpeg',
    mimeAliases: ['image/jpeg', 'image/jpg'],
    kind: 'jpeg',
  },
  jpeg: {
    mediaType: 'image/jpeg',
    mimeAliases: ['image/jpeg', 'image/jpg'],
    kind: 'jpeg',
  },
  webp: {
    mediaType: 'image/webp',
    mimeAliases: ['image/webp'],
    kind: 'webp',
  },
});

const UNSAFE_FILENAME_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>:"|?*]/u;
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
const DANGEROUS_SECONDARY_EXTENSION = /\.(?:exe|com|scr|msi|dll|bat|cmd|ps1|sh|html?|svg|js|mjs|cjs)$/iu;
const ACTIVE_TEXT_MARKUP = /<!doctype\s+html\b|<\s*(?:html|script|svg|iframe|object|embed)\b/iu;
const FORBIDDEN_XML_DECLARATION = /<!\s*(?:DOCTYPE|ENTITY)\b/iu;
const DOCX_ACTIVE_PART = /(?:^|\/)(?:vbaProject\.bin|activeX\/|embeddings\/)/iu;

const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const ZIP_SIGNATURES = [
  Buffer.from('504b0304', 'hex'),
  Buffer.from('504b0506', 'hex'),
  Buffer.from('504b0708', 'hex'),
] as const;

export async function inspectDevelopmentAttachment(
  file: UploadFile,
): Promise<InspectedDevelopmentAttachment> {
  if (!file || typeof file !== 'object' || !Buffer.isBuffer(file.buffer)) {
    rejectInvalid('附件数据缺失或格式不正确');
  }
  if (file.buffer.length > DEVELOPMENT_LIMITS.fileBytes) {
    throw attachmentException(
      'DEVELOPMENT_ATTACHMENT_TOO_LARGE',
      `附件不能超过 ${DEVELOPMENT_LIMITS.fileBytes} 字节`,
    );
  }
  if (file.buffer.length === 0) rejectInvalid('不能上传空附件');

  const filename = inspectOuterFilename(file.originalname);
  const extension = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
  const format = FORMATS[extension];
  if (!format) {
    rejectInvalid('不支持该附件类型');
  }
  rejectKnownExecutableSignature(file.buffer);
  rejectMismatchedKnownSignature(format.kind, file.buffer);
  assertSignature(format.kind, file.buffer);

  const warnings: string[] = [];
  appendMimeWarning(warnings, file.mimetype, format);
  let extraction: 'text' | 'metadata_only';
  let excerpt: string | null;

  if (format.kind === 'text') {
    const inspected = inspectUtf8Text(file.buffer, extension);
    extraction = 'text';
    excerpt = inspected.excerpt;
    warnings.push(...inspected.warnings);
  } else if (format.kind === 'docx' || format.kind === 'zip') {
    const inspected = await inspectArchive(file.buffer, format.kind);
    extraction = inspected.extraction;
    excerpt = inspected.excerpt;
    warnings.push(...inspected.warnings);
  } else {
    extraction = 'metadata_only';
    excerpt = null;
    warnings.push(
      format.kind === 'pdf'
        ? '仅校验 PDF 签名和基础元数据；系统未读取或理解文档正文，需人工查看。'
        : '仅校验图片签名和基础元数据；系统未读取或理解图像内容，需人工查看。',
    );
  }

  return {
    filename,
    mediaType: format.mediaType,
    bytes: file.buffer.length,
    sha256: createHash('sha256').update(file.buffer).digest('hex'),
    extraction,
    excerpt,
    warnings: [...new Set(warnings)],
  };
}

function inspectOuterFilename(originalname: unknown): string {
  if (typeof originalname !== 'string' || !originalname) {
    rejectInvalid('附件文件名缺失');
  }
  if (originalname !== originalname.trim()) {
    rejectInvalid('附件文件名不能以空格开头或结尾');
  }
  const filename = repairMulterUtf8Filename(originalname).normalize('NFKC');
  if (
    !filename ||
    filename === '.' ||
    filename === '..' ||
    filename.startsWith('.') ||
    filename.endsWith('.') ||
    filename.includes('/') ||
    filename.includes('\\') ||
    UNSAFE_FILENAME_CHARACTERS.test(filename) ||
    Buffer.byteLength(filename, 'utf8') > MAX_FILENAME_BYTES
  ) {
    rejectInvalid('附件文件名包含路径、控制字符或危险字符');
  }
  if (WINDOWS_RESERVED_NAME.test(filename)) {
    rejectInvalid('附件文件名为系统保留名称');
  }
  const dot = filename.lastIndexOf('.');
  if (dot <= 0 || dot === filename.length - 1) {
    rejectInvalid('附件文件名必须包含允许的扩展名');
  }
  const stem = filename.slice(0, dot);
  if (DANGEROUS_SECONDARY_EXTENSION.test(stem)) {
    rejectInvalid('附件文件名包含伪装的可执行或主动内容扩展名');
  }
  return filename;
}

/**
 * Busboy/Multer deployments sometimes expose UTF-8 filename bytes as latin1.
 * Repair only the narrow, reversible case where every source code point is a
 * byte, UTF-8 fatal decoding succeeds, and the decoded name contains genuine
 * non-latin text. Ordinary latin1 names (for example "café.txt") are left as-is.
 * All path and dangerous-character validation deliberately runs afterwards.
 */
function repairMulterUtf8Filename(value: string): string {
  const codePoints = Array.from(value, (character) => character.codePointAt(0) ?? 0);
  if (codePoints.some((codePoint) => codePoint > 0xff)) return value;
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(codePoints));
  } catch {
    return value;
  }
  return Array.from(decoded).some((character) => (character.codePointAt(0) ?? 0) > 0xff)
    ? decoded
    : value;
}

function rejectKnownExecutableSignature(buffer: Buffer): void {
  if (
    buffer.subarray(0, 2).equals(Buffer.from('MZ', 'ascii')) ||
    buffer.subarray(0, 4).equals(Buffer.from('7f454c46', 'hex')) ||
    ['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe'].includes(
      buffer.subarray(0, 4).toString('hex'),
    )
  ) {
    rejectInvalid('检测到可执行文件签名');
  }
}

function rejectMismatchedKnownSignature(
  expected: FormatDefinition['kind'],
  buffer: Buffer,
): void {
  let detected: 'pdf' | 'zip' | 'png' | 'jpeg' | 'webp' | null = null;
  if (buffer.subarray(0, 5).equals(Buffer.from('%PDF-', 'ascii'))) {
    detected = 'pdf';
  } else if (ZIP_SIGNATURES.some((signature) => buffer.subarray(0, 4).equals(signature))) {
    detected = 'zip';
  } else if (buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    detected = 'png';
  } else if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    detected = 'jpeg';
  } else if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    detected = 'webp';
  }
  const expectedMatches =
    detected === null ||
    detected === expected ||
    (detected === 'zip' && (expected === 'zip' || expected === 'docx'));
  if (!expectedMatches) rejectInvalid('文件的二进制签名与扩展名不一致');
}

function assertSignature(kind: FormatDefinition['kind'], buffer: Buffer): void {
  switch (kind) {
    case 'text':
      if (!isUtf8(buffer)) rejectInvalid('文本附件必须为有效 UTF-8');
      return;
    case 'pdf': {
      const hasHeader = buffer.subarray(0, 5).equals(Buffer.from('%PDF-', 'ascii'));
      const trailer = buffer
        .subarray(Math.max(0, buffer.length - 2_048))
        .toString('latin1');
      if (!hasHeader || !trailer.includes('%%EOF')) {
        rejectInvalid('PDF 文件签名或结尾不正确');
      }
      return;
    }
    case 'docx':
    case 'zip':
      if (!ZIP_SIGNATURES.some((signature) => buffer.subarray(0, 4).equals(signature))) {
        rejectInvalid('压缩文件签名不正确');
      }
      return;
    case 'png':
      if (
        buffer.length < 33 ||
        !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) ||
        buffer.readUInt32BE(8) !== 13 ||
        buffer.subarray(12, 16).toString('ascii') !== 'IHDR'
      ) {
        rejectInvalid('PNG 文件签名或头部不正确');
      }
      return;
    case 'jpeg':
      if (
        buffer.length < 4 ||
        buffer[0] !== 0xff ||
        buffer[1] !== 0xd8 ||
        buffer[2] !== 0xff ||
        buffer[buffer.length - 2] !== 0xff ||
        buffer[buffer.length - 1] !== 0xd9
      ) {
        rejectInvalid('JPEG 文件签名或结尾不正确');
      }
      return;
    case 'webp':
      if (
        buffer.length < 16 ||
        buffer.subarray(0, 4).toString('ascii') !== 'RIFF' ||
        buffer.subarray(8, 12).toString('ascii') !== 'WEBP' ||
        buffer.readUInt32LE(4) + 8 !== buffer.length ||
        !['VP8 ', 'VP8L', 'VP8X'].includes(buffer.subarray(12, 16).toString('ascii'))
      ) {
        rejectInvalid('WebP 文件签名或 RIFF 长度不正确');
      }
  }
}

function inspectUtf8Text(
  buffer: Buffer,
  extension: string,
): { excerpt: string; warnings: string[] } {
  let text = buffer.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(text)) {
    rejectInvalid('文本附件包含不允许的二进制或控制字符');
  }
  if (extension === 'json') {
    try {
      JSON.parse(text);
    } catch {
      rejectInvalid('JSON 附件语法不正确');
    }
  } else if (ACTIVE_TEXT_MARKUP.test(text)) {
    rejectInvalid('文本附件包含 HTML、SVG 或脚本标记');
  }

  const warnings = [
    '附件内容仅作为用户提供的资料文本；系统未访问链接或执行其中任何指令。',
  ];
  if (extension === 'csv' && /(?:^|\r?\n)[=+@-]/u.test(text)) {
    warnings.push('表格内容可能包含公式；系统未执行，人工打开时需禁用外部链接和宏。');
  }
  const limited = limitExcerpt(text);
  if (limited.truncated) {
    warnings.push(`文本超过 ${TEXT_EXCERPT_CHARS} 个字符，预览已截断；请人工查看原文件。`);
  }
  return { excerpt: limited.value, warnings };
}

async function inspectArchive(
  buffer: Buffer,
  kind: 'docx' | 'zip',
): Promise<ArchiveInspection> {
  let zipFile: yauzl.ZipFile | null = null;
  let activeStream: Readable | null = null;
  const timeoutError = attachmentException(
    'DEVELOPMENT_ATTACHMENT_INVALID',
    '压缩包检查超时',
  );
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      activeStream?.destroy(timeoutError);
      if (zipFile?.isOpen) zipFile.close();
      reject(timeoutError);
    }, ARCHIVE_TIMEOUT_MS);
    timeout.unref?.();
  });

  const work = (async (): Promise<ArchiveInspection> => {
    zipFile = await yauzl.fromBufferPromise(buffer, {
      lazyEntries: true,
      decodeStrings: true,
      validateEntrySizes: true,
      strictFileNames: true,
    });
    if (zipFile.entryCount > ARCHIVE_MAX_ENTRIES) {
      rejectInvalid(`压缩包条目不能超过 ${ARCHIVE_MAX_ENTRIES} 个`);
    }

    const names: string[] = [];
    const seenNames = new Set<string>();
    const documentChunks: Buffer[] = [];
    const contentTypeChunks: Buffer[] = [];
    const warnings: string[] = [];
    let entries = 0;
    let files = 0;
    let claimedTotal = 0;
    let actualTotal = 0;

    for await (const entry of zipFile.eachEntry()) {
      entries += 1;
      if (entries > ARCHIVE_MAX_ENTRIES) {
        rejectInvalid(`压缩包条目不能超过 ${ARCHIVE_MAX_ENTRIES} 个`);
      }
      const name = inspectArchiveEntryName(entry.fileName);
      if (seenNames.has(name)) rejectInvalid('压缩包含有重复路径');
      seenNames.add(name);
      names.push(name);
      assertArchiveEntryMetadata(entry);
      claimedTotal += entry.uncompressedSize;
      if (claimedTotal > ARCHIVE_MAX_UNCOMPRESSED_BYTES) {
        rejectInvalid('压缩包解压后总大小超过 20 MiB');
      }
      if (exceedsRatio(entry.uncompressedSize, entry.compressedSize)) {
        rejectInvalid(`压缩包条目压缩比超过 ${ARCHIVE_MAX_RATIO}:1`);
      }

      const directory = name.endsWith('/');
      if (directory) {
        if (entry.uncompressedSize !== 0 || entry.compressedSize !== 0) {
          rejectInvalid('压缩包目录条目不应包含数据');
        }
        continue;
      }
      files += 1;
      if (kind === 'docx' && DOCX_ACTIVE_PART.test(name)) {
        rejectInvalid('DOCX 包含宏、嵌入对象或 ActiveX 内容');
      }
      if (kind === 'zip' && isPotentiallyActiveArchiveEntry(name)) {
        warnings.push('压缩包目录含可执行或主动内容类型；系统未打开该内容，人工下载时需谨慎。');
      }

      const captureDocument = kind === 'docx' && name === 'word/document.xml';
      const captureContentTypes = kind === 'docx' && name === '[Content_Types].xml';
      const stream = await zipFile.openReadStreamPromise(entry);
      activeStream = stream;
      let actualEntryBytes = 0;
      try {
        for await (const value of stream) {
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
          actualEntryBytes += chunk.length;
          actualTotal += chunk.length;
          if (actualTotal > ARCHIVE_MAX_UNCOMPRESSED_BYTES) {
            stream.destroy();
            rejectInvalid('压缩包实际解压流量超过 20 MiB');
          }
          if (exceedsRatio(actualEntryBytes, entry.compressedSize)) {
            stream.destroy();
            rejectInvalid(`压缩包实际压缩比超过 ${ARCHIVE_MAX_RATIO}:1`);
          }
          if (captureDocument) documentChunks.push(Buffer.from(chunk));
          if (captureContentTypes) contentTypeChunks.push(Buffer.from(chunk));
        }
      } finally {
        activeStream = null;
      }
      if (actualEntryBytes !== entry.uncompressedSize) {
        rejectInvalid('压缩包条目的实际大小与目录记录不一致');
      }
    }

    if (entries === 0 || files === 0) rejectInvalid('压缩包中没有可检查的文件');
    if (kind === 'zip') {
      const limited = limitExcerpt(names.join('\n'));
      if (limited.truncated) {
        warnings.push('压缩包目录预览超过长度上限，已截断显示。');
      }
      warnings.push('压缩包仅完成安全校验和纯文本目录列举；未提取、分析或执行文件正文，需人工查看。');
      return {
        excerpt: limited.value,
        extraction: 'metadata_only',
        warnings: [...new Set(warnings)],
      };
    }

    if (!seenNames.has('[Content_Types].xml') || !seenNames.has('word/document.xml')) {
      rejectInvalid('DOCX 缺少必需的内容类型或正文部件');
    }
    const contentTypes = decodeSafeXml(
      Buffer.concat(contentTypeChunks),
      'DOCX 内容类型',
    );
    if (
      !contentTypes.includes(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
      ) ||
      /macroEnabled/iu.test(contentTypes)
    ) {
      rejectInvalid('DOCX 内容类型不正确或含宏文档声明');
    }
    const documentXml = decodeSafeXml(
      Buffer.concat(documentChunks),
      'DOCX 正文',
    );
    const text = extractDocxText(documentXml);
    const limited = limitExcerpt(text);
    if (limited.truncated) {
      warnings.push(`DOCX 正文超过 ${TEXT_EXCERPT_CHARS} 个字符，预览已截断；请人工查看原文件。`);
    }
    warnings.push('DOCX 仅提取 word/document.xml 的纯文本；未访问链接、外部资源或执行其中指令。');
    return {
      excerpt: limited.value,
      extraction: 'text',
      warnings: [...new Set(warnings)],
    };
  })();

  try {
    return await Promise.race([work, timeoutPromise]);
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw attachmentException(
      'DEVELOPMENT_ATTACHMENT_INVALID',
      '压缩包损坏、加密或使用了不支持的格式',
    );
  } finally {
    if (timeout) clearTimeout(timeout);
    const finalStream = activeStream as Readable | null;
    const finalZipFile = zipFile as yauzl.ZipFile | null;
    finalStream?.destroy();
    if (finalZipFile?.isOpen) finalZipFile.close();
  }
}

function inspectArchiveEntryName(rawName: string): string {
  if (typeof rawName !== 'string' || !rawName) rejectInvalid('压缩包条目名称为空');
  const name = rawName.normalize('NFKC');
  const withoutTrailingSlash = name.endsWith('/') ? name.slice(0, -1) : name;
  const segments = withoutTrailingSlash.split('/');
  if (
    name.length > MAX_ARCHIVE_ENTRY_NAME_CHARS ||
    name.startsWith('/') ||
    name.includes('\\') ||
    /^[a-z]:/iu.test(name) ||
    UNSAFE_FILENAME_CHARACTERS.test(name) ||
    !withoutTrailingSlash ||
    segments.some(
      (segment, index) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        (segment.startsWith('.') &&
          !(segment === '.rels' && index > 0 && segments[index - 1] === '_rels')) ||
        segment.endsWith('.') ||
        segment !== segment.trim() ||
        WINDOWS_RESERVED_NAME.test(segment),
    )
  ) {
    rejectInvalid('压缩包条目包含路径穿越、控制字符或危险文件名');
  }
  return name;
}

function assertArchiveEntryMetadata(entry: yauzl.Entry): void {
  if (
    !Number.isSafeInteger(entry.compressedSize) ||
    !Number.isSafeInteger(entry.uncompressedSize) ||
    entry.compressedSize < 0 ||
    entry.uncompressedSize < 0
  ) {
    rejectInvalid('压缩包条目大小不合法');
  }
  if (entry.isEncrypted()) rejectInvalid('不接受加密压缩包');
  if (!entry.canDecodeFileData()) rejectInvalid('压缩包使用了不支持的压缩方法');

  const unixType = (entry.externalFileAttributes >>> 16) & 0o170000;
  if (unixType === 0o120000) rejectInvalid('压缩包不能包含符号链接');
}

function exceedsRatio(uncompressed: number, compressed: number): boolean {
  if (uncompressed === 0) return false;
  return compressed === 0 || uncompressed > compressed * ARCHIVE_MAX_RATIO;
}

function isPotentiallyActiveArchiveEntry(name: string): boolean {
  return /\.(?:exe|com|scr|msi|dll|bat|cmd|ps1|sh|html?|svg|js|mjs|cjs)$/iu.test(name);
}

function decodeSafeXml(buffer: Buffer, label: string): string {
  if (!buffer.length || !isUtf8(buffer)) rejectInvalid(`${label}必须是有效 UTF-8`);
  const xml = buffer.toString('utf8');
  if (FORBIDDEN_XML_DECLARATION.test(xml)) {
    rejectInvalid(`${label}不能包含 DTD 或实体声明`);
  }
  return xml;
}

function extractDocxText(xml: string): string {
  if (!/<(?:[A-Za-z_][\w.-]*:)?document\b/u.test(xml)) {
    rejectInvalid('DOCX 正文 XML 缺少 document 根元素');
  }
  const pieces: string[] = [];
  const tokenPattern =
    /<(?:[A-Za-z_][\w.-]*:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?t\s*>|<(?:[A-Za-z_][\w.-]*:)?(?:tab|br)(?:\s[^>]*)?\/\s*>|<\/(?:[A-Za-z_][\w.-]*:)?p\s*>/giu;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(xml))) {
    if (match[1] !== undefined) {
      pieces.push(decodeXmlText(match[1]));
    } else if (/\btab\b/iu.test(match[0])) {
      pieces.push('\t');
    } else {
      pieces.push('\n');
    }
  }
  return pieces.join('').replace(/\n{3,}/gu, '\n\n').trim();
}

function decodeXmlText(value: string): string {
  if (/<[^>]*>/u.test(value)) rejectInvalid('DOCX 正文文本节点含未预期标记');
  return value.replace(
    /&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/giu,
    (entity) => {
      switch (entity.toLowerCase()) {
        case '&amp;':
          return '&';
        case '&lt;':
          return '<';
        case '&gt;':
          return '>';
        case '&quot;':
          return '"';
        case '&apos;':
          return "'";
        default: {
          const hexadecimal = entity[2]?.toLowerCase() === 'x';
          const raw = entity.slice(hexadecimal ? 3 : 2, -1);
          const codePoint = Number.parseInt(raw, hexadecimal ? 16 : 10);
          if (
            !Number.isSafeInteger(codePoint) ||
            codePoint < 0 ||
            codePoint > 0x10ffff ||
            (codePoint >= 0xd800 && codePoint <= 0xdfff)
          ) {
            rejectInvalid('DOCX 正文含无效 XML 字符实体');
          }
          return String.fromCodePoint(codePoint);
        }
      }
    },
  ).replace(/&[A-Za-z_:][\w:.-]*;/gu, () => {
    rejectInvalid('DOCX 正文含不允许的自定义实体');
  });
}

function limitExcerpt(value: string): { value: string; truncated: boolean } {
  if (value.length <= TEXT_EXCERPT_CHARS) return { value, truncated: false };
  let excerpt = value.slice(0, TEXT_EXCERPT_CHARS);
  const finalCodeUnit = excerpt.charCodeAt(excerpt.length - 1);
  if (finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff) excerpt = excerpt.slice(0, -1);
  return { value: excerpt, truncated: true };
}

function appendMimeWarning(
  warnings: string[],
  declaredMime: unknown,
  format: FormatDefinition,
): void {
  if (typeof declaredMime !== 'string' || !declaredMime.trim()) return;
  const normalized = declaredMime.split(';', 1)[0]?.trim().toLowerCase();
  if (!normalized || !format.mimeAliases.includes(normalized)) {
    warnings.push('上传时声明的 MIME 类型与已校验格式不一致；已按文件签名和扩展名处理。');
  }
}

function attachmentException(
  code: 'DEVELOPMENT_ATTACHMENT_INVALID' | 'DEVELOPMENT_ATTACHMENT_TOO_LARGE',
  message: string,
): BadRequestException {
  return new BadRequestException({ code, message });
}

function rejectInvalid(message: string): never {
  throw attachmentException('DEVELOPMENT_ATTACHMENT_INVALID', message);
}
