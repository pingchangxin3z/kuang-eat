/**
 * 智谱订餐接口校验头：与原站 order.hersweetie.com 一致，由 wasm get_sign(时间戳字符串, openid) 生成 x-sign
 * WASM 来自同站点前端 wasm-bindgen 0.2.114，见 public/wasm_encrypt_bg-DRD3eZ7J.wasm
 */

/** wasm-bindgen 导出（仅列出本模块用到的） */
type FeishuWasmExports = WebAssembly.Exports & {
  memory: WebAssembly.Memory
  get_sign: (ptrT: number, lenT: number, ptrO: number, lenO: number) => [number, number]
  __wbindgen_malloc: (size: number, align: number) => number
  __wbindgen_realloc: (ptr: number, oldSize: number, newSize: number, align: number) => number
  __wbindgen_free: (ptr: number, size: number, align: number) => void
  __wbindgen_start: () => void
  __externref_table_alloc: () => number
  __wbindgen_externrefs: WebAssembly.Table
  __wbindgen_exn_store: (externIdx: number) => void
}

let wasmExports: FeishuWasmExports | undefined
let wasmInitPromise: Promise<void> | undefined

let cachedDataView: DataView | null = null
function dataView(): DataView {
  const mem = wasmExports?.memory
  if (!mem) {
    throw new Error('feishu wasm 未初始化')
  }
  if (cachedDataView === null || cachedDataView.buffer !== mem.buffer) {
    cachedDataView = new DataView(mem.buffer)
  }
  return cachedDataView
}

let cachedUint8: Uint8Array | null = null
function memoryU8(): Uint8Array {
  const mem = wasmExports?.memory
  if (!mem) {
    throw new Error('feishu wasm 未初始化')
  }
  if (cachedUint8 === null || cachedUint8.buffer !== mem.buffer) {
    cachedUint8 = new Uint8Array(mem.buffer)
  }
  return cachedUint8
}

const textEncoder = new TextEncoder()
if (!('encodeInto' in textEncoder)) {
  ;(textEncoder as TextEncoder & { encodeInto: (input: string, dest: Uint8Array) => { read: number; written: number } }).encodeInto =
    function encInto(input: string, dest: Uint8Array) {
      const buf = new TextEncoder().encode(input)
      dest.set(buf)
      return { read: input.length, written: buf.length }
    }
}

let lastStringWriteLen = 0

function isRefUnset(x: unknown): x is null | undefined {
  return x === null || x === undefined
}

function externRefTableSet(idx: number, val: unknown): void {
  wasmExports?.__wbindgen_externrefs.set(idx, val)
}

function externRefAlloc(val: unknown): number {
  const slot = wasmExports?.__externref_table_alloc()
  if (slot === undefined) {
    throw new Error('externref alloc 失败')
  }
  externRefTableSet(slot, val)
  return slot
}

function wasmThrow(ptr: number, len: number): never {
  throw new Error(decodeUtf8(ptr, len))
}

