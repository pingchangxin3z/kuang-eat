import { useState, useCallback, useEffect } from 'react'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'

import { getMenu, createOrder, getAddressList } from '@/api/order'
import { parseKeywords, matchFirstMenuItem, matchFirstByStockCount } from '@/utils/keywords'
import { getWeekDates, getWeekdayLabel } from '@/utils/week'
import { notifyOnGrabSuccess, notifyOnGrabFail } from '@/utils/notify'
import type { AddressItem, MenuItem } from '@/types/order'

const USERS_KEY = 'kuang-eat-users'
const OPENID_KEY = 'kuang-eat-openid'
const NICKNAME_KEY = 'kuang-eat-nickname'

const FEISHU_WEBHOOK = (import.meta.env.VITE_FEISHU_WEBHOOK ?? '').trim()

function toMealDate(dateStr: string): string {
  return dateStr ? dateStr.replace(/-/g, '') : ''
}

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

interface RunDayResult {
  date: string
  dateLabel: string
  mealType: 1 | 2 | 3
  mealTypeLabel: string
  status: 'ordered' | 'no_match' | 'error'
  message?: string
  packageName?: string
}

interface RunOrderTaskParams {
  openid: string
  weekPick: string
  selectedWeekdays: number[]
  selectedMealTypes: (1 | 2 | 3)[]
  matchMode: 'keywords' | 'stock'
  keywords: string
  stockThresholdBreakfastDinner: number
  stockThresholdLunch: number
  addressId: number
  addressDetail: string
}

