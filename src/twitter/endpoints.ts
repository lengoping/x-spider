// 新数据源骨架：高级搜索 / 推文回复 / 喜欢 / 书签 / 时间线 / 社群 / 关注导出。
//
// 硬约束：绝不编造 X 的 GraphQL operation ID。仓库里只有
// UserByScreenName / UserMedia / UserTweets 三个 ID 是真实的；
// 下面这些端点的 ID 在手册和仓库里都没有，且 X 会轮换 ID。
// 因此所有新端点都走可配置的端点注册表 GRAPHQL_ENDPOINTS：
// operationId 为 null 时抛出 EndpointNotConfiguredError，UI 显示
// “需配置 GraphQL ID”；用户按 docs/GRAPHQL-IDS.md 从 x.com 网页
// bundle 里提取最新 ID 后，用 registerEndpointOperationId() 配上即可用。
// variables 只写各端点语义上的最小集合，不编造 features 以外的细节。

import {
  extractNextCursorFromBody,
  extractTimelinePosts,
  requestGraphql,
} from './api';
import { TwitterPost } from '../interfaces/TwitterPost';

export class EndpointNotConfiguredError extends Error {
  operationName: string;

  constructor(operationName: string) {
    super(
      `GraphQL 端点 ${operationName} 未配置 operation ID：请按 docs/GRAPHQL-IDS.md 从 x.com 网页 bundle 里提取最新 ID 后配置`,
    );
    this.name = 'EndpointNotConfiguredError';
    this.operationName = operationName;
  }
}

export interface EndpointConfig {
  /** GraphQL operation 名称（仅作标识，不是 ID）。 */
  operation: string;
  /** 真实 operation ID；为 null 表示尚未配置。 */
  operationId: string | null;
  description: string;
}

export const GRAPHQL_ENDPOINTS: Record<string, EndpointConfig> = {
  SearchTimeline: {
    operation: 'SearchTimeline',
    operationId: null,
    description: '高级搜索下载：按关键词 / from: / since: / until: 搜索推文',
  },
  TweetDetail: {
    operation: 'TweetDetail',
    operationId: null,
    description: '推文回复下载：按推文 ID 拉取回复串',
  },
  Likes: {
    operation: 'Likes',
    operationId: null,
    description: '我的喜欢：按用户 ID 拉取点赞过的推文',
  },
  Bookmarks: {
    operation: 'Bookmarks',
    operationId: null,
    description: '我的书签：拉取已收藏的推文',
  },
  HomeTimeline: {
    operation: 'HomeTimeline',
    operationId: null,
    description: '时间线：拉取首页关注流',
  },
  CommunityTweets: {
    operation: 'CommunityTweets',
    operationId: null,
    description: '社群：按社群 ID 拉取社群内推文',
  },
  Following: {
    operation: 'Following',
    operationId: null,
    description: '我的关注导出：按用户 ID 拉取关注列表',
  },
};

export function getEndpointOperationId(operationName: string): string | null {
  return GRAPHQL_ENDPOINTS[operationName]?.operationId ?? null;
}

/** 在运行时配置某个端点的 operation ID（例如从本地配置文件读入后调用）。 */
export function registerEndpointOperationId(
  operationName: string,
  operationId: string,
): void {
  const config = GRAPHQL_ENDPOINTS[operationName];
  if (!config) {
    throw new Error(`未知的 GraphQL 端点：${operationName}`);
  }
  config.operationId = operationId;
}

export interface TimelineResult {
  twitterPosts: TwitterPost[];
  cursor: string | null;
}

function requireOperationId(operationName: string): string {
  const operationId = getEndpointOperationId(operationName);
  if (!operationId) {
    throw new EndpointNotConfiguredError(operationName);
  }
  return operationId;
}

async function fetchTimeline(
  operationName: string,
  variables: Record<string, unknown>,
): Promise<TimelineResult> {
  const operationId = requireOperationId(operationName);
  const body = await requestGraphql(operationId, variables);
  return {
    twitterPosts: extractTimelinePosts(body),
    cursor: extractNextCursorFromBody(body),
  };
}

