import { fs, notification, path } from '@tauri-apps/api';
import { nanoid } from 'nanoid';
import * as R from 'ramda';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import MediaType from '../enums/MediaType';
import { CreationTask, CreationTaskKind, TaskGroup } from '../interfaces/CreationTask';
import { DownloadFilter } from '../interfaces/DownloadFilter';
import { DownloadTask } from '../interfaces/DownloadTask';
import { TwitterMedia } from '../interfaces/TwitterMedia';
import { TwitterPost } from '../interfaces/TwitterPost';
import { TwitterUser } from '../interfaces/TwitterUser';
import { AriaStatus, aria2 } from '../utils/aria2';
import { delay } from '../utils';
import {
  getUser,
  getUserMedias,
  getUserTweets,
  registerAuthFailureHandler,
} from '../twitter/api';
import {
  getBookmarks,
  getCommunityTweets,
  getHomeTimeline,
  getLikes,
  getSearchTweets,
  getTweetReplies,
} from '../twitter/endpoints';
import {
  shouldSkipMedia,
  shouldSkipPost,
  shouldStopAtPost,
} from '../twitter/conditions';
import { buildSearchQuery, splitDateRange } from '../twitter/date-segments';
import { tweetDb } from '../twitter/tweet-db';
import { getDownloadUrl } from '../twitter/utils';
import { serializePost, tweetFileName } from '../utils/tweet-export';
import { resolveVariables } from '../utils/file-name-template';
import { FileNameTemplateData } from '../interfaces/FileNameTemplateData';
import dayjs from 'dayjs';
import { notification as antNotification } from 'antd';
import { useSettingsStore } from './settings';
import { useAppStateStore } from './app-state';
import { createTauriFileStorage } from './persist/tauri-file-storage';

let _log: ICategoriedLogger;

function log() {
  if (_log) return _log;
  _log = window.log.category('DL');
  return _log;
}

export interface CreateDownloadTaskParams {
  post: TwitterPost;
  media: TwitterMedia;
}

async function mergeAriaStatusToDownloadTask(
  ariaStatus: any,
  oldTask: DownloadTask,
  now = Date.now(),
): Promise<DownloadTask> {
  return {
    ...oldTask,
    gid: ariaStatus.gid,
    status: ariaStatus.status,
    completeSize: Number(ariaStatus.completedLength),
    totalSize: Number(ariaStatus.totalLength),
    fileName: await path.basename(ariaStatus.files[0].path),
    error: ariaStatus.errorMessage,
    dir: ariaStatus.dir,
    updatedAt: now,
  };
}

async function prepareDownloadTask({
  post,
  media,
}: CreateDownloadTaskParams): Promise<DownloadTask> {
  const settings = useSettingsStore.getState();
  const downloadUrl = getDownloadUrl(media, {
    videoQuality: settings.download.videoQuality,
    imageQuality: settings.download.imageQuality,
  });
  log().info('downloadUrl', downloadUrl);
  const templateData: FileNameTemplateData = {
    media,
    post,
  };
  const resolvedDirName = settings.download.dirTemplate
    ? resolveVariables(settings.download.dirTemplate, templateData)
    : '';
  log().info('resolved dirName', resolvedDirName);
  const dir = await path.join(settings.download.saveDirBase, resolvedDirName);
  log().info('resolved dir', dir);

  const fileName = resolveVariables(
    settings.download.fileNameTemplate,
    templateData,
  );

  log().info('resolved fileName', fileName);

  const task: DownloadTask = {
    gid: '',
    status: AriaStatus.Waiting,
    completeSize: 0,
    totalSize: Infinity,
    fileName,
    media,
    post,
    error: '',
    dir,
    updatedAt: Date.now(),
    downloadUrl,
    ariaRetryCountRemains: 5,
  };

  return task;
}

const creationTaskAbortControllerMap = new Map<string, AbortController>();

export interface CreateCreationTaskOptions {
  kind?: CreationTaskKind;
  sourceLabel?: string;
  persistent?: boolean;
  groupId?: string;
  query?: string;
}

export interface BatchCreateResult {
  created: CreationTask[];
  errors: { line: string; reason: string }[];
}

export interface DownloadStore {
  currentTab: string;
  setCurrentTab: (tab: string) => void;

