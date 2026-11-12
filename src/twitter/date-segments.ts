// 日期分段：把一个大的日期范围切成每段不超过 stepDays 天的小段，
// 供高级搜索 / 日期分段下载逐段抓取（X 高级搜索按天查更稳）。
// 纯逻辑模块，零第三方依赖，只用原生 Date，可在 Node 下直接跑。
// 注意：本文件只用可擦除的 TypeScript 语法。

export type SegmentDirection = 'newToOld' | 'oldToNew';

export type DateInput = Date | string | number;

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateOnly(input: DateInput): Date {
  const d =
    input instanceof Date
      ? new Date(input.getTime())
      : typeof input === 'number'
        ? new Date(input)
        : new Date(input);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`无效的日期：${String(input)}`);
  }
  // 按 UTC 日期归一化，避免本地时区把边界算偏一天。
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

export function formatDateYYYYMMDD(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/**
 * 切分 [start, end]（两端都包含）为 [since, until][]。
 * 每段不超过 stepDays 天；各段连续、无遗漏、无重叠。
 * - oldToNew：从旧到新返回；
 * - newToOld：从新到旧返回（默认，下载时先抓最新）。
 */
export function splitDateRange(
  start: DateInput,
  end: DateInput,
  stepDays = 7,
  direction: SegmentDirection = 'newToOld',
): Array<[string, string]> {
  let startDate = parseDateOnly(start);
  let endDate = parseDateOnly(end);
  if (startDate.getTime() > endDate.getTime()) {
    const tmp = startDate;
    startDate = endDate;
    endDate = tmp;
  }
  const step = Math.max(1, Math.floor(stepDays) || 7);
  const segments: Array<[string, string]> = [];

  if (direction === 'oldToNew') {
    let cursor = startDate;
    while (cursor.getTime() <= endDate.getTime()) {
      const segEnd = addDays(cursor, step - 1);
      const until =
        segEnd.getTime() > endDate.getTime() ? endDate : segEnd;
      segments.push([formatDateYYYYMMDD(cursor), formatDateYYYYMMDD(until)]);
      cursor = addDays(until, 1);
    }
  } else {
    let cursor = endDate;
    while (cursor.getTime() >= startDate.getTime()) {
      const segStart = addDays(cursor, -(step - 1));
      const since =
        segStart.getTime() < startDate.getTime() ? startDate : segStart;
      segments.push([formatDateYYYYMMDD(since), formatDateYYYYMMDD(cursor)]);
      cursor = addDays(since, -1);
    }
  }
  return segments;
}

/**
 * 生成高级搜索语句，例如：
 * buildSearchQuery('from:elonmusk', '2026-11-01', '2026-11-07')
 * => '(from:elonmusk) since:2026-11-01 until:2026-11-07'
 */
export function buildSearchQuery(
  base: string,
  since: string,
  until: string,
): string {
  const trimmed = base.trim();
  const head = trimmed
    ? trimmed.startsWith('(')
      ? trimmed
      : `(${trimmed})`
    : '';
  return [head, `since:${since}`, `until:${until}`]
    .filter(Boolean)
    .join(' ');
}
