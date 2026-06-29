export interface MonitorUser {
  id: string
  openid: string
  nickname: string
  enabled: boolean
  settings?: MonitorSettings
}

export interface MonitorSettings {
  weekPick: string
  selectedWeekdays: number[]
  selectedMealTypes: number[]
  matchMode: 'keywords' | 'stock'
  keywords: string
  stockThresholdBreakfastDinner: number
  stockThresholdLunch: number
  addressId: number
  addressDetail: string
}

export interface Monitor {
  id: string
  createdAt: string
  updatedAt: string
  users: MonitorUser[]
  settings: MonitorSettings
}

export interface MonitorUserStatus {
  openid: string
  monitored: boolean
  enabled: boolean
  nickname: string
}

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'

export interface JobResult {
  monitorId: string
  startedAt: string
  finishedAt: string | null
  counts: ResultCounts
  users: UserResult[]
}

export interface ResultCounts {
  ordered: number
  no_match: number
  error: number
  [key: string]: number
}

export interface UserResult {
  userId: string
  nickname: string
  openid: string
  counts: ResultCounts
  results: MealResult[]
}

export interface MealResult {
  date: string
  dateLabel: string
  mealType: number
  mealTypeLabel: string
  status: 'ordered' | 'no_match' | 'error'
  message: string
  packageName?: string
}

export interface Job {
  id: string
  status: JobStatus
  triggerPayload: unknown
  result: JobResult | null
  error: string | null
  createdAt: string
  updatedAt: string
}

export interface AppSettings {
  feishuNotifyEnabled: boolean
  updatedAt: string
}

export interface Storage {
  init(): Promise<void>
  getAppSettings(): Promise<AppSettings>
  saveAppSettings(settings: AppSettings): Promise<AppSettings>
  getMonitor(): Promise<Monitor | null>
  saveMonitor(monitor: Monitor): Promise<Monitor>
  saveJob(job: Job): Promise<Job>
  getJob(id: string): Promise<Job | null>
  listJobs(limit?: number): Promise<Job[]>
}

export interface MenuItem {
  packageName: string
  sequenceChar: string
  mealType: number | string
  mealDate: string
  stockCount?: number
  [key: string]: unknown
}
