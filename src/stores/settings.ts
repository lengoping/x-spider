import { path } from '@tauri-apps/api';
import * as R from 'ramda';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  CURRENT_SETTINGS_VERSION,
  DEFAULT_SETTINGS,
} from '../constants/settings';
import { Settings } from '../interfaces/Settings';
import { createTauriFileStorage } from './persist/tauri-file-storage';

export interface SettingsStore extends Settings {
  update: (settings: Settings) => void;
  updateOne: <T>(name: string, key: string, value: T) => Promise<void>;
}

export const useSettingsStore = create(
  persist<SettingsStore>(
    (set, get) => ({
      ...DEFAULT_SETTINGS,
      update: (settings) => {
        set(settings);
      },
      updateOne: async (name, key, value) => {
        const store = get();
        const newSettings = R.assocPath([name, key], value)(store) as Settings;
        store.update(newSettings);
        log.info('UpdateSettings', `${name}.${key}`, value);
      },
    }),
    {
      name: 'settings',
      version: CURRENT_SETTINGS_VERSION,
      storage: createTauriFileStorage(),
      onRehydrateStorage: () => {
        return async (state, error) => {
          if (error) return;

          // 如果没有默认保存路径，设置为系统 Downloads 文件夹所在地
          if (!state?.download.saveDirBase) {
            const dir = await path.downloadDir();
            useSettingsStore.setState({
              download: R.mergeDeepRight(state!.download, {
                saveDirBase: dir,
              }),
            });
          }
        };
      },
      migrate(state: any, version) {
        if (version === 1) {
          delete state.download.savePath;
        }

        if (version < 3) {
          // V2 -> V3：新字段用默认值补齐，旧值原样保留。
          state.download = R.mergeDeepRight(
            DEFAULT_SETTINGS.download,
            state.download ?? {},
          );
          state.app = R.mergeDeepRight(
            DEFAULT_SETTINGS.app,
            state.app ?? {},
          );
        }

        return state;
      },
    },
  ),
);
