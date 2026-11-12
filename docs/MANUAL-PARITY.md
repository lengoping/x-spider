# 手册功能对照表（蓝鸟猎手 v8.1.0 使用手册 vs 本 fork）

手册来源：https://bhr.96neko.work/articles/manual（v8.1.0）。
本 fork 在开源 v2.2.2 基础上按手册的功能描述自行实现，未复制付费版代码。

## 图例

- ✅ 完整实现：功能可用（以本地现有能力为准）
- 🟡 骨架待配 ID：代码已就绪，但缺 X 的 GraphQL operation ID，配上 ID 才能真正抓取
- ❌ 未做：原因见备注

## 对照表

| 手册功能 | 状态 | 说明 |
| --- | --- | --- |
| 用户推文下载 | ✅ | 原有 getUserTweets 保留；新增 kind=userTweets 的自动化任务 |
| 用户媒体下载 | ✅ | 原有 getUserMedias 保留；新增 kind=userMedias |
| 推文回复下载 | 🟡 | getTweetReplies 已实现，缺 TweetDetail 的 operation ID |
| 高级搜索下载 | 🟡 | getSearchTweets 已实现，缺 SearchTimeline 的 operation ID；日期分段搜索（splitDateRange / buildSearchQuery）已完整实现 |
| 日期分段下载 | ✅ | splitDateRange（步长/方向可配）+ kind=dateSegmented 任务完整实现；仅当分段走高级搜索时仍需 SearchTimeline 的 ID |
| 我的喜欢 | 🟡 | getLikes 已实现，缺 Likes 的 operation ID |
| 我的书签 | 🟡 | getBookmarks 已实现，缺 Bookmarks 的 operation ID |
| 时间线 | 🟡 | getHomeTimeline 已实现，缺 HomeTimeline 的 operation ID |
| 社群 | 🟡 | getCommunityTweets 已实现，缺 CommunityTweets 的 operation ID |
| 我的关注导出 | 🟡 | exportFollowing + followingToTxt 已实现，缺 Following 的 operation ID；导出为 TXT（一行一个 @用户名） |
| 自动化任务 | ✅ | CreationTask 增加 kind / persistent / lastCursor / paused / done；调度器只跑 waiting 任务，失败的常驻任务暂停保留 |
| 批量自动化下载 | ✅ | batchCreateCreationTasks：每行一个用户名或搜索语句，空行/重复去重，单行失败收集进 errors 不中断整批 |
| 常驻自动化任务 | ✅ | persistent 任务跑完保留为 done；任务组 + 全部重置 / 全部开始；CreationTask 与 TaskGroup 经 zustand persist（key 分别为 creation-tasks、task-groups）持久化，重启后可继续 |
| 任务组 | ✅ | TaskGroup + useTaskGroupStore；重置为第一页 + paused，不删已下载文件 |
| 一键更新新推文 | ✅ | 任务组“全部开始”：done 的任务从头抓，顺带抓到期间的新推文 |
| 媒体下载管理 | ✅ | 原有 aria2 下载管理保留 |
| 推文管理（入库） | ✅ | 推文库 src/twitter/tweet-db.ts：upsert / has / query / 导出；下载任务命中设置时自动入库 |
| 推文管理（排序过滤导出） | ✅ | 推文库页支持关键词 / 用户 / 日期过滤，按时间 / 点赞 / 转推排序，导出 CSV / JSON |
| 下载设置：推文存 TXT/HTML/JSON | ✅ | tweetFormat 可选 txt / html / json / none，见 src/utils/tweet-export.ts |
| 下载设置：下载推文/媒体开关 | ✅ | downloadTweet / downloadMedia |
| 下载设置：视频/图片质量 | ✅ | videoQuality（best/720p/480p）、imageQuality（orig/large/medium）；720p/480p 按码率档位尽力匹配，X 的视频链接不带分辨率元数据 |
| 下载设置：GIF 转换 | ✅（有限） | gifToMp4 开关已实现；X 的 GIF 本身就是 MP4 直链，开启后按视频直链保存，不做本地转码（需 ffmpeg，不随应用打包） |
| 下载设置：文件名/目录模板 | ✅ | 原有模板保留 |
| 下载设置：跳过/停止/媒体跳过条件 | ✅ | 条件引擎 src/twitter/conditions.ts：skip / stop / mediaSkip 三种条件组，支持动态值 today / yesterday / lastNDays(n) / now |
| 应用设置：多 Cookie 自动切换 | ✅ | 多 Cookie 账号列表；401/403 时失败计数 +1，连续 3 次自动禁用并切换；旧单 Cookie 字段保留兼容并自动迁移为首个账号 |
| 应用设置：并发/限速 | ✅ | concurrency（分块提交 aria2）、rateLimitMs（翻页间隔） |
| 导出 CSV | ✅ | 推文库导出 CSV（含逗号/引号/换行转义） |
| 导出 JSON | ✅ | 推文库导出 JSON；单条推文也可按 tweetFormat 存 JSON |
| 导出 XLSX | ❌ | 不新增依赖（xlsx 包未引入），暂只提供 CSV/JSON；CSV 可用 Excel / WPS 直接打开 |
| 导出多个任务 | ✅ | 推文库导出覆盖全部入库推文；任务组维度按组导出尚未做（可先按来源过滤后导出） |

## 未在手册里写明、本 fork 也未做的

- 第三方数据源 / 付费版私有接口：没有公开资料，不实现。
- 任何需要编造 GraphQL operation ID 的功能：一律不做，见 docs/GRAPHQL-IDS.md。