function wasmImports(): WebAssembly.Imports {
  return {
    './wasm_encrypt_bg.js': {
      __wbg___wbindgen_boolean_get_c0f3f60bac5a78d1: (ref: unknown) => {
        const v = typeof ref === 'boolean' ? ref : undefined
        return isRefUnset(v) ? 16777215 : v ? 1 : 0
      },
      __wbg___wbindgen_is_undefined_52709e72fb9f179c: (v: unknown) => v === undefined,
      __wbg___wbindgen_string_get_395e606bd0ee4427: (outAddr: number, value: unknown) => {
        const s = typeof value === 'string' ? value : undefined
        const ptr = isRefUnset(s)
          ? 0
          : passStringToWasm(s, wasmExports!.__wbindgen_malloc, wasmExports!.__wbindgen_realloc)
        const len = lastStringWriteLen
        dataView().setInt32(outAddr + 4, len, true)
        dataView().setInt32(outAddr + 0, ptr, true)
      },
      __wbg___wbindgen_throw_6ddd609b62940d55: (ptr: number, len: number) => {
        wasmThrow(ptr, len)
      },
      __wbg_getOwnPropertyDescriptor_99c5c66035afe95e: (...args: unknown[]) => {
        try {
          const fn = Reflect.getOwnPropertyDescriptor as (t: object, p: PropertyKey) => PropertyDescriptor | undefined
          return fn(args[0] as object, args[1] as PropertyKey)
        } catch (e) {
          const o = externRefAlloc(e)
          wasmExports!.__wbindgen_exn_store(o)
        }
      },
      __wbg_get_3ef1eba1850ade27: (...args: unknown[]) => {
        try {
          return Reflect.get(args[0] as object, args[1] as PropertyKey)
        } catch (e) {
          const o = externRefAlloc(e)
          wasmExports!.__wbindgen_exn_store(o)
        }
      },
      __wbg_has_926ef2ff40b308cf: (...args: unknown[]) => {
        try {
          return Reflect.has(args[0] as object, args[1] as PropertyKey)
        } catch (e) {
          const o = externRefAlloc(e)
          wasmExports!.__wbindgen_exn_store(o)
        }
      },
      __wbg_new_no_args_d15c5c26a5dbe2e7: (ptr: number, len: number) =>
        new Function(decodeUtf8(ptr, len)),
      __wbg_static_accessor_GLOBAL_8adb955bd33fac2f: () => {
        const w = globalThis as unknown as { global?: unknown }
        const v = w.global !== undefined ? w.global : null
        return isRefUnset(v) ? 0 : externRefAlloc(v)
      },
      __wbg_static_accessor_GLOBAL_THIS_ad356e0db91c7913: () => {
        const v = typeof globalThis !== 'undefined' ? globalThis : null
        return isRefUnset(v) ? 0 : externRefAlloc(v)
      },
      __wbg_static_accessor_SELF_f207c857566db248: () => {
        const v = typeof self !== 'undefined' ? self : null
        return isRefUnset(v) ? 0 : externRefAlloc(v)
      },
      __wbg_static_accessor_WINDOW_bb9f1ba69d61b386: () => {
        const v = typeof window !== 'undefined' ? window : null
        return isRefUnset(v) ? 0 : externRefAlloc(v)
      },
      __wbg_toString_04ebde4c127f09ae: (v: { toString: () => string }) => v.toString(),
      __wbindgen_cast_0000000000000001: (ptr: number, len: number) => decodeUtf8(ptr, len),
      __wbindgen_init_externref_table: () => {
        const table = wasmExports!.__wbindgen_externrefs
        const prev = table.grow(4)
        table.set(0, undefined)
        table.set(prev + 0, undefined)
        table.set(prev + 1, null)
        table.set(prev + 2, true)
        table.set(prev + 3, false)
      }
    }
  }
}

let utfDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true })
utfDecoder.decode()
const decoderByteBudget = 2146435072
let decoderUsed = 0

function decodeUtf8(ptr: number, len: number): string {
  ptr = ptr >>> 0
  decoderUsed += len
  if (decoderUsed >= decoderByteBudget) {
    utfDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true })
    utfDecoder.decode()
    decoderUsed = len
  }
  return utfDecoder.decode(memoryU8().subarray(ptr, ptr + len))
}

function passStringToWasm(
  str: string,
  malloc: (size: number, align: number) => number,
  realloc?: (ptr: number, oldSize: number, newSize: number, align: number) => number
): number {
  if (realloc === undefined) {
    const encoded = textEncoder.encode(str)
    const ptr = malloc(encoded.length, 1) >>> 0
    memoryU8().subarray(ptr, ptr + encoded.length).set(encoded)
    lastStringWriteLen = encoded.length
    return ptr
  }
  const len = str.length
  let ptr = malloc(len, 1) >>> 0
  const mem = memoryU8()
  let writtenAscii = 0
  for (; writtenAscii < len; writtenAscii++) {
    const c = str.charCodeAt(writtenAscii)
    if (c > 127) break
    mem[ptr + writtenAscii] = c
  }
  if (writtenAscii === len) {
    lastStringWriteLen = len
    return ptr
  }
  const cap = writtenAscii + str.length * 3
  if (writtenAscii !== 0) {
    str = str.slice(writtenAscii)
    ptr = realloc(ptr, len, cap, 1) >>> 0
  } else {
    ptr = realloc(ptr, len, cap, 1) >>> 0
  }
  const view = mem.subarray(ptr + writtenAscii, ptr + cap)
  const into = textEncoder.encodeInto(str, view)
  writtenAscii += into.written
  ptr = realloc(ptr, cap, writtenAscii, 1) >>> 0
  lastStringWriteLen = writtenAscii
  return ptr
}

