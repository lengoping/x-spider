# X-Spider（lengoping fork）

> 本仓库是 [MiningCattiva/x-spider](https://github.com/MiningCattiva/x-spider)
> 开源 v2.2.2 的 fork，由 lengoping 维护，在开源版基础上按付费版“蓝鸟猎手”
> v8.1.0 公开使用手册（https://bhr.96neko.work/articles/manual）的功能描述
> 自行补齐了同类功能。未复制付费版代码；原作者署名与 GPL-3.0 LICENSE 保留。
> 新增功能对照见 [docs/MANUAL-PARITY.md](./docs/MANUAL-PARITY.md)；
> 新数据源需要的 GraphQL operation ID 提取方法见
> [docs/GRAPHQL-IDS.md](./docs/GRAPHQL-IDS.md)。

【停止维护说明】

由于个人规划，该软件停止维护，如果有需要可以尝试一下付费版本，付费版本整体加强了开源版本的各种功能，稳定性更强，可定制化程度更高，欢迎大家尝试：<https://bh.keli.moe/>

# X-Spider

[![版本](https://img.shields.io/github/v/release/MiningCattiva/x-spider?label=%E7%89%88%E6%9C%AC)](https://github.com/MiningCattiva/x-spider/releases)
[![下载数](https://img.shields.io/github/downloads/MiningCattiva/x-spider/total?style=flat&label=%E4%B8%8B%E8%BD%BD%E6%95%B0)](https://github.com/MiningCattiva/x-spider/releases)
![操作系统](https://img.shields.io/badge/%E6%93%8D%E4%BD%9C%E7%B3%BB%E7%BB%9F-Windows-yellow)
[![爱发电](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fgithub.com%2FMiningCattiva%2Fsponsors%2Fraw%2Fmain%2Fsponsors.json&query=%24.count&suffix=%E4%BA%BA&label=%E7%88%B1%E5%8F%91%E7%94%B5&color=%23926be5)
](https://afdian.net/a/moyuscript)


一个推特媒体（图片、视频）下载器。

## 下载

[Releases](https://github.com/MiningCattiva/x-spider/releases/latest)

## 功能

- 媒体过滤器（如指定下载日期范围）
- 跳过已下载文件
- 可配置文件名、保存路径格式
- 手动、自动代理
- Cookie 登录
- 自动化任务：用户推文/媒体、高级搜索、推文回复、喜欢、书签、时间线、社群、日期分段下载（部分数据源需自行配置 GraphQL operation ID，见 docs/GRAPHQL-IDS.md）
- 批量创建任务、常驻任务与任务组（全部重置 / 全部开始 / 一键更新新推文）
- 推文库：推文入库、关键词/用户/日期过滤、按时间/点赞/转推排序、导出 CSV / JSON
- 下载设置：推文存 TXT / HTML / JSON、下载推文/媒体开关、视频/图片质量、GIF 转 MP4、跳过/停止/媒体跳过条件
- 应用设置：多 Cookie 自动切换、并发/限速

## 软件截图

![screenshot-homepage](./assets/screenshot-homepage.jpg)

![screenshot-settings](./assets/screenshot-settings.jpg)

![screenshot-downloading](./assets/screenshot-downloading.jpg)

## 给猫猫喂口红色莓果

[爱发电](https://afdian.net/a/moyuscript)
