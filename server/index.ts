import express, { type Request, type Response, type NextFunction } from 'express'
import path from 'node:path'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'
import { createStorage } from './storage.js'
import { MonitorService } from './monitorService.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localEnvPath = path.resolve(__dirname, '../.env')
try {
  loadEnvFile(localEnvPath)
} catch (error) {
  if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error
}

const port = Number(process.env.PORT || 8787)
const host = process.env.HOST || '0.0.0.0'
const corsOrigin = process.env.CORS_ORIGIN || '*'
const triggerSecret = process.env.MONITOR_TRIGGER_SECRET || process.env.TRIGGER_SECRET || ''
const staticDir = process.env.STATIC_DIR || path.resolve(__dirname, '../dist')
const orderBaseUrl = (process.env.ORDER_BASE_URL || 'https://order.hersweetie.com').replace(/\/$/, '')

const hopByHopHeaders = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
])

interface HttpError extends Error {
  statusCode?: number
}

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
}

function redactRequestUrl(req: Request): string {
  const baseUrl = `http://${req.headers.host || 'localhost'}`
  const url = new URL(req.originalUrl, baseUrl)
  for (const key of ['secret', 'token', 'password', 'key']) {
    if (url.searchParams.has(key)) url.searchParams.set(key, '[redacted]')
  }
  return `${url.pathname}${url.search}`
}

function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint()
  res.on('finish', () => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/feishu-api')) return
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
    const contentLength = res.getHeader('content-length')
    const lengthText = contentLength ? ` ${contentLength}b` : ''
    console.log(
      `[request] ${req.method} ${redactRequestUrl(req)} ${res.statusCode} ${durationMs.toFixed(1)}ms${lengthText}`
    )
  })
  next()
}

function assertTriggerSecret(req: Request): void {
  if (!triggerSecret) return
  const provided =
    req.header('x-monitor-secret') ||
    req.header('x-trigger-secret') ||
    (req.query.secret as string | undefined) ||
    (req.body as Record<string, unknown>)?.secret
  if (provided !== triggerSecret) {
    const error: HttpError = new Error('触发密钥无效')
    error.statusCode = 401
    throw error
  }
}

function requestHeadersForProxy(req: Request): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    const lowerKey = key.toLowerCase()
    if (hopByHopHeaders.has(lowerKey) || value === undefined) continue
    headers.set(key, Array.isArray(value) ? value.join(', ') : value)
  }
  return headers
}

async function readRequestBody(req: Request): Promise<Buffer | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return chunks.length ? Buffer.concat(chunks) : undefined
}

async function proxyOrderApi(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const targetUrl = new URL(req.originalUrl, orderBaseUrl)
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: requestHeadersForProxy(req),
      body: await readRequestBody(req),
      redirect: 'manual'
    })

    res.status(upstream.status)
    upstream.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase()
      if (hopByHopHeaders.has(lowerKey) || lowerKey === 'content-encoding') return
      res.setHeader(key, value)
    })
    res.send(Buffer.from(await upstream.arrayBuffer()))
  } catch (error) {
    next(error)
  }
}

const storage = createStorage()
try {
  await storage.init()
} catch (error) {
  console.error('[kuang-eat] storage init failed', error)
  process.exit(1)
}

const service = new MonitorService(storage)
const app = express()

app.use(requestLogger)
app.use('/feishu-api', proxyOrderApi)
app.use(express.json({ limit: '1mb' }))
app.use((_: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', corsOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Monitor-Secret, X-Trigger-Secret')
  res.setHeader('Cache-Control', 'no-store')
  next()
})

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})

app.get('/health', (_: Request, res: Response) => {
  res.json({ ok: true })
})

app.get(
  '/api/monitor/active',
  asyncRoute(async (_: Request, res: Response) => {
    res.json({ ok: true, monitor: await service.getActiveMonitor() })
  })
)

