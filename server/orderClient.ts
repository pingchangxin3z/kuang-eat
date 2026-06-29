import { antiForgeryHeaders } from './signer.js'
import type { MenuItem } from './types.js'

const REFERRER_BASE = 'https://order.hersweetie.com/feishu/order/work'
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36'

export class OrderApiError extends Error {
  payload: unknown

  constructor(message: string, payload?: unknown) {
    super(message)
    this.name = 'OrderApiError'
    this.payload = payload
  }
}

export class OrderClient {
  private baseUrl: string
  private timeoutMs: number

  constructor(options: { baseUrl?: string; timeoutMs?: number } = {}) {
    this.baseUrl = (options.baseUrl || process.env.ORDER_BASE_URL || 'https://order.hersweetie.com').replace(/\/$/, '')
    this.timeoutMs = Number(options.timeoutMs || process.env.ORDER_REQUEST_TIMEOUT_MS || 10000)
  }

  async getMenu(openid: string, mealType: number, mealDate: string): Promise<MenuItem[]> {
    const url = new URL(`${this.baseUrl}/feishu-api/v2/dailymeals/list`)
    url.searchParams.set('mealType', String(mealType))
    url.searchParams.set('mealDate', mealDate)
    const payload = await this.fetchJson(url.toString(), {
      method: 'GET',
      headers: await this.headers(openid, undefined, `${REFERRER_BASE}?mealType=${mealType}&mealDate=${mealDate}`)
    })
    this.assertApiOk(payload, '获取菜单失败')
    return Array.isArray(payload.data) ? payload.data : []
  }

  async createOrder(
    openid: string,
    item: MenuItem,
    addressId: number,
    addressDetail: string
  ): Promise<{ code?: number; msg?: string; [key: string]: unknown }> {
    const body = {
      mealType: String(item.mealType),
      orderDate: String(item.mealDate),
      packageName: item.packageName,
      sequenceChar: item.sequenceChar,
      addressId,
      addressDetail
    }
    const payload = await this.fetchJson(`${this.baseUrl}/feishu-api/order/create`, {
      method: 'POST',
      headers: await this.headers(
        openid,
        'application/json;charset=UTF-8',
        `${REFERRER_BASE}?mealType=${item.mealType}&mealDate=${item.mealDate}`
      ),
      body: JSON.stringify(body)
    })
    return payload
  }

  private async headers(
    openid: string,
    contentType?: string,
    referer: string = REFERRER_BASE
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      accept: 'application/json, text/plain, */*',
      'accept-language': 'zh-CN,zh;q=0.9',
      openid,
      referer,
      'user-agent': USER_AGENT,
      'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      ...(await antiForgeryHeaders(openid))
    }
    if (contentType) headers['content-type'] = contentType
    return headers
  }

  private async fetchJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(url, { ...init, signal: controller.signal })
      const text = await response.text()
      let payload: Record<string, unknown>
      try {
        payload = text ? JSON.parse(text) : {}
      } catch {
        throw new OrderApiError(`接口返回的不是合法 JSON：${text.slice(0, 120)}`, { status: response.status })
      }
      if (!response.ok) {
        throw new OrderApiError(`HTTP ${response.status}`, payload)
      }
      return payload
    } catch (error: unknown) {
      if ((error as Error)?.name === 'AbortError') {
        throw new OrderApiError(`请求超时：${this.timeoutMs}ms`)
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  private assertApiOk(payload: Record<string, unknown>, fallback: string): void {
    if (Number(payload?.code) !== 200) {
      throw new OrderApiError(String(payload?.msg || fallback), payload)
    }
  }
}
