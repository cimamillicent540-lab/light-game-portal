# Light Game Portal

一个可长期迭代的轻量小游戏网站。第一版使用 React + Vite + TypeScript，只包含前端静态页面，适合直接部署到 Netlify。

## 当前功能

- 首页游戏门户
- 点击反应速度测试
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

以后新增小游戏时，建议在 `src/games/<game-id>/` 下创建独立组件，并在 `src/data/games.ts` 里注册入口信息。

## 本地开发

建议使用 Node.js 22，与 `netlify.toml` 中的 Netlify 构建环境保持一致。

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
