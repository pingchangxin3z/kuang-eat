import { randomUUID } from 'node:crypto'
import { OrderClient } from './orderClient.js'
import type { AppSettings, Job, MenuItem, MealResult, Monitor, MonitorSettings, MonitorUser, MonitorUserStatus, ResultCounts, Storage, UserResult } from './types.js'

const MEAL_LABELS: Record<number, string> = {
  1: '早餐',
  2: '午餐',
  3: '晚餐'
}

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function toInt(value: unknown, fallback: number): number {
  const next = Number(value)
  return Number.isFinite(next) ? Math.trunc(next) : fallback
}

function normalizeIntArray(value: unknown, allowed: number[], fallback: number[]): number[] {
  const set = new Set(Array.isArray(value) ? value.map((item) => toInt(item, NaN)) : fallback)
  return [...set].filter((item) => allowed.includes(item)).sort((a, b) => a - b)
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false
  return fallback
}

function parseKeywords(input: string): string[] {
  if (!input || !String(input).trim()) return []
  return String(input)
    .split(/[,，\s\n、]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeMonitorPayload(payload: unknown): Monitor {
  const p = payload as { users?: unknown[]; settings?: Record<string, unknown> } | undefined
  const users = Array.isArray(p?.users) ? p!.users : []
  const normalizedUsers: MonitorUser[] = users
    .map((user: unknown) => {
      const u = user as Record<string, unknown>
      return {
        id: String(u?.id || randomUUID()),
        openid: String(u?.openid || '').trim(),
        nickname: String(u?.nickname || '').trim(),
        enabled: u?.enabled !== false
      }
    })
    .filter((user) => user.openid)

  const settings = (p?.settings || {}) as Record<string, unknown>
  const matchMode = settings.matchMode === 'keywords' ? 'keywords' : 'stock'
  const normalizedSettings: MonitorSettings = {
    weekPick: String(settings.weekPick || new Date().toISOString().slice(0, 10)),
    selectedWeekdays: normalizeIntArray(settings.selectedWeekdays, [0, 1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 4]),
    selectedMealTypes: normalizeIntArray(settings.selectedMealTypes, [1, 2, 3], [2]),
    matchMode,
    keywords: String(settings.keywords || ''),
    stockThresholdBreakfastDinner: Math.max(0, toInt(settings.stockThresholdBreakfastDinner, 200)),
    stockThresholdLunch: Math.max(0, toInt(settings.stockThresholdLunch, 100)),
    addressId: Math.max(1, toInt(settings.addressId, 118)),
    addressDetail: String(settings.addressDetail || '8层西侧吧台')
  }
  const normalized: Monitor = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    users: normalizedUsers.map((user) => ({ ...user, settings: normalizedSettings })),
    settings: normalizedSettings
  }

  if (normalized.users.length === 0) {
    throw new Error('请至少提供一个有效 OpenID')
  }
  if (normalized.settings.selectedWeekdays.length === 0) {
    throw new Error('请至少选择一天')
  }
  if (normalized.settings.selectedMealTypes.length === 0) {
    throw new Error('请至少选择一种餐次')
  }
  return normalized
}

function mergeMonitor(existing: Monitor | null, incoming: Monitor): Monitor {
  if (!existing) return incoming

  const updatedAt = new Date().toISOString()
  const incomingByOpenid = new Map(incoming.users.map((user) => [user.openid, user]))
  const seen = new Set<string>()
  const users: MonitorUser[] = existing.users.map((user) => {
    const next = incomingByOpenid.get(user.openid)
    if (!next) {
      return {
        ...user,
        settings: user.settings || existing.settings
      }
    }
    seen.add(user.openid)
    return {
      ...user,
      id: user.id || next.id,
      nickname: next.nickname,
      enabled: next.enabled,
      settings: next.settings || incoming.settings
    }
  })

  for (const user of incoming.users) {
    if (!seen.has(user.openid)) users.push(user)
  }

  return {
    ...existing,
    updatedAt,
    users,
    settings: incoming.settings
  }
}

function parseYmd(dateText: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateText))
  if (!match) throw new Error(`日期格式无效：${dateText}`)
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

function isoFromUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function getWeekDates(isoDateStr: string): string[] {
  const { year, month, day } = parseYmd(isoDateStr)
  const base = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const weekDay = base.getUTCDay()
  const diff = weekDay === 0 ? -6 : 1 - weekDay
  base.setUTCDate(base.getUTCDate() + diff)
  const dates: string[] = []
  for (let i = 0; i < 7; i++) {
    dates.push(isoFromUtcDate(base))
    base.setUTCDate(base.getUTCDate() + 1)
  }
  return dates
}

function toMealDate(dateStr: string): string {
  return String(dateStr).replace(/-/g, '')
}