  downloadTasks: DownloadTask[];
  autoSyncTaskIds: string[];
  setAutoSyncTaskIds: (ids: string[]) => void;
  createDownloadTask: (params: CreateDownloadTaskParams) => Promise<void>;
  batchCreateDownloadTask: (
    paramsList: CreateDownloadTaskParams[],
  ) => Promise<void>;
  pauseDownloadTask: (gid: string) => Promise<void>;
  pauseAllDownloadTask: () => Promise<void>;
  unpauseDownloadTask: (gid: string) => Promise<void>;
  unpauseAllDownloadTask: () => Promise<void>;
  removeDownloadTask: (gid: string) => Promise<void>;
  batchRemoveDownloadTasks: (gids: string[]) => Promise<void>;
  syncDownloadTaskStatus: (gid: string) => Promise<void>;
  updateDownloadTask: (task: DownloadTask, now?: number) => void;
  batchUpdateDownloadTasks: (tasks: DownloadTask[]) => void;
  redownloadTask: (gid: string) => Promise<void>;
  batchRedownloadTask: (gid: string[]) => Promise<void>;

  creationTasks: CreationTask[];
  createCreationTask: (
    user: TwitterUser | undefined,
    filter: DownloadFilter,
    options?: CreateCreationTaskOptions,
  ) => CreationTask;
  batchCreateCreationTasks: (
    lines: string[],
    kind: CreationTaskKind,
    baseFilter?: DownloadFilter,
    options?: { persistent?: boolean; groupId?: string },
  ) => Promise<BatchCreateResult>;
  removeCreationTask: (id: string) => void;
  updateCreationTask: (task: CreationTask) => void;
  pauseCreationTask: (id: string) => void;
  resumeCreationTask: (id: string) => void;
}

