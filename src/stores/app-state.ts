import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  CookieAccount,
  addCookieAccount,
  createCookieAccount,
  markCookieFailed,
  removeCookieAccount,
  resolveActiveCookieString,
} from '../twitter/cookies';
import { createTauriFileStorage } from './persist/tauri-file-storage';
import { useSettingsStore } from './settings';

export interface AppStateStore {
  /** 历史遗留的单 Cookie 字段：始终与当前激活账号保持同步，供老代码兼容。 */
  cookieString: string;
  setCookieString: (cookieString: string) => void;

  /** 多 Cookie 账号列表（见 src/twitter/cookies.ts）。 */
  cookieAccounts: CookieAccount[];
  activeCookieId: string | null;
  addCookie: (label: string, cookieString: string) => string | undefined;
  removeCookie: (id: string) => void;
  setActiveCookie: (id: string) => void;
  /** 当前激活 Cookie 失败（401/403）时调用：失败计数 +1，满 3 次自动禁用并切换。 */
  markActiveCookieFailed: () => void;
  getActiveCookieString: () => string;

  searchHistory: string[];
  addSearchHistory: (keyword: string) => void;
  clearSearchHistory: () => void;

  latestVersion: string;
  latestUrl: string;
  lastCheckUpdateTime: number;
  setLatestVersion: (version: string) => void;
  setLastCheckUpdateTime: (time: number) => void;
  setLatestUrl: (url: string) => void;

  systemProxyUrl: string;
  setSystemProxyUrl: (url: string) => void;
}

export const useAppStateStore = create(
  persist<AppStateStore>(
    (set, get) => ({
      cookieString: '',
      setCookieString: (cookieString) => {
        const state = get();
        // 同步写回当前激活账号，保持两者一致。
        const active = state.cookieAccounts.find(
          (a) => a.id === state.activeCookieId,
        );
        set({
          cookieString,
          cookieAccounts: active
            ? state.cookieAccounts.map((a) =>
                a.id === active.id ? { ...a, cookieString } : a,
              )
            : state.cookieAccounts,
        });
      },
      cookieAccounts: [],
      activeCookieId: null,
      addCookie: (label, cookieString) => {
        const state = get();
        const maxCookies =
          useSettingsStore.getState().app.maxCookies || 5;
        const result = addCookieAccount(
          state.cookieAccounts,
          label,
          cookieString,
          maxCookies,
        );
        if (result.error || !result.account) return result.error;
        // 首个账号即为激活账号，并同步兼容字段；已有激活账号时不动它。
        if (!state.activeCookieId) {
          set({
            cookieAccounts: result.accounts,
            activeCookieId: result.account.id,
            cookieString: result.account.cookieString,
          });
        } else {
          set({ cookieAccounts: result.accounts });
        }
        return undefined;
      },
      removeCookie: (id) => {
        const state = get();
        const result = removeCookieAccount(
          state.cookieAccounts,
          state.activeCookieId,
          id,
        );
        const active = result.accounts.find((a) => a.id === result.activeId);
        set({
          cookieAccounts: result.accounts,
          activeCookieId: result.activeId,
          cookieString: active?.cookieString ?? '',
        });
      },
      setActiveCookie: (id) => {
        const state = get();
        const account = state.cookieAccounts.find(
          (a) => a.id === id && !a.disabled,
        );
        if (!account) return;
        set({ activeCookieId: id, cookieString: account.cookieString });
      },
      markActiveCookieFailed: () => {
        const state = get();
        const result = markCookieFailed(
          state.cookieAccounts,
          state.activeCookieId,
        );
        const active = result.accounts.find((a) => a.id === result.activeId);
        set({
          cookieAccounts: result.accounts,
          activeCookieId: result.activeId,
          cookieString: active?.cookieString ?? state.cookieString,
        });
        if (result.disabledAccount) {
          log.warn(
            `Cookie 账号 ${result.disabledAccount.label} 连续失败 ${result.disabledAccount.failCount} 次，已自动禁用并切换账号`,
          );
        }
      },
      getActiveCookieString: () => {
        const state = get();
        return resolveActiveCookieString(
          state.cookieAccounts,
          state.activeCookieId,
          state.cookieString,
        );
      },
      searchHistory: [],
      addSearchHistory: (keyword) => {
        const history = get().searchHistory;
        const existsIndex = history.findIndex(
          (v) => v === keyword.toLowerCase(),
        );

        if (existsIndex >= 0) {
          history.splice(existsIndex, 1);
        }

        history.unshift(keyword.toLowerCase());
        set({ searchHistory: history });
      },
      clearSearchHistory: () => set({ searchHistory: [] }),
      latestVersion: PACKAGE_JSON_VERSION,
      lastCheckUpdateTime: 0,
      latestUrl: '',
      setLastCheckUpdateTime: (time) => set({ lastCheckUpdateTime: time }),
      setLatestVersion: (version) => set({ latestVersion: version }),
      setLatestUrl: (url) => set({ latestUrl: url }),
      systemProxyUrl: '',
      setSystemProxyUrl: (url) => {
        set({ systemProxyUrl: url });
      },
    }),
    {
      name: 'app-state',
      storage: createTauriFileStorage(),
      version: 2,
      migrate(state: any, version) {
        if (version === 1) {
          // V1 -> V2：把遗留的单 Cookie 迁成第一个 Cookie 账号。
          if (state.cookieString && !state.cookieAccounts?.length) {
            const account = createCookieAccount(
              '主账号',
              state.cookieString,
            );
            state.cookieAccounts = [account];
            state.activeCookieId = account.id;
          } else {
            state.cookieAccounts = state.cookieAccounts ?? [];
            state.activeCookieId = state.activeCookieId ?? null;
          }
        }
        return state;
      },
    },
  ),
);
