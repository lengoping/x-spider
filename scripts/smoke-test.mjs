// 纯逻辑模块冒烟测试（零第三方依赖）。
// 运行：node --experimental-strip-types scripts/smoke-test.mjs
import assert from 'node:assert/strict';
import {
  evaluateMedia,
  evaluatePost,
  resolveDynamicValue,
  shouldSkipMedia,
  shouldSkipPost,
  shouldStopAtPost,
} from '../src/twitter/conditions.ts';
import {
  buildSearchQuery,
  splitDateRange,
} from '../src/twitter/date-segments.ts';
import {
  TweetDb,
  createMemoryTweetDbStorage,
} from '../src/twitter/tweet-db.ts';
import {
  sanitizeFileName,
  serializePostToHtml,
  serializePostToJson,
  serializePostToTxt,
} from '../src/utils/tweet-export.ts';
import {
  addCookieAccount,
  createCookieAccount,
  markCookieFailed,
  resolveActiveCookieString,
} from '../src/twitter/cookies.ts';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

// ---------- 条件引擎 ----------
const post = {
  id: '123',
  createdAt: new Date('2026-11-10T12:00:00Z'),
  fullText: 'Hello world, 黄金涨了',
  favoriteCount: 100,
  retweetCount: 5,
  replyCount: 2,
  views: 1000,
  lang: 'zh',
  medias: [{ type: 'photo' }],
};

check('conditions: all 模式全部命中', () => {
  assert.equal(
    evaluatePost(post, {
      mode: 'all',
      expressions: [
        { left: 'favoriteCount', op: 'gte', right: 100 },
        { left: 'fullText', op: 'includes', right: '黄金' },
        { left: 'hasMedia', op: 'eq', right: true },
      ],
    }),
    true,
  );
});

check('conditions: all 模式有一条不命中即 false', () => {
  assert.equal(
    evaluatePost(post, {
      mode: 'all',
      expressions: [
        { left: 'favoriteCount', op: 'gte', right: 100 },
        { left: 'retweetCount', op: 'gt', right: 100 },
      ],
    }),
    false,
  );
});

check('conditions: any 模式命中一条即 true', () => {
  assert.equal(
    evaluatePost(post, {
      mode: 'any',
      expressions: [
        { left: 'retweetCount', op: 'gt', right: 100 },
        { left: 'lang', op: 'eq', right: 'zh' },
      ],
    }),
    true,
  );
});

check('conditions: 空条件组默认通过', () => {
  assert.equal(evaluatePost(post, { mode: 'all', expressions: [] }), true);
  assert.equal(evaluatePost(post, undefined), true);
});

check('conditions: 动态值 yesterday', () => {
  const now = new Date('2026-11-12T15:00:00');
  const yesterday = resolveDynamicValue('yesterday', now);
  assert.equal(yesterday.getFullYear(), 2026);
  assert.equal(yesterday.getMonth(), 10);
  assert.equal(yesterday.getDate(), 11);
  assert.equal(yesterday.getHours(), 0);
  // 昨天 00:00 之前发的帖子：before yesterday 成立
  assert.equal(
    evaluatePost(
      { ...post, createdAt: new Date('2026-11-10T12:00:00Z') },
      {
        mode: 'all',
        expressions: [{ left: 'createdAt', op: 'before', right: 'yesterday' }],
      },
      {},
      now,
    ),
    true,
  );
  // lastNDays(7) = 11 月 5 日 00:00
  const last7 = resolveDynamicValue('lastNDays(7)', now);
  assert.equal(last7.getDate(), 5);
  assert.equal(resolveDynamicValue('today', now).getDate(), 12);
  assert.equal(resolveDynamicValue('now', now).getTime(), now.getTime());
  assert.equal(resolveDynamicValue(42, now), 42);
});

check('conditions: inTweetDb / isDownloadedFile 走 lookup', () => {
  assert.equal(
    evaluatePost(
      post,
      {
        mode: 'all',
        expressions: [{ left: 'inTweetDb', op: 'eq', right: true }],
      },
      { dbLookup: (id) => id === '123' },
    ),
    true,
  );
  assert.equal(
    evaluatePost(
      post,
      {
        mode: 'all',
        expressions: [{ left: 'isDownloadedFile', op: 'eq', right: true }],
      },
      { downloadedLookup: () => false },
    ),
    false,
  );
});