export const useDownloadStore = create<DownloadStore>()(
  persist<DownloadStore, [], [], { creationTasks: CreationTask[] }>(
    (set, get) => ({
      currentTab: '',
      setCurrentTab: (tab) => set({ currentTab: tab }),

      autoSyncTaskIds: [],
      setAutoSyncTaskIds: (ids) => set({ autoSyncTaskIds: ids }),

      downloadTasks: [],
      createDownloadTask: async (params) => {
        const task = await prepareDownloadTask(params);

        const gid = await aria2.invoke('aria2.addUri', [task.downloadUrl], {
          dir: task.dir,
          out: task.fileName,
        });
        task.gid = gid;

        const status = await aria2.tellStatus(task.gid);
        task.status = status.status;

        set({
          downloadTasks: get().downloadTasks.concat(task),
        });
      },
      updateDownloadTask: (task, now = Date.now()) => {
        const oldTasks = get().downloadTasks;
        const oldTaskIndex = get().downloadTasks.findIndex(
          (t) => t.gid === task.gid,
        );
        if (oldTaskIndex === -1) return;
        const oldTask = oldTasks[oldTaskIndex];
        if (oldTask.updatedAt > now) return;
        const newTasks = R.adjust(oldTaskIndex, R.always(task))(oldTasks);
        set({
          downloadTasks: newTasks,
        });
      },
      batchUpdateDownloadTasks: (tasks) => {
        const { downloadTasks: oldTasks } = get();
        const newTaskMap = R.pipe<
          [DownloadTask[]],
          [DownloadTask['gid'], DownloadTask][],
          Record<string, DownloadTask>
        >(
          R.map((t: DownloadTask) => [t.gid, t]),
          R.fromPairs,
        )(tasks);

        const newTasks = oldTasks.map((oldTask) => {
          const newTask = newTaskMap[oldTask.gid];
          if (!newTask) return oldTask;
          if (newTask.updatedAt < oldTask.updatedAt) {
            return oldTask;
          }
          return newTask;
        });

        set({
          downloadTasks: newTasks,
        });
      },
      batchCreateDownloadTask: async (paramsList) => {
        const tasks: DownloadTask[] = [];

        for (const params of paramsList) {
          const task = await prepareDownloadTask(params);
          tasks.push(task);
        }

        if (tasks.length === 0) {
          return;
        }

        const gids: string[] = (
          await aria2.batchInvoke(
            tasks.map((task) => ({
              methodName: 'aria2.addUri',
              params: [
                [task.downloadUrl],
                {
                  dir: task.dir,
                  out: task.fileName,
                },
              ],
            })),
          )
        ).flat();

        const statusMap = await aria2.tellStatus(gids);

        tasks.forEach((task, index) => {
          task.gid = gids[index];
          task.status = statusMap[task.gid].status;
        });

        const newTasks = get().downloadTasks.concat(tasks);
        set({
          downloadTasks: newTasks,
        });
      },
      pauseDownloadTask: async (gid) => {
        await aria2.invoke('aria2.pause', gid);
      },
      pauseAllDownloadTask: async () => {
        await aria2.invoke('aria2.pauseAll');
      },
      unpauseDownloadTask: async (gid) => {
        await aria2.invoke('aria2.unpause', gid);
      },
      unpauseAllDownloadTask: async () => {
        await aria2.invoke('aria2.unpauseAll');
      },
      removeDownloadTask: async (gid) => {
        aria2.invoke('aria2.remove', gid).catch((err) => {
          log().warn('Remove aria2 task failed', { gid, err });
        });
        const state = get();
        set({
          downloadTasks: R.filter((v: DownloadTask) => v.gid !== gid)(
            state.downloadTasks,
          ),
          autoSyncTaskIds: R.filter((v: string) => v !== gid)(
            state.autoSyncTaskIds,
          ),
        });
      },
      batchRemoveDownloadTasks: async (gids) => {
        aria2
          .batchInvoke(
            gids.map((gid) => ({
              methodName: 'aria2.remove',
              params: [gid],
            })),
          )
          .catch((err) => {
            log().error({ gids, err });
          });
        set({
          downloadTasks: R.filter((v: DownloadTask) => !gids.includes(v.gid))(
            get().downloadTasks,
          ),
        });
      },
      redownloadTask: async (gid) => {
        const store = get();
        const oldTask = store.downloadTasks.find((t) => t.gid === gid);
        if (!oldTask) {
          throw new Error('找不到旧的下载任务');
        }
        await store.removeDownloadTask(oldTask.gid);
        await store.createDownloadTask({
          post: oldTask.post,
          media: oldTask.media,
        });
      },
      batchRedownloadTask: async (gids) => {
        const store = get();
        const oldTasks = store.downloadTasks.filter((t) =>
          gids.includes(t.gid),
        );
        if (oldTasks.length === 0) {
          throw new Error('找不到旧的下载任务');
        }

        await store.batchRemoveDownloadTasks(gids);
        await store.batchCreateDownloadTask(
          oldTasks.map((task) => ({
            media: task.media,
            post: task.post,
          })),
        );
      },
      syncDownloadTaskStatus: async (gid) => {
        const { downloadTasks, updateDownloadTask, removeDownloadTask } = get();
        const index = downloadTasks.findIndex((v) => v.gid === gid);
        if (index === -1) {
          return;
        }
        const task = downloadTasks[index];
        const now = Date.now();
        const status = await aria2.tellStatus(gid);

        if (status.status === 'error') {
          if (task.ariaRetryCountRemains > 0) {
            log().warn(
              `Task download failed, retry it. RetryCountRemains: ${task.ariaRetryCountRemains}`,
              task,
            );
            removeDownloadTask(task.gid);

            const newTask = await prepareDownloadTask({
              post: task.post,
              media: task.media,
            });
            newTask.ariaRetryCountRemains = task.ariaRetryCountRemains - 1;

            const gid = await aria2.invoke('aria2.addUri', [task.downloadUrl], {
              dir: newTask.dir,
              out: newTask.fileName,
            });
            newTask.gid = gid;

            const status = await aria2.tellStatus(task.gid);
            newTask.status = status.status;

            set({
              downloadTasks: get().downloadTasks.concat(newTask),
            });
          } else {
            const newTask = await mergeAriaStatusToDownloadTask(status, task);
            const msg = '任务下载失败';
            const desc = `${newTask.fileName}\n${newTask.error || '未知原因'}`;
            log().error('Task download failed', newTask);
            antNotification.error({
              message: msg,
              description: desc,
            });
            notification.sendNotification({
              title: msg,
              body: desc,
            });
          }
        } else {
          const newTask = await mergeAriaStatusToDownloadTask(status, task);
          updateDownloadTask(newTask, now);
        }
      },

      creationTasks: [],
      createCreationTask: (user, filter, options: CreateCreationTaskOptions = {}) => {
        const id = nanoid();
        const abortController = new AbortController();
        creationTaskAbortControllerMap.set(id, abortController);
        const kind =
          options.kind ??
          (filter.source === 'medias' ? 'userMedias' : 'userTweets');
        const task: CreationTask = {
          id,
          user,
          query: options.query,
          filter,
          status: 'waiting',
          completeCount: 0,
          skipCount: 0,
          kind,
          sourceLabel:
            options.sourceLabel ??
            (user ? `@${user.screenName}` : kind),
          persistent: options.persistent ?? false,
          groupId: options.groupId,
          lastCursor: undefined,
        };
        set({
          creationTasks: [...get().creationTasks, task],
        });
        if (options.groupId) {
          useTaskGroupStore
            .getState()
            .addTasksToGroup(options.groupId, [id]);
        }
        return task;
      },
      batchCreateCreationTasks: async (
        lines,
        kind,
        baseFilter,
        options: { persistent?: boolean; groupId?: string } = {},
      ) => {
        const store = get();
        const filter: DownloadFilter = {
          source: 'tweets',
          mediaTypes: [MediaType.Video, MediaType.Photo, MediaType.Gif],
          ...baseFilter,
        };
        const created: CreationTask[] = [];
        const errors: { line: string; reason: string }[] = [];
        const seen = new Set<string>();
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;
          const dedupeKey =
            kind === 'search' ? line : line.toLowerCase();
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          try {
            if (kind === 'search') {
              created.push(
                store.createCreationTask(undefined, filter, {
                  kind,
                  query: line,
                  sourceLabel: `搜索：${line}`,
                  persistent: options.persistent,
                  groupId: options.groupId,
                }),
              );
            } else if (kind === 'replies') {
              const tweetId = extractTweetId(line);
              created.push(
                store.createCreationTask(undefined, filter, {
                  kind,
                  query: tweetId,
                  sourceLabel: `回复：${tweetId}`,
                  persistent: options.persistent,
                  groupId: options.groupId,
                }),
              );
            } else if (kind === 'bookmarks' || kind === 'timeline') {
              created.push(
                store.createCreationTask(undefined, filter, {
                  kind,
                  query: line,
                  sourceLabel:
                    kind === 'bookmarks' ? `书签：${line}` : `时间线：${line}`,
                  persistent: options.persistent,
                  groupId: options.groupId,
                }),
              );
            } else if (kind === 'community') {
              created.push(
                store.createCreationTask(undefined, filter, {
                  kind,
                  query: line,
                  sourceLabel: `社群：${line}`,
                  persistent: options.persistent,
                  groupId: options.groupId,
                }),
              );
            } else {
              // userMedias / userTweets / likes / dateSegmented：每行一个用户名。
              const user = await getUser(line);
              const kindLabel =
                kind === 'userMedias'
                  ? '媒体'
                  : kind === 'userTweets'
                    ? '推文'
                    : kind === 'likes'
                      ? '喜欢'
                      : '分段';
              created.push(
                store.createCreationTask(user, filter, {
                  kind,
                  sourceLabel: `@${user.screenName}（${kindLabel}）`,
                  persistent: options.persistent,
                  groupId: options.groupId,
                }),
              );
            }
          } catch (err: any) {
            errors.push({
              line,
              reason: err?.message || '未知原因',
            });
          }
        }
        return { created, errors };
      },
      removeCreationTask: (id) => {
        const abortController = creationTaskAbortControllerMap.get(id);
        if (abortController) {
          abortController.abort();
          creationTaskAbortControllerMap.delete(id);
        }
        set({
          creationTasks: get().creationTasks.filter((v) => v.id !== id),
        });
      },
      updateCreationTask: (task) => {
        set({
          creationTasks: get().creationTasks.map((oldTask) => {
            if (oldTask.id === task.id) return task;
            return oldTask;
          }),
        });
      },
      pauseCreationTask: (id) => {
        const abortController = creationTaskAbortControllerMap.get(id);
        if (abortController) {
          abortController.abort();
          creationTaskAbortControllerMap.delete(id);
        }
        const task = get().creationTasks.find((v) => v.id === id);
        if (task && task.status === 'active') {
          get().updateCreationTask({ ...task, status: 'paused' });
        } else if (task && task.status === 'waiting') {
          get().updateCreationTask({ ...task, status: 'paused' });
        }
      },
      resumeCreationTask: (id) => {
        const task = get().creationTasks.find((v) => v.id === id);
        if (task && (task.status === 'paused' || task.status === 'done')) {
          get().updateCreationTask({ ...task, status: 'waiting' });
        }
      },
    }),
    {
      name: 'creation-tasks',
      version: 1,
      storage: createTauriFileStorage(),
      partialize: (state) => ({ creationTasks: state.creationTasks }),
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error || !state) return;
          // 上次退出时还在跑的任务回到等待态，由调度器继续跑。
          const tasks = useDownloadStore.getState().creationTasks;
          tasks.forEach((task) => {
            if (task.status === 'active') {
              useDownloadStore
                .getState()
                .updateCreationTask({ ...task, status: 'waiting' });
            }
          });
        };
      },
      migrate(state: any, _version) {
        if (state?.creationTasks) {
          state.creationTasks = state.creationTasks.map((task: any) => ({
            ...task,
            kind:
              task.kind ??
              (task.filter?.source === 'medias'
                ? 'userMedias'
                : 'userTweets'),
            sourceLabel:
              task.sourceLabel ??
              (task.user ? `@${task.user.screenName}` : '任务'),
            persistent: task.persistent ?? false,
            status: task.status === 'active' ? 'waiting' : task.status,
          }));
        }
        return state;
      },
    },
  ),
);

