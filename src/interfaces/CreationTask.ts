import { DownloadFilter } from './DownloadFilter';
import { TwitterUser } from './TwitterUser';

export type CreationTaskKind =
  | 'userMedias'
  | 'userTweets'
  | 'search'
  | 'replies'
  | 'likes'
  | 'bookmarks'
  | 'timeline'
  | 'community'
  | 'dateSegmented';

export type CreationTaskStatus = 'waiting' | 'active' | 'paused' | 'done';

export interface CreationTask {
  id: string;
  /** 用户类任务的目标用户；搜索 / 书签 / 时间线类任务可为空。 */
  user?: TwitterUser;
  /** 搜索语句 / 推文 ID / 社群 ID（按 kind 而定）。 */
  query?: string;
  filter: DownloadFilter;
  status: CreationTaskStatus;
  completeCount: number;
  skipCount: number;
  kind: CreationTaskKind;
  /** 列表里显示的来源，例如 `@elonmusk`、`搜索：from:xxx`。 */
  sourceLabel: string;
  /** 常驻任务：跑完后保留为 done，可一键重新开始抓新推文；重启后可继续。 */
  persistent: boolean;
  groupId?: string;
  /** 断点续跑游标：undefined 表示从第一页开始。 */
  lastCursor?: string | null;
  lastRunAt?: number;
}

export interface TaskGroup {
  id: string;
  name: string;
  createdAt: number;
  taskIds: string[];
}
