import { useState, useCallback } from 'react'
import { getMenu, createOrder } from '@/api/order'
import { parseKeywords, matchFirstMenuItem, matchFirstByStockCount } from '@/utils/keywords'
import { getWeekDates, getWeekdayLabel } from '@/utils/week'

const OPENID_KEY = 'kuang-eat-openid'

function toMealDate(dateStr: string): string {
  return dateStr ? dateStr.replace(/-/g, '') : ''
}

const MEAL_OPTIONS: { value: 1 | 2 | 3; label: string }[] = [
  { value: 1, label: '早餐' },
  { value: 2, label: '午餐' },
  { value: 3, label: '晚餐' }
]

/** 周一～周五，对应 weekDates 的 index 0～4 */
const WEEKDAY_OPTIONS = [0, 1, 2, 3, 4].map((i) => ({
  value: i,
  label: getWeekdayLabel(i)
}))

/** 匹配模式：关键词 或 按总量（stockCount） */
const MATCH_MODE_OPTIONS = [
  { value: 'keywords' as const, label: '关键词' },
  { value: 'stock' as const, label: '按总量' }
]

/** 单次抢饭中某天某餐的执行结果 */
interface RunDayResult {
  date: string
  dateLabel: string
  mealType: 1 | 2 | 3
  mealTypeLabel: string
  status: 'ordered' | 'no_match' | 'error'
  message?: string
  packageName?: string
}

function App() {
  const [openid, setOpenid] = useState(() => {
    try {
      return localStorage.getItem(OPENID_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [matchMode, setMatchMode] = useState<'keywords' | 'stock'>('keywords')
  const [keywords, setKeywords] = useState('金谷园')
  const [stockThreshold, setStockThreshold] = useState(200)
  const [selectedMealTypes, setSelectedMealTypes] = useState<(1 | 2 | 3)[]>([2])
  const [weekPick, setWeekPick] = useState(() => {
    const d = new Date()
    return d.toISOString().slice(0, 10)
  })
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([0, 1, 2, 3, 4])
  const [loading, setLoading] = useState(false)
  const [runResults, setRunResults] = useState<RunDayResult[]>([])
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error'; msg: string }>({ type: 'idle', msg: '' })

  const saveOpenid = useCallback((v: string) => {
    setOpenid(v)
    try {
      localStorage.setItem(OPENID_KEY, v)
    } catch {
      // ignore
    }
  }, [])

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

  const startGrab = useCallback(async () => {
    if (selectedWeekdays.length === 0) {
      setStatus({ type: 'error', msg: '请至少选择一天（周一～周五）' })
      return
    }
    if (selectedMealTypes.length === 0) {
      setStatus({ type: 'error', msg: '请至少选择一种餐次（早/午/晚餐）' })
      return
    }
    setLoading(true)
    setStatus({ type: 'idle', msg: '' })
    setRunResults([])
    const kw = parseKeywords(keywords)
    const results: RunDayResult[] = []
    const sortedDays = [...selectedWeekdays].sort((a, b) => a - b)
    const sortedMealTypes = [...selectedMealTypes].sort((a, b) => a - b)

    for (const dayIndex of sortedDays) {
      const dateStr = weekDates[dayIndex]
      const dateLabel = getWeekdayLabel(dayIndex)
      const ymd = toMealDate(dateStr)
      for (const mealType of sortedMealTypes) {
        const mealTypeLabel = MEAL_OPTIONS.find((o) => o.value === mealType)?.label ?? ''
        try {
          const res = await getMenu(mealType, ymd, openid)
          const list = res.data ?? []
          const matched =
            matchMode === 'keywords'
              ? matchFirstMenuItem(list, kw)
              : matchFirstByStockCount(list, stockThreshold)
          if (matched) {
            const orderRes = await createOrder(
              {
                mealType: String(matched.mealType),
                orderDate: String(matched.mealDate),
                packageName: matched.packageName,
                sequenceChar: matched.sequenceChar
              },
              openid
            )
            if (orderRes.code === 200) {
              results.push({
                date: dateStr,
                dateLabel,
                mealType,
                mealTypeLabel,
                status: 'ordered',
                message: orderRes.msg ?? '已下单',
                packageName: matched.packageName.replace(/\n/g, ' ')
              })
            } else {
              results.push({
                date: dateStr,
                dateLabel,
                mealType,
                mealTypeLabel,
                status: 'error',
                message: orderRes.msg ?? '下单失败'
              })
            }
          } else {
            const noMatchMsg =
              matchMode === 'keywords'
                ? (list.length === 0 ? '暂无菜单' : '未匹配到关键词')
                : (list.length === 0 ? '暂无菜单' : `无总量 < ${stockThreshold} 的套餐`)
            results.push({
              date: dateStr,
              dateLabel,
              mealType,
              mealTypeLabel,
              status: 'no_match',
              message: noMatchMsg
            })
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : '请求失败'
          results.push({
            date: dateStr,
            dateLabel,
            mealType,
            mealTypeLabel,
            status: 'error',
            message: msg
          })
        }
        setRunResults([...results])
      }
    }

    setLoading(false)
    const ordered = results.filter((r) => r.status === 'ordered').length
    const noMatch = results.filter((r) => r.status === 'no_match').length
    const err = results.filter((r) => r.status === 'error').length
    if (ordered > 0) setStatus({ type: 'success', msg: `完成：${ordered} 单下单，${noMatch} 单未匹配${err > 0 ? `，${err} 单失败` : ''}` })
    else if (err > 0) setStatus({ type: 'error', msg: `无下单成功，${err} 单失败` })
    else setStatus({ type: 'idle', msg: `全部未匹配` })
  }, [openid, matchMode, keywords, stockThreshold, weekPick, selectedWeekdays, selectedMealTypes, weekDates])

  return (
    <>
      <h1 className="page-title">狂吃</h1>
      <p className="page-desc">选择工作日、餐次与关键词，一键自动获取菜单并匹配下单</p>

      <section className="section">
        <h2 className="section-title">鉴权</h2>
        <label htmlFor="openid">OpenID（飞书）</label>
        <input
          id="openid"
          type="text"
          value={openid}
          onChange={(e) => saveOpenid(e.target.value)}
          placeholder="用于请求接口的 openid"
        />
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
            <label htmlFor="keywords">关键词（多个用逗号/空格分隔，匹配到第一个即下单）</label>
            <textarea
              id="keywords"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="例：金谷园、麦当劳、香肠"
            />
          </>
        )}
        {matchMode === 'stock' && (
          <>
            <label htmlFor="stockThreshold">总量低于（stockCount &lt; 此值则选中该套餐）</label>
            <input
              id="stockThreshold"
              type="number"
              min={1}
              value={stockThreshold}
              onChange={(e) => setStockThreshold(Number(e.target.value) || 0)}
            />
            <p className="input-hint">只选中总量小于该数值的第一个套餐，如 200 表示抢“总量在 200 以下”的饭</p>
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
            <button
              type="button"
              className="btn btn-chip"
              onClick={selectAllWeekdays}
            >
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
        <button
          type="button"
          className="btn btn-primary"
          onClick={startGrab}
          disabled={loading}
        >
          {loading ? '抢饭中…' : '开始抢饭'}
        </button>
      </section>

      {runResults.length > 0 && (
        <section className="section">
          <h2 className="section-title">执行结果</h2>
          <ul className="run-result-list">
            {runResults.map((r, i) => (
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
        </section>
      )}

      {status.msg && (
        <p className={`status ${status.type}`}>{status.msg}</p>
      )}
    </>
  )
}

export default App