export interface TaskGroupStore {
  taskGroups: TaskGroup[];
  createTaskGroup: (name: string) => TaskGroup;
  removeTaskGroup: (id: string) => void;
  addTasksToGroup: (groupId: string, taskIds: string[]) => void;
  /** 重置为第一页 + paused，不删已下载的文件与推文库记录。 */
  resetGroupTasks: (groupId: string) => void;
  /** 组内 paused / done 的任务全部开始（done 的从头抓新推文）。 */
  startAllGroupTasks: (groupId: string) => void;
}

export const useTaskGroupStore = create<TaskGroupStore>()(
  persist<TaskGroupStore, [], [], { taskGroups: TaskGroup[] }>(
    (set, get) => ({
      taskGroups: [],
      createTaskGroup: (name) => {
        const group: TaskGroup = {
          id: nanoid(),
          name: name.trim() || '未命名任务组',
          createdAt: Date.now(),
          taskIds: [],
        };
        set({ taskGroups: [...get().taskGroups, group] });
        return group;
      },
      removeTaskGroup: (id) => {
        const group = get().taskGroups.find((g) => g.id === id);
        if (group) {
          const downloadState = useDownloadStore.getState();
          group.taskIds.forEach((taskId) => {
            const task = downloadState.creationTasks.find(
              (t) => t.id === taskId,
            );
            if (task?.groupId === id) {
              downloadState.updateCreationTask({
                ...task,
                groupId: undefined,
              });
            }
          });
        }
        set({
          taskGroups: get().taskGroups.filter((g) => g.id !== id),
        });
      },
      addTasksToGroup: (groupId, taskIds) => {
        set({
          taskGroups: get().taskGroups.map((group) => {
            if (group.id !== groupId) return group;
            return {
              ...group,
              taskIds: [...new Set([...group.taskIds, ...taskIds])],
            };
          }),
        });
        const downloadState = useDownloadStore.getState();
        taskIds.forEach((taskId) => {
          const task = downloadState.creationTasks.find(
            (t) => t.id === taskId,
          );
          if (task && task.groupId !== groupId) {
            downloadState.updateCreationTask({ ...task, groupId });
          }
        });
      },
      resetGroupTasks: (groupId) => {
        const group = get().taskGroups.find((g) => g.id === groupId);
        if (!group) return;
        const downloadState = useDownloadStore.getState();
        group.taskIds.forEach((taskId) => {
          const task = downloadState.creationTasks.find(
            (t) => t.id === taskId,
          );
          if (!task) return;
          const abortController = creationTaskAbortControllerMap.get(taskId);
          if (abortController) {
            abortController.abort();
            creationTaskAbortControllerMap.delete(taskId);
          }
          downloadState.updateCreationTask({
            ...task,
            status: 'paused',
            lastCursor: undefined,
            completeCount: 0,
            skipCount: 0,
          });
        });
      },
      startAllGroupTasks: (groupId) => {
        const group = get().taskGroups.find((g) => g.id === groupId);
        if (!group) return;
        const downloadState = useDownloadStore.getState();
        group.taskIds.forEach((taskId) => {
          const task = downloadState.creationTasks.find(
            (t) => t.id === taskId,
          );
          if (!task) return;
          if (task.status === 'paused') {
            downloadState.updateCreationTask({ ...task, status: 'waiting' });
          } else if (task.status === 'done') {
            // 常驻任务重新开始：从头抓，顺带抓到期间的新推文。
            downloadState.updateCreationTask({
              ...task,
              status: 'waiting',
              lastCursor: undefined,
            });
          }
        });
      },
    }),
    {
      name: 'task-groups',
      version: 1,
      storage: createTauriFileStorage(),
      partialize: (state) => ({ taskGroups: state.taskGroups }),
    },
  ),
);

