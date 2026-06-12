# Light Game Portal

一个可长期迭代的轻量小游戏平台。项目使用 React + Vite + TypeScript，前端静态页面部署在 Netlify，并用 Supabase 承载登录、钱包和长期运营数据。

## 当前功能

- 首页游戏门户
- 独立游戏列表页
- 2048
- 点击反应速度测试
- 记忆翻牌
- 随机等待 1-3 秒后进入可点击状态
- 显示本次反应时间
- 记录当前页面会话内的最好成绩
- 手机和桌面端自适应布局
- Supabase 邮箱密码注册、登录、退出
- 用户中心展示资料、VIP、金币钱包
- 每日签到奖励金币
- 邀请码、邀请链接和邀请奖励统计
- World Cup Prediction Challenge 2026 活动页面、预测大厅、排行榜、历史记录和规则页
- World Cup 自动赛程同步、比分同步、自动开奖和自动派奖
- World Cup 商城、AI 高级预测和运营后台状态页

## 项目结构

```text
.
├── index.html
├── netlify.toml
├── netlify
│   └── functions
│       ├── _shared
│       │   └── worldCupSync.mts
│       ├── grant-referral-reward.mts
│       ├── settle-world-cup.mts
│       ├── sync-world-cup-matches.mts
│       ├── sync-world-cup-scores.mts
│       └── world-cup-ai-analysis.mts
├── package.json
├── public
│   └── portal-symbol.svg
├── src
│   ├── App.tsx
│   ├── components
│   │   ├── GameCard.tsx
│   │   └── SiteHeader.tsx
│   ├── data
│   │   └── games.ts
│   ├── games
│   │   ├── 2048
│   │   │   └── Game2048.tsx
│   │   ├── memory
│   │   │   └── MemoryGame.tsx
│   │   └── reaction
│   │       └── ReactionGame.tsx
│   ├── main.tsx
│   ├── pages
│   │   ├── LoginPage.tsx
│   │   ├── ProfilePage.tsx
│   │   ├── RegisterPage.tsx
│   │   └── world-cup
│   │       ├── WorldCupAdminPage.tsx
│   │       ├── WorldCupHistoryPage.tsx
│   │       ├── WorldCupHomePage.tsx
│   │       ├── WorldCupLeaderboardPage.tsx
│   │       ├── WorldCupMatchesPage.tsx
│   │       ├── WorldCupPredictionsPage.tsx
│   │       ├── WorldCupRulesPage.tsx
│   │       └── WorldCupShopPage.tsx
│   ├── styles.css
│   └── types.ts
├── supabase
│   ├── migrations
│   │   └── 20260611_daily_checkin_reward_20.sql
│   └── schema.sql
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

以后新增小游戏时，建议：

1. 在 `src/games/<game-id>/` 下创建独立组件。
2. 在 `src/data/games.ts` 中注册游戏标题、分类、难度、时长、颜色和组件。
3. 游戏内部只管理自己的局部状态；跨游戏的用户、成绩、排行榜后续再接 Supabase。

## 本地开发

建议使用 Node.js 22，与 `netlify.toml` 中的 Netlify 构建环境保持一致。

复制环境变量示例文件，并填入 Supabase 前端公开配置：

```bash
cp .env.example .env.local
```

```bash
npm install
npm run dev
```

默认开发地址通常是 `http://localhost:5173`。

## 构建

```bash
npm run build
```

构建产物会输出到 `dist/`。

## Netlify 部署

### 方式一：连接 Git 仓库

1. 将项目推送到 GitHub、GitLab 或 Bitbucket。
2. 在 Netlify 新建站点并选择该仓库。
3. 构建命令填写 `npm run build`。
4. 发布目录填写 `dist`。
5. 点击 Deploy。

本项目已经包含 `netlify.toml`，Netlify 通常会自动读取这些配置。

