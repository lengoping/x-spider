/* eslint-disable react/prop-types */
import { fs, path } from '@tauri-apps/api';
import { App, Button, DatePicker, Input, Select, Space, Table } from 'antd';
import dayjs from 'dayjs';
import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { useSettingsStore } from '../stores/settings';
import {
  TweetDbRecord,
  TweetDbSortBy,
  tweetDb,
} from '../twitter/tweet-db';

const COLUMNS = [
  {
    title: '推文',
    dataIndex: 'id',
    key: 'id',
    render: (_: unknown, record: TweetDbRecord) => (
      <a
        href={`https://x.com/${record.screenName}/status/${record.id}`}
        target="_blank"
        rel="noreferrer"
      >
        {record.id}
      </a>
    ),
  },
  {
    title: '用户',
    dataIndex: 'screenName',
    key: 'screenName',
    render: (screenName?: string) => (screenName ? `@${screenName}` : ''),
  },
  {
    title: '时间',
    dataIndex: 'createdAt',
    key: 'createdAt',
    render: (createdAt?: string) =>
      createdAt ? createdAt.slice(0, 19).replace('T', ' ') : '',
  },
  {
    title: '内容',
    dataIndex: 'fullText',
    key: 'fullText',
    ellipsis: true,
  },
  {
    title: '点赞',
    dataIndex: 'favoriteCount',
    key: 'favoriteCount',
  },
  {
    title: '转推',
    dataIndex: 'retweetCount',
    key: 'retweetCount',
  },
  {
    title: '媒体',
    dataIndex: 'hasMedia',
    key: 'hasMedia',
    render: (hasMedia?: boolean) =>
      hasMedia === undefined ? '未知' : hasMedia ? '有' : '无',
  },
];

export const TweetManager: React.FC = () => {
  const { message } = App.useApp();
  const saveDirBase = useSettingsStore((s) => s.download.saveDirBase);
  const [records, setRecords] = useState<TweetDbRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [screenName, setScreenName] = useState('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(
    null,
  );
  const [sortBy, setSortBy] = useState<TweetDbSortBy>('createdAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [exporting, setExporting] = useState(false);

  const refresh = useCallback(async () => {
    await tweetDb.load();
    setTotal(tweetDb.count());
    setRecords(
      tweetDb.query({
        keyword: keyword.trim() || undefined,
        screenName: screenName.trim() || undefined,
        dateRange: dateRange
          ? [
              dateRange[0].startOf('day').toISOString(),
              dateRange[1].endOf('day').toISOString(),
            ]
          : undefined,
        sortBy,
        order,
        limit: 500,
      }),
    );
  }, [keyword, screenName, dateRange, sortBy, order]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onExport = async (format: 'csv' | 'json') => {
    if (!saveDirBase) {
      message.error('请先在设置里填写保存路径');
      return;
    }
    setExporting(true);
    try {
      const stamp = dayjs().format('YYYYMMDD-HHmmss');
      const fileName = `tweet-db-${stamp}.${format}`;
      const content =
        format === 'csv' ? tweetDb.toCSV(records) : tweetDb.toJSON(records);
      const filePath = await path.join(saveDirBase, fileName);
      await fs.writeTextFile(filePath, content);
      message.success(`已导出 ${records.length} 条到 ${fileName}`);
    } catch (err: any) {
      message.error(`导出失败：${err?.message || '未知原因'}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader />
      <section className="mb-4 bg-white p-4 border-[1px] rounded-md">
        <p className="text-sm text-gray-500 mb-2">
          推文库共 {total} 条。下载任务在设置中开启“下载推文”后，会自动把推文写入推文库；
          手动入库尚未实现，见下方按钮说明。
        </p>
        <Space wrap>
          <Input
            placeholder="关键词"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 160 }}
            allowClear
          />
          <Input
            placeholder="用户名（不含 @）"
            value={screenName}
            onChange={(e) => setScreenName(e.target.value)}
            style={{ width: 160 }}
            allowClear
          />
          <DatePicker.RangePicker
            value={dateRange}
            onChange={(v) =>
              setDateRange(
                v && v[0] && v[1] ? [v[0], v[1]] : null,
              )
            }
          />
          <Select<TweetDbSortBy>
            value={sortBy}
            onChange={setSortBy}
            options={[
              { label: '按时间', value: 'createdAt' },
              { label: '按点赞', value: 'favoriteCount' },
              { label: '按转推', value: 'retweetCount' },
            ]}
          />
          <Select<'asc' | 'desc'>
            value={order}
            onChange={setOrder}
            options={[
              { label: '从新到旧 / 从大到小', value: 'desc' },
              { label: '从旧到新 / 从小到大', value: 'asc' },
            ]}
          />
          <Button type="primary" onClick={() => void refresh()}>
            查询
          </Button>
          <Button loading={exporting} onClick={() => void onExport('csv')}>
            导出 CSV
          </Button>
          <Button loading={exporting} onClick={() => void onExport('json')}>
            导出 JSON
          </Button>
          <Button
            onClick={() =>
              message.info(
                '手动入库尚未实现：请在设置 → 下载内容中开启“下载推文”，下载任务会自动把推文写入推文库。',
              )
            }
          >
            手动入库
          </Button>
        </Space>
      </section>
      <section className="mb-4 bg-white p-4 border-[1px] rounded-md">
        <Table<TweetDbRecord>
          rowKey="id"
          columns={COLUMNS}
          dataSource={records}
          pagination={{ pageSize: 20 }}
        />
      </section>
    </>
  );
};
