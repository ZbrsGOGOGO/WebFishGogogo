import { Bookmark } from './bookmark.entity';
import { Chapter } from './chapter.entity';
import { Document } from './document.entity';
import { FakeMeta } from './fake-meta.entity';
import { Memo } from './memo.entity';
import { ReadingProgress } from './reading-progress.entity';
import { Tool } from './tool.entity';
import { ToolProfession } from './tool-profession.entity';
import { User } from './user.entity';
import { UserPreference } from './user-preference.entity';

export {
  Bookmark,
  Chapter,
  Document,
  FakeMeta,
  Memo,
  ReadingProgress,
  Tool,
  ToolProfession,
  User,
  UserPreference,
};

/** 所有实体的集合，供 TypeORM DataSource / NestJS TypeOrmModule 使用 */
export const entities = [
  User,
  Document,
  Chapter,
  ReadingProgress,
  Bookmark,
  Memo,
  FakeMeta,
  UserPreference,
  Tool,
  ToolProfession,
];
