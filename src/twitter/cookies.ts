// 多 Cookie 账号：纯逻辑部分（零第三方依赖，可在 Node 下直接跑）。
// Cookie 列表本身由 stores/app-state.ts 持久化；本模块只提供无副作用的
// 纯函数，api.ts 通过 resolveActiveCookieString() 读取当前激活 Cookie，
// 这样 api.ts 不需要直接 import store，避免循环依赖。
// 注意：本文件只用可擦除的 TypeScript 语法。

export interface CookieAccount {
  id: string;
  label: string;
  cookieString: string;
  lastUsedAt: number;
  failCount: number;
  disabled: boolean;
}

/** 连续失败达到该次数后自动禁用该 Cookie 并切换到下一个可用账号。 */
export const MAX_COOKIE_FAILURES = 3;

function newId(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return `cookie-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function createCookieAccount(
  label: string,
  cookieString: string,
): CookieAccount {
  return {
    id: newId(),
    label: label.trim() || '未命名账号',
    cookieString,
    lastUsedAt: 0,
    failCount: 0,
    disabled: false,
  };
}

/** 取当前激活账号；激活账号不可用时退到第一个可用账号，再退到 undefined。 */
export function getActiveAccount(
  accounts: CookieAccount[],
  activeId: string | null,
): CookieAccount | undefined {
  if (activeId) {
    const active = accounts.find((a) => a.id === activeId && !a.disabled);
    if (active) return active;
  }
  return accounts.find((a) => !a.disabled);
}

/**
 * 解析本次请求该用的 Cookie 字符串。
 * fallback 是历史遗留的单 Cookie 字段（app-state.cookieString），
 * 在没有任何账号时继续用它，保证老用户不断连。
 */
export function resolveActiveCookieString(
  accounts: CookieAccount[],
  activeId: string | null,
  fallback: string,
): string {
  return getActiveAccount(accounts, activeId)?.cookieString ?? fallback;
}

export function touchCookieUsed(
  accounts: CookieAccount[],
  id: string,
): CookieAccount[] {
  return accounts.map((a) =>
    a.id === id ? { ...a, lastUsedAt: Date.now() } : a,
  );
}

export interface MarkFailedResult {
  accounts: CookieAccount[];
  /** 切换后的激活账号 id；无可用账号时为 null。 */
  activeId: string | null;
  /** 本次被禁用的账号（未达到阈值时为 undefined）。 */
  disabledAccount?: CookieAccount;
}

/**
 * 标记当前激活 Cookie 请求失败（401/403 时由调用方触发）：
 * failCount + 1，达到 MAX_COOKIE_FAILURES 后禁用，并切换到下一个可用账号。
 */
export function markCookieFailed(
  accounts: CookieAccount[],
  activeId: string | null,
): MarkFailedResult {
  const active = getActiveAccount(accounts, activeId);
  if (!active) return { accounts, activeId: null };
  const failed: CookieAccount = {
    ...active,
    failCount: active.failCount + 1,
    disabled: active.failCount + 1 >= MAX_COOKIE_FAILURES,
  };
  const nextAccounts = accounts.map((a) => (a.id === active.id ? failed : a));
  const nextActive = failed.disabled
    ? (nextAccounts.find((a) => !a.disabled)?.id ?? null)
    : active.id;
  return {
    accounts: nextAccounts,
    activeId: nextActive,
    disabledAccount: failed.disabled ? failed : undefined,
  };
}

export interface AddCookieResult {
  accounts: CookieAccount[];
  account?: CookieAccount;
  error?: string;
}

export function addCookieAccount(
  accounts: CookieAccount[],
  label: string,
  cookieString: string,
  maxCookies: number,
): AddCookieResult {
  const trimmed = cookieString.trim();
  if (!trimmed) return { accounts, error: 'Cookie 不能为空' };
  if (accounts.some((a) => a.cookieString === trimmed)) {
    return { accounts, error: '该 Cookie 已添加过' };
  }
  if (accounts.length >= Math.max(1, maxCookies)) {
    return { accounts, error: `Cookie 账号已达上限（${maxCookies} 个）` };
  }
  const account = createCookieAccount(label, trimmed);
  return { accounts: [...accounts, account], account };
}

export interface RemoveCookieResult {
  accounts: CookieAccount[];
  activeId: string | null;
}

export function removeCookieAccount(
  accounts: CookieAccount[],
  activeId: string | null,
  id: string,
): RemoveCookieResult {
  const nextAccounts = accounts.filter((a) => a.id !== id);
  const nextActive =
    activeId === id
      ? (nextAccounts.find((a) => !a.disabled)?.id ?? null)
      : activeId;
  return { accounts: nextAccounts, activeId: nextActive };
}
