/**
 * 获取某天所在周的周一日期 (YYYY-MM-DD)
 * 一周按周一至周日
 */
export function getMondayOfWeek(isoDateStr: string): string {
  const d = new Date(isoDateStr + 'T12:00:00')
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

/**
 * 获取某周整周的 7 个日期 [周一, ..., 周日] (YYYY-MM-DD)
 */
export function getWeekDates(isoDateStr: string): string[] {
  const monday = getMondayOfWeek(isoDateStr)
  const dates: string[] = []
  const d = new Date(monday + 'T12:00:00')
  for (let i = 0; i < 7; i++) {
    dates.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return dates
}

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

export function getWeekdayLabel(index: number): string {
  return WEEKDAY_LABELS[index] ?? ''
}