function finalizeInstance(instance: WebAssembly.Instance): FeishuWasmExports {
  wasmExports = instance.exports as FeishuWasmExports
  cachedDataView = null
  cachedUint8 = null
  wasmExports.__wbindgen_start()
  return wasmExports
}

function corsModeOk(t: string): boolean {
  return t === 'basic' || t === 'cors' || t === 'default'
}

async function instantiateWasm(bytesOrMod: ArrayBuffer | WebAssembly.Module, imports: WebAssembly.Imports): Promise<WebAssembly.Instance> {
  if (bytesOrMod instanceof WebAssembly.Module) {
    return await WebAssembly.instantiate(bytesOrMod, imports)
  }
  const { instance } = await WebAssembly.instantiate(bytesOrMod, imports)
  return instance
}

async function instantiateFromResponse(response: Response, imports: WebAssembly.Imports): Promise<WebAssembly.Instance> {
  if (typeof WebAssembly.instantiateStreaming === 'function') {
    try {
      const out = await WebAssembly.instantiateStreaming(response, imports)
      return out.instance
    } catch (e) {
      const ok = response.ok && corsModeOk(response.type) && response.headers.get('Content-Type') !== 'application/wasm'
      if (ok) {
        console.warn(
          'WebAssembly.instantiateStreaming 失败（MIME 或网络），回退到 ArrayBuffer 实例化',
          e
        )
      } else {
        throw e
      }
    }
  }
  const buf = await response.arrayBuffer()
  return instantiateWasm(buf, imports)
}

async function loadWasmOnce(): Promise<void> {
  if (wasmExports !== undefined) {
    return
  }
  const wasmPath = `${import.meta.env.BASE_URL}wasm_encrypt_bg-DRD3eZ7J.wasm`
  const resp = fetch(wasmPath)
  const imports = wasmImports()
  const res = await resp
  const instance = await instantiateFromResponse(res, imports)
  finalizeInstance(instance)
}

export function initFeishuSignWasm(): Promise<void> {
  if (wasmInitPromise === undefined) {
    wasmInitPromise = loadWasmOnce()
  }
  return wasmInitPromise
}

function computeXSign(timeStr: string, openid: string): string {
  const wasm = wasmExports
  if (!wasm) {
    throw new Error('feishu wasm 未初始化')
  }
  let freePtr = 0
  let freeLen = 0
  try {
    const pT = passStringToWasm(timeStr, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc)
    const lenT = lastStringWriteLen
    const pO = passStringToWasm(openid, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc)
    const lenO = lastStringWriteLen
    const pair = wasm.get_sign(pT, lenT, pO, lenO) as [number, number]
    freePtr = pair[0]
    freeLen = pair[1]
    return decodeUtf8(pair[0], pair[1])
  } finally {
    wasm.__wbindgen_free(freePtr, freeLen, 1)
  }
}

/** 与官方前端 axios 拦截器一致的时间戳与签名 */
export async function getFeishuAntiForgeryHeaders(openid: string): Promise<{ 'x-sign': string; 'x-time': string }> {
  await initFeishuSignWasm()
  const timeSec = Math.round(Date.now() / 1000)
  const timeStr = String(timeSec)
  const xSign = computeXSign(timeStr, openid)
  return { 'x-sign': xSign, 'x-time': timeStr }
}