/** 从推文链接或纯 ID 里提取推文数字 ID。 */
export function extractTweetId(line: string): string {
  const statusMatch = line.match(/status\/(\d+)/);
  if (statusMatch) return statusMatch[1];
  return line.trim();
}

type RunOutcome = 'completed' | 'stopped' | 'aborted';

/** 把一条推文写入推文库，并在设置允许时保存推文正文文件。 */
async function archivePost(
  post: TwitterPost,
  task: CreationTask,
  settings: ReturnType<typeof useSettingsStore.getState>,
): Promise<void> {
  try {
    await tweetDb.upsert(post, { source: task.sourceLabel });
  } catch (err) {
    log().warn('推文入库失败', err);
  }
  if (!settings.download.downloadTweet) return;
  const format = settings.download.tweetFormat ?? 'txt';
  if (format === 'none') return;
  try {
    const templateData: FileNameTemplateData = {
      media: post.medias?.[0] as TwitterMedia,
      post,
    } as FileNameTemplateData;
    const resolvedDirName = settings.download.dirTemplate
      ? resolveVariables(settings.download.dirTemplate, templateData)
      : '';
    const dir = await path.join(
      settings.download.saveDirBase,
      resolvedDirName,
    );
    await fs.createDir(dir, { recursive: true });
    await fs.writeTextFile(
      await path.join(dir, tweetFileName(post, format)),
      serializePost(post, format),
    );
  } catch (err) {
    log().warn('保存推文正文失败', err);
  }
}

