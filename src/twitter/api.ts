import dayjs from 'dayjs';
import * as R from 'ramda';
import { Response } from '../interfaces/Response';
import { TwitterAccountInfo } from '../interfaces/TwitterAccountInfo';
import {
  TwitterMedia,
  TwitterMediaBase,
  TwitterMediaGif,
  TwitterMediaPhoto,
  TwitterMediaVideo,
} from '../interfaces/TwitterMedia';
import { TwitterPost } from '../interfaces/TwitterPost';
import { TwitterUser } from '../interfaces/TwitterUser';
import { request } from '../ipc/network';
import { useAppStateStore } from '../stores/app-state';
import { parseCookie } from '../utils/cookie';
import MediaType from '../enums/MediaType';

import { resolveActiveCookieString } from './cookies';

const HOST = 'x.com';

/**
 * 401/403 回调注册点：由调用方（stores/download.ts 在模块加载时）注册，
 * 收到未授权响应时切换到下一个可用 Cookie。api.ts 自身不 import
 * 任何 store，避免循环依赖。
 */
export type AuthFailureHandler = () => void;

let authFailureHandler: AuthFailureHandler | null = null;

export function registerAuthFailureHandler(handler: AuthFailureHandler): void {
  authFailureHandler = handler;
}

export function clearAuthFailureHandler(): void {
  authFailureHandler = null;
}

function getCommonHeaders(withCredentials = true): Record<string, string> {
  const appState = useAppStateStore.getState();
  const cookies = resolveActiveCookieString(
    appState.cookieAccounts ?? [],
    appState.activeCookieId ?? null,
    appState.cookieString,
  );
  return {
    'User-Agent': navigator.userAgent,
    Referer: `https://${HOST}`,
    ...(withCredentials
      ? {
          Authorization:
            'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
          Cookie: cookies,
          'X-Csrf-Token': parseCookie(cookies)['ct0'],
        }
      : {}),
  };
}

function ensureResponse(response: Response) {
  if (response.status === 401 || response.status === 403) {
    // 触发多 Cookie 切换：下一次请求即用新账号的 Cookie。
    authFailureHandler?.();
  }
  if (response.status >= 400) {
    log.error(response);
    throw new Error(`Response error: status=${response.status}`);
  }
}

/**
 * 通用 GraphQL GET 请求：新端点（见 src/twitter/endpoints.ts）共用。
 * operationId 由端点注册表提供，未配置时调用方应先抛
 * EndpointNotConfiguredError，不要传猜测的 ID 进来。
 */
export async function requestGraphql(
  operationId: string,
  variables: Record<string, unknown>,
  features?: Record<string, unknown>,
): Promise<any> {
  const resp = await request({
    method: 'GET',
    responseType: 'json',
    url: `https://${HOST}/i/api/graphql/${operationId}`,
    query: {
      ...(features ? { features: JSON.stringify(features) } : {}),
      variables: JSON.stringify(variables),
    },
    headers: getCommonHeaders(),
  });
  ensureResponse(resp);
  return resp.body;
}

export async function getAccountInfo(
  cookieStringOverride?: string,
): Promise<TwitterAccountInfo> {
  const res = await request({
    method: 'GET',
    url: `https://${HOST}`,
    responseType: 'text',
    headers: R.mergeRight(getCommonHeaders(false), {
      Cookie: cookieStringOverride,
    }),
  });
  ensureResponse(res);
  const html = res.body as string;
  const nameMatch = html.match(/"screen_name":"(.*?)"/);
  if (nameMatch === null) throw new Error('Cannot find name in response');

  const avatarMatch = html.match(/"profile_image_url_https":"(.*?)"/);
  if (avatarMatch === null) throw new Error('Cannot find avatar in response');

  return {
    screenName: nameMatch[1],
    avatar: avatarMatch[1],
  };
}

