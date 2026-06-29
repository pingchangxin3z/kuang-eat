# 后端监控触发

## 启动

```bash
npm run backend
```

默认监听 `http://localhost:8787`。

后端启动时会自动读取项目根目录 `.env`。本地连接 PostgreSQL 时，至少配置：

```text
DATABASE_URL=postgres://user:pass@host:5432/db
STORAGE_DRIVER=postgres
```

启动后，后端会打印接口请求日志，例如：

```text
[request] GET /api/monitor/active 200 12.4ms 128b
```

前端开发模式已把 `/api` 代理到该后端，所以本地需要同时启动：

```bash
npm run backend
npm run dev
```

## 接口

### 登记监控配置

前端点击「发起监控」会调用：

```http
POST /api/monitor/register
```

后端会保存用户 `openid`、昵称、启用状态、餐次、工作日、匹配规则、地址等配置。

重复登记时按 `openid` 合并：本次提交的用户会更新自己的监控配置，未提交的已监控用户会保留，不会被清空。

### 飞书触发抢饭

给飞书配置的触发接口是：

```http
POST /api/trigger/grab
```

如果配置了 `MONITOR_TRIGGER_SECRET`，请求需带其一：

```http
X-Monitor-Secret: <secret>
```

或：

```text
/api/trigger/grab?secret=<secret>
```

返回 `202` 表示任务已入队。查询任务：

```http
GET /api/jobs/<jobId>
GET /api/jobs
```

管理后台 `/admin` 可以查看当前所有监控人员、每个人的 OpenID/昵称/监控规则/地址、最近任务中的用户级执行结果，并开关飞书结果通知。

## 存储

默认使用本地 JSON 文件：

```text
server/data/monitor-state.json
```

切换到 PostgreSQL：

```bash
STORAGE_DRIVER=postgres DATABASE_URL='postgres://user:pass@host:5432/db' npm run backend
```

如果服务器访问不了公司内网 PostgreSQL，先用默认 JSON 存储即可，不影响功能验证。

## GitHub Actions / k3s 部署

生产镜像会启动 Express 后端，同时托管前端静态文件。部署到 k3s 时，GitHub Actions 会创建
PostgreSQL、PVC、Service、Kubernetes Secret `${APP_NAME}-env`，并把后端需要的环境变量注入 Deployment。

GitHub Actions 必填 Secrets：

```text
TCR_USERNAME=<腾讯云镜像仓库用户名>
TCR_PASSWORD=<腾讯云镜像仓库密码>
SERVER_HOST=<k3s 服务器地址>
SERVER_USER=<SSH 用户名>
SERVER_SSH_KEY=<SSH 私钥>
POSTGRES_PASSWORD=<k3s 内 PostgreSQL 密码>
MONITOR_FEISHU_WEBHOOK=https://open.feishu.cn/open-apis/bot/v2/hook/...
```

建议同时配置：

```text
MONITOR_TRIGGER_SECRET=<飞书触发接口密钥>
```

如果 SSH 端口不是 `22`，在 GitHub Actions Variables 里配置：

```text
SERVER_PORT=<SSH 端口>
```

部署后的容器会使用：

```text
STORAGE_DRIVER=postgres
DATABASE_URL=postgres://kuang_eat:<POSTGRES_PASSWORD>@kuang-eat-postgres:5432/kuang_eat
MONITOR_FEISHU_WEBHOOK=<来自 Kubernetes Secret>
MONITOR_TRIGGER_SECRET=<来自 Kubernetes Secret，可为空>
PGSSL=false
```

## 常用环境变量

- `PORT`: 后端端口，默认 `8787`
- `ORDER_BASE_URL`: 原订餐系统地址，默认 `https://order.hersweetie.com`
- `MONITOR_TRIGGER_SECRET`: 飞书触发接口密钥
- `MONITOR_FEISHU_WEBHOOK`: 抢饭结果通知 webhook
- `STORAGE_DRIVER`: `json` 或 `postgres`
- `DATABASE_URL`: PostgreSQL 连接串
- `ORDER_CONCURRENCY`: 并发用户数，默认 `3`

飞书结果通知是否发送由管理后台 `/admin` 的「飞书结果通知」开关控制，默认开启。
