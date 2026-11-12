// 推文导出：把一条推文序列化为 TXT / HTML / JSON 文本。
// 纯逻辑模块，零第三方依赖，只用原生 Date / JSON，可在 Node 下直接跑。
// 注意：本文件只用可擦除的 TypeScript 语法。

import { toDate } from '../twitter/conditions.ts';

export interface TweetExportPost {
  id: string;
  createdAt?: unknown;
  fullText?: string;
  favoriteCount?: number;
  retweetCount?: number;
  replyCount?: number;
  views?: number;
  lang?: string;
  medias?: Array<{ type?: string; url?: string; id?: string }>;
  user?: { screenName?: string; name?: string };
}

export type TweetFormat = 'txt' | 'html' | 'json';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 文件名安全化：去掉 Windows / POSIX 文件名非法字符，截断到 200 字符。 */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 200);
  return cleaned || 'tweet';
}

export function tweetFileName(post: TweetExportPost, format: TweetFormat): string {
  return sanitizeFileName(`${post.id}.${format}`);
}

function tweetUrl(post: TweetExportPost): string {
  const screenName = post.user?.screenName ?? 'i';
  return `https://x.com/${screenName}/status/${post.id}`;
}

function createdAtText(post: TweetExportPost): string {
  const date = toDate(post.createdAt);
  return date ? date.toISOString() : '';
}

export function serializePostToTxt(post: TweetExportPost): string {
  const lines = [
    tweetUrl(post),
    `作者：${post.user?.name ?? ''} (@${post.user?.screenName ?? ''})`,
    `时间：${createdAtText(post)}`,
    `点赞 ${post.favoriteCount ?? 0}  转推 ${post.retweetCount ?? 0}  回复 ${post.replyCount ?? 0}  浏览 ${post.views ?? ''}`,
    '',
    post.fullText ?? '',
  ];
  if (post.medias && post.medias.length > 0) {
    lines.push('', '媒体：');
    for (const media of post.medias) {
      lines.push(`- [${media.type ?? ''}] ${media.url ?? ''}`);
    }
  }
  return lines.join('\n');
}

export function serializePostToHtml(post: TweetExportPost): string {
  const text = escapeHtml(post.fullText ?? '').replace(/\n/g, '<br>');
  const mediaHtml = (post.medias ?? [])
    .map((media) => {
      const url = escapeHtml(media.url ?? '');
      if (!url) return '';
      if (media.type === 'photo') {
        return `<p><img src="${url}" alt="图片" style="max-width:100%"></p>`;
      }
      return `<p><a href="${url}">${url}</a></p>`;
    })
    .join('\n');
  return [
    '<!DOCTYPE html>',
    '<html lang="zh-CN"><head><meta charset="utf-8">',
    `<title>推文 ${escapeHtml(post.id)}</title></head><body>`,
    `<p><a href="${escapeHtml(tweetUrl(post))}">${escapeHtml(tweetUrl(post))}</a></p>`,
    `<p>作者：${escapeHtml(post.user?.name ?? '')} (@${escapeHtml(post.user?.screenName ?? '')})</p>`,
    `<p>时间：${escapeHtml(createdAtText(post))}</p>`,
    `<p>点赞 ${post.favoriteCount ?? 0} 转推 ${post.retweetCount ?? 0} 回复 ${post.replyCount ?? 0} 浏览 ${post.views ?? ''}</p>`,
    `<p>${text}</p>`,
    mediaHtml,
    '</body></html>',
  ].join('\n');
}

export function serializePostToJson(post: TweetExportPost): string {
  return JSON.stringify(
    {
      id: post.id,
      url: tweetUrl(post),
      screenName: post.user?.screenName,
      name: post.user?.name,
      createdAt: createdAtText(post),
      fullText: post.fullText ?? '',
      favoriteCount: post.favoriteCount,
      retweetCount: post.retweetCount,
      replyCount: post.replyCount,
      views: post.views,
      lang: post.lang,
      medias: post.medias ?? [],
    },
    null,
    2,
  );
}

export function serializePost(
  post: TweetExportPost,
  format: TweetFormat,
): string {
  if (format === 'html') return serializePostToHtml(post);
  if (format === 'json') return serializePostToJson(post);
  return serializePostToTxt(post);
}
