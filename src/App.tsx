import { useState, useCallback, useEffect } from 'react'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'

import { getAddressList } from '@/api/order'
import { cancelMonitor, getMonitorStatuses, registerMonitor, type MonitorUserStatus } from '@/api/monitor'
import { getWeekDates, getWeekdayLabel } from '@/utils/week'
import type { AddressItem } from '@/types/order'

const USERS_KEY = 'kuang-eat-users'
const OPENID_KEY = 'kuang-eat-openid'
const NICKNAME_KEY = 'kuang-eat-nickname'

function parseStockThreshold(input: string): number | null {
  const s = input.trim()
  if (s === '') return null
  const n = parseInt(s, 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

const MEAL_OPTIONS: { value: 1 | 2 | 3; label: string }[] = [
  { value: 1, label: '早餐' },
  { value: 2, label: '午餐' },
  { value: 3, label: '晚餐' }
]

const WEEKDAY_OPTIONS = [0, 1, 2, 3, 4, 5, 6].map((i) => ({
  value: i,
  label: getWeekdayLabel(i)
}))

const MATCH_MODE_OPTIONS = [
  { value: 'keywords' as const, label: '关键词' },
  { value: 'stock' as const, label: '按总量' }
]

type MonitorStatusState = 'idle' | 'loading' | 'monitored' | 'disabled' | 'missing' | 'error'

/* ─── 多用户配置 ─── */

interface UserConfig {
  id: string
  openid: string
  nickname: string
  enabled: boolean
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function normalizeUserConfig(user: Partial<UserConfig>): UserConfig {
  return {
    id: user.id || generateId(),
    openid: user.openid ?? '',
    nickname: user.nickname ?? '',
    enabled: user.enabled ?? true
  }
}

function createEmptyUser(): UserConfig {
  return { id: generateId(), openid: '', nickname: '', enabled: true }
}

function loadUsers(): UserConfig[] {
  try {
    const saved = localStorage.getItem(USERS_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(normalizeUserConfig)
    }
    const oldOpenid = localStorage.getItem(OPENID_KEY) ?? ''
    const oldNickname = localStorage.getItem(NICKNAME_KEY) ?? ''
    if (oldOpenid) {
      return [{ id: generateId(), openid: oldOpenid, nickname: oldNickname, enabled: true }]
    }
  } catch { /* ignore */ }
  return [createEmptyUser()]
}

function persistUsers(users: UserConfig[]): void {
  try { localStorage.setItem(USERS_KEY, JSON.stringify(users)) } catch { /* ignore */ }
}

function statusForUser(user: UserConfig, statuses: Record<string, MonitorUserStatus>, loading: boolean, error: boolean): MonitorStatusState {
  const openid = user.openid.trim()
  if (!openid) return 'idle'
  if (loading) return 'loading'
  if (error) return 'error'
  const status = statuses[openid]
  if (!status || !status.monitored) return 'missing'
  return status.enabled ? 'monitored' : 'disabled'
}

function getStatusLabel(status: MonitorStatusState): string {
  switch (status) {
    case 'loading': return '查询中'
    case 'monitored': return '监控中'
    case 'disabled': return '已停用'
    case 'missing': return '未监控'
    case 'error': return '查询失败'
    default: return '未填写'
  }
}

/* ─── App ─── */

function App() {
  const [users, setUsers] = useState<UserConfig[]>(loadUsers)
  const [matchMode, setMatchMode] = useState<'keywords' | 'stock'>('stock')
  const [keywords, setKeywords] = useState('金谷园')
  const [stockThresholdBreakfastDinnerInput, setStockThresholdBreakfastDinnerInput] = useState('200')
  const [stockThresholdLunchInput, setStockThresholdLunchInput] = useState('100')
  const [selectedMealTypes, setSelectedMealTypes] = useState<(1 | 2 | 3)[]>([2])
  const [weekPick, setWeekPick] = useState(() => {
    const d = new Date()
    const day = d.getDay()
    const daysToAdd = day === 1 ? 7 : (8 - day) % 7
    d.setDate(d.getDate() + daysToAdd)
    return d.toISOString().slice(0, 10)
  })
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([0, 1, 2, 3, 4])
  const [savingMonitor, setSavingMonitor] = useState(false)
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error'; msg: string }>({ type: 'idle', msg: '' })
  const [addressList, setAddressList] = useState<AddressItem[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(118)
  const [monitorStatuses, setMonitorStatuses] = useState<Record<string, MonitorUserStatus>>({})
  const [loadingMonitorStatus, setLoadingMonitorStatus] = useState(false)
  const [monitorStatusError, setMonitorStatusError] = useState(false)
  const [cancellingOpenids, setCancellingOpenids] = useState<string[]>([])

  const updateUsers = useCallback((next: UserConfig[]) => {
    setUsers(next)
    persistUsers(next)
  }, [])

  const addUser = useCallback(() => {
    updateUsers([...users, createEmptyUser()])
  }, [users, updateUsers])

  const removeUser = useCallback((id: string) => {
    const next = users.filter((u) => u.id !== id)
    updateUsers(next.length > 0 ? next : [createEmptyUser()])
  }, [users, updateUsers])

  const updateUser = useCallback(
    (id: string, field: 'openid' | 'nickname', value: string) => {
      updateUsers(users.map((u) => (u.id === id ? { ...u, [field]: value } : u)))
    },
    [users, updateUsers]
  )

  const toggleUserEnabled = useCallback((id: string) => {
    updateUsers(users.map((u) => (u.id === id ? { ...u, enabled: !u.enabled } : u)))
  }, [users, updateUsers])

  const toggleWeekday = useCallback((index: number) => {
    setSelectedWeekdays((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].sort((a, b) => a - b)
    )
  }, [])

  const selectAllWeekdays = useCallback(() => {
    setSelectedWeekdays([0, 1, 2, 3, 4])
  }, [])

  const toggleMealType = useCallback((value: 1 | 2 | 3) => {
    setSelectedMealTypes((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value].sort((a, b) => a - b)
    )
  }, [])

  const selectAllMealTypes = useCallback(() => {
    setSelectedMealTypes([1, 2, 3])
  }, [])

  const weekDates = getWeekDates(weekPick)
  const selectedAddress = addressList.find((a) => a.id === selectedAddressId)

  const firstOpenid = users.find((u) => u.enabled && u.openid.trim())?.openid ?? ''
  const userOpenidKey = users.map((u) => u.openid.trim()).filter(Boolean).join('|')

  const refreshMonitorStatuses = useCallback(async () => {
    const openids = [...new Set(users.map((u) => u.openid.trim()).filter(Boolean))]
    if (openids.length === 0) {
      setMonitorStatuses({})
      setLoadingMonitorStatus(false)
      setMonitorStatusError(false)
      return
    }
    setLoadingMonitorStatus(true)
    setMonitorStatusError(false)
    try {
      const res = await getMonitorStatuses(openids)
      setMonitorStatuses(Object.fromEntries(res.statuses.map((item) => [item.openid, item])))
    } catch {
      setMonitorStatusError(true)
    } finally {
      setLoadingMonitorStatus(false)
    }
  }, [users])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshMonitorStatuses()
    }, 300)
    return () => window.clearTimeout(timer)
  }, [refreshMonitorStatuses, userOpenidKey])

  useEffect(() => {
    if (!firstOpenid) {
      setAddressList([])
      return
    }
    getAddressList(firstOpenid)
      .then((res) => setAddressList(res.data ?? []))
      .catch(() => setAddressList([]))
  }, [firstOpenid])

  const getMonitorSettings = useCallback(() => {
    const stockThresholdBreakfastDinner =
      matchMode === 'stock' ? (parseStockThreshold(stockThresholdBreakfastDinnerInput) ?? 0) : 0
    const stockThresholdLunch =
      matchMode === 'stock' ? (parseStockThreshold(stockThresholdLunchInput) ?? 0) : 0
    return {
      weekPick,
      selectedWeekdays,
      selectedMealTypes,
      matchMode,
      keywords,
      stockThresholdBreakfastDinner,
      stockThresholdLunch,
      addressId: selectedAddress?.id ?? 118,
      addressDetail: selectedAddress?.detailAddress ?? '8层西侧吧台'
    }
  }, [weekPick, selectedWeekdays, selectedMealTypes, matchMode, keywords, stockThresholdBreakfastDinnerInput, stockThresholdLunchInput, selectedAddress])

  const validateMonitorInputs = useCallback((validUserCount: number): boolean => {
    if (validUserCount === 0) {
      setStatus({ type: 'error', msg: '请至少勾选一个有效用户（填写 OpenID）' })
      return false
    }
    if (selectedWeekdays.length === 0) {
      setStatus({ type: 'error', msg: '请至少选择一天（周一～周五）' })
      return false
    }
    if (selectedMealTypes.length === 0) {
      setStatus({ type: 'error', msg: '请至少选择一种餐次（早/午/晚餐）' })
      return false
    }
    if (
      matchMode === 'stock' &&
      (parseStockThreshold(stockThresholdBreakfastDinnerInput) === null ||
        parseStockThreshold(stockThresholdLunchInput) === null)
    ) {
      setStatus({ type: 'error', msg: '请输入有效的总量数值（≥0 的整数）' })
      return false
    }
    return true
  }, [matchMode, selectedMealTypes, selectedWeekdays, stockThresholdBreakfastDinnerInput, stockThresholdLunchInput])

  const handleStartMonitor = useCallback(async () => {
    const monitorUsers = users.filter((u) => u.openid.trim())
    const enabledUserCount = monitorUsers.filter((u) => u.enabled).length
    if (!validateMonitorInputs(enabledUserCount)) return

    setSavingMonitor(true)
    setStatus({ type: 'idle', msg: `正在登记 ${monitorUsers.length} 位用户的监控配置…` })
    try {
      await registerMonitor({
        users: monitorUsers.map((user) => ({
          id: user.id,
          openid: user.openid.trim(),
          nickname: user.nickname.trim(),
          enabled: user.enabled
        })),
        settings: getMonitorSettings()
      })
      setStatus({
        type: 'success',
        msg:
          enabledUserCount > 1
            ? `当前提交的 ${enabledUserCount} 个 OpenID 已在监控中。等待飞书请求后端触发接口。`
            : '当前 OpenID 已在监控中。等待飞书请求后端触发接口。'
      })
      await refreshMonitorStatuses()
    } catch (e) {
      const msg = e instanceof Error ? e.message : '发起监控失败'
      setStatus({ type: 'error', msg })
    } finally {
      setSavingMonitor(false)
    }
  }, [getMonitorSettings, refreshMonitorStatuses, users, validateMonitorInputs])

  const handleCancelMonitor = useCallback(async (user: UserConfig) => {
    const openid = user.openid.trim()
    if (!openid) return
    if (!window.confirm('确认取消这个 OpenID 的监控吗？')) return

    setCancellingOpenids((prev) => (prev.includes(openid) ? prev : [...prev, openid]))
    setStatus({ type: 'idle', msg: '正在取消监控…' })
    try {
      const res = await cancelMonitor([openid])
      setMonitorStatuses((prev) => ({
        ...prev,
        ...Object.fromEntries(res.statuses.map((item) => [item.openid, item]))
      }))
      updateUsers(users.map((item) => (item.id === user.id ? { ...item, enabled: false } : item)))
      setStatus({ type: 'success', msg: '当前 OpenID 已取消监控。' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : '取消监控失败'
      setStatus({ type: 'error', msg })
    } finally {
      setCancellingOpenids((prev) => prev.filter((item) => item !== openid))
    }
  }, [updateUsers, users])

  return (
    <ConfigProvider locale={zhCN}>
    <div className="app-layout">
      <div className="app-main">
      <h1 className="page-title">狂吃</h1>
      <p className="page-desc">选择工作日、餐次与匹配规则，点击「发起监控」保存到后端；飞书请求触发接口后才会执行抢饭</p>

      <section className="section">
        <h2 className="section-title">用户</h2>
        {users.map((user, idx) => (
          <div key={user.id} className="user-row">
            {(() => {
              const rowStatus = statusForUser(user, monitorStatuses, loadingMonitorStatus, monitorStatusError)
              const openid = user.openid.trim()
              const cancelling = cancellingOpenids.includes(openid)
              return (
                <>
            <label className="user-row__enabled" title="是否参与本次点餐">
              <input
                type="checkbox"
                checked={user.enabled}
                onChange={() => toggleUserEnabled(user.id)}
              />
              <span>抢</span>
            </label>
            <span className="user-row__index">{idx + 1}</span>
            <input
              type="text"
              value={user.openid}
              onChange={(e) => updateUser(user.id, 'openid', e.target.value)}
              placeholder="OpenID（飞书）"
              className="user-row__openid"
            />
            <input
              type="text"
              value={user.nickname}
              onChange={(e) => updateUser(user.id, 'nickname', e.target.value)}
              placeholder="昵称"
              className="user-row__nickname"
            />
            <span className={`user-row__monitor-status user-row__monitor-status--${rowStatus}`}>
              {getStatusLabel(rowStatus)}
            </span>
            <button
              type="button"
              className="btn btn-chip user-row__cancel"
              onClick={() => void handleCancelMonitor(user)}
              disabled={rowStatus !== 'monitored' || cancelling}
              title="取消此 OpenID 的监控"
            >
              {cancelling ? '取消中' : '取消监控'}
            </button>
            <button
              type="button"
              className="btn btn-chip user-row__remove"
              onClick={() => removeUser(user.id)}
              title="删除此用户"
            >
              删除
            </button>
                </>
              )
            })()}
          </div>
        ))}
        <button type="button" className="btn btn-secondary" style={{ marginTop: '0.5rem' }} onClick={addUser}>
          + 添加用户
        </button>
        <div style={{ marginTop: '1rem' }}>
          <label htmlFor="address">配送地址（所有用户共用）</label>
          <select
            id="address"
            value={selectedAddressId ?? ''}
            onChange={(e) => setSelectedAddressId(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value={118}>8层西侧吧台（默认）</option>
            {addressList.filter((a) => a.id !== 118).map((a) => (
              <option key={a.id} value={a.id}>
                {a.detailAddress}
              </option>
            ))}
          </select>
          {addressList.length === 0 && firstOpenid && (
            <p className="input-hint">加载中…</p>
          )}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">偏好</h2>
        <label>选择模式</label>
        <div className="mode-options">
          {MATCH_MODE_OPTIONS.map((o) => (
            <label key={o.value} className="chip-label">
              <input
                type="radio"
                name="matchMode"
                checked={matchMode === o.value}
                onChange={() => setMatchMode(o.value)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
        {matchMode === 'keywords' && (
          <>
            <label htmlFor="keywords">关键词（多个用逗号/空格/回车/顿号分隔，匹配到第一个即下单）</label>
            <textarea
              id="keywords"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="例：金谷园、达美乐、好开心"
            />
          </>
        )}
        {matchMode === 'stock' && (
          <>
            <div className="row">
              <div>
                <label htmlFor="stockThresholdBd">早餐/晚餐 总量阈值</label>
                <input
                  id="stockThresholdBd"
                  type="text"
                  inputMode="numeric"
                  value={stockThresholdBreakfastDinnerInput}
                  onChange={(e) => setStockThresholdBreakfastDinnerInput(e.target.value)}
                  placeholder="默认 200"
                />
              </div>
              <div>
                <label htmlFor="stockThresholdLunch">午餐 总量阈值</label>
                <input
                  id="stockThresholdLunch"
                  type="text"
                  inputMode="numeric"
                  value={stockThresholdLunchInput}
                  onChange={(e) => setStockThresholdLunchInput(e.target.value)}
                  placeholder="默认 100"
                />
              </div>
            </div>
            <p className="input-hint">早餐/晚餐使用 200（默认），午餐使用 100（默认）；选中总量 ≤ 阈值的第一个套餐</p>
          </>
        )}
        <div style={{ marginTop: '1rem' }}>
          <label>餐次（多选）</label>
          <div className="weekday-chips">
            <button type="button" className="btn btn-chip" onClick={selectAllMealTypes}>
              全选
            </button>
            {MEAL_OPTIONS.map((o) => (
              <label key={o.value} className="chip-label">
                <input
                  type="checkbox"
                  checked={selectedMealTypes.includes(o.value)}
                  onChange={() => toggleMealType(o.value)}
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <label htmlFor="weekPick">订餐周</label>
          <input
            id="weekPick"
            type="date"
            value={weekPick}
            onChange={(e) => setWeekPick(e.target.value)}
            title="选该周内任意一天即可，用于确定是哪一周"
          />
          <p className="input-hint">选该周任意一天，下面会显示该周日期范围</p>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <label>工作日（多选）</label>
          <div className="weekday-chips">
            <button type="button" className="btn btn-chip" onClick={selectAllWeekdays}>
              全选
            </button>
            {WEEKDAY_OPTIONS.map((o) => (
              <label key={o.value} className="chip-label">
                <input
                  type="checkbox"
                  checked={selectedWeekdays.includes(o.value)}
                  onChange={() => toggleWeekday(o.value)}
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
          <p className="status" style={{ marginTop: '0.375rem', marginBottom: 0 }}>
            订餐周：{weekDates[0]} ～ {weekDates[6]}（周一～周日）
          </p>
        </div>
        <div className="action-row">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void handleStartMonitor()}
            disabled={savingMonitor}
            style={{ width: '100%', flex: '1 1 auto' }}
          >
            {savingMonitor ? '登记中…' : '发起监控'}
          </button>
        </div>
        <p className="input-hint" style={{ marginTop: '0.5rem' }}>
          后端会保存当前配置；飞书请求后端触发接口时，才会按这份配置为已勾选用户执行抢饭。
        </p>
      </section>

      {status.msg && (
        <p className={`status ${status.type}`}>{status.msg}</p>
      )}
      </div>
    </div>
    </ConfigProvider>
  )
}

export default App
