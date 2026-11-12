// 条件引擎：用于下载任务的跳过 / 停止 / 媒体跳过条件。
// 纯逻辑模块，零第三方依赖，只用原生 Date / JSON，可在 Node 下直接跑。
// 注意：本文件只用可擦除的 TypeScript 语法（不用 enum / 命名空间 / 参数属性），
// 以便 `node --experimental-strip-types` 能直接导入。

export type ConditionLeft =
  | 'createdAt'
  | 'fullText'
  | 'favoriteCount'
  | 'retweetCount'
  | 'replyCount'
  | 'views'
  | 'lang'
  | 'mediaType'
  | 'hasMedia'
  | 'isDownloadedFile'
  | 'inTweetDb';

export type ConditionOp =
  | 'eq'
  | 'ne'
  | 'includes'
  | 'notIncludes'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'before'
  | 'after';

export interface Expression {
  left: ConditionLeft;
  op: ConditionOp;
  right: string | number | boolean | null;
}

export interface ConditionGroup {
  mode: 'all' | 'any';
  expressions: Expression[];
}

/** 帖子形状：刻意用结构类型而非导入 TwitterPost，避免引入 dayjs 等依赖。 */
export interface ConditionPost {
  id: string;
  createdAt?: unknown;
  fullText?: string;
  favoriteCount?: number;
  retweetCount?: number;
  replyCount?: number;
  views?: number;
  lang?: string;
  medias?: Array<{ type?: string }>;
}

export interface ConditionMedia {
  type?: string;
  url?: string;
  id?: string;
}

export type DbLookup = (postId: string) => boolean;
export type DownloadedLookup = (postId: string) => boolean;

export interface EvaluateLookups {
  dbLookup?: DbLookup;
  downloadedLookup?: DownloadedLookup;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * 解析动态右值：
 * - `today`：今天 00:00（本地时间）
 * - `yesterday`：昨天 00:00
 * - `lastNDays(n)`：n 天前 00:00，例如 lastNDays(7)
 * - `now`：当前时间
 * 其他值原样返回。
 */
export function resolveDynamicValue(
  right: string | number | boolean | null,
  now: Date = new Date(),
): string | number | boolean | Date | null {
  if (typeof right !== 'string') return right;
  if (right === 'today') return startOfDay(now);
  if (right === 'yesterday')
    return new Date(startOfDay(now).getTime() - DAY_MS);
  if (right === 'now') return now;
  const lastN = /^lastNDays\((\d+)\)$/.exec(right.trim());
  if (lastN) {
    return new Date(startOfDay(now).getTime() - Number(lastN[1]) * DAY_MS);
  }
  return right;
}

/** 把 Dayjs / Date / 时间戳 / 日期字符串统一转成 Date，无法解析返回 undefined。 */
export function toDate(value: unknown): Date | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof value === 'object') {
    const obj = value as {
      toDate?: unknown;
      valueOf?: unknown;
    };
    if (typeof obj.toDate === 'function') {
      try {
        const d = (obj.toDate as () => unknown)();
        if (d instanceof Date && !Number.isNaN(d.getTime())) return d;
      } catch {
        // 忽略，走下面的 valueOf 分支
      }
    }
    if (typeof obj.valueOf === 'function') {
      const n = (obj.valueOf as () => unknown)();
      if (typeof n === 'number' && !Number.isNaN(n)) {
        return new Date(n);
      }
    }
  }
  return undefined;
}

