import MediaType from '../enums/MediaType';
import { TwitterMedia } from '../interfaces/TwitterMedia';

export interface DownloadUrlOptions {
  videoQuality?: 'best' | '720p' | '480p';
  imageQuality?: 'orig' | 'large' | 'medium';
}

export function getDownloadUrl(
  media: TwitterMedia,
  options: DownloadUrlOptions = {},
): string {
  if (media.type === MediaType.Photo) {
    if (!media.url) throw new Error('媒体没有下载链接');
    const url = new URL(media.url);
    // 图片质量直接映射为 pbs.twimg.com 的 name 参数。
    url.searchParams.set('name', options.imageQuality ?? 'orig');
    return url.href;
  }

  if (media.type === MediaType.Video) {
    const variants = (media.videoInfo?.variants ?? []).filter(
      (i) => i.bitrate && i.url,
    );
    if (variants.length === 0) {
      throw new Error('视频没有下载链接');
    }
    const sorted = [...variants].sort(
      (a, b) => (a.bitrate || 0) - (b.bitrate || 0),
    );
    const quality = options.videoQuality ?? 'best';
    let variant;
    if (quality === 'best') {
      variant = sorted[sorted.length - 1];
    } else {
      // X 的 variant 不带分辨率元数据，只能按 URL 里的分辨率标记尽力匹配，
      // 匹配不到时按码率档位退化：720p 取中间档，480p 取最低档。
      const marker = quality === '720p' ? /720|1280/ : /480|854/;
      variant =
        sorted.find((v) => marker.test(v.url || '')) ??
        (quality === '720p'
          ? sorted[Math.floor(sorted.length / 2)]
          : sorted[0]);
    }
    if (!variant?.url) {
      throw new Error('视频没有下载链接');
    }
    return variant.url;
  }

  if (media.type === MediaType.Gif) {
    if (!media.videoInfo?.url) throw new Error('Gif 没有下载链接');
    // X 的 GIF 本身就是 MP4 直链；gifToMp4 开启时同样返回该直链，
    // 不做本地转码（需要 ffmpeg，不随应用打包）。
    return media.videoInfo.url;
  }

  throw new Error(`无法获取该媒体类型的下载链接 ${media}`);
}
