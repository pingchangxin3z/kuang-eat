/** 菜单单项 */
export interface MenuItem {
  id: number
  mealDate: number
  mealType: number
  packageName: string
  sequenceChar: string
  stockCount: number
  orderedCount: number
  stockRemaining: number
  status: number
}

/** 获取菜单列表接口响应 */
export interface MenuListResponse {
  code: number
  msg: string
  data: MenuItem[]
}

/** 下单请求体 */
export interface CreateOrderBody {
  mealType: string
  orderDate: string
  packageName: string
  sequenceChar: string
  addressId: number
  addressDetail: string
}

/** 餐次：1 早餐 2 午餐 3 晚餐 */
export type MealType = 1 | 2 | 3
