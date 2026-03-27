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

/** 地址项（获取地址列表） */
export interface AddressItem {
  id: number
  detailAddress: string
  addressType: number
  status: number
  [key: string]: unknown
}

export interface AddressListResponse {
  code: number
  msg: string
  data: AddressItem[]
}

/** 转让池列表请求体 */
export interface TransferPoolListBody {
  orderDate: string
  mealType?: string
  addressId?: string
}

/** 转让池单项 */
export interface TransferPoolItem {
  id: number
  orderId: number
  userName: string
  department: string
  orderDate: number
  mealType: number
  packageName: string
  sequenceChar: string
  addressId: number
  addressDetail: string
  orderTime?: string
  [key: string]: unknown
}

export interface TransferPoolListResponse {
  code: number
  msg: string
  data: TransferPoolItem[]
}
