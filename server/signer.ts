import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultWasmPath = path.resolve(__dirname, '../public/wasm_encrypt_bg-DRD3eZ7J.wasm')

interface WasmExports {
  memory: WebAssembly.Memory
  __wbindgen_externrefs: WebAssembly.Table
  __externref_table_alloc: () => number
  __wbindgen_exn_store: (ref: number) => void
  __wbindgen_malloc: (size: number, align: number) => number
  __wbindgen_realloc: (ptr: number, oldSize: number, newSize: number, align: number) => number
  __wbindgen_free: (ptr: number, size: number, align: number) => void
  __wbindgen_start: () => void
  get_sign: (ptrTime: number, lenTime: number, ptrOpenid: number, lenOpenid: number) => [number, number]
}

let wasmExports: WasmExports | undefined
let cachedDataView: DataView | null = null
let cachedUint8: Uint8Array | null = null
let initPromise: Promise<void> | undefined
const textEncoder = new TextEncoder()
let lastStringWriteLen = 0

function Window() {}
const fakeWindow = Object.create(null)
fakeWindow.document = {}
fakeWindow.location = { href: '' }
fakeWindow.navigator = { webdriver: undefined }
Object.defineProperty(fakeWindow, 'constructor', {
  value: Window,
  writable: true,
  configurable: true
})

function dataView(): DataView {
  const mem = wasmExports?.memory
  if (!mem) throw new Error('wasm not initialized')
  if (cachedDataView === null || cachedDataView.buffer !== mem.buffer) {
    cachedDataView = new DataView(mem.buffer)
  }
  return cachedDataView
}

function memoryU8(): Uint8Array {
  const mem = wasmExports?.memory
  if (!mem) throw new Error('wasm not initialized')
  if (cachedUint8 === null || cachedUint8.buffer !== mem.buffer) {
    cachedUint8 = new Uint8Array(mem.buffer)
  }
  return cachedUint8
}

function isRefUnset(value: unknown): boolean {
  return value === null || value === undefined
}

function externRefTableSet(index: number, value: unknown): void {
  wasmExports?.__wbindgen_externrefs.set(index, value)
}

function externRefAlloc(value: unknown): number {
  const slot = wasmExports?.__externref_table_alloc()
  if (slot === undefined) throw new Error('externref alloc failed')
  externRefTableSet(slot, value)
  return slot
}

let utfDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true })
utfDecoder.decode()
let decoderUsed = 0
const decoderByteBudget = 2146435072

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
  realloc: (ptr: number, oldSize: number, newSize: number, align: number) => number
): number {
  const len = str.length
  let ptr = malloc(len, 1) >>> 0
  const mem = memoryU8()
  let writtenAscii = 0
  for (; writtenAscii < len; writtenAscii++) {
    const code = str.charCodeAt(writtenAscii)
    if (code > 127) break
    mem[ptr + writtenAscii] = code
  }
  if (writtenAscii === len) {
    lastStringWriteLen = len
    return ptr
  }
  const cap = writtenAscii + str.length * 3
  ptr = realloc(ptr, len, cap, 1) >>> 0
  const view = mem.subarray(ptr + writtenAscii, ptr + cap)
  const into = textEncoder.encodeInto(str.slice(writtenAscii), view)
  writtenAscii += into.written!
  ptr = realloc(ptr, cap, writtenAscii, 1) >>> 0
  lastStringWriteLen = writtenAscii
  return ptr
}

function wasmThrow(ptr: number, len: number): never {
  throw new Error(decodeUtf8(ptr, len))
}

