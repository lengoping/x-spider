import { Settings } from '../interfaces/Settings';

export const DEFAULT_SETTINGS: Settings = {
  proxy: {
    enable: true,
    url: 'http://127.0.0.1:7890',
    useSystem: true,
  },
  download: {
    saveDirBase: '',
    dirTemplate: '',
    fileNameTemplate:
      '%POST_TIME% %USER_SCREEN_NAME% %POST_ID%-%MEDIA_INDEX%%EXT%',
    sameFileSkip: true,
    tweetFormat: 'txt',
    downloadTweet: true,
    downloadMedia: true,
    videoQuality: 'best',
    imageQuality: 'orig',
    gifToMp4: false,
    concurrency: 3,
    rateLimitMs: 1000,
    dateSegmentStepDays: 7,
    dateSegmentDirection: 'newToOld',
  },
  app: {
    autoCheckUpdate: true,
    acceptPrerelease: false,
    writeLogs: false,
    maxCookies: 5,
  },
};

export const CURRENT_SETTINGS_VERSION = 3;
