import { Dayjs } from 'dayjs';
import MediaType from '../enums/MediaType';
import { ConditionGroup } from '../twitter/conditions';

export interface DownloadFilter {
  dateRange?: [start: Dayjs, end: Dayjs];
  mediaTypes?: MediaType[];
  source: 'medias' | 'tweets';
  /** 跳过条件：命中该条件的帖子不下载（见 src/twitter/conditions.ts）。 */
  skipConditions?: ConditionGroup;
  /** 停止条件：翻页时遇到命中的帖子即停止本任务。 */
  stopConditions?: ConditionGroup;
  /** 媒体跳过条件：命中该条件的媒体不下载。 */
  mediaSkipConditions?: ConditionGroup;
  /** 推文库去重口径：global 全局去重，perSource 按任务来源去重。 */
  dedupMode?: 'global' | 'perSource';
}
