# Personal Asset Dashboard

一个可自行托管的个人资产看板，用于记录余额、查看历史快照、多币种汇总，以及导出备份。

[English](README.md)

[![Deploy API to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/lxxself/CfPersonAssetDashboard/tree/main/apps/api)

> 这个按钮会把 API Worker 以及对应的 D1/KV 资源部署到你的 Cloudflare 账号。Pages 前端需要按照下面的步骤单独配置。

本项目的设计目标是在你自己的 Cloudflare 账号中运行：

- React + Vite 前端部署到 Cloudflare Pages
- Hono API 部署到 Cloudflare Workers
- D1 保存资产位置和历史记录
- KV 缓存汇率
- 通过看板手动刷新汇率

当前界面为简体中文。仓库不包含生产数据；前端仅在离线或请求失败时使用合成的示例数据作为回退展示。

## 架构

```text
浏览器
  ├── Cloudflare Pages（静态 React 应用）
  └── Cloudflare Worker API
        ├── D1：资产位置和余额历史
        ├── KV：汇率缓存
        └── 汇率服务商（仅在手动同步时调用）
```

## 功能

- 以 CNY 或其他三字母货币记录资产位置。
- 添加余额快照，查看单个账户或总资产趋势。
- 按货币和标签筛选。
- 手动刷新汇率，不使用定时 Cron 任务。
- 导出完整 JSON 备份，并在之后恢复。
- 使用 Worker Secret 保护 API 路由。
- 使用 Wrangler 的本地 D1/KV 模拟进行开发。

## 仓库结构

```text
apps/api/       Cloudflare Worker API、D1 schema、迁移文件和 Wrangler 配置
apps/web/       React/Vite 前端
docs/           存储和数据模型说明
```

常用文件：

- [API 路由](apps/api/src/routes.ts)
- [D1 schema](apps/api/schema.sql)
- [初始迁移](apps/api/migrations/0001_initial.sql)
- [KV 设计](docs/kv-design.md)
- [Worker 配置](apps/api/wrangler.toml)

## 环境要求

- Node.js 22.12 或更高版本
- 一个可用于部署的 Cloudflare 账号
- 已通过 `npx wrangler login` 完成 Wrangler 登录

## 本地开发

在仓库根目录安装依赖：

```bash
npm install
```

如果希望本地 API 也启用密码验证，复制示例文件并设置一个本地密码：

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

将 D1 迁移应用到 Wrangler 的本地数据库：

```bash
npm --workspace apps/api run db:migrate:local
```

在两个终端中分别启动 API 和前端：

```bash
npm run dev:api
npm run dev:web
```

打开终端显示的 Vite 地址，通常是 `http://localhost:5173`。本地前端默认使用 `http://localhost:8787` 作为 API 地址。如果 API 使用了其他地址，请在启动 Vite 前设置：

```bash
VITE_API_BASE=http://localhost:8787 npm run dev:web
```

如果没有设置 `DASHBOARD_PASSWORD`，API 会在本地开发时有意允许未认证请求。不要把这样的 Worker 暴露到公网。

## 部署到你自己的 Cloudflare

建议先部署 API，因为构建 Pages 前端时需要 API 最终的 Worker URL。

### 一键部署 API

点击本页顶部的 **Deploy API to Cloudflare** 按钮。它会打开 Cloudflare 的部署流程，针对隔离的 `apps/api` Worker，根据 Wrangler 配置创建 D1 和 KV 资源，执行 D1 迁移，并将 Worker 部署到你的账号。

这个按钮有意只部署 API：Cloudflare 的 Deploy 按钮支持 Workers，不支持 Pages；本仓库又包含两个需要分别部署的应用。Worker 部署完成后：

1. 如果部署页面要求填写 `DASHBOARD_PASSWORD`，请直接设置一个强且唯一的值；否则请立即在 Cloudflare 控制台中设置 Worker Secret，或执行下面的 `wrangler secret put` 命令。
2. 将 Worker URL 填入 Pages 的 `VITE_API_BASE` 设置。
3. 按照下一节的说明部署 Pages 前端。

这些改动推送到公开 GitHub 仓库后，按钮才会使用最新版本。如果你希望先在本地检查每条命令，也可以使用下面的手动流程。

### 手动部署 API

#### 1. 登录 Wrangler

```bash
npx wrangler login
npx wrangler whoami
```

#### 2. 创建 D1 和 KV 资源

下面的命令使用项目预期的 binding 名称。Cloudflare 中的资源名称可以自定义，但 Wrangler 配置中的 binding 必须保持为 `DB` 和 `ASSET_KV`。

```bash
npx wrangler d1 create personal-asset-dashboard
npx wrangler kv namespace create ASSET_KV
```

将命令返回的 D1 `database_id` 和 KV namespace `id` 填入 [apps/api/wrangler.toml](apps/api/wrangler.toml)。如果 Worker 名称已在你的账号中被占用，也请修改 `name`。

Wrangler 文件中的这些 ID 是账号范围内的资源标识符，不是密码或 API Token；部署前仍然必须替换成你自己账号中的资源 ID。

#### 3. 执行远程迁移并部署

```bash
npm run deploy:api
```

`npm run deploy:api` 会通过 `DB` binding 应用尚未执行的远程迁移，然后部署 Worker。单独执行迁移命令不是必须的，但仍保留为排查问题和显式检查迁移状态的手段。

部署输出中会包含 Worker URL，例如 `https://<your-worker>.<your-subdomain>.workers.dev`。

#### 4. 立即设置生产密码

使用一个较长且唯一的密码。Wrangler 会交互式读取密码，因此不会出现在 shell 历史中：

```bash
npx wrangler secret put DASHBOARD_PASSWORD --config apps/api/wrangler.toml
```

`DASHBOARD_PASSWORD` 是 Worker Secret。不要把它放进 `vars`、源代码、Pages 变量或提交到仓库的 `.env` 文件中。`wrangler secret put` 会立即部署新的 Secret 版本。

验证公开健康检查可用，并确认受保护接口需要认证：

```bash
curl https://<your-worker>.<your-subdomain>.workers.dev/api/health
curl -i https://<your-worker>.<your-subdomain>.workers.dev/api/summary
```

第二个命令在没有提供 `Authorization: Bearer ...` 时应返回 `401`。不要把真实密码放进会被复制到 issue 或 shell 历史的命令中。

请保留 Wrangler 配置中的 `[triggers]` 和 `crons = []`。本项目只有在用户点击 **手动同步** 时才刷新汇率。

## 部署 Cloudflare Pages 前端

前端和 API 是两个独立部署。`VITE_API_BASE` 是构建时公开配置，不是 Secret，必须指向你自己的 Worker 地址。

### 推荐：Pages Git 集成

在 Cloudflare **Workers & Pages** 中创建 Pages 项目并连接本仓库。这个 monorepo 使用以下设置：

| 设置 | 值 |
| --- | --- |
| 根目录 | `/` |
| 构建命令 | `npm run build:web` |
| 构建输出目录 | `apps/web/dist` |
| 生产分支 | 你的生产分支，通常是 `main` |
| `VITE_API_BASE` | `https://<your-worker>.<your-subdomain>.workers.dev` |

第一次构建前，请在 Production 和 Preview 环境都设置 `VITE_API_BASE`。Vite 会将它嵌入生成的 JavaScript，因此修改该值后需要重新部署 Pages。

### 直接使用 Wrangler 上传

如果不使用 Git 集成，请在仓库根目录设置 API 地址、构建并上传生成目录：

```bash
VITE_API_BASE=https://<your-worker>.<your-subdomain>.workers.dev npm run build:web
npx wrangler pages project create <your-pages-project> --production-branch=main
npx wrangler pages deploy apps/web/dist --project-name <your-pages-project>
```

不要把 `DASHBOARD_PASSWORD` 放进 Pages 环境变量。浏览器会要求用户输入密码，并通过 HTTPS 将其作为 Bearer token 发送给 Worker。

## 构建和验证命令

```bash
npm run typecheck
npm run build:web
npm run preview:web
```

使用看板前，确认：

1. `/api/health` 返回 `200`。
2. 未携带密码时，受保护 API 返回 `401`。
3. Pages 构建时的 `VITE_API_BASE` 指向你的 Worker URL。
4. 可以登录、添加测试资产、刷新汇率、导出备份并恢复备份。

## API 概览

配置 `DASHBOARD_PASSWORD` 后，除 `GET /api/health` 和 CORS 预检请求外，所有路由都需要认证。

```text
GET    /api/health
GET    /api/exchange-rates
POST   /api/exchange-rates/refresh
GET    /api/asset-locations
POST   /api/asset-locations
GET    /api/asset-locations/:id
PATCH  /api/asset-locations/:id
DELETE /api/asset-locations/:id
GET    /api/asset-locations/:id/history
POST   /api/asset-locations/:id/history
PATCH  /api/asset-history/:id
DELETE /api/asset-history/:id
GET    /api/asset-locations/:id/trend
GET    /api/summary
GET    /api/backup
POST   /api/backup/restore
```

## 隐私和安全说明

- 仓库没有提交 `.env`、`.dev.vars`、备份、API key、token 或私钥文件。
- 生产资产记录保存在你的 D1 数据库中，汇率缓存保存在你的 KV namespace 中；它们不会发送给前端构建系统。
- 手动刷新汇率时会调用配置的汇率服务商。请求只包含货币汇率查询，不包含资产名称、余额、标签或历史记录。
- JSON 备份包含全部资产名称、金额、标签、备注和历史记录。请把它当作财务记录处理，不要提交到仓库。
- 前端会将输入的密码保存在浏览器 `localStorage`，并通过 HTTPS 以 Bearer token 发送。建议使用私密且可信的浏览器配置文件。
- 这是一个面向单用户的轻量级自托管工具。密码门禁不能替代 Cloudflare Access、更强的身份管理、限流或完整的金融数据安全审计。
- 如果缺少密码，API 会为本地开发有意保持开放。录入真实数据前请先设置 Worker Secret。
- 如果真实凭据曾经提交过，请先轮换凭据；后续提交中删除文件并不能将其从 Git 历史中移除。
- 示例配置启用了 Worker 可观测性。如果请求元数据敏感，请检查 Cloudflare 的遥测和保留设置。

## 备份和恢复

在看板中使用 **数据备份** 下载带版本信息的 JSON 文件。恢复操作会替换全部资产位置和历史记录，因此请先导出当前数据，并保留不止一份备份。

## Cloudflare 文档

- [Deploy to Cloudflare 按钮](https://developers.cloudflare.com/workers/platform/deploy-buttons/)
- [Pages 构建配置](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Pages Git 集成](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)
- [D1 Wrangler 命令](https://developers.cloudflare.com/d1/wrangler-commands/)
- [Workers Secret](https://developers.cloudflare.com/workers/configuration/secrets/)
- [创建 KV namespace](https://developers.cloudflare.com/kv/get-started/)
