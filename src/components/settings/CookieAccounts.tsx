/* eslint-disable react/prop-types */
import { App, Button, Input, Space, Tag } from 'antd';
import React, { useState } from 'react';
import { useAppStateStore } from '../../stores/app-state';
import { useSettingsStore } from '../../stores/settings';
import { MAX_COOKIE_FAILURES } from '../../twitter/cookies';

/**
 * 多 Cookie 账号管理：列表、添加、切换、删除。
 * 某账号连续失败 MAX_COOKIE_FAILURES 次会自动禁用并切换到下一个可用账号。
 */
export const CookieAccounts: React.FC = () => {
  const { message } = App.useApp();
  const {
    cookieAccounts,
    activeCookieId,
    addCookie,
    removeCookie,
    setActiveCookie,
  } = useAppStateStore((s) => ({
    cookieAccounts: s.cookieAccounts,
    activeCookieId: s.activeCookieId,
    addCookie: s.addCookie,
    removeCookie: s.removeCookie,
    setActiveCookie: s.setActiveCookie,
  }));
  const maxCookies = useSettingsStore((s) => s.app.maxCookies);
  const [label, setLabel] = useState('');
  const [cookieString, setCookieString] = useState('');

  const onAdd = () => {
    const error = addCookie(label, cookieString);
    if (error) {
      message.error(error);
      return;
    }
    message.success('已添加 Cookie 账号');
    setLabel('');
    setCookieString('');
  };

  return (
    <div>
      <p className="text-sm text-gray-500 mb-2">
        最多保存 {maxCookies} 个账号（在“应用”里改）。请求返回 401 / 403
        时当前账号失败计数 +1，连续失败 {MAX_COOKIE_FAILURES}
        次自动禁用并切换到下一个可用账号；没有可用账号时会继续用当前账号。
      </p>
      <Space.Compact block className="mb-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="账号备注，例如 主号 / 小号"
          style={{ width: 180 }}
        />
        <Input
          value={cookieString}
          onChange={(e) => setCookieString(e.target.value)}
          placeholder="粘贴 Cookie 字符串"
        />
        <Button type="primary" onClick={onAdd}>
          添加账号
        </Button>
      </Space.Compact>
      {cookieAccounts.length === 0 && (
        <p className="text-sm text-gray-500">
          暂无多账号，当前使用设置页登录时保存的单个 Cookie。
        </p>
      )}
      <ul className="text-sm space-y-2">
        {cookieAccounts.map((account) => (
          <li key={account.id} className="flex items-center gap-2">
            <span className="font-bold">{account.label}</span>
            {account.id === activeCookieId && (
              <Tag color="green">当前使用</Tag>
            )}
            {account.disabled && <Tag color="red">已禁用</Tag>}
            {account.failCount > 0 && (
              <span className="text-gray-400">
                失败 {account.failCount} 次
              </span>
            )}
            {account.lastUsedAt > 0 && (
              <span className="text-gray-400">
                上次使用{' '}
                {new Date(account.lastUsedAt).toLocaleString('zh-CN')}
              </span>
            )}
            <span className="ml-auto flex gap-1">
              {account.id !== activeCookieId && !account.disabled && (
                <Button
                  size="small"
                  onClick={() => setActiveCookie(account.id)}
                >
                  设为当前
                </Button>
              )}
              <Button
                size="small"
                danger
                onClick={() => removeCookie(account.id)}
              >
                删除
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
