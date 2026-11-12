// 推文库：已抓取推文的本地索引，用于去重、检索、排序与导出。
// 纯逻辑模块，零第三方依赖，只用原生 Date / JSON，可在 Node 下直接跑。
// 存储可注入：默认用 localStorage 适配器（Tauri 内嵌页面可用）；
// Tauri 下调用方可通过 setTweetDbStorage 注入文件存储。
// 注意：本文件只用可擦除的 TypeScript 语法。

import { toDate } from './conditions.ts';

export type DedupMode = 'global' | 'perSource';
export type TweetDbSortBy = 'createdAt' | 'favoriteCount' | 'retweetCount';

export interface TweetDbRecord {
  id: string;
  screenName?: string;
  name?: string;
  fullText?: string;
  createdAt?: string;
  favoriteCount?: number;
  retweetCount?: number;
  replyCount?: number;
  views?: number;
  lang?: string;
  /** medias 未提供时为 undefined：再次入库时不覆盖旧值。 */
  hasMedia?: boolean;
  mediaCount?: number;
  source?: string;
  savedAt: string;
}

export interface TweetDbPostInput {
  id: string;
  createdAt?: unknown;
  fullText?: string;
  favoriteCount?: number;
  retweetCount?: number;
  replyCount?: number;
  views?: number;
  lang?: string;
  medias?: Array<{ type?: string }>;
  user?: { screenName?: string; name?: string };
}

export interface TweetDbQuery {
  keyword?: string;
  screenName?: string;
  dateRange?: [string | Date, string | Date];
  hasMedia?: boolean;
  sortBy?: TweetDbSortBy;
  order?: 'asc' | 'desc';
  limit?: number;
}

export interface TweetDbStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem?(key: string): void | Promise<void>;
}

export interface TweetDbOptions {
  dedupMode?: DedupMode;
  storageKey?: string;
}

export const DEFAULT_TWEET_DB_KEY = 'tweet-db-v1';

function createMemoryStorage(): TweetDbStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function createLocalStorageAdapter(): TweetDbStorage | null {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (!ls) return null;
    return {
      getItem: (key) => ls.getItem(key),
      setItem: (key, value) => ls.setItem(key, value),
      removeItem: (key) => ls.removeItem(key),
    };
  } catch {
    return null;
  }
}

export function recordFromPost(
  post: TweetDbPostInput,
  source?: string,
): TweetDbRecord {
  const createdAt = toDate(post.createdAt);
  return {
    id: post.id,
    screenName: post.user?.screenName,
    name: post.user?.name,
    fullText: post.fullText,
    createdAt: createdAt ? createdAt.toISOString() : undefined,
    favoriteCount: post.favoriteCount,
    retweetCount: post.retweetCount,
    replyCount: post.replyCount,
    views: post.views,
    lang: post.lang,
    // medias 未提供时不写这两个字段：再次入库时不覆盖旧值。
    hasMedia: post.medias ? post.medias.length > 0 : undefined,
    mediaCount: post.medias?.length,
    source,
    savedAt: new Date().toISOString(),
  };
}

