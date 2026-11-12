export interface Settings_V1 {
  proxy: {
    enable: boolean;
    url: string;
    useSystem: boolean;
  };
  download: {
    savePath: string;
    fileNameTemplate: string;
    sameFileSkip: boolean;
  };
  app: {
    autoCheckUpdate: boolean;
    acceptPrerelease: boolean;
  };
}

export interface Settings_V2 {
  proxy: {
    enable: boolean;
    url: string;
    useSystem: boolean;
  };
  download: {
    saveDirBase: string;
    dirTemplate: string;
    fileNameTemplate: string;
    sameFileSkip: boolean;
  };
  app: {
    autoCheckUpdate: boolean;
    acceptPrerelease: boolean;
    writeLogs: boolean;
  };
}

export interface Settings_V3 {
  proxy: {
    enable: boolean;
    url: string;
    useSystem: boolean;
  };
  download: {
    saveDirBase: string;
    dirTemplate: string;
    fileNameTemplate: string;
    sameFileSkip: boolean;
    /** 推文正文保存格式；'none' 表示不保存推文正文。 */
    tweetFormat: 'txt' | 'html' | 'json' | 'none';
    /** 下载任务是否保存推文正文文件。 */
    downloadTweet: boolean;
    /** 下载任务是否下载媒体文件。 */
    downloadMedia: boolean;
    videoQuality: 'best' | '720p' | '480p';
    imageQuality: 'orig' | 'large' | 'medium';
    /** GIF 转 MP4：X 的 GIF 本身就是 MP4 直链，开启后按视频保存。 */
    gifToMp4: boolean;
    /** 同时提交给 aria2 的下载任务数。 */
    concurrency: number;
    /** 两次翻页请求之间的最小间隔（毫秒）。 */
    rateLimitMs: number;
    /** 日期分段下载：每段天数。 */
    dateSegmentStepDays: number;
    /** 日期分段下载：分段方向。 */
    dateSegmentDirection: 'newToOld' | 'oldToNew';
  };
  app: {
    autoCheckUpdate: boolean;
    acceptPrerelease: boolean;
    writeLogs: boolean;
    /** 最多保存的 Cookie 账号数。 */
    maxCookies: number;
  };
}

export type Settings = Settings_V3;