async function runCreationTask(
  task: CreationTask,
  abortSignal: AbortSignal,
): Promise<RunOutcome> {
  log().info('Run creation task', task);
  const { filter, user } = task;

  const { batchCreateDownloadTask, updateCreationTask } =
    useDownloadStore.getState();
  const settings = useSettingsStore.getState();

  let completeCount = task.completeCount || 0;
  let skipCount = task.skipCount || 0;
  let current: CreationTask = {
    ...task,
    status: 'active',
    lastRunAt: Date.now(),
  };
  const save = (patch: Partial<CreationTask>) => {
    current = { ...current, ...patch };
    updateCreationTask(current);
  };

  const rateLimitMs = Math.max(0, settings.download.rateLimitMs ?? 0);
  const concurrency = Math.max(1, settings.download.concurrency ?? 1);
  const dbLookup = (postId: string): boolean =>
    filter.dedupMode === 'perSource'
      ? tweetDb.hasInSource(postId, task.sourceLabel)
      : tweetDb.has(postId);
  const downloadedLookup = (postId: string): boolean =>
    useDownloadStore
      .getState()
      .downloadTasks.some((t) => t.post.id === postId);

  const getMediaCounts = R.reduce((acc: number, elem: TwitterPost) => {
    return acc + (elem.medias?.length || 0);
  }, 0);

  /**
   * 处理一页帖子。返回 'stop' 表示命中停止条件，本任务应立即停止。
   */
  const processPage = async (
    twitterPosts: TwitterPost[],
  ): Promise<'continue' | 'stop'> => {
    const now = dayjs();
    const since = filter.dateRange?.[0] || dayjs.unix(0);
    const until = filter.dateRange?.[1] || now.clone();
    const filteredPosts = twitterPosts.filter(
      R.allPass([
        (post) => (post.medias ? post.medias.length >= 0 : false),
        (post) => {
          if (!post.createdAt) return true;
          return until ? post.createdAt.isBefore(until) : true;
        },
        (post) => {
          if (!post.createdAt) return true;
          return since ? post.createdAt.isAfter(since) : true;
        },
      ]),
    );

    const filteredCount =
      getMediaCounts(twitterPosts) - getMediaCounts(filteredPosts);
    skipCount += filteredCount;

    const paramsList: CreateDownloadTaskParams[] = [];

    for (const post of filteredPosts) {
      if (abortSignal.aborted) return 'continue';
      if (
        shouldStopAtPost(
          post,
          filter.stopConditions,
          { dbLookup, downloadedLookup },
        )
      ) {
        log().info('Stop condition hit, stop task', post.id);
        return 'stop';
      }
      if (
        shouldSkipPost(
          post,
          filter.skipConditions,
          { dbLookup, downloadedLookup },
        )
      ) {
        skipCount++;
        continue;
      }

      await archivePost(post, task, settings);

      if (!settings.download.downloadMedia) continue;
      if (!post.medias) continue;
      for (const media of post.medias) {
        if (
          filter.mediaTypes &&
          !filter.mediaTypes.includes(media.type)
        ) {
          continue;
        }
        if (shouldSkipMedia(media, filter.mediaSkipConditions)) {
          skipCount++;
          continue;
        }
        const downloadTask = await prepareDownloadTask({ post, media });
        const filePath = await path.join(
          downloadTask.dir,
          downloadTask.fileName,
        );
        if (
          settings.download.sameFileSkip &&
          (await fs.exists(filePath))
        ) {
          skipCount++;
          continue;
        }
        paramsList.push({ media, post });
      }
    }

    save({ completeCount, skipCount });

    // 按并发数分块提交给 aria2。
    for (let i = 0; i < paramsList.length; i += concurrency) {
      if (abortSignal.aborted) return 'continue';
      const chunk = paramsList.slice(i, i + concurrency);
      await batchCreateDownloadTask(chunk);
      completeCount += chunk.length;
      save({ completeCount, skipCount });
    }
    return 'continue';
  };

  const fetchPage = async (
    cursor: string | undefined,
  ): Promise<{ twitterPosts: TwitterPost[]; cursor: string | null }> => {
    switch (task.kind) {
      case 'userMedias': {
        if (!user) throw new Error('该任务缺少目标用户');
        return getUserMedias(user.id, cursor);
      }
      case 'search': {
        return getSearchTweets(task.query ?? '', cursor);
      }
      case 'replies': {
        return getTweetReplies(task.query ?? '', cursor);
      }
      case 'likes': {
        if (!user) throw new Error('该任务缺少目标用户');
        return getLikes(user.id, cursor);
      }
      case 'bookmarks': {
        return getBookmarks(cursor);
      }
      case 'timeline': {
        return getHomeTimeline(cursor);
      }
      case 'community': {
        return getCommunityTweets(task.query ?? '', cursor);
      }
      case 'userTweets':
      default: {
        if (!user) throw new Error('该任务缺少目标用户');
        return getUserTweets(user.id, cursor);
      }
    }
  };

  // 日期分段下载：按段生成高级搜索语句逐段抓取。
  if (task.kind === 'dateSegmented') {
    if (!user) throw new Error('该任务缺少目标用户');
    if (!filter.dateRange) {
      // 没有日期范围时退化为普通用户推文任务。
      return runPagedTask(task, abortSignal, fetchPage, processPage, save);
    }
    const segments = splitDateRange(
      filter.dateRange[0].toDate(),
      filter.dateRange[1].toDate(),
      settings.download.dateSegmentStepDays ?? 7,
      settings.download.dateSegmentDirection ?? 'newToOld',
    );
    for (const [segSince, segUntil] of segments) {
      if (abortSignal.aborted) return 'aborted';
      const query = buildSearchQuery(
        `from:${user.screenName}`,
        segSince,
        segUntil,
      );
      let segCursor: string | undefined | null = undefined;
      while (segCursor !== null) {
        if (abortSignal.aborted) return 'aborted';
        log().info('CreationTask fetching segment', query, segCursor);
        const { twitterPosts, cursor } = await getSearchTweets(
          query,
          segCursor,
        );
        if (abortSignal.aborted) return 'aborted';
        segCursor = cursor;
        save({ lastCursor: segCursor });
        const outcome = await processPage(twitterPosts);
        if (outcome === 'stop') {
          save({ completeCount, skipCount });
          return 'stopped';
        }
        if (segCursor !== null && rateLimitMs > 0) {
          await delay(rateLimitMs);
        }
      }
    }
    save({ completeCount, skipCount, lastCursor: null });
    return 'completed';
  }

  return runPagedTask(task, abortSignal, fetchPage, processPage, save);
}

