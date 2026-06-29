type MealType = 1 | 2 | 3

export interface MonitorUserPayload {
  id: string
  openid: string
  nickname: string
  enabled: boolean
}

export interface MonitorSettingsPayload {
  weekPick: string
  selectedWeekdays: number[]
  selectedMealTypes: MealType[]
  matchMode: 'keywords' | 'stock'
  keywords: string
  stockThresholdBreakfastDinner: number
  stockThresholdLunch: number
  addressId: number
  addressDetail: string
}

export interface RegisterMonitorPayload {
  users: MonitorUserPayload[]
  settings: MonitorSettingsPayload
}

export interface RegisterMonitorResponse {
  ok: boolean
  monitor?: {
    id: string
    users: MonitorUserPayload[]
    settings: MonitorSettingsPayload
    updatedAt: string
  }
  error?: string
}

export interface MonitorUserStatus {
  openid: string
  monitored: boolean
  enabled: boolean
  nickname: string
}

export interface MonitorStatusResponse {
  ok: boolean
  statuses: MonitorUserStatus[]
  error?: string
}

const BACKEND_BASE = (import.meta.env.VITE_BACKEND_BASE_URL ?? '').trim().replace(/\/$/, '')

export async function registerMonitor(payload: RegisterMonitorPayload): Promise<RegisterMonitorResponse> {
  const response = await fetch(`${BACKEND_BASE}/api/monitor/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const data = (await response.json()) as RegisterMonitorResponse
  if (!response.ok || !data.ok) {
    throw new Error(data.error || '发起监控失败')
  }
  return data
}

export async function getMonitorStatuses(openids: string[]): Promise<MonitorStatusResponse> {
  const response = await fetch(`${BACKEND_BASE}/api/monitor/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ openids })
  })
  const data = (await response.json()) as MonitorStatusResponse
  if (!response.ok || !data.ok) {
    throw new Error(data.error || '查询监控状态失败')
  }
  return data
}

export async function cancelMonitor(openids: string[]): Promise<MonitorStatusResponse> {
  const response = await fetch(`${BACKEND_BASE}/api/monitor/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ openids })
  })
  const data = (await response.json()) as MonitorStatusResponse
  if (!response.ok || !data.ok) {
    throw new Error(data.error || '取消监控失败')
  }
  return data
}
