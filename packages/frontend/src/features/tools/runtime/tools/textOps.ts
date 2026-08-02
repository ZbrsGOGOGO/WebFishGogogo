// packages/frontend/src/features/tools/runtime/tools/textOps.ts
// 文本处理工具（text-tools）的纯逻辑：一组无副作用的文本操作。
// 与 UI 分离，便于单测覆盖。

/** 支持的文本操作标识。 */
export type TextOp =
  | 'uppercase'
  | 'lowercase'
  | 'dedupe'
  | 'removeBlank'
  | 'sortAsc'
  | 'sortDesc'
  | 'trimLines';

/** 操作元数据：标识 + 展示名。 */
export interface TextOpMeta {
  op: TextOp;
  label: string;
}

/** 全部操作（用于渲染操作按钮）。 */
export const TEXT_OPS: readonly TextOpMeta[] = [
  { op: 'uppercase', label: '转大写' },
  { op: 'lowercase', label: '转小写' },
  { op: 'trimLines', label: '去首尾空格' },
  { op: 'dedupe', label: '去重行' },
  { op: 'removeBlank', label: '删空行' },
  { op: 'sortAsc', label: '升序排列' },
  { op: 'sortDesc', label: '降序排列' },
];

/**
 * 将文本按行拆分，保留原始行内容。
 * 统一处理 \r\n 与 \r，避免跨平台换行差异。
 */
function splitLines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n');
}

/** 用 \n 连接行。 */
function joinLines(lines: string[]): string {
  return lines.join('\n');
}

/**
 * 对文本应用指定操作，返回新文本（不修改入参）。
 *
 * - uppercase / lowercase：整体大小写转换。
 * - trimLines：逐行去除首尾空白。
 * - dedupe：去除重复行，保留首次出现顺序。
 * - removeBlank：删除仅由空白构成（含空串）的行。
 * - sortAsc / sortDesc：按 locale 对行排序（升/降）。
 */
export function applyTextOp(text: string, op: TextOp): string {
  switch (op) {
    case 'uppercase':
      return text.toUpperCase();
    case 'lowercase':
      return text.toLowerCase();
    case 'trimLines':
      return joinLines(splitLines(text).map((line) => line.trim()));
    case 'dedupe': {
      const seen = new Set<string>();
      const result: string[] = [];
      for (const line of splitLines(text)) {
        if (!seen.has(line)) {
          seen.add(line);
          result.push(line);
        }
      }
      return joinLines(result);
    }
    case 'removeBlank':
      return joinLines(splitLines(text).filter((line) => line.trim() !== ''));
    case 'sortAsc':
      return joinLines(
        [...splitLines(text)].sort((a, b) => a.localeCompare(b)),
      );
    case 'sortDesc':
      return joinLines(
        [...splitLines(text)].sort((a, b) => b.localeCompare(a)),
      );
    default: {
      // 穷尽检查：新增 op 时若忘记处理会触发编译错误。
      const _exhaustive: never = op;
      return _exhaustive;
    }
  }
}