app.post(
  '/api/monitor/register',
  asyncRoute(async (req: Request, res: Response) => {
    const monitor = await service.registerMonitor(req.body || {})
    res.json({ ok: true, monitor })
  })
)

app.post(
  '/api/monitor/status',
  asyncRoute(async (req: Request, res: Response) => {
    res.json({ ok: true, statuses: await service.getUserStatuses((req.body as Record<string, unknown>)?.openids) })
  })
)

app.post(
  '/api/monitor/cancel',
  asyncRoute(async (req: Request, res: Response) => {
    res.json({ ok: true, statuses: await service.cancelMonitor((req.body as Record<string, unknown>)?.openids) })
  })
)

app.post(
  '/api/trigger/grab',
  asyncRoute(async (req: Request, res: Response) => {
    assertTriggerSecret(req)
    const result = await service.trigger(req.body || {})
    res.status(result.accepted ? 202 : 200).json({ ok: true, ...result })
  })
)

app.get(
  '/api/admin/settings',
  asyncRoute(async (req: Request, res: Response) => {
    assertTriggerSecret(req)
    res.json({ ok: true, settings: await service.getAppSettings() })
  })
)

app.post(
  '/api/admin/settings',
  asyncRoute(async (req: Request, res: Response) => {
    assertTriggerSecret(req)
    res.json({ ok: true, settings: await service.updateAppSettings(req.body || {}) })
  })
)

app.get(
  '/api/jobs',
  asyncRoute(async (req: Request, res: Response) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)))
    res.json({ ok: true, jobs: await storage.listJobs(limit) })
  })
)

app.get(
  '/api/jobs/:jobId',
  asyncRoute(async (req: Request, res: Response) => {
    const job = await storage.getJob(req.params.jobId as string)
    if (!job) {
      res.status(404).json({ ok: false, error: 'job not found' })
      return
    }
    res.json({ ok: true, job })
  })
)

app.post(
  '/api/jobs/:jobId/stop',
  asyncRoute(async (req: Request, res: Response) => {
    assertTriggerSecret(req)
    const job = await service.stopJob(req.params.jobId as string)
    if (!job) {
      res.status(404).json({ ok: false, error: 'job not found' })
      return
    }
    res.json({ ok: true, job })
  })
)

app.post(
  '/api/jobs/:jobId/retry',
  asyncRoute(async (req: Request, res: Response) => {
    assertTriggerSecret(req)
    const result = await service.retryJob(req.params.jobId as string)
    res.status(result.accepted ? 202 : 200).json({ ok: true, ...result })
  })
)

app.post(
  '/api/jobs/:jobId/retry-user',
  asyncRoute(async (req: Request, res: Response) => {
    assertTriggerSecret(req)
    const result = await service.retryUser((req.body as Record<string, unknown>)?.openid, req.params.jobId)
    res.status(result.accepted ? 202 : 200).json({ ok: true, ...result })
  })
)

app.use(express.static(staticDir))
app.use((req: Request, res: Response, next: NextFunction) => {
  if (
    req.method !== 'GET' ||
    req.path === '/api' ||
    req.path.startsWith('/api/') ||
    req.path === '/feishu-api' ||
    req.path.startsWith('/feishu-api/')
  ) {
    next()
    return
  }
  res.sendFile(path.join(staticDir, 'index.html'), (error) => {
    if (error) next(error)
  })
})

app.use((_: Request, res: Response) => {
  res.status(404).json({ ok: false, error: 'not found' })
})

app.use((error: HttpError, _req: Request, res: Response, _next: NextFunction) => {
  void _next
  const statusCode = error?.statusCode || 500
  res.status(statusCode).json({
    ok: false,
    error: error instanceof Error ? error.message : String(error)
  })
})

const server = app.listen(port, host, () => {
  console.log(`[kuang-eat] express backend listening on http://${host}:${port}`)
})

server.on('error', (error) => {
  console.error('[kuang-eat] express backend error', error)
})

server.on('close', () => {
  console.log('[kuang-eat] express backend closed')
})
