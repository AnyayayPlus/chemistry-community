# Chemistry Note Community

独立的名单管理服务：React、shadcn/ui、Vite+、Node.js 和 SQLite。支持共建者、反馈者、赞助记录管理；公开 API 不返回邮箱。

## 本地运行

需要 Node.js 24 或更高版本和 pnpm。首次安装依赖后，设置至少 12 个字符的管理员密码：

```sh
pnpm install
ADMIN_PASSWORD='替换为本地管理员密码' node server/index.mjs
pnpm dev
```

访问 Vite 输出的本地地址。Vite 将 `/api` 代理到本地 3000 端口。数据库默认为 `data/community.sqlite`；不要将密码或数据库提交到仓库。

## 导入现有名单

停掉服务，使用原项目的 `data` 目录及一个**不存在或空的**数据库路径：

```sh
node server/import.mjs /path/to/Chemistry-Note/data ./data/community.sqlite
```

如果目标目录不存在，先创建目录。导入会保留记录顺序、同名记录及邮箱，将赞助金额转换为整数分；非空数据库会拒绝再次导入。请先备份原始数据并核对输出的数量和金额。

## 构建和测试

```sh
pnpm run build
node --test tests/*.test.mjs
```

构建后启动服务，直接访问 3000 端口。`GET /api/public` 提供 `{members, feedbackers, appreciators}`，仅包含已公开数据，不含邮箱；`/api/entries` 需管理员登录。原化学笔记站点仍须另行改造才能读取该接口。

## 容器与后续部署

`Dockerfile` 和 `compose.yaml` 可供本地试运行及后续 Dokploy 适配。数据必须持久化挂载到 `/data`，独立备份 SQLite 数据库并演练恢复。生产环境必须提供 `ADMIN_PASSWORD` 并通过 HTTPS 访问，Cookie 在生产模式仅通过 HTTPS 发送；建议管理入口使用内网访问，同时保留应用认证。服务公开 API 与管理 API 共用服务，应在网关区分路由访问权限。部署前检查资源、路由、备份和恢复方案，本项目不会自动创建云资源。

## 镜像交付

推送 `main` 后，GitHub Actions 检查并构建服务，将 `latest` 和 `sha-<commit>` 推送到腾讯香港个人镜像仓库。仅在 `DEPLOY_ENABLED=true` 且 `MIGRATION_FREEZE` 不是 `true` 时，通过 Dokploy Webhook 请求部署；请求成功不等于服务已启动，应检查 Dokploy 和访问入口。镜像版本回退时保留 SQLite 数据，确认数据库兼容性。
