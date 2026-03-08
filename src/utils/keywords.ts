import type { MenuItem } from '@/types/order'

/** 从用户输入解析出关键词数组（支持逗号、空格、换行、顿号等） */
export function parseKeywords(input: string): string[] {
  if (!input || !input.trim()) return []
  return input
    .split(/[,，\s\n、]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * 在菜单中按关键词匹配：任一关键词出现在 packageName 中即视为匹配
 * 返回第一个匹配的菜单项；多个匹配时取列表中的第一个
 */
export function matchFirstMenuItem(
  items: MenuItem[],
  keywords: string[]
): MenuItem | null {
  if (!keywords.length) return null
  const lowerKeywords = keywords.map((k) => k.toLowerCase())
  for (const item of items) {
    const name = item.packageName.toLowerCase()
    const matched = lowerKeywords.some((kw) => name.includes(kw))
    if (matched) return item
  }
  return null
}

/**
 * 按总量（stockCount）匹配：选中第一个 stockCount < threshold 的套餐
 * 用于抢“限量”的饭
 */
export function matchFirstByStockCount(
  items: MenuItem[],
  threshold: number
): MenuItem | null {
  if (!Number.isFinite(threshold)) return null
  for (const item of items) {
    if (item.stockCount < threshold) return item
  }
  return null
}