/** 普通翻页循环：按 cursor 循环拉取，直到游标为空或翻到日期范围之外。 */
async function runPagedTask(
  task: CreationTask,
  abortSignal: AbortSignal,
  fetchPage: (
    cursor: string | undefined,
  ) => Promise<{ twitterPosts: TwitterPost[]; cursor: string | null }>,
  processPage: (
    posts: TwitterPost[],
  ) => Promise<'continue' | 'stop'>,
  save: (patch: Partial<CreationTask>) => void,
): Promise<RunOutcome> {
  const { filter } = task;
  let now = dayjs();
  const since = filter.dateRange?.[0] || dayjs.unix(0);
  let nextCursor: string | undefined | null =
    task.lastCursor ?? undefined;
  const settings = useSettingsStore.getState();
  const rateLimitMs = Math.max(0, settings.download.rateLimitMs ?? 0);

  while (nextCursor !== null && now.isAfter(since)) {
    if (abortSignal.aborted) {
      return 'aborted';
    }

    log().info('CreationTask fetching', nextCursor);
    const { twitterPosts, cursor } = await fetchPage(nextCursor);
    if (abortSignal.aborted) return 'aborted';
    nextCursor = cursor;
    now = R.last(twitterPosts)?.createdAt || now;
    log().info('Now', now.format('YYYY-MM-DD'), 'next cursor', nextCursor);
    save({ lastCursor: nextCursor });

    const outcome = await processPage(twitterPosts);
    if (outcome === 'stop') {
      return 'stopped';
    }

    if (abortSignal.aborted) return 'aborted';
    if (nextCursor !== null && rateLimitMs > 0) {
      await delay(rateLimitMs);
    }
  }

  save({ lastCursor: null });
  return 'completed';
}