Netlify 还需要配置以下环境变量：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
OPENAI_MODEL
SPORTS_API_KEY
SPORTS_API_FOOTBALL_LEAGUE_ID
SPORTS_API_FOOTBALL_SEASON
```

`VITE_SUPABASE_ANON_KEY` 只能使用 Supabase anon public / publishable key。`SUPABASE_SERVICE_ROLE_KEY`、`OPENAI_API_KEY` 和 `SPORTS_API_KEY` 只给 Netlify Functions 在服务端使用，不要加 `VITE_` 前缀，不要写入前端代码，也不要提交到 GitHub。`OPENAI_MODEL` 可选，默认使用 `gpt-4.1-mini`。`SPORTS_API_FOOTBALL_LEAGUE_ID` 和 `SPORTS_API_FOOTBALL_SEASON` 可选，默认分别为 `1` 和 `2026`。

### 方式二：Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy
netlify deploy --prod
```

## 可迭代方向

- 增加游戏分类、搜索和排序
- 增加本地历史成绩
- 增加更多小游戏
- 增加分享卡片和排行榜页面
- 增加音效、动效和主题切换
- 接入 Supabase 用户系统、云端成绩和排行榜

## Auth 功能

当前已接入 Supabase Auth：

- `/register` 邮箱密码注册
- `/login` 邮箱密码登录
- `/profile` 用户中心，未登录会跳转到 `/login`
- 导航栏会根据登录状态显示 Login/Register 或 Profile/Logout
- `/profile` 中可以每日签到，调用数据库函数 `daily_checkin()`
- `/profile` 中显示邀请码、邀请链接、邀请人数和累计奖励
- 新用户通过 `/register?ref=邀请码` 注册时，会把邀请码写入 Supabase Auth metadata，由数据库注册触发器绑定邀请关系

Supabase 后台需要检查：

- Authentication > Providers 中启用 Email。
- Authentication > URL Configuration 中设置 Site URL 为线上域名。
- Redirect URLs 加入线上域名和本地开发地址，例如 `http://localhost:5173/*`。
- 如果开启 Confirm email，注册后用户需要先完成邮箱确认再登录。

## Supabase 数据库

长期运营用的数据库结构在 `supabase/schema.sql`，可以直接复制到 Supabase SQL Editor 执行。

如果数据库已经安装过基础 schema，本次每日签到奖励改为 20 金币的增量 SQL 在：

```text
supabase/migrations/20260611_daily_checkin_reward_20.sql
```

世界杯活动 V1 数据库迁移在：

```text
supabase/migrations/20260611_world_cup_prediction_v1.sql
```

赛程系统迁移在：

```text
supabase/migrations/20260611_world_cup_matches.sql
```

世界杯经济系统迁移在：

```text
supabase/migrations/20260612_world_cup_economy.sql
```

世界杯自动同步系统迁移在：

```text
supabase/migrations/20260612_world_cup_auto_sync.sql
```

World Cup 自动化由 Netlify Scheduled Functions 执行：

- `sync-world-cup-matches`：每日同步 API-Football 世界杯赛程，并由数据库触发器自动生成 `match_winner` 预测市场。
- `sync-world-cup-scores`：每 5 分钟同步 live / finished 比赛比分，覆盖比赛期间高频更新。
- `settle-world-cup`：每 10 分钟调用 `settleWorldCupMarkets()`，自动开奖、调用 `add_coins()` 派奖、写入 `notifications`。

运营状态页：

```text
/admin/worldcup
```

管理员导入赛程 CSV 可使用：

```bash
node --experimental-strip-types scripts/import-worldcup-matches.ts matches.csv output.sql
```

CSV 字段：

```text
group_name,team_home,team_away,kickoff_time
```

该迁移新增 `wc_markets`、`wc_predictions`、`wc_user_stats`、`event_config` 等表，并新增 `wc_place_prediction()`、`wc_get_leaderboard()`、`wc_use_ai_assistant()` 等函数。竞猜扣金币必须走 `spend_coins()`，派奖必须走 `add_coins()`。

配套说明在 `docs/supabase-database.md`，包括：

- 哪些表前端可以读取
- 哪些写操作必须走数据库函数或后端接口
- PayPal / Netlify Functions 后续接入方式
- 哪些环境变量不能暴露到前端

## 签到和邀请奖励

- 每日签到由前端调用 `daily_checkin()`，金币余额会通过数据库函数安全更新。
- 邀请奖励由 `netlify/functions/grant-referral-reward.mts` 验证当前登录用户后，用服务端 `SUPABASE_SERVICE_ROLE_KEY` 调用 `grant_referral_reward()`。
- 前端不能直接修改 `wallets.balance`、`coin_transactions`、`vip_memberships` 或支付订单状态。