function matchFirstMenuItem(items: MenuItem[], keywords: string[]): MenuItem | null {
  if (!keywords.length) return null
  const lowered = keywords.map((keyword) => keyword.toLowerCase())
  return (
    items.find((item) => {
      const name = String(item.packageName || '').toLowerCase()
      return lowered.some((keyword) => name.includes(keyword))
    }) || null
  )
}

function matchFirstByStockCount(items: MenuItem[], threshold: number): MenuItem | null {
  return items.find((item) => Number(item.stockCount) <= threshold) || null
}

function resultCounts(results: MealResult[]): ResultCounts {
  return results.reduce(
    (acc, result) => {
      acc[result.status] = (acc[result.status] || 0) + 1
      return acc
    },
    { ordered: 0, no_match: 0, error: 0 } as ResultCounts
  )
}

async function runWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const queue = [...items]
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    const results: R[] = []
    while (queue.length) {
      const item = queue.shift()!
      results.push(await worker(item))
    }
    return results
  })
  return (await Promise.all(workers)).flat()
}

interface HttpError extends Error {
  statusCode?: number
}

export class MonitorService {
  private storage: Storage
  private orderClient: OrderClient
  private runningJobId: string | null = null
  private monitorWriteQueue: Promise<unknown> = Promise.resolve()
  private concurrency: number

  constructor(storage: Storage, options: { orderClient?: OrderClient } = {}) {
    this.storage = storage
    this.orderClient = options.orderClient || new OrderClient()
    this.concurrency = Math.max(1, toInt(process.env.ORDER_CONCURRENCY, 3))
  }

  async registerMonitor(payload: unknown): Promise<Monitor> {
    const incoming = normalizeMonitorPayload(payload)
    const task = this.monitorWriteQueue.then(async () => {
      const monitor = mergeMonitor(await this.storage.getMonitor(), incoming)
      await this.storage.saveMonitor(monitor)
      return monitor
    })
    this.monitorWriteQueue = task.catch(() => {})
    return await task
  }

  async getActiveMonitor(): Promise<Monitor | null> {
    return await this.storage.getMonitor()
  }

  async getAppSettings(): Promise<AppSettings> {
    return await this.storage.getAppSettings()
  }

  async updateAppSettings(payload: unknown): Promise<AppSettings> {
    const current = await this.storage.getAppSettings()
    const p = (payload || {}) as Record<string, unknown>
    return await this.storage.saveAppSettings({
      ...current,
      feishuNotifyEnabled: toBoolean(p.feishuNotifyEnabled, current.feishuNotifyEnabled),
      updatedAt: new Date().toISOString()
    })
  }

  async getUserStatuses(openids: unknown): Promise<MonitorUserStatus[]> {
    const requested = Array.isArray(openids)
      ? [...new Set(openids.map((openid) => String(openid || '').trim()).filter(Boolean))]
      : []
    if (requested.length === 0) return []

    const monitor = await this.storage.getMonitor()
    const usersByOpenid = new Map((monitor?.users || []).map((user) => [user.openid, user]))
    return requested.map((openid) => {
      const user = usersByOpenid.get(openid)
      return {
        openid,
        monitored: Boolean(user),
        enabled: user?.enabled === true,
        nickname: user?.nickname || ''
      }
    })
  }

  async cancelMonitor(openids: unknown): Promise<MonitorUserStatus[]> {
    const requested = Array.isArray(openids)
      ? [...new Set(openids.map((openid) => String(openid || '').trim()).filter(Boolean))]
      : []
    if (requested.length === 0) return []

    const requestedSet = new Set(requested)
    const task = this.monitorWriteQueue.then(async () => {
      const monitor = await this.storage.getMonitor()
      if (!monitor) return requested.map((openid) => ({ openid, monitored: false, enabled: false, nickname: '' }))

      const nextMonitor: Monitor = {
        ...monitor,
        updatedAt: new Date().toISOString(),
        users: monitor.users.map((user) =>
          requestedSet.has(user.openid)
            ? { ...user, enabled: false, settings: user.settings || monitor.settings }
            : user
        )
      }
      await this.storage.saveMonitor(nextMonitor)
      return await this.getUserStatuses(requested)
    })
    this.monitorWriteQueue = task.catch(() => {})
    return await task
  }

  async trigger(payload: unknown = {}): Promise<{ accepted: boolean; job: Job | null }> {
    const monitor = await this.storage.getMonitor()
    if (!monitor) {
      const error: HttpError = new Error('尚未发起监控')
      error.statusCode = 409
      throw error
    }
    if (this.runningJobId) {
      return {
        accepted: false,
        job: await this.storage.getJob(this.runningJobId)
      }
    }

    const now = new Date().toISOString()
    const job: Job = {
      id: randomUUID(),
      status: 'queued',
      triggerPayload: payload,
      result: null,
      error: null,
      createdAt: now,
      updatedAt: now
    }
    await this.storage.saveJob(job)
    this.runningJobId = job.id
    this.runJob(job.id, monitor).catch((error) => {
      console.error('[monitor] job failed', error)
    })
    return { accepted: true, job }
  }