export async function getUser(screenName: string): Promise<TwitterUser> {
  const resp = await request({
    method: 'GET',
    responseType: 'json',
    url: `https://${HOST}/i/api/graphql/NimuplG1OB7Fd2btCLdBOw/UserByScreenName`,
    query: {
      features: JSON.stringify({
        hidden_profile_likes_enabled: true,
        hidden_profile_subscriptions_enabled: true,
        responsive_web_graphql_exclude_directive_enabled: true,
        verified_phone_label_enabled: false,
        subscriptions_verification_info_is_identity_verified_enabled: true,
        subscriptions_verification_info_verified_since_enabled: true,
        highlights_tweets_tab_ui_enabled: true,
        responsive_web_twitter_article_notes_tab_enabled: false,
        creator_subscriptions_tweet_preview_api_enabled: true,
        responsive_web_graphql_skip_user_profile_image_extensions_enabled:
          false,
        responsive_web_graphql_timeline_navigation_enabled: true,
      }),
      fieldToggles: JSON.stringify({ withAuxiliaryUserLabels: false }),
      variables: JSON.stringify({
        screen_name: screenName,
        withSafetyModeUserFields: true,
      }),
    },
    headers: getCommonHeaders(),
  });
  ensureResponse(resp);

  const data = R.path(['data', 'user', 'result', 'legacy'])(resp.body) as any;

  if (!data) {
    throw new Error('找不到该用户');
  }

  return {
    avatar: data?.profile_image_url_https,
    name: data?.name,
    screenName: data?.screen_name,
    id: R.path<string>(['data', 'user', 'result', 'rest_id'])(
      resp.body,
    ) as string,
    mediaCount: data?.media_count,
    registerTime: dayjs(data.created_at),
  };
}

export const mapTwitterPosts = (posts: any[]) => {
  const mapTwitterMedias = (medias: any[]) => {
    const toTwitterMediaBase: (v: any) => TwitterMediaBase = (v: any) => {
      return {
        id: v?.id_str,
        url: v?.media_url_https,
        width: v?.original_info?.width,
        height: v?.original_info?.height,
      };
    };

    const toPhoto: (v: any) => TwitterMediaPhoto = (v: any) => ({
      ...toTwitterMediaBase(v),
      type: MediaType.Photo,
    });

    const toVideo: (v: any) => TwitterMediaVideo = (v: any) => ({
      ...toTwitterMediaBase(v),
      type: MediaType.Video,
      videoInfo: {
        duration: v?.video_info?.duration_millis,
        variants: v?.video_info?.variants?.map?.((item: any) => ({
          bitrate: item?.bitrate,
          contentType: item?.contentType,
          url: item?.url,
        })),
        aspectRatio: v?.aspect_ratio,
      },
    });

    const toGif: (v: any) => TwitterMediaGif = (v: any) => ({
      ...toTwitterMediaBase(v),
      type: MediaType.Gif,
      videoInfo: {
        url: v?.video_info?.variants?.[0]?.url,
        aspectRatio: v?.video_info?.aspect_ratio,
      },
    });

    return R.pipe<any[], (TwitterMedia | null)[], TwitterMedia[]>(
      R.map<any, TwitterMedia | null>(
        R.cond<any, TwitterMedia | null>([
          [R.propEq('photo', 'type'), toPhoto],
          [R.propEq('video', 'type'), toVideo],
          [R.propEq('animated_gif', 'type'), toGif],
          [R.T, R.always(null)],
        ]),
      ),
      R.filter<TwitterMedia | null, TwitterMedia>(R.isNotNil),
    )(medias);
  };
  return R.map<any, TwitterPost>((item) => {
    return {
      id: item?.rest_id,
      views: R.isNotNil(item?.views?.count)
        ? Number(item.views.count)
        : undefined,
      createdAt: item.legacy?.created_at
        ? dayjs(item.legacy?.created_at)
        : undefined,
      bookmarkCount: item?.legacy?.bookmark_count,
      bookmarked: item?.legacy?.bookmarked,
      favoriteCount: item?.legacy?.favorite_count,
      favorited: item?.legacy?.favorited,
      fullText: item?.legacy?.full_text,
      lang: item?.legacy?.lang,
      possiblySensitive: item?.legacy?.possibly_sensitive,
      replyCount: item?.legacy?.reply_count,
      retweeted: item?.legacy?.retweeted,
      retweetCount: item?.legacy?.retweet_count,
      medias: item?.legacy?.entities?.media
        ? mapTwitterMedias(item.legacy?.entities?.media)
        : undefined,
      tags: R.pipe<any, any[], string[]>(
        R.path<any>(['legacy', 'entities', 'hashtags']),
        R.ifElse(R.isNotNil, R.map(R.prop('text')), R.always([])),
      )(item),
      user: {
        id: item?.core?.user_results?.result?.rest_id,
        avatar:
          item?.core?.user_results?.result?.legacy?.profile_image_url_https,
        mediaCount: item?.core?.user_results?.result?.legacy?.media_count,
        name: item?.core?.user_results?.result?.legacy?.name,
        screenName: item?.core?.user_results?.result?.legacy?.screen_name,
        registerTime: item?.core?.user_results?.result?.legacy?.created_at,
      },
    };
  })(posts);
};

