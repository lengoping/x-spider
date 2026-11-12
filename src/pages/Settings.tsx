/* eslint-disable react/prop-types */
import React from 'react';
import { PageHeader } from '../components/PageHeader';
import { Section } from '../components/settings/Section';
import { Item } from '../components/settings/Item';
import { DownloadOutlined, GlobalOutlined } from '@ant-design/icons';
import Joi from 'joi';
import { SavePathSelector } from '../components/settings/SavePathSelector';
import { Button, Input, InputNumber, Select, Switch } from 'antd';
import { FileNameTemplateInput } from '../components/settings/FileNameTemplateInput';
import { CookieAccounts } from '../components/settings/CookieAccounts';
import { showInFolder } from '../utils/shell';
import { path } from '@tauri-apps/api';

export const Settings: React.FC = () => {
  return (
    <>
      <PageHeader />
      <Section title="下载" name="download" titleIcon={<DownloadOutlined />}>
        <Item
          validator={(value) => {
            return Joi.string()
              .messages({
                'string.empty': '请填写保存路径模板',
              })
              .validate(value).error?.message;
          }}
          label="保存路径"
          settingKey="saveDirBase"
        >
          <SavePathSelector required />
        </Item>
        <Item
          validator={(value) => {
            return Joi.string()
              .pattern(
                // eslint-disable-next-line
                /^([^\\\/:\*\"<>\|]\\?)+$/,
              )
              .message(
                '文件夹名有误，请检查文件夹名是否正确，文件夹名不能包含以下字符：? * / \\ < > : " |',
              )
              .$.pattern(/^\s+$/, { invert: true })
              .message('文件夹名不能为纯空格！')
              .allow('')
              .validate(value).error?.message;
          }}
          label="文件夹模板"
          settingKey="dirTemplate"
          description="为空时下载的文件直接保存在上方的“保存路径”里面"
        >
          <FileNameTemplateInput />
        </Item>
        <Item
          settingKey="fileNameTemplate"
          label="文件名模板"
          validator={(value) => {
            return Joi.string()
              .pattern(
                // eslint-disable-next-line
                /^[^\\\/:\*\"<>\|]+$/,
              )
              .message(
                '文件名有误，请检查文件名是否正确，文件名不能包含以下字符：? * / \\ < > : " |',
              )
              .$.pattern(/^\s+$/, { invert: true })
              .message('文件名不能为纯空格！')
              .messages({
                'string.empty': '请填写保存文件名模板',
              })
              .validate(value).error?.message;
          }}
        >
          <FileNameTemplateInput />
        </Item>
        <Item
          settingKey="sameFileSkip"
          label="跳过相同文件"
          valuePropName="checked"
          description="存在同名文件时，是否跳过下载"
        >
          <Switch />
        </Item>
      </Section>
      <Section title="下载内容" name="download" titleIcon={<DownloadOutlined />}>
        <Item
          settingKey="downloadTweet"
          label="下载推文"
          valuePropName="checked"
          description="下载任务是否保存推文正文文件，并写入推文库"
        >
          <Switch />
        </Item>
        <Item
          settingKey="tweetFormat"
          label="推文保存格式"
          description="推文正文文件的格式；选“不保存”则只下载媒体"
        >
          <Select
            options={[
              { label: 'TXT', value: 'txt' },
              { label: 'HTML', value: 'html' },
              { label: 'JSON', value: 'json' },
              { label: '不保存', value: 'none' },
            ]}
          />
        </Item>
        <Item
          settingKey="downloadMedia"
          label="下载媒体"
          valuePropName="checked"
          description="关闭后只保存推文正文、不下载图片与视频"
        >
          <Switch />
        </Item>
        <Item
          settingKey="gifToMp4"
          label="GIF 转换为 MP4"
          valuePropName="checked"
          description="X 的 GIF 本身就是 MP4 直链，开启后按视频保存，不做本地转码"
        >
          <Switch />
        </Item>
      </Section>
      <Section title="视频图片质量" name="download" titleIcon={<DownloadOutlined />}>
        <Item
          settingKey="videoQuality"
          label="视频质量"
          description="720p / 480p 按码率档位尽力匹配，X 的视频链接不带分辨率元数据"
        >
          <Select
            options={[
              { label: '最高画质', value: 'best' },
              { label: '720p', value: '720p' },
              { label: '480p', value: '480p' },
            ]}
          />
        </Item>
        <Item
          settingKey="imageQuality"
          label="图片质量"
          description="对应 pbs.twimg.com 的原图 / 大图 / 中图"
        >
          <Select
            options={[
              { label: '原图', value: 'orig' },
              { label: '大图', value: 'large' },
              { label: '中图', value: 'medium' },
            ]}
          />
        </Item>
      </Section>
      <Section title="日期分段" name="download" titleIcon={<DownloadOutlined />}>
        <Item
          settingKey="dateSegmentStepDays"
          label="每段天数"
          description="日期分段下载时每段的天数，1-30 天"
        >
          <InputNumber min={1} max={30} />
        </Item>
        <Item
          settingKey="dateSegmentDirection"
          label="分段方向"
          description="从新到旧先抓最新内容，从旧到新按时间顺序抓"
        >
          <Select
            options={[
              { label: '从新到旧', value: 'newToOld' },
              { label: '从旧到新', value: 'oldToNew' },
            ]}
          />
        </Item>
      </Section>
      <Section title="并发与限速" name="download" titleIcon={<DownloadOutlined />}>
        <Item
          settingKey="concurrency"
          label="并发数"
          description="同时提交给 aria2 的下载任务数"
        >
          <InputNumber min={1} max={10} />
        </Item>
        <Item
          settingKey="rateLimitMs"
          label="翻页间隔（毫秒）"
          description="两次翻页请求之间的最小间隔，太小容易触发限流"
        >
          <InputNumber min={0} step={100} />
        </Item>
      </Section>
      <Section title="多 Cookie 账号" name="app" titleIcon={<GlobalOutlined />}>
        <CookieAccounts />
      </Section>
      <Section title="代理" name="proxy" titleIcon={<GlobalOutlined />}>
        <Item label="启用代理" settingKey="enable" valuePropName="checked">
          <Switch />
        </Item>
        <Item
          label="使用系统代理"
          settingKey="useSystem"
          valuePropName="checked"
          description="自动使用系统代理，如果代理未生效，可能是你的代理软件没有自动设置系统代理，此时请手动配置代理地址。"
        >
          <Switch />
        </Item>
        <Item
          label="代理地址"
          settingKey="url"
          validator={(val) => {
            return Joi.string()
              .uri({
                scheme: ['http'],
              })
              .message('代理地址格式不正确，示例：“http://127.0.0.1:7890”')
              .validate(val).error?.message;
          }}
        >
          <Input placeholder="代理地址，例如：“http://127.0.0.1:7890”" />
        </Item>
      </Section>
      <Section title="应用" name="app">
        <Item
          label="自动检查更新"
          settingKey="autoCheckUpdate"
          valuePropName="checked"
        >
          <Switch />
        </Item>
        <Item
          label="接收预览版"
          description="预览版更新更频繁，能获取到最新的特性，但不太稳定，可能会出现各种错误。"
          settingKey="acceptPrerelease"
          valuePropName="checked"
        >
          <Switch />
        </Item>
        <Item
          label="记录日志文件"
          description="日志文件可能体积较大，建议软件运行出问题需要上报时再开启，开启后请重启软件。"
          settingKey="writeLogs"
          valuePropName="checked"
        >
          <Switch />
        </Item>
        <Item
          label="Cookie 账号上限"
          description="最多保存的 Cookie 账号数"
          settingKey="maxCookies"
        >
          <InputNumber min={1} max={10} />
        </Item>
        <Button
          onClick={async () => {
            await showInFolder(await path.appLogDir());
          }}
        >
          打开日志文件夹
        </Button>
      </Section>
    </>
  );
};
