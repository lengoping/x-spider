/* eslint-disable react/prop-types */
import {
  App,
  Button,
  Checkbox,
  Input,
  InputNumber,
  Select,
  Space,
  Tag,
} from 'antd';
import React, { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { CreationTaskKind } from '../interfaces/CreationTask';
import {
  useDownloadStore,
  useTaskGroupStore,
} from '../stores/download';
import { useSettingsStore } from '../stores/settings';

const KIND_OPTIONS: { label: string; value: CreationTaskKind; hint: string }[] =
  [
    {
      label: '用户媒体',
      value: 'userMedias',
      hint: '每行一个用户名，例如 elonmusk',
    },
    {
      label: '用户推文',
      value: 'userTweets',
      hint: '每行一个用户名，例如 elonmusk',
    },
    {
      label: '高级搜索',
      value: 'search',
      hint: '每行一条搜索语句，例如 from:elonmusk filter:media',
    },
    {
      label: '推文回复',
      value: 'replies',
      hint: '每行一个推文 ID 或推文链接',
    },
    {
      label: '我的喜欢',
      value: 'likes',
      hint: '每行一个用户名，拉取其点赞过的推文',
    },
    {
      label: '我的书签',
      value: 'bookmarks',
      hint: '每行一个标签（仅作区分），拉取已收藏的推文',
    },
    {
      label: '时间线',
      value: 'timeline',
      hint: '每行一个标签（仅作区分），拉取首页关注流',
    },
    {
      label: '社群',
      value: 'community',
      hint: '每行一个社群 ID',
    },
    {
      label: '日期分段',
      value: 'dateSegmented',
      hint: '每行一个用户名，按下方步长把日期范围切段后用高级搜索逐段抓取',
    },
  ];

const KIND_LABELS: Record<CreationTaskKind, string> = {
  userMedias: '用户媒体',
  userTweets: '用户推文',
  search: '高级搜索',
  replies: '推文回复',
  likes: '我的喜欢',
  bookmarks: '我的书签',
  timeline: '时间线',
  community: '社群',
  dateSegmented: '日期分段',
};

const STATUS_TAG: Record<string, { color: string; text: string }> = {
  waiting: { color: 'default', text: '等待中' },
  active: { color: 'processing', text: '进行中' },
  paused: { color: 'warning', text: '已暂停' },
  done: { color: 'success', text: '已完成' },
};

export const Automation: React.FC = () => {
  const { message } = App.useApp();
  const {
    creationTasks,
    batchCreateCreationTasks,
    pauseCreationTask,
    resumeCreationTask,
    removeCreationTask,
  } = useDownloadStore((s) => ({
    creationTasks: s.creationTasks,
    batchCreateCreationTasks: s.batchCreateCreationTasks,
    pauseCreationTask: s.pauseCreationTask,
    resumeCreationTask: s.resumeCreationTask,
    removeCreationTask: s.removeCreationTask,
  }));
  const {
    taskGroups,
    createTaskGroup,
    removeTaskGroup,
    resetGroupTasks,
    startAllGroupTasks,
  } = useTaskGroupStore((s) => ({
    taskGroups: s.taskGroups,
    createTaskGroup: s.createTaskGroup,
    removeTaskGroup: s.removeTaskGroup,
    resetGroupTasks: s.resetGroupTasks,
    startAllGroupTasks: s.startAllGroupTasks,
  }));
  const settings = useSettingsStore((s) => s.download);
  const updateOne = useSettingsStore((s) => s.updateOne);

  const [lines, setLines] = useState('');
  const [kind, setKind] = useState<CreationTaskKind>('userTweets');
  const [persistent, setPersistent] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errors, setErrors] = useState<{ line: string; reason: string }[]>([]);
  const [groupName, setGroupName] = useState('');

  const kindHint =
    KIND_OPTIONS.find((o) => o.value === kind)?.hint ?? '';

  const onBatchCreate = async () => {
    setCreating(true);
    try {
      const result = await batchCreateCreationTasks(
        lines.split('\n'),
        kind,
        undefined,
        { persistent },
      );
      setErrors(result.errors);
      if (result.created.length > 0) {
        message.success(`已创建 ${result.created.length} 个任务`);
      }
      if (result.errors.length > 0) {
        message.warning(`${result.errors.length} 行创建失败，见下方详情`);
      }
      if (result.created.length === 0 && result.errors.length === 0) {
        message.info('没有可创建的内容：请先输入内容，每行一个');
      }
    } catch (err: any) {
      message.error(`批量创建失败：${err?.message || '未知原因'}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <PageHeader />
      <section className="mb-4 bg-white p-4 border-[1px] rounded-md">
        <h2 className="font-bold text-xl mb-4">批量创建任务</h2>
        <p className="text-sm text-gray-500 mb-2">{kindHint}</p>
        <div className="flex gap-2 mb-2">
          <Select<CreationTaskKind>
            value={kind}
            onChange={setKind}
            options={KIND_OPTIONS.map((o) => ({
              label: o.label,
              value: o.value,
            }))}
            style={{ width: 160 }}
          />
          <Checkbox
            checked={persistent}
            onChange={(e) => setPersistent(e.target.checked)}
          >
            常驻任务（跑完后保留，可一键重新开始抓新推文）
          </Checkbox>
        </div>
        <Input.TextArea
          rows={6}
          value={lines}
          onChange={(e) => setLines(e.target.value)}
          placeholder={'每行一个\n空行与重复行会自动跳过'}
        />
        <div className="mt-2">
          <Button type="primary" loading={creating} onClick={onBatchCreate}>
            批量创建
          </Button>
        </div>
        {errors.length > 0 && (
          <ul className="mt-2 text-sm text-red-500">
            {errors.map((e) => (
              <li key={e.line}>
                {e.line}：{e.reason}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-4 bg-white p-4 border-[1px] rounded-md">
        <h2 className="font-bold text-xl mb-4">日期分段</h2>
        <p className="text-sm text-gray-500 mb-2">
          日期分段任务会把日期范围切成小段，逐段用高级搜索抓取；步长越小越稳，但请求次数越多。
        </p>
        <Space>
          <span>每段天数</span>
          <InputNumber
            min={1}
            max={30}
            value={settings.dateSegmentStepDays}
            onChange={(v) =>
              updateOne('download', 'dateSegmentStepDays', v ?? 7)
            }
          />
          <span>方向</span>
          <Select
            value={settings.dateSegmentDirection}
            onChange={(v) =>
              updateOne('download', 'dateSegmentDirection', v)
            }
            options={[
              { label: '从新到旧', value: 'newToOld' },
              { label: '从旧到新', value: 'oldToNew' },
            ]}
          />
        </Space>
      </section>

      <section className="mb-4 bg-white p-4 border-[1px] rounded-md">
        <h2 className="font-bold text-xl mb-4">任务组</h2>
        <p className="text-sm text-gray-500 mb-2">
          常驻自动化任务可以放进任务组统一管理：全部重置会把组内任务回到第一页并暂停（不删已下载的文件）；
          全部开始会把组内已暂停 / 已完成的任务重新开始，已完成的任务会从头抓，顺带抓到期间的新推文。
        </p>
        <Space.Compact block className="mb-4">
          <Input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="新任务组名称"
            onPressEnter={() => {
              if (!groupName.trim()) return;
              createTaskGroup(groupName);
              setGroupName('');
            }}
          />
          <Button
            type="primary"
            onClick={() => {
              if (!groupName.trim()) {
                message.info('请先输入任务组名称');
                return;
              }
              createTaskGroup(groupName);
              setGroupName('');
            }}
          >
            创建任务组
          </Button>
        </Space.Compact>
        {taskGroups.length === 0 && (
          <p className="text-sm text-gray-500">暂无任务组</p>
        )}
        {taskGroups.map((group) => {
          const tasks = creationTasks.filter((t) =>
            group.taskIds.includes(t.id),
          );
          return (
            <div
              key={group.id}
              className="border-[1px] rounded-md p-3 mb-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">
                  {group.name}（{tasks.length} 个任务）
                </span>
                <Space>
                  <Button size="small" onClick={() => resetGroupTasks(group.id)}>
                    全部重置
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => startAllGroupTasks(group.id)}
                  >
                    全部开始
                  </Button>
                  <Button
                    size="small"
                    danger
                    onClick={() => removeTaskGroup(group.id)}
                  >
                    删除组
                  </Button>
                </Space>
              </div>
              <ul className="mt-2 text-sm space-y-1">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2">
                    <Tag color={STATUS_TAG[t.status]?.color}>
                      {STATUS_TAG[t.status]?.text ?? t.status}
                    </Tag>
                    <span>{t.sourceLabel}</span>
                    <span className="text-gray-400">
                      {KIND_LABELS[t.kind as CreationTaskKind]} · 已完成 {t.completeCount} · 已跳过{' '}
                      {t.skipCount}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <section className="mb-4 bg-white p-4 border-[1px] rounded-md">
        <h2 className="font-bold text-xl mb-4">
          全部任务（{creationTasks.length}）
        </h2>
        {creationTasks.length === 0 && (
          <p className="text-sm text-gray-500">暂无任务</p>
        )}
        <ul className="text-sm space-y-2">
          {creationTasks.map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              <Tag color={STATUS_TAG[t.status]?.color}>
                {STATUS_TAG[t.status]?.text ?? t.status}
              </Tag>
              <span>{t.sourceLabel}</span>
              <span className="text-gray-400">
                {KIND_LABELS[t.kind as CreationTaskKind]}
                {t.persistent ? ' · 常驻' : ''} · 已完成 {t.completeCount} ·
                已跳过 {t.skipCount}
              </span>
              <span className="ml-auto flex gap-1">
                {(t.status === 'waiting' || t.status === 'active') && (
                  <Button size="small" onClick={() => pauseCreationTask(t.id)}>
                    暂停
                  </Button>
                )}
                {(t.status === 'paused' || t.status === 'done') && (
                  <Button size="small" onClick={() => resumeCreationTask(t.id)}>
                    开始
                  </Button>
                )}
                <Button
                  size="small"
                  danger
                  onClick={() => removeCreationTask(t.id)}
                >
                  删除
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
};
