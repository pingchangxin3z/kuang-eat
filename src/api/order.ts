import type { MenuListResponse, CreateOrderBody } from '@/types/order'

/** 开发时走 Vite 反向代理，避免 CORS；生产若部署同域可继续用相对路径 */
const BASE = ''
const REFERRER = 'https://order.hersweetie.com/feishu/order/work'

function defaultHeaders(openid: string, contentType?: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9',
    openid,
    'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin'
  }
  if (contentType) headers['content-type'] = contentType
  return headers
}

/**
 * 获取某天某顿餐的菜单
 * @param mealType 1 早餐 2 午餐 3 晚餐
 * @param mealDate 日期 YYYYMMDD 如 20260309
 */
export async function getMenu(
  mealType: 1 | 2 | 3,
  mealDate: string,
  openid: string
): Promise<MenuListResponse> {
  const url = `${BASE}/feishu-api/v2/dailymeals/list?mealType=${mealType}&mealDate=${mealDate}`
  const res = await fetch(url, {
    method: 'GET',
    headers: defaultHeaders(openid),
    referrer: `${REFERRER}?mealType=${mealType}&mealDate=${mealDate}`,
    mode: 'cors',
    credentials: 'include'
  })
  const data = (await res.json()) as MenuListResponse
  if (data.code !== 200) throw new Error(data.msg || '获取菜单失败')
  return data
}

/** 固定配送地址（与文档一致） */
const ADDRESS_ID = 118
const ADDRESS_DETAIL = '8层西侧吧台'

/**
 * 提交下单
 */
export async function createOrder(
  body: Omit<CreateOrderBody, 'addressId' | 'addressDetail'>,
  openid: string
): Promise<{ code: number; msg: string }> {
  const payload: CreateOrderBody = {
    ...body,
    addressId: ADDRESS_ID,
    addressDetail: ADDRESS_DETAIL
  }
  const res = await fetch(`${BASE}/feishu-api/order/create`, {
    method: 'POST',
    headers: defaultHeaders(openid, 'application/json;charset=UTF-8'),
    referrer: `${REFERRER}?mealType=${body.mealType}&mealDate=${body.orderDate}`,
    mode: 'cors',
    credentials: 'include',
    body: JSON.stringify(payload)
  })
  const data = (await res.json()) as { code: number; msg: string }
  return data
}
