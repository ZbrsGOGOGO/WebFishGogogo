// packages/frontend/src/components/index.ts
// 通用 UI 组件的统一出口。

// 通用 UI 组件库（U2）。
export * from './ui';

export { Footer } from './layout/Footer';
export { SelfOwnedContentDeclaration } from './compliance/SelfOwnedContentDeclaration';
export type { SelfOwnedContentDeclarationProps } from './compliance/SelfOwnedContentDeclaration';
export {
  ICP_BEIAN_NUMBER,
  ICP_BEIAN_URL,
  USER_CONTENT_FOOTER_STATEMENT,
  SELF_OWNED_CONTENT_DECLARATION_TITLE,
  SELF_OWNED_CONTENT_DECLARATION_ITEMS,
  SELF_OWNED_CONTENT_CONFIRM_LABEL,
} from './compliance/content-declaration';