check('conditions: skip/stop/mediaSkip 辅助函数', () => {
  const skipGroup = {
    mode: 'any',
    expressions: [{ left: 'mediaType', op: 'eq', right: 'video' }],
  };
  assert.equal(shouldSkipMedia({ type: 'video' }, skipGroup), true);
  assert.equal(shouldSkipMedia({ type: 'photo' }, skipGroup), false);
  assert.equal(
    evaluateMedia({ type: 'photo' }, {
      mode: 'all',
      expressions: [{ left: 'mediaType', op: 'eq', right: 'photo' }],
    }),
    true,
  );
  assert.equal(
    shouldSkipPost(post, {
      mode: 'all',
      expressions: [{ left: 'views', op: 'lt', right: 10 }],
    }),
    false,
  );
  assert.equal(
    shouldStopAtPost(post, {
      mode: 'all',
      expressions: [{ left: 'favoriteCount', op: 'gte', right: 100 }],
    }),
    true,
  );
});

// ---------- 日期分段 ----------
function segmentDays(start, end, step, direction) {
  const segments = splitDateRange(start, end, step, direction);
  const seen = new Set();
  for (const [since, until] of segments) {
    let d = new Date(`${since}T00:00:00Z`);
    const endD = new Date(`${until}T00:00:00Z`);
    let len = 0;
    while (d <= endD) {
      const key = d.toISOString().slice(0, 10);
      assert.ok(!seen.has(key), `日期 ${key} 重叠`);
      seen.add(key);
      len++;
      d = new Date(d.getTime() + 86400000);
    }
    assert.ok(len <= step, `段 [${since}, ${until}] 超过 ${step} 天`);
  }
  // 覆盖完整范围
  const expected = new Set();
  let d = new Date(`${start}T00:00:00Z`);
  const endD = new Date(`${end}T00:00:00Z`);
  while (d <= endD) {
    expected.add(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  assert.deepEqual([...seen].sort(), [...expected].sort());
  return segments;
}

check('date-segments: 步长 7 从新到旧覆盖无遗漏无重叠', () => {
  const segments = segmentDays('2026-11-01', '2026-11-15', 7, 'newToOld');
  assert.deepEqual(segments, [
    ['2026-11-09', '2026-11-15'],
    ['2026-11-02', '2026-11-08'],
    ['2026-11-01', '2026-11-01'],
  ]);
});

check('date-segments: 步长 7 从旧到新', () => {
  const segments = segmentDays('2026-11-01', '2026-11-15', 7, 'oldToNew');
  assert.deepEqual(segments, [
    ['2026-11-01', '2026-11-07'],
    ['2026-11-08', '2026-11-14'],
    ['2026-11-15', '2026-11-15'],
  ]);
});

check('date-segments: 步长 30 / 步长 1 / 单日', () => {
  segmentDays('2026-01-01', '2026-02-15', 30, 'oldToNew');
  segmentDays('2026-11-01', '2026-11-03', 1, 'newToOld');
  assert.deepEqual(splitDateRange('2026-11-11', '2026-11-11', 7, 'oldToNew'), [
    ['2026-11-11', '2026-11-11'],
  ]);
});

check('date-segments: 搜索语句生成', () => {
  assert.equal(
    buildSearchQuery('from:elonmusk', '2026-11-01', '2026-11-07'),
    '(from:elonmusk) since:2026-11-01 until:2026-11-07',
  );
  assert.equal(
    buildSearchQuery('', '2026-11-01', '2026-11-07'),
    'since:2026-11-01 until:2026-11-07',
  );
  assert.equal(
    buildSearchQuery('(from:a OR from:b)', '2026-11-01', '2026-11-07'),
    '(from:a OR from:b) since:2026-11-01 until:2026-11-07',
  );
});

// ---------- 推文库 ----------
check('tweet-db: 全局去重 + 查询 + 排序', () => {
  const db = new TweetDb(createMemoryTweetDbStorage());
  db.upsertSync({
    id: '1',
    fullText: '黄金涨了',
    favoriteCount: 10,
    retweetCount: 1,
    createdAt: new Date('2026-11-10T00:00:00Z'),
    medias: [{ type: 'photo' }],
    user: { screenName: 'alice', name: 'Alice' },
  });
  db.upsertSync({
    id: '2',
    fullText: 'nothing',
    favoriteCount: 50,
    retweetCount: 9,
    createdAt: new Date('2026-11-11T00:00:00Z'),
    medias: [],
    user: { screenName: 'bob' },
  });
  // 同一 id 再次入库不产生重复
  db.upsertSync({ id: '1', fullText: '黄金涨了 v2', favoriteCount: 11, user: { screenName: 'alice' } });
  assert.equal(db.count(), 2);
  assert.equal(db.has('1'), true);
  assert.equal(db.has('999'), false);
  assert.equal(db.query({ keyword: '黄金' }).length, 1);
  assert.equal(db.query({ screenName: 'BOB' }).length, 1);
  assert.equal(db.query({ hasMedia: true }).length, 1);
  assert.equal(db.query({ sortBy: 'favoriteCount', order: 'desc' })[0].id, '2');
  assert.equal(db.query({ sortBy: 'createdAt', order: 'asc' })[0].id, '1');
  assert.equal(db.query({ limit: 1 }).length, 1);
  assert.equal(
    db.query({ dateRange: ['2026-11-11', '2026-11-12'] }).length,
    1,
  );
});

check('tweet-db: 按 source 去重模式', () => {
  const db = new TweetDb(createMemoryTweetDbStorage(), {
    dedupMode: 'perSource',
  });
  db.upsertSync({ id: '1', fullText: 'a', user: { screenName: 'x' } }, { source: 'A' });
  db.upsertSync({ id: '1', fullText: 'b', user: { screenName: 'x' } }, { source: 'B' });
  assert.equal(db.count(), 2);
  assert.equal(db.hasInSource('1', 'A'), true);
  assert.equal(db.hasInSource('1', 'C'), false);
});

check('tweet-db: CSV 转义（逗号/引号/换行）', () => {
  const db = new TweetDb(createMemoryTweetDbStorage());
  db.upsertSync({
    id: '9',
    fullText: 'hello, "world"\n第二行',
    favoriteCount: 3,
    createdAt: new Date('2026-11-10T00:00:00Z'),
    user: { screenName: 'alice', name: 'A, "B"' },
  });
  const csv = db.toCSV();
  const lines = csv.split('\n');
  assert.ok(lines[0].startsWith('id,screen_name,'), '表头');
  // 全文含逗号引号换行：应被整体引号包裹，内层引号加倍
  assert.ok(csv.includes('"hello, ""world""\n第二行"'), `CSV 转义缺失：${csv}`);
  assert.ok(csv.includes('"A, ""B"""'), `姓名转义缺失：${csv}`);
  const parsed = JSON.parse(db.toJSON());
  assert.equal(parsed[0].fullText, 'hello, "world"\n第二行');
});

// ---------- 推文导出 ----------
check('tweet-export: txt/html/json + 文件名安全化', () => {
  const p = {
    id: '123',
    createdAt: new Date('2026-11-10T12:00:00Z'),
    fullText: 'hi <b>there</b>',
    favoriteCount: 7,
    retweetCount: 1,
    replyCount: 0,
    user: { screenName: 'alice', name: 'Alice' },
    medias: [{ type: 'photo', url: 'https://x.com/pic.jpg' }],
  };
  const txt = serializePostToTxt(p);
  assert.ok(txt.includes('https://x.com/alice/status/123'));
  assert.ok(txt.includes('hi <b>there</b>'));
  const html = serializePostToHtml(p);
  assert.ok(html.includes('&lt;b&gt;there&lt;/b&gt;'), 'HTML 应转义');
  assert.ok(!html.includes('<b>there</b>'), 'HTML 不应原样输出标签');
  const json = JSON.parse(serializePostToJson(p));
  assert.equal(json.id, '123');
  assert.equal(json.url, 'https://x.com/alice/status/123');
  assert.equal(sanitizeFileName('a/b:c*d?e<f>g|h'), 'a_b_c_d_e_f_g_h');
  assert.equal(sanitizeFileName(''), 'tweet');
});

// ---------- 多 Cookie ----------
check('cookies: 失败 3 次自动禁用并切换', () => {
  const a = createCookieAccount('主号', 'ct0=aaa');
  const b = createCookieAccount('小号', 'ct0=bbb');
  let accounts = [a, b];
  let activeId = a.id;
  assert.equal(
    resolveActiveCookieString(accounts, activeId, 'fallback'),
    'ct0=aaa',
  );
  let r = markCookieFailed(accounts, activeId);
  accounts = r.accounts;
  assert.equal(r.activeId, a.id, '第 1 次失败不切换');
  r = markCookieFailed(accounts, activeId);
  accounts = r.accounts;
  r = markCookieFailed(accounts, activeId);
  accounts = r.accounts;
  assert.equal(r.disabledAccount?.id, a.id, '第 3 次失败应禁用主号');
  assert.equal(r.activeId, b.id, '禁用后切换到小号');
  assert.equal(
    resolveActiveCookieString(accounts, r.activeId, 'fallback'),
    'ct0=bbb',
  );
  const dup = addCookieAccount(accounts, '重复', 'ct0=bbb', 5);
  assert.ok(dup.error, '重复 Cookie 应拒绝');
  const over = addCookieAccount(accounts, '超限', 'ct0=ccc', 2);
  assert.ok(over.error, '超上限应拒绝');
});

console.log(`\n全部通过：${passed} 项`);
