import type { AppSettings, Job, Monitor } from '../../server/types'

const BACKEND_BASE = (import.meta.env.VITE_BACKEND_BASE_URL ?? '').toString().trim().replace(/\/$/, '')

function getAdminKey(): string {
  return localStorage.getItem('kuang-eat-admin-key') ?? ''
}

export function setAdminKey(key: string): void {
  localStorage.setItem('kuang-eat-admin-key', key)
}

export function hasAdminKey(): boolean {
  return !!getAdminKey()
}

export interface TriggerResponse {
  ok: boolean
  accepted?: boolean
  job?: Job
  error?: string
}

export interface ListJobsResponse {
  ok: boolean
  jobs: Job[]
  error?: string
}

export interface GetJobResponse {
  ok: boolean
  job?: Job
  error?: string
}

export interface ActiveMonitorResponse {
  ok: boolean
  monitor: Monitor | null
  error?: string
}

export interface AdminSettingsResponse {
  ok: boolean
  settings?: AppSettings
  error?: string
}

export async function triggerGrab(): Promise<TriggerResponse> {
  const res = await fetch(`${BACKEND_BASE}/api/trigger/grab`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Monitor-Secret': getAdminKey()
    },
    body: JSON.stringify({})
  })
  return (await res.json()) as TriggerResponse
}

export async function stopJob(jobId: string): Promise<GetJobResponse> {
  const res = await fetch(`${BACKEND_BASE}/api/jobs/${jobId}/stop`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Monitor-Secret': getAdminKey()
    },
    body: JSON.stringify({})
  })
  return (await res.json()) as GetJobResponse
}

export async function retryJob(jobId: string): Promise<TriggerResponse> {
  const res = await fetch(`${BACKEND_BASE}/api/jobs/${jobId}/retry`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Monitor-Secret': getAdminKey()
    },
    body: JSON.stringify({})
  })
  return (await res.json()) as TriggerResponse
}

export async function retryJobUser(jobId: string, openid: string): Promise<TriggerResponse> {
  const res = await fetch(`${BACKEND_BASE}/api/jobs/${jobId}/retry-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Monitor-Secret': getAdminKey()
    },
    body: JSON.stringify({ openid })
  })
  return (await res.json()) as TriggerResponse
}

export async function getAdminSettings(): Promise<AdminSettingsResponse> {
  const res = await fetch(`${BACKEND_BASE}/api/admin/settings`, {
    headers: {
      'X-Monitor-Secret': getAdminKey()
    }
  })
  return (await res.json()) as AdminSettingsResponse
}

export async function updateAdminSettings(payload: Partial<AppSettings>): Promise<AdminSettingsResponse> {
  const res = await fetch(`${BACKEND_BASE}/api/admin/settings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Monitor-Secret': getAdminKey()
    },
    body: JSON.stringify(payload)
  })
  return (await res.json()) as AdminSettingsResponse
}

export async function listJobs(limit = 20): Promise<ListJobsResponse> {
  const res = await fetch(`${BACKEND_BASE}/api/jobs?limit=${limit}`)
  return (await res.json()) as ListJobsResponse
}

export async function getJob(jobId: string): Promise<GetJobResponse> {
  const res = await fetch(`${BACKEND_BASE}/api/jobs/${jobId}`)
  return (await res.json()) as GetJobResponse
}

export async function getActiveMonitor(): Promise<ActiveMonitorResponse> {
  const res = await fetch(`${BACKEND_BASE}/api/monitor/active`)
  return (await res.json()) as ActiveMonitorResponse
}