function compareValues(
  left: unknown,
  op: ConditionOp,
  right: string | number | boolean | Date | null,
): boolean {
  // 左值缺失：只有 ne / notIncludes 视为成立，其余一律不成立。
  if (left === undefined || left === null) {
    return op === 'ne' || op === 'notIncludes';
  }
  if (op === 'eq') return left === right;
  if (op === 'ne') return left !== right;

  if (op === 'includes' || op === 'notIncludes') {
    const hit = String(left)
      .toLowerCase()
      .includes(String(right ?? '').toLowerCase());
    return op === 'includes' ? hit : !hit;
  }

  if (op === 'before' || op === 'after') {
    const leftDate = toDate(left);
    const rightDate = toDate(right);
    if (!leftDate || !rightDate) return false;
    return op === 'before'
      ? leftDate.getTime() < rightDate.getTime()
      : leftDate.getTime() > rightDate.getTime();
  }

  // gt / gte / lt / lte：数值比较；日期也可比较（按时间戳）。
  const leftNum =
    typeof left === 'number'
      ? left
      : (toDate(left)?.getTime() ?? Number(left));
  const rightNum =
    typeof right === 'number'
      ? right
      : right instanceof Date
        ? right.getTime()
        : Number(right);
  if (Number.isNaN(leftNum) || Number.isNaN(rightNum)) return false;
  if (op === 'gt') return leftNum > rightNum;
  if (op === 'gte') return leftNum >= rightNum;
  if (op === 'lt') return leftNum < rightNum;
  return leftNum <= rightNum;
}

function getPostField(
  post: ConditionPost,
  left: ConditionLeft,
  lookups: EvaluateLookups,
): unknown {
  switch (left) {
    case 'createdAt':
      return post.createdAt;
    case 'fullText':
      return post.fullText;
    case 'favoriteCount':
      return post.favoriteCount;
    case 'retweetCount':
      return post.retweetCount;
    case 'replyCount':
      return post.replyCount;
    case 'views':
      return post.views;
    case 'lang':
      return post.lang;
    case 'mediaType':
      // 帖子本身没有单一 mediaType：有任一媒体即按第一条媒体的类型计。
      return post.medias?.[0]?.type;
    case 'hasMedia':
      return (post.medias?.length ?? 0) > 0;
    case 'isDownloadedFile':
      return lookups.downloadedLookup ? lookups.downloadedLookup(post.id) : false;
    case 'inTweetDb':
      return lookups.dbLookup ? lookups.dbLookup(post.id) : false;
    default:
      return undefined;
  }
}

function evaluateExpression(
  leftValue: unknown,
  expression: Expression,
  now: Date,
): boolean {
  return compareValues(
    leftValue,
    expression.op,
    resolveDynamicValue(expression.right, now),
  );
}

export function evaluateGroup(
  values: (left: ConditionLeft) => unknown,
  group: ConditionGroup | undefined | null,
  now: Date = new Date(),
): boolean {
  if (!group || group.expressions.length === 0) return true;
  const results = group.expressions.map((expr) =>
    evaluateExpression(values(expr.left), expr, now),
  );
  return group.mode === 'any'
    ? results.some(Boolean)
    : results.every(Boolean);
}

/** 帖子是否满足条件组。 */
export function evaluatePost(
  post: ConditionPost,
  group: ConditionGroup | undefined | null,
  lookups: EvaluateLookups = {},
  now: Date = new Date(),
): boolean {
  return evaluateGroup((left) => getPostField(post, left, lookups), group, now);
}

/** 媒体是否满足条件组（主要用于 mediaType 过滤；与帖子无关的字段按缺失处理）。 */
export function evaluateMedia(
  media: ConditionMedia,
  group: ConditionGroup | undefined | null,
  now: Date = new Date(),
): boolean {
  return evaluateGroup((left) => {
    if (left === 'mediaType') return media.type;
    if (left === 'hasMedia') return true;
    return undefined;
  }, group, now);
}

/** 跳过条件命中则返回 true（该帖子不下载）。 */
export function shouldSkipPost(
  post: ConditionPost,
  group: ConditionGroup | undefined | null,
  lookups: EvaluateLookups = {},
  now: Date = new Date(),
): boolean {
  return evaluatePost(post, group, lookups, now);
}

/** 停止条件命中则返回 true（遇到该帖子即停止本任务）。 */
export function shouldStopAtPost(
  post: ConditionPost,
  group: ConditionGroup | undefined | null,
  lookups: EvaluateLookups = {},
  now: Date = new Date(),
): boolean {
  return evaluatePost(post, group, lookups, now);
}

/** 媒体跳过条件命中则返回 true（该媒体不下载）。 */
export function shouldSkipMedia(
  media: ConditionMedia,
  group: ConditionGroup | undefined | null,
  now: Date = new Date(),
): boolean {
  return evaluateMedia(media, group, now);
}
