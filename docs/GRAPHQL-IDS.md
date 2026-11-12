# 如何提取 X 的 GraphQL operation ID

本 fork 的新数据源（高级搜索、推文回复、喜欢、书签、时间线、社群、关注导出）
都缺 X 的 GraphQL operation ID。X 会轮换这些 ID，所以**不要把从网上抄来的旧 ID
写进代码**；请按下面步骤从当前 x.com 网页里提取最新 ID，再配置进来。

## 为什么需要这一步

X 的网页端调用 `https://x.com/i/api/graphql/<operationId>/<operationName>`，
`<operationId>` 是一串哈希，X 前端发版时可能变化。仓库里只有以下三个 ID
是随开源 v2.2.2 一起验证过的真实值：

- `UserByScreenName`：`NimuplG1OB7Fd2btCLdBOw`
- `UserMedia`：`cEjpJXA15Ok78yO4TUQPeQ`
- `UserTweets`：`9zyyd1hebl7oNWIPdA8HRw`

其余端点的 ID 本仓库一律留空（`src/twitter/endpoints.ts` 里的
`GRAPHQL_ENDPOINTS`），缺 ID 时调用会抛 `EndpointNotConfiguredError`，
界面显示“需配置 GraphQL ID”。

## 提取步骤

1. 用浏览器打开 https://x.com 并登录（用与本软件同一个账号）。
2. 打开开发者工具 → Network（网络）面板，筛选 `graphql`。
3. 在页面上做一次对应操作，例如：
   - 高级搜索：在搜索框输入 `from:elonmusk` 回车 → 找 `SearchTimeline` 请求；
   - 推文回复：打开任意推文的详情页 → 找 `TweetDetail` 请求；
   - 喜欢：打开自己的喜欢列表 → 找 `Likes` 请求；
   - 书签：打开书签页 → 找 `Bookmarks` 请求；
   - 时间线：刷新首页 → 找 `HomeTimeline` 请求；
   - 社群：打开任意社群 → 找 `CommunityTweets` 请求；
   - 关注：打开自己的关注列表 → 找 `Following` 请求。
4. 点开该请求，看 URL：`https://x.com/i/api/graphql/<operationId>/<operationName>`，
   其中 `<operationId>` 就是要找的 ID（例如 `NimuplG1OB7Fd2btCLdBOw` 这种形式）。
5. 也可以在页面 JS bundle 里搜 operation 名称附近的哈希值做交叉验证；
   以 Network 面板实际发出的请求为准。

## 配置方法

在应用启动后调用一次（例如在本地配置文件或启动逻辑里）：

```ts
import { registerEndpointOperationId } from './src/twitter/endpoints';

registerEndpointOperationId('SearchTimeline', '你提取到的最新 ID');
registerEndpointOperationId('TweetDetail', '你提取到的最新 ID');
registerEndpointOperationId('Likes', '你提取到的最新 ID');
registerEndpointOperationId('Bookmarks', '你提取到的最新 ID');
registerEndpointOperationId('HomeTimeline', '你提取到的最新 ID');
registerEndpointOperationId('CommunityTweets', '你提取到的最新 ID');
registerEndpointOperationId('Following', '你提取到的最新 ID');
```

也可以直接编辑 `src/twitter/endpoints.ts` 里 `GRAPHQL_ENDPOINTS` 对应项的
`operationId` 字段（从 `null` 改成提取到的字符串）。

## 注意事项

- ID 失效时 X 会返回 400 / 403：按上面步骤重新提取最新 ID 即可。
- 不同账号、不同时间提取到的 ID 一般相同；若某个端点在你账号上
  一直不出请求，说明该操作没走这个 operation，请换一个入口再试。
- 提取到的 ID 只应保存在你自己的本地配置里，不要公开传播。
