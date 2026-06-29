import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AppSettings, Job, Monitor, Storage } from './types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultDataFile = path.resolve(__dirname, 'data/monitor-state.json')

interface State {
  monitor: Monitor | null
  jobs: Job[]
  appSettings: AppSettings
}

function defaultAppSettings(): AppSettings {
  return {
    feishuNotifyEnabled: true,
    updatedAt: new Date().toISOString()
  }
}

function emptyState(): State {
  return { monitor: null, jobs: [], appSettings: defaultAppSettings() }
}

function normalizeAppSettings(value: Partial<AppSettings> | null | undefined): AppSettings {
  const defaults = defaultAppSettings()
  return {
    feishuNotifyEnabled: value?.feishuNotifyEnabled !== false,
    updatedAt: value?.updatedAt || defaults.updatedAt
  }
}

function toPositiveInt(value: unknown, fallback: number): number {
  const next = Number(value)
  return Number.isFinite(next) && next > 0 ? Math.trunc(next) : fallback
}

export class JsonStorage implements Storage {
  private filePath: string

  constructor(filePath = process.env.MONITOR_STATE_FILE || defaultDataFile) {
    this.filePath = filePath
  }

  async init(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    try {
      await fs.access(this.filePath)
    } catch {
      await this.writeState(emptyState())
    }
  }

  async getAppSettings(): Promise<AppSettings> {
    const state = await this.readState()
    return state.appSettings
  }

  async saveAppSettings(settings: AppSettings): Promise<AppSettings> {
    const state = await this.readState()
    state.appSettings = normalizeAppSettings(settings)
    await this.writeState(state)
    return state.appSettings
  }

  async getMonitor(): Promise<Monitor | null> {
    const state = await this.readState()
    return state.monitor || null
  }

  async saveMonitor(monitor: Monitor): Promise<Monitor> {
    const state = await this.readState()
    state.monitor = monitor
    await this.writeState(state)
    return monitor
  }

  async saveJob(job: Job): Promise<Job> {
    const state = await this.readState()
    const index = state.jobs.findIndex((item) => item.id === job.id)
    if (index >= 0) state.jobs[index] = job
    else state.jobs.unshift(job)
    state.jobs = state.jobs.slice(0, 100)
    await this.writeState(state)
    return job
  }

  async getJob(id: string): Promise<Job | null> {
    const state = await this.readState()
    return state.jobs.find((job) => job.id === id) || null
  }

  async listJobs(limit = 20): Promise<Job[]> {
    const state = await this.readState()
    return state.jobs.slice(0, limit)
  }

  private async readState(): Promise<State> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8')
      const parsed = { ...emptyState(), ...JSON.parse(raw) } as State
      parsed.appSettings = normalizeAppSettings(parsed.appSettings)
      return parsed
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return emptyState()
      throw error
    }
  }

  private async writeState(state: State): Promise<void> {
    const tempPath = `${this.filePath}.tmp`
    await fs.writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    await fs.rename(tempPath, this.filePath)
  }
}

export class PostgresStorage implements Storage {
  private connectionString: string | undefined
  private pool: import('pg').Pool | null = null

  constructor(connectionString = process.env.DATABASE_URL) {
    this.connectionString = connectionString
  }

  async init(): Promise<void> {
    if (!this.connectionString) {
      throw new Error('STORAGE_DRIVER=postgres requires DATABASE_URL')
    }
    const pg = await import('pg')
    this.pool = new pg.default.Pool({
      connectionString: this.connectionString,
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: toPositiveInt(process.env.PG_CONNECTION_TIMEOUT_MS, 5000),
      query_timeout: toPositiveInt(process.env.PG_QUERY_TIMEOUT_MS, 10000)
    })
    await this.pool.query(`
      create table if not exists kuang_eat_monitor_state (
        key text primary key,
        value jsonb not null,
        updated_at timestamptz not null default now()
      )
    `)
    await this.pool.query(`
      create table if not exists kuang_eat_monitor_jobs (
        id text primary key,
        status text not null,
        trigger_payload jsonb,
        result jsonb,
        error text,
        created_at timestamptz not null,
        updated_at timestamptz not null
      )
    `)
  }

  async getMonitor(): Promise<Monitor | null> {
    const result = await this.pool!.query('select value from kuang_eat_monitor_state where key = $1', ['active'])
    return (result.rows[0]?.value as Monitor) || null
  }

  async getAppSettings(): Promise<AppSettings> {
    const result = await this.pool!.query('select value from kuang_eat_monitor_state where key = $1', ['app-settings'])
    return normalizeAppSettings((result.rows[0]?.value as AppSettings) || null)
  }

  async saveAppSettings(settings: AppSettings): Promise<AppSettings> {
    const normalized = normalizeAppSettings(settings)
    await this.pool!.query(
      `
        insert into kuang_eat_monitor_state(key, value, updated_at)
        values ($1, $2::jsonb, now())
        on conflict (key) do update set value = excluded.value, updated_at = now()
      `,
      ['app-settings', JSON.stringify(normalized)]
    )
    return normalized
  }

  async saveMonitor(monitor: Monitor): Promise<Monitor> {
    await this.pool!.query(
      `
        insert into kuang_eat_monitor_state(key, value, updated_at)
        values ($1, $2::jsonb, now())
        on conflict (key) do update set value = excluded.value, updated_at = now()
      `,
      ['active', JSON.stringify(monitor)]
    )
    return monitor
  }

  async saveJob(job: Job): Promise<Job> {
    await this.pool!.query(
      `
        insert into kuang_eat_monitor_jobs(id, status, trigger_payload, result, error, created_at, updated_at)
        values ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7)
        on conflict (id) do update set
          status = excluded.status,
          trigger_payload = excluded.trigger_payload,
          result = excluded.result,
          error = excluded.error,
          updated_at = excluded.updated_at
      `,
      [
        job.id,
        job.status,
        JSON.stringify(job.triggerPayload || null),
        JSON.stringify(job.result || null),
        job.error || null,
        job.createdAt,
        job.updatedAt
      ]
    )
    return job
  }

  async getJob(id: string): Promise<Job | null> {
    const result = await this.pool!.query(
      `
        select id, status, trigger_payload, result, error, created_at, updated_at
        from kuang_eat_monitor_jobs
        where id = $1
      `,
      [id]
    )
    return this.rowToJob(result.rows[0])
  }

  async listJobs(limit = 20): Promise<Job[]> {
    const result = await this.pool!.query(
      `
        select id, status, trigger_payload, result, error, created_at, updated_at
        from kuang_eat_monitor_jobs
        order by created_at desc
        limit $1
      `,
      [limit]
    )
    return result.rows.map((row: Record<string, unknown>) => this.rowToJob(row)).filter((j): j is Job => j !== null)
  }

  private rowToJob(row: Record<string, unknown> | undefined): Job | null {
    if (!row) return null
    return {
      id: row.id as string,
      status: row.status as Job['status'],
      triggerPayload: row.trigger_payload,
      result: row.result as Job['result'],
      error: (row.error as string) || null,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at as string),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : (row.updated_at as string)
    }
  }
}

export function createStorage(): Storage {
  const driver = (process.env.STORAGE_DRIVER || (process.env.DATABASE_URL ? 'postgres' : 'json')).toLowerCase()
  if (driver === 'postgres' || driver === 'pg') return new PostgresStorage()
  return new JsonStorage()
}