function csvEscape(value: string | number | undefined): string {
  const text = value === undefined || value === null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export const TWEET_DB_CSV_HEADER =
  'id,screen_name,name,created_at,full_text,favorite_count,retweet_count,reply_count,views,lang,has_media,media_count,source';

export function recordsToCSV(records: TweetDbRecord[]): string {
  const lines = records.map((r) =>
    [
      csvEscape(r.id),
      csvEscape(r.screenName),
      csvEscape(r.name),
      csvEscape(r.createdAt),
      csvEscape(r.fullText),
      csvEscape(r.favoriteCount),
      csvEscape(r.retweetCount),
      csvEscape(r.replyCount),
      csvEscape(r.views),
      csvEscape(r.lang),
      csvEscape(r.hasMedia === undefined ? undefined : r.hasMedia ? '1' : '0'),
      csvEscape(r.mediaCount),
      csvEscape(r.source),
    ].join(','),
  );
  return [TWEET_DB_CSV_HEADER, ...lines].join('\n');
}

export function recordsToJSON(records: TweetDbRecord[]): string {
  return JSON.stringify(records, null, 2);
}

function stripUndefined(record: TweetDbRecord): TweetDbRecord {
  const result = { ...record };
  for (const key of Object.keys(result) as Array<keyof TweetDbRecord>) {
    if (result[key] === undefined) delete result[key];
  }
  return result;
}

export class TweetDb {
  private map = new Map<string, TweetDbRecord>();
  private loaded = false;
  private loadPromise: Promise<void> | null = null;
  private storage: TweetDbStorage;
  private storageKey: string;
  private dedupMode: DedupMode;

  constructor(storage?: TweetDbStorage, options: TweetDbOptions = {}) {
    this.storage =
      storage ?? createLocalStorageAdapter() ?? createMemoryStorage();
    this.storageKey = options.storageKey ?? DEFAULT_TWEET_DB_KEY;
    this.dedupMode = options.dedupMode ?? 'global';
  }

  private keyFor(id: string, source?: string): string {
    if (this.dedupMode === 'perSource' && source) return `${source}:${id}`;
    return id;
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      try {
        const raw = await this.storage.getItem(this.storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as TweetDbRecord[];
          if (Array.isArray(parsed)) {
            for (const record of parsed) {
              if (record && record.id) {
                this.map.set(this.keyFor(record.id, record.source), record);
              }
            }
          }
        }
      } catch {
        // 存储损坏时从空库开始，不让推文库拖垮下载任务。
      }
      this.loaded = true;
    })();
    return this.loadPromise;
  }

  /** 同步加载已注入的内存存储（测试 / 同步调用方用）；异步存储请用 load()。 */
  loadSync(): void {
    if (this.loaded) return;
    const raw = this.storage.getItem(this.storageKey);
    if (raw instanceof Promise) {
      throw new Error('异步存储请使用 load() 而不是 loadSync()');
    }
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as TweetDbRecord[];
        if (Array.isArray(parsed)) {
          for (const record of parsed) {
            if (record && record.id) {
              this.map.set(this.keyFor(record.id, record.source), record);
            }
          }
        }
      } catch {
        // 忽略损坏的数据
      }
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    try {
      await this.storage.setItem(
        this.storageKey,
        JSON.stringify([...this.map.values()]),
      );
    } catch {
      // 持久化失败不抛错：内存里的库仍可用。
    }
  }

  private persistSync(): void {
    try {
      const result = this.storage.setItem(
        this.storageKey,
        JSON.stringify([...this.map.values()]),
      );
      if (result instanceof Promise) {
        result.catch(() => undefined);
      }
    } catch {
      // 忽略
    }
  }

  async upsert(
    post: TweetDbPostInput,
    opts: { source?: string } = {},
  ): Promise<TweetDbRecord> {
    await this.load();
    const record = recordFromPost(post, opts.source);
    const existing = this.map.get(this.keyFor(record.id, record.source));
    if (existing) {
      // 已存在：保留首次入库时间，只更新内容字段；
      // 新记录里为 undefined 的字段不覆盖旧值。
      const merged: TweetDbRecord = {
        ...existing,
        ...stripUndefined(record),
        savedAt: existing.savedAt,
      };
      this.map.set(this.keyFor(record.id, record.source), merged);
      await this.persist();
      return merged;
    }
    this.map.set(this.keyFor(record.id, record.source), record);
    await this.persist();
    return record;
  }

  upsertSync(
    post: TweetDbPostInput,
    opts: { source?: string } = {},
  ): TweetDbRecord {
    this.loadSync();
    const record = recordFromPost(post, opts.source);
    const existing = this.map.get(this.keyFor(record.id, record.source));
    if (existing) {
      const merged: TweetDbRecord = {
        ...existing,
        ...stripUndefined(record),
        savedAt: existing.savedAt,
      };
      this.map.set(this.keyFor(record.id, record.source), merged);
      this.persistSync();
      return merged;
    }
    this.map.set(this.keyFor(record.id, record.source), record);
    this.persistSync();
    return record;
  }

  has(id: string, source?: string): boolean {
    return this.map.has(this.keyFor(id, source));
  }

  hasInSource(id: string, source: string): boolean {
    return [...this.map.values()].some(
      (r) => r.id === id && r.source === source,
    );
  }

  get(id: string, source?: string): TweetDbRecord | undefined {
    return this.map.get(this.keyFor(id, source));
  }

  count(): number {
    return this.map.size;
  }

  all(): TweetDbRecord[] {
    return [...this.map.values()];
  }

  query(query: TweetDbQuery = {}): TweetDbRecord[] {
    let result = this.all();
    if (query.keyword) {
      const keyword = query.keyword.toLowerCase();
      result = result.filter((r) =>
        (r.fullText ?? '').toLowerCase().includes(keyword),
      );
    }
    if (query.screenName) {
      const name = query.screenName.toLowerCase();
      result = result.filter(
        (r) => (r.screenName ?? '').toLowerCase() === name,
      );
    }
    if (query.dateRange) {
      const [start, end] = query.dateRange;
      const startDate = toDate(start);
      const endDate = toDate(end);
      result = result.filter((r) => {
        const createdAt = toDate(r.createdAt);
        if (!createdAt) return false;
        if (startDate && createdAt.getTime() < startDate.getTime())
          return false;
        if (endDate && createdAt.getTime() > endDate.getTime()) return false;
        return true;
      });
    }
    if (query.hasMedia !== undefined) {
      result = result.filter((r) => r.hasMedia === query.hasMedia);
    }
    const sortBy = query.sortBy ?? 'createdAt';
    const order = query.order ?? 'desc';
    result = [...result].sort((a, b) => {
      let diff: number;
      if (sortBy === 'createdAt') {
        diff =
          (toDate(a.createdAt)?.getTime() ?? 0) -
          (toDate(b.createdAt)?.getTime() ?? 0);
      } else if (sortBy === 'favoriteCount') {
        diff = (a.favoriteCount ?? 0) - (b.favoriteCount ?? 0);
      } else {
        diff = (a.retweetCount ?? 0) - (b.retweetCount ?? 0);
      }
      return order === 'asc' ? diff : -diff;
    });
    if (query.limit !== undefined) {
      result = result.slice(0, Math.max(0, query.limit));
    }
    return result;
  }

  toCSV(records: TweetDbRecord[] = this.all()): string {
    return recordsToCSV(records);
  }

  toJSON(records: TweetDbRecord[] = this.all()): string {
    return recordsToJSON(records);
  }

  remove(id: string, source?: string): boolean {
    const removed = this.map.delete(this.keyFor(id, source));
    if (removed) void this.persist();
    return removed;
  }

  async clear(): Promise<void> {
    this.map.clear();
    await this.persist();
  }
}

/** 默认单例：浏览器 / Tauri 内嵌页用 localStorage，Node 下退化为内存存储。 */
export const tweetDb = new TweetDb();

/** 注入自定义存储（例如 Tauri 文件存储适配器）后返回新实例。 */
export function createTweetDb(
  storage?: TweetDbStorage,
  options: TweetDbOptions = {},
): TweetDb {
  return new TweetDb(storage, options);
}

export function createMemoryTweetDbStorage(): TweetDbStorage {
  return createMemoryStorage();
}