const pathToInstructions = R.path<any>([
  'data',
  'user',
  'result',
  'timeline_v2',
  'timeline',
  'instructions',
]);

/**
 * 通用 timeline 解析（入口式 entries）：供新端点（SearchTimeline /
 * TweetDetail / Likes / Bookmarks / HomeTimeline 等）复用。
 * 与 getUserTweets 不同，这里不过滤转推与无媒体帖子，由调用方自行过滤。
 * 各端点返回的 instructions 路径不同，这里按候选路径依次尝试。
 */
const INSTRUCTIONS_PATH_CANDIDATES: string[][] = [
  ['data', 'user', 'result', 'timeline_v2', 'timeline', 'instructions'],
  ['data', 'search_by_raw_query', 'search_timeline', 'timeline', 'instructions'],
  ['data', 'home', 'home_timeline_urt', 'instructions'],
  ['data', 'threaded_conversation_with_injections_v2', 'instructions'],
  ['data', 'timeline', 'instructions'],
  ['data', 'user', 'result', 'timeline', 'timeline', 'instructions'],
];

function findInstructions(body: any): any[] {
  for (const candidate of INSTRUCTIONS_PATH_CANDIDATES) {
    const instructions = R.path<any>(candidate)(body);
    if (Array.isArray(instructions) && instructions.length > 0) {
      return instructions;
    }
  }
  return [];
}

export function extractTimelinePosts(body: any): TwitterPost[] {
  const instructions = findInstructions(body);
  const items = R.pipe(
    R.find(R.pathEq('TimelineAddEntries', ['type'])),
    R.defaultTo({}),
    R.prop('entries'),
    R.defaultTo([]),
    R.map(
      R.cond([
        [
          R.pathSatisfies(R.startsWith('tweet'), ['entryId']),
          R.path(['content', 'itemContent', 'tweet_results', 'result']),
        ],
        [
          R.pathSatisfies(R.startsWith('profile-conversation'), ['entryId']),
          R.pipe(
            R.path<any>(['content', 'items']),
            R.map(
              R.path(['item', 'itemContent', 'tweet_results', 'result']),
            ),
          ),
        ],
        [R.T, R.always(undefined)],
      ]),
    ),
    R.flatten,
    R.filter(R.isNotNil),
    R.map((item: any) =>
      item?.__typename === 'TweetWithVisibilityResults' ? item.tweet : item,
    ),
    R.filter(R.isNotNil),
  )(instructions);
  return mapTwitterPosts(items);
}

/** 通用底部游标解析：取 TimelineAddEntries 里 cursorType 为 Bottom 的值。 */
export function extractNextCursorFromBody(body: any): string | null {
  const instructions = findInstructions(body);
  return R.pipe<any, any, any, any, any, string | undefined, string | null>(
    R.find(R.pathEq('TimelineAddEntries', ['type'])),
    R.prop('entries'),
    R.find(R.pathEq('Bottom', ['content', 'cursorType'])),
    R.path(['content', 'value']),
    R.defaultTo(null),
  )(instructions);
}

