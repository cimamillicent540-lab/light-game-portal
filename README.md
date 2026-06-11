# Light Game Portal

一个可长期迭代的轻量小游戏平台。项目使用 React + Vite + TypeScript，只包含前端静态页面，适合直接部署到 Netlify。

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

## 项目结构

```text
.
├── index.html
├── netlify.toml
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
│   ├── styles.css
│   └── types.ts
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
```

只使用 Supabase anon public / publishable key，不要在前端或 Netlify 环境变量里放 `service_role` key。

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

Supabase 后台需要检查：

- Authentication > Providers 中启用 Email。
- Authentication > URL Configuration 中设置 Site URL 为线上域名。
- Redirect URLs 加入线上域名和本地开发地址，例如 `http://localhost:5173/*`。
- 如果开启 Confirm email，注册后用户需要先完成邮箱确认再登录。