/** 高级搜索下载：query 例如 `from:elonmusk since:2026-11-01 until:2026-11-07`。 */
export async function getSearchTweets(
  query: string,
  cursor?: string,
  count = 20,
): Promise<TimelineResult> {
  return fetchTimeline('SearchTimeline', {
    rawQuery: query,
    count,
    cursor,
    querySource: 'typed_query',
    product: 'Top',
  });
}

/** 推文回复下载：tweetId 为推文数字 ID（或从推文链接中提取）。 */
export async function getTweetReplies(
  tweetId: string,
  cursor?: string,
  count = 20,
): Promise<TimelineResult> {
  return fetchTimeline('TweetDetail', {
    focalTweetId: tweetId,
    count,
    cursor,
    with_rux_injections: false,
    includePromotedContent: true,
    withCommunity: true,
    withQuickPromoteEligibilityTweetFields: true,
    withBirdwatchNotes: false,
    withVoice: true,
    withV2Timeline: true,
  });
}

/** 我的喜欢：按用户 ID 拉取点赞过的推文。 */
export async function getLikes(
  userId: string,
  cursor?: string,
  count = 20,
): Promise<TimelineResult> {
  return fetchTimeline('Likes', {
    userId,
    count,
    cursor,
    includePromotedContent: false,
    withBirdwatchNotes: false,
    withVoice: true,
    withV2Timeline: true,
  });
}

/** 我的书签：拉取已收藏的推文。 */
export async function getBookmarks(
  cursor?: string,
  count = 20,
): Promise<TimelineResult> {
  return fetchTimeline('Bookmarks', {
    count,
    cursor,
    includePromotedContent: false,
    withBirdwatchNotes: false,
    withVoice: true,
    withV2Timeline: true,
  });
}

/** 时间线：拉取首页关注流。 */
export async function getHomeTimeline(
  cursor?: string,
  count = 20,
): Promise<TimelineResult> {
  return fetchTimeline('HomeTimeline', {
    count,
    cursor,
    includePromotedContent: true,
    latestControlAvailable: true,
    withCommunity: true,
    withVoice: true,
    withV2Timeline: true,
  });
}

/** 社群：按社群 ID 拉取社群内推文。 */
export async function getCommunityTweets(
  communityId: string,
  cursor?: string,
  count = 20,
): Promise<TimelineResult> {
  return fetchTimeline('CommunityTweets', {
    communityId,
    count,
    cursor,
    includePromotedContent: false,
    withBirdwatchNotes: false,
    withVoice: true,
    withV2Timeline: true,
  });
}

export interface FollowingResult {
  screenNames: string[];
  cursor: string | null;
}

/** 从关注列表响应里递归收集 screen_name（去重，保持出现顺序）。 */
export function extractFollowingScreenNames(body: any): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const walk = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    const obj = value as Record<string, unknown>;
    const legacy = obj.legacy as Record<string, unknown> | undefined;
    if (
      obj.__typename === 'User' &&
      legacy &&
      typeof legacy.screen_name === 'string'
    ) {
      const name = legacy.screen_name;
      if (!seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    }
    Object.values(obj).forEach(walk);
  };
  walk(body);
  return names;
}

/** 我的关注导出：返回一页关注者的 screenName 列表与下一页游标。 */
export async function exportFollowing(
  userId: string,
  cursor?: string,
  count = 20,
): Promise<FollowingResult> {
  const operationId = requireOperationId('Following');
  const body = await requestGraphql(operationId, {
    userId,
    count,
    cursor,
    includePromotedContent: false,
    withBirdwatchNotes: false,
    withVoice: true,
    withV2Timeline: true,
  });
  return {
    screenNames: extractFollowingScreenNames(body),
    cursor: extractNextCursorFromBody(body),
  };
}

/** 关注导出写 TXT：一行一个 @screenName。 */
export function followingToTxt(screenNames: string[]): string {
  return screenNames.map((name) => `@${name}`).join('\n');
}