export async function getUserMedias(
  userId: string,
  cursor?: string,
  count = 20,
): Promise<{
  twitterPosts: TwitterPost[];
  cursor: string | null;
}> {
  const resp = await request({
    method: 'GET',
    url: `https://${HOST}/i/api/graphql/cEjpJXA15Ok78yO4TUQPeQ/UserMedia`,
    responseType: 'json',
    query: {
      features: JSON.stringify({
        responsive_web_graphql_exclude_directive_enabled: true,
        verified_phone_label_enabled: false,
        creator_subscriptions_tweet_preview_api_enabled: true,
        responsive_web_graphql_timeline_navigation_enabled: true,
        responsive_web_graphql_skip_user_profile_image_extensions_enabled:
          false,
        c9s_tweet_anatomy_moderator_badge_enabled: true,
        tweetypie_unmention_optimization_enabled: true,
        responsive_web_edit_tweet_api_enabled: true,
        graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
        view_counts_everywhere_api_enabled: true,
        longform_notetweets_consumption_enabled: true,
        responsive_web_twitter_article_tweet_consumption_enabled: true,
        tweet_awards_web_tipping_enabled: false,
        freedom_of_speech_not_reach_fetch_enabled: true,
        standardized_nudges_misinfo: true,
        tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled:
          true,
        rweb_video_timestamps_enabled: true,
        longform_notetweets_rich_text_read_enabled: true,
        longform_notetweets_inline_media_enabled: true,
        responsive_web_media_download_video_enabled: false,
        responsive_web_enhance_cards_enabled: false,
      }),
      variables: JSON.stringify({
        userId,
        count,
        cursor,
        includePromotedContent: false,
        withClientEventToken: false,
        withBirdwatchNotes: false,
        withVoice: true,
        withV2Timeline: true,
      }),
    },
    headers: getCommonHeaders(),
  });
  ensureResponse(resp);

  const extractTwitterPosts = (
    pathToInstructions: (data: any) => any,
    data: any,
  ): TwitterPost[] | undefined => {
    const pathToTwitterPostItems = (instructions: any): any => {
      const pathToModuleItemsFirst = R.pipe(
        R.find(R.pathEq('TimelineAddEntries', ['type'])),
        R.defaultTo({}),
        R.prop('entries'),
        R.defaultTo([]),
        R.find(R.pathEq('TimelineTimelineModule', ['content', 'entryType'])),
        R.defaultTo({}),
        R.path<any>(['content', 'items']),
      );

      const pathToModuleItemsMore = R.pipe(
        R.find(R.pathEq('TimelineAddToModule', ['type'])),
        R.defaultTo({}),
        R.prop('moduleItems'),
      );

      return R.pipe(
        R.either(pathToModuleItemsFirst, pathToModuleItemsMore),
        R.defaultTo([]),
        R.map(
          R.pipe(
            R.path(['item', 'itemContent', 'tweet_results', 'result']),
            R.ifElse<any, any, any>(
              R.propEq('TweetWithVisibilityResults', '__typename'),
              R.prop('tweet'),
              R.identity,
            ),
          ),
        ),
      )(instructions);
    };
    return R.pipe(
      pathToInstructions,
      R.ifElse(
        R.isNil,
        R.always([]),
        R.pipe(pathToTwitterPostItems, R.filter(R.isNotNil), mapTwitterPosts),
      ),
    )(data);
  };

  const extractNextCursor = (
    pathToInstructions: (data: any) => any,
    data: any,
  ): string | null => {
    return R.pipe<any, any, any, any, any, string | undefined, string | null>(
      pathToInstructions,
      R.find(R.pathEq('TimelineAddEntries', ['type'])),
      R.prop('entries'),
      R.find(R.pathEq('Bottom', ['content', 'cursorType'])),
      R.path(['content', 'value']),
      R.defaultTo(null),
    )(data);
  };

  const twitterPosts = extractTwitterPosts(pathToInstructions, resp.body);

  if (!twitterPosts || twitterPosts.length === 0) {
    return {
      cursor: null,
      twitterPosts: [],
    };
  }

  log.info('twitterPosts', twitterPosts);

  const nextCursor = extractNextCursor(pathToInstructions, resp.body);

  return {
    twitterPosts,
    cursor: nextCursor,
  };
}