function wasmImports(): WebAssembly.Imports {
  return {
    './wasm_encrypt_bg.js': {
      __wbg___wbindgen_boolean_get_c0f3f60bac5a78d1: (ref: unknown) => {
        const value = typeof ref === 'boolean' ? ref : undefined
        return isRefUnset(value) ? 16777215 : value ? 1 : 0
      },
      __wbg___wbindgen_is_undefined_52709e72fb9f179c: (value: unknown) => value === undefined,
      __wbg___wbindgen_string_get_395e606bd0ee4427: (outAddr: number, value: unknown) => {
        const text = typeof value === 'string' ? value : undefined
        const ptr = isRefUnset(text)
          ? 0
          : passStringToWasm(text as string, wasmExports!.__wbindgen_malloc, wasmExports!.__wbindgen_realloc)
        const len = lastStringWriteLen
        dataView().setInt32(outAddr + 4, len, true)
        dataView().setInt32(outAddr + 0, ptr, true)
      },
      __wbg___wbindgen_throw_6ddd609b62940d55: (ptr: number, len: number) => wasmThrow(ptr, len),
      __wbg_getOwnPropertyDescriptor_99c5c66035afe95e: (...args: unknown[]) => {
        try {
          return Reflect.getOwnPropertyDescriptor(args[0] as object, args[1] as PropertyKey)
        } catch (error) {
          const ref = externRefAlloc(error)
          wasmExports!.__wbindgen_exn_store(ref)
        }
      },
      __wbg_get_3ef1eba1850ade27: (...args: unknown[]) => {
        try {
          return Reflect.get(args[0] as object, args[1] as PropertyKey)
        } catch (error) {
          const ref = externRefAlloc(error)
          wasmExports!.__wbindgen_exn_store(ref)
        }
      },
      __wbg_has_926ef2ff40b308cf: (...args: unknown[]) => {
        try {
          return Reflect.has(args[0] as object, args[1] as PropertyKey)
        } catch (error) {
          const ref = externRefAlloc(error)
          wasmExports!.__wbindgen_exn_store(ref)
        }
      },
      __wbg_new_no_args_d15c5c26a5dbe2e7: (ptr: number, len: number) => new Function(decodeUtf8(ptr, len)),
      __wbg_static_accessor_GLOBAL_8adb955bd33fac2f: () => 0,
      __wbg_static_accessor_GLOBAL_THIS_ad356e0db91c7913: () => 0,
      __wbg_static_accessor_SELF_f207c857566db248: () => externRefAlloc(fakeWindow),
      __wbg_static_accessor_WINDOW_bb9f1ba69d61b386: () => externRefAlloc(fakeWindow),
      __wbg_toString_04ebde4c127f09ae: (value: { toString(): string }) => value.toString(),
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

async function initWasm(): Promise<void> {
  const wasmPath = process.env.KUANG_EAT_WASM_PATH || defaultWasmPath
  const bytes = await fs.readFile(wasmPath)
  const { instance } = await WebAssembly.instantiate(bytes, wasmImports())
  wasmExports = instance.exports as unknown as WasmExports
  cachedDataView = null
  cachedUint8 = null
  wasmExports.__wbindgen_start()
}

async function ensureWasm(): Promise<void> {
  if (wasmExports) return
  if (!initPromise) initPromise = initWasm()
  await initPromise
}

export async function antiForgeryHeaders(openid: string): Promise<{ 'x-time': string; 'x-sign': string }> {
  await ensureWasm()
  const timeStr = String(Math.round(Date.now() / 1000))
  let freePtr = 0
  let freeLen = 0
  try {
    const ptrTime = passStringToWasm(timeStr, wasmExports!.__wbindgen_malloc, wasmExports!.__wbindgen_realloc)
    const lenTime = lastStringWriteLen
    const ptrOpenid = passStringToWasm(openid, wasmExports!.__wbindgen_malloc, wasmExports!.__wbindgen_realloc)
    const lenOpenid = lastStringWriteLen
    const pair = wasmExports!.get_sign(ptrTime, lenTime, ptrOpenid, lenOpenid)
    freePtr = pair[0]
    freeLen = pair[1]
    return {
      'x-time': timeStr,
      'x-sign': decodeUtf8(pair[0], pair[1])
    }
  } finally {
    if (freePtr || freeLen) {
      wasmExports!.__wbindgen_free(freePtr, freeLen, 1)
    }
  }
}