  private async runJob(jobId: string, monitor: Monitor): Promise<Job> {
    let job = await this.storage.getJob(jobId)
    const startedAt = new Date().toISOString()
    job = { ...job!, status: 'running', updatedAt: startedAt }
    await this.storage.saveJob(job)

    try {
      const enabledUsers = monitor.users.filter((user) => user.enabled && user.openid)
      const userResults = await runWithConcurrency(enabledUsers, this.concurrency, (user) =>
        this.runUser(user, user.settings || monitor.settings)
      )
      const allResults = userResults.flatMap((userResult) => userResult.results)
      const counts = resultCounts(allResults)
      const result = {
        monitorId: monitor.id,
        startedAt,
        finishedAt: new Date().toISOString(),
        counts,
        users: userResults
      }
      job = { ...job, status: 'succeeded', result, updatedAt: result.finishedAt }
      await this.storage.saveJob(job)
      await this.notifyResult(job).catch(() => {})
      return job
    } catch (error: unknown) {
      job = {
        ...job,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        updatedAt: new Date().toISOString()
      }
      await this.storage.saveJob(job)
      await this.notifyResult(job).catch(() => {})
      return job
    } finally {
      if (this.runningJobId === jobId) this.runningJobId = null
    }
  }

  private async runUser(user: MonitorUser, settings: MonitorSettings): Promise<UserResult> {
    const weekDates = getWeekDates(settings.weekPick)
    const keywords = parseKeywords(settings.keywords)
    const results: MealResult[] = []
    const selectedWeekdays = [...settings.selectedWeekdays].sort((a, b) => a - b)
    const selectedMealTypes = [...settings.selectedMealTypes].sort((a, b) => a - b)

    for (const dayIndex of selectedWeekdays) {
      const date = weekDates[dayIndex]
      for (const mealType of selectedMealTypes) {
        const mealTypeLabel = MEAL_LABELS[mealType] || ''
        const threshold =
          mealType === 2 ? settings.stockThresholdLunch : settings.stockThresholdBreakfastDinner

        try {
          const menu = await this.orderClient.getMenu(user.openid, mealType, toMealDate(date))
          const matched =
            settings.matchMode === 'keywords'
              ? matchFirstMenuItem(menu, keywords)
              : matchFirstByStockCount(menu, threshold)

          if (!matched) {
            results.push({
              date,
              dateLabel: WEEKDAY_LABELS[dayIndex] || '',
              mealType,
              mealTypeLabel,
              status: 'no_match',
              message:
                menu.length === 0
                  ? '暂无菜单'
                  : settings.matchMode === 'keywords'
                    ? '未匹配到关键词'
                    : `无总量 <= ${threshold} 的套餐`
            })
            continue
          }

          const response = await this.orderClient.createOrder(
            user.openid,
            matched,
            settings.addressId,
            settings.addressDetail
          )
          results.push({
            date,
            dateLabel: WEEKDAY_LABELS[dayIndex] || '',
            mealType,
            mealTypeLabel,
            status: Number(response?.code) === 200 ? 'ordered' : 'error',
            message: String(response?.msg || ''),
            packageName: String(matched.packageName || '').replace(/\n/g, ' ')
          })
        } catch (error: unknown) {
          results.push({
            date,
            dateLabel: WEEKDAY_LABELS[dayIndex] || '',
            mealType,
            mealTypeLabel,
            status: 'error',
            message: error instanceof Error ? error.message : String(error)
          })
        }
      }
    }

    return {
      userId: user.id,
      nickname: user.nickname || user.openid,
      openid: user.openid,
      counts: resultCounts(results),
      results
    }
  }

  private async notifyResult(job: Job): Promise<void> {
    const settings = await this.storage.getAppSettings()
    if (!settings.feishuNotifyEnabled) return
    const webhookUrl = process.env.MONITOR_FEISHU_WEBHOOK || process.env.VITE_FEISHU_WEBHOOK
    if (!webhookUrl) return
    const result = job.result
    const text =
      job.status === 'succeeded'
        ? `【狂吃】抢饭任务完成\njob: ${job.id}\n成功：${result!.counts.ordered || 0}，未匹配：${result!.counts.no_match || 0}，失败：${result!.counts.error || 0}`
        : `【狂吃】抢饭任务失败\njob: ${job.id}\n${job.error || 'unknown error'}`
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msg_type: 'text',
        content: { text }
      })
    })
  }
}