export async function getUserTweets(
  userId: string,
  cursor?: string,
  count = 20,
): Promise<{
  twitterPosts: TwitterPost[];
  cursor: string | null;
}> {
  const resp = await request({
    method: 'GET',
    url: `https://${HOST}/i/api/graphql/9zyyd1hebl7oNWIPdA8HRw/UserTweets`,
    responseType: 'json',
    query: {
      features: JSON.stringify({
        rweb_tipjar_consumption_enabled: true,
        responsive_web_graphql_exclude_directive_enabled: true,
        verified_phone_label_enabled: false,
        creator_subscriptions_tweet_preview_api_enabled: true,
        responsive_web_graphql_timeline_navigation_enabled: true,
        responsive_web_graphql_skip_user_profile_image_extensions_enabled:
          false,
        communities_web_enable_tweet_community_results_fetch: true,
        c9s_tweet_anatomy_moderator_badge_enabled: true,
        articles_preview_enabled: false,
        tweetypie_unmention_optimization_enabled: true,
        responsive_web_edit_tweet_api_enabled: true,
        graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
        view_counts_everywhere_api_enabled: true,
        longform_notetweets_consumption_enabled: true,
        responsive_web_twitter_article_tweet_consumption_enabled: true,
        tweet_awards_web_tipping_enabled: false,
        creator_subscriptions_quote_tweet_preview_enabled: false,
        freedom_of_speech_not_reach_fetch_enabled: true,
        standardized_nudges_misinfo: true,
        tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled:
          true,
        tweet_with_visibility_results_prefer_gql_media_interstitial_enabled:
          false,
        rweb_video_timestamps_enabled: true,
        longform_notetweets_rich_text_read_enabled: true,
        longform_notetweets_inline_media_enabled: true,
        responsive_web_enhance_cards_enabled: false,
      }),
      variables: JSON.stringify({
        userId,
        count,
        cursor,
        includePromotedContent: true,
        withQuickPromoteEligibilityTweetFields: true,
        withVoice: true,
        withV2Timeline: true,
      }),
    },
    headers: getCommonHeaders(),
  });
  ensureResponse(resp);

  const extractTwitterPosts = (
    pathToInstructions: (data: any) => any,
    data: any,
  ): TwitterPost[] | undefined => {
    const pathToTwitterPostItems = (instructions: any): any => {
      // @ts-ignore
      return R.pipe(
        R.find(R.pathEq('TimelineAddEntries', ['type'])),
        R.defaultTo({}),
        R.prop('entries'),
        R.defaultTo([]),
        R.map(
          R.cond([
            [
              R.pathSatisfies(R.startsWith('tweet'), ['entryId']),
              R.path(['content', 'itemContent', 'tweet_results', 'result']),
            ],
            [
              R.pathSatisfies(R.startsWith('profile-conversation'), [
                'entryId',
              ]),
              R.pipe(
                R.path<any>(['content', 'items']),
                R.map(
                  R.path(['item', 'itemContent', 'tweet_results', 'result']),
                ),
              ),
            ],
            [R.T, R.always(undefined)],
          ]),
        ),
        R.flatten,
        R.filter(
          R.allPass<any>([
            R.isNotNil,
            // 过滤掉转推
            R.complement(R.hasPath(['legacy', 'retweeted_status_result'])),
            // 过滤掉无媒体
            R.hasPath(['legacy', 'entities', 'media']),
            R.pathSatisfies(R.pipe(R.length, R.lte(0)), [
              'legacy',
              'entities',
              'media',
            ]),
          ]),
        ),
      )(instructions);
    };
    return R.pipe(
      pathToInstructions,
      pathToTwitterPostItems,
      mapTwitterPosts,
    )(data);
  };

  const extractNextCursor = (
    pathToInstructions: (data: any) => any,
    data: any,
  ): string | null => {
    return R.pipe<any, any, any, any, any, string | undefined, string | null>(
      pathToInstructions,
      R.find(R.pathEq('TimelineAddEntries', ['type'])),
      R.prop('entries'),
      R.find(R.pathEq('Bottom', ['content', 'cursorType'])),
      R.path(['content', 'value']),
      R.defaultTo(null),
    )(data);
  };

  const twitterPosts = extractTwitterPosts(pathToInstructions, resp.body);
  const nextCursor = extractNextCursor(pathToInstructions, resp.body);
  if (!twitterPosts || twitterPosts.length === 0) {
    return {
      cursor: nextCursor,
      twitterPosts: [],
    };
  }

  log.info('twitterPosts', twitterPosts);

  return {
    twitterPosts,
    cursor: nextCursor,
  };
}