// 401/403 时切换到下一个可用 Cookie 账号（见 src/twitter/api.ts）。
registerAuthFailureHandler(() => {
  useAppStateStore.getState().markActiveCookieFailed();
});

// Schedules creation tasks
async function scheduleCreationTasks() {
  const state = useDownloadStore.getState();

  // 只跑 waiting 的任务；paused / done 等用户手动开始。
  const task = state.creationTasks.find((t) => t.status === 'waiting');
  if (!task) {
    requestIdleCallback(scheduleCreationTasks);
    return;
  }

  // Check if there was a creation task running
  if (state.creationTasks.find((t) => t.status === 'active')) {
    requestIdleCallback(scheduleCreationTasks);
    return;
  }

  let abortController = creationTaskAbortControllerMap.get(task.id);
  if (!abortController || abortController.signal.aborted) {
    abortController = new AbortController();
    creationTaskAbortControllerMap.set(task.id, abortController);
  }

  state.updateCreationTask({ ...task, status: 'active' });

  try {
    const outcome = await runCreationTask(
      { ...task, status: 'active' },
      abortController.signal,
    );
    log().info('Completed creation task', task.id, outcome);
    const latest = useDownloadStore
      .getState()
      .creationTasks.find((t) => t.id === task.id);
    if (!latest) {
      // 任务在运行期间已被删除
    } else if (outcome === 'aborted') {
      useDownloadStore.getState().removeCreationTask(task.id);
    } else if (outcome === 'stopped') {
      // 命中停止条件：暂停保留断点，等用户手动继续。
      useDownloadStore
        .getState()
        .updateCreationTask({ ...latest, status: 'paused' });
    } else if (latest.persistent) {
      useDownloadStore
        .getState()
        .updateCreationTask({ ...latest, status: 'done', lastCursor: null });
    } else {
      useDownloadStore.getState().removeCreationTask(task.id);
    }
  } catch (err: any) {
    log().error('runCreationTaskError', err);
    const latest = useDownloadStore
      .getState()
      .creationTasks.find((t) => t.id === task.id);
    if (latest?.persistent) {
      // 常驻任务失败后暂停保留，不断重试。
      useDownloadStore
        .getState()
        .updateCreationTask({ ...latest, status: 'paused' });
    } else {
      useDownloadStore.getState().removeCreationTask(task.id);
    }
    const reason = typeof err === 'string' ? err : err?.message || '未知原因';
    notification.sendNotification({
      title: '爬虫任务运行失败',
      body: reason,
    });
    antNotification.error({
      message: `爬虫任务运行失败：${reason}`,
    });
  }

  requestIdleCallback(scheduleCreationTasks);
}

scheduleCreationTasks();

const INTERVAL = 500;
// Auto sync tasks
async function scheduleAutoSyncTasks() {
  const ids = useDownloadStore.getState().autoSyncTaskIds;
  if (ids.length === 0) {
    setTimeout(scheduleAutoSyncTasks, INTERVAL);
    return;
  }

  const now = Date.now();
  const resultMap = await aria2.tellStatus(ids);
  const { downloadTasks, batchUpdateDownloadTasks } =
    useDownloadStore.getState();
  const newTasks = await Promise.all(
    downloadTasks.map<Promise<DownloadTask>>(async (oldTask) => {
      // Do not update status after someone updated it during query
      if (oldTask.updatedAt > now) return oldTask;
      if (!resultMap[oldTask.gid]) return oldTask;
      return mergeAriaStatusToDownloadTask(
        resultMap[oldTask.gid],
        oldTask,
        now,
      );
    }),
  );

  batchUpdateDownloadTasks(newTasks);

  setTimeout(scheduleAutoSyncTasks, INTERVAL);
}

scheduleAutoSyncTasks();