async function runOrderTask(
  params: RunOrderTaskParams,
  onProgress?: (results: RunDayResult[]) => void
): Promise<RunDayResult[]> {
  const {
    openid,
    weekPick,
    selectedWeekdays,
    selectedMealTypes,
    matchMode,
    keywords,
    stockThresholdBreakfastDinner,
    stockThresholdLunch,
    addressId,
    addressDetail
  } = params
  const weekDates = getWeekDates(weekPick)
  const kw = parseKeywords(keywords)
  const sortedDays = [...selectedWeekdays].sort((a, b) => a - b)
  const sortedMealTypes = [...selectedMealTypes].sort((a, b) => a - b)

  const tasks: { dayIndex: number; dateStr: string; dateLabel: string; mealType: 1 | 2 | 3; mealTypeLabel: string }[] = []
  for (const dayIndex of sortedDays) {
    const dateStr = weekDates[dayIndex]
    const dateLabel = getWeekdayLabel(dayIndex)
    for (const mealType of sortedMealTypes) {
      const mealTypeLabel = MEAL_OPTIONS.find((o) => o.value === mealType)?.label ?? ''
      tasks.push({ dayIndex, dateStr, dateLabel, mealType, mealTypeLabel })
    }
  }

  const results: RunDayResult[] = []

  for (const t of tasks) {
    const { dateStr, dateLabel, mealType, mealTypeLabel } = t
    const threshold =
      mealType === 2 ? stockThresholdLunch : stockThresholdBreakfastDinner

    let list: MenuItem[] = []
    try {
      const res = await getMenu(mealType, toMealDate(dateStr), openid)
      list = res.data ?? []
    } catch (e) {
      const msg = e instanceof Error ? e.message : '获取菜单失败'
      results.push({ date: dateStr, dateLabel, mealType, mealTypeLabel, status: 'error', message: msg })
      onProgress?.([...results])
      continue
    }

    const matched =
      matchMode === 'keywords'
        ? matchFirstMenuItem(list, kw)
        : matchFirstByStockCount(list, threshold)

    if (matched) {
      try {
        const orderRes = await createOrder(
          {
            mealType: String(matched.mealType),
            orderDate: String(matched.mealDate),
            packageName: matched.packageName,
            sequenceChar: matched.sequenceChar
          },
          openid,
          addressId,
          addressDetail
        )
        if (orderRes.code === 200) {
          results.push({
            date: dateStr, dateLabel, mealType, mealTypeLabel,
            status: 'ordered',
            message: orderRes.msg ?? '已下单',
            packageName: matched.packageName.replace(/\n/g, ' ')
          })
        } else {
          results.push({ date: dateStr, dateLabel, mealType, mealTypeLabel, status: 'error', message: orderRes.msg ?? '下单失败' })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : '下单请求失败'
        results.push({ date: dateStr, dateLabel, mealType, mealTypeLabel, status: 'error', message: msg })
      }
    } else {
      const noMatchMsg =
        matchMode === 'keywords'
          ? (list.length === 0 ? '暂无菜单' : '未匹配到关键词')
          : (list.length === 0 ? '暂无菜单' : `无总量 ≤ ${threshold} 的套餐`)
      results.push({ date: dateStr, dateLabel, mealType, mealTypeLabel, status: 'no_match', message: noMatchMsg })
    }
    onProgress?.([...results])
  }

  return results
}

/* ─── 多用户配置 ─── */

interface UserConfig {
  id: string
  openid: string
  nickname: string
}

interface UserRunResult {
  userId: string
  nickname: string
  results: RunDayResult[]
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function loadUsers(): UserConfig[] {
  try {
    const saved = localStorage.getItem(USERS_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
    const oldOpenid = localStorage.getItem(OPENID_KEY) ?? ''
    const oldNickname = localStorage.getItem(NICKNAME_KEY) ?? ''
    if (oldOpenid) {
      return [{ id: generateId(), openid: oldOpenid, nickname: oldNickname }]
    }
  } catch { /* ignore */ }
  return [{ id: generateId(), openid: '', nickname: '' }]
}

function persistUsers(users: UserConfig[]): void {
  try { localStorage.setItem(USERS_KEY, JSON.stringify(users)) } catch { /* ignore */ }
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
  const [loading, setLoading] = useState(false)
  const [userResults, setUserResults] = useState<UserRunResult[]>([])
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error'; msg: string }>({ type: 'idle', msg: '' })
  const [addressList, setAddressList] = useState<AddressItem[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(118)

  const updateUsers = useCallback((next: UserConfig[]) => {
    setUsers(next)
    persistUsers(next)
  }, [])

  const addUser = useCallback(() => {
    updateUsers([...users, { id: generateId(), openid: '', nickname: '' }])
  }, [users, updateUsers])

  const removeUser = useCallback((id: string) => {
    const next = users.filter((u) => u.id !== id)
    updateUsers(next.length > 0 ? next : [{ id: generateId(), openid: '', nickname: '' }])
  }, [users, updateUsers])

  const updateUser = useCallback(
    (id: string, field: 'openid' | 'nickname', value: string) => {
      updateUsers(users.map((u) => (u.id === id ? { ...u, [field]: value } : u)))
    },
    [users, updateUsers]
  )

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

  const firstOpenid = users.find((u) => u.openid.trim())?.openid ?? ''

  useEffect(() => {
    if (!firstOpenid) {
      setAddressList([])
      return
    }
    getAddressList(firstOpenid)
      .then((res) => setAddressList(res.data ?? []))
      .catch(() => setAddressList([]))
  }, [firstOpenid])

  const getSharedTaskParams = useCallback((): Omit<RunOrderTaskParams, 'openid'> => {
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

  const handleStartOrder = useCallback(async () => {
    const validUsers = users.filter((u) => u.openid.trim())
    if (validUsers.length === 0) {
      setStatus({ type: 'error', msg: '请至少添加一个有效用户（填写 OpenID）' })
      return
    }
    if (selectedWeekdays.length === 0) {
      setStatus({ type: 'error', msg: '请至少选择一天（周一～周五）' })
      return
    }
    if (selectedMealTypes.length === 0) {
      setStatus({ type: 'error', msg: '请至少选择一种餐次（早/午/晚餐）' })
      return
    }
    if (
      matchMode === 'stock' &&
      (parseStockThreshold(stockThresholdBreakfastDinnerInput) === null ||
        parseStockThreshold(stockThresholdLunchInput) === null)
    ) {
      setStatus({ type: 'error', msg: '请输入有效的总量数值（≥0 的整数）' })
      return
    }

    setLoading(true)
    setUserResults(validUsers.map((u) => ({ userId: u.id, nickname: u.nickname.trim() || u.openid.trim(), results: [] })))
    setStatus({ type: 'idle', msg: `正在为 ${validUsers.length} 位用户点餐…` })

    const shared = getSharedTaskParams()

    const promises = validUsers.map((user) => {
      const params: RunOrderTaskParams = { ...shared, openid: user.openid }
      return runOrderTask(params, (results) => {
        setUserResults((prev) =>
          prev.map((ur) => (ur.userId === user.id ? { ...ur, results: [...results] } : ur))
        )
      }).then((results) => {
        const displayName = user.nickname.trim()
        const ordered = results.filter((r) => r.status === 'ordered').length
        const noMatch = results.filter((r) => r.status === 'no_match').length
        const err = results.filter((r) => r.status === 'error').length

        if (ordered > 0) {
          const summary = `完成：${ordered} 单下单，${noMatch} 单未匹配${err > 0 ? `，${err} 单失败` : ''}`
          const detail = results
            .filter((r) => r.status === 'ordered')
            .map((r) => `${r.dateLabel} ${r.mealTypeLabel}：${r.packageName ?? ''}`)
            .join('\n')
          notifyOnGrabSuccess(FEISHU_WEBHOOK, displayName, summary, detail || '无').catch(() => {})
        } else {
          const failSummary = err > 0 ? `无下单成功，${err} 单失败` : '全部未匹配'
          notifyOnGrabFail(FEISHU_WEBHOOK, displayName, failSummary).catch(() => {})
        }

        return results
      })
    })

    const settled = await Promise.allSettled(promises)

    let totalOrdered = 0
    let totalNoMatch = 0
    let totalErr = 0
    for (const s of settled) {
      if (s.status === 'fulfilled') {
        for (const r of s.value) {
          if (r.status === 'ordered') totalOrdered++
          else if (r.status === 'no_match') totalNoMatch++
          else totalErr++
        }
      } else {
        totalErr++
      }
    }

    if (totalOrdered > 0) {
      setStatus({
        type: 'success',
        msg: `完成：${validUsers.length} 人，${totalOrdered} 单下单，${totalNoMatch} 单未匹配${totalErr > 0 ? `，${totalErr} 单失败` : ''}`
      })
    } else {
      const failMsg = totalErr > 0 ? `无下单成功，${totalErr} 单失败` : '全部未匹配'
      setStatus({ type: totalErr > 0 ? 'error' : 'idle', msg: failMsg })
    }

    setLoading(false)
  }, [users, matchMode, stockThresholdBreakfastDinnerInput, stockThresholdLunchInput, selectedWeekdays, selectedMealTypes, getSharedTaskParams])

  return (
    <ConfigProvider locale={zhCN}>
    <div className="app-layout">
      <div className="app-main">
      <h1 className="page-title">狂吃</h1>
      <p className="page-desc">选择工作日、餐次与匹配规则，点击「开始点餐」立即拉取菜单并下单</p>

      <section className="section">
        <h2 className="section-title">用户</h2>
        {users.map((user, idx) => (
          <div key={user.id} className="user-row">
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
            <button
              type="button"
              className="btn btn-chip user-row__remove"
              onClick={() => removeUser(user.id)}
              title="删除此用户"
            >
              删除
            </button>
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
            onClick={() => void handleStartOrder()}
            disabled={loading}
            style={{ width: '100%', flex: '1 1 auto' }}
          >
            {loading ? '点餐中…' : '开始点餐'}
          </button>
        </div>
        <p className="input-hint" style={{ marginTop: '0.5rem' }}>
          按当前偏好立即为所有用户拉取各天各餐菜单并尝试下单；各用户并行执行、互不影响。
        </p>
      </section>

      {userResults.length > 0 && userResults.map((ur) => (
        <section key={ur.userId} className="section">
          <h2 className="section-title">执行结果 — {ur.nickname}</h2>
          {ur.results.length === 0 ? (
            <p className="status">等待中…</p>
          ) : (
            <ul className="run-result-list">
              {ur.results.map((r, i) => (
                <li key={`${r.date}-${r.mealType}-${i}`} className={`run-result run-result--${r.status}`}>
                  <span className="run-result__day">{r.dateLabel} {r.mealTypeLabel}（{r.date}）</span>
                  <span className="run-result__msg">
                    {r.status === 'ordered' && (r.packageName ?? r.message)}
                    {r.status === 'no_match' && (r.message ?? '未匹配')}
                    {r.status === 'error' && (r.message ?? '失败')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {status.msg && (
        <p className={`status ${status.type}`}>{status.msg}</p>
      )}
      </div>
    </div>
    </ConfigProvider>
  )
}

export default App
