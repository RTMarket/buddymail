/**
 * 兼容性 polyfill：补齐 pdfjs-dist v5 等依赖在较老浏览器（如 Safari < 18.4）尚未支持的
 * 标准/草案方法。必须在任何 import 使用到 pdfjs / pdf-lib 等库之前最先加载。
 *
 * - Map.prototype.getOrInsert
 * - Map.prototype.getOrInsertComputed
 * - WeakMap.prototype.getOrInsert
 * - WeakMap.prototype.getOrInsertComputed
 *   (TC39 proposal-upsert，参考 https://github.com/tc39/proposal-upsert)
 *
 * - ReadableStream.prototype[Symbol.asyncIterator]
 *   pdfjs v5 内部 `getTextContent` 用了 `for await (const x of readableStream)`，
 *   Safari < 17.5 等环境里 ReadableStream 还没原生异步迭代器，会抛
 *   "undefined is not a function (near '...x of readableStream...')"。
 */

type MapLike<K, V> = Map<K, V> | WeakMap<object, V>;

function defineIfMissing<T extends MapLike<unknown, unknown>>(
  proto: T,
  name: string,
  impl: (this: T, ...args: unknown[]) => unknown
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (proto as any)[name] === "function") return;
  Object.defineProperty(proto, name, {
    value: impl,
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

defineIfMissing(Map.prototype, "getOrInsert", function (
  this: Map<unknown, unknown>,
  key: unknown,
  defaultValue: unknown
) {
  if (this.has(key)) return this.get(key);
  this.set(key, defaultValue);
  return defaultValue;
} as (this: Map<unknown, unknown>, ...args: unknown[]) => unknown);

defineIfMissing(Map.prototype, "getOrInsertComputed", function (
  this: Map<unknown, unknown>,
  key: unknown,
  callbackfn: (k: unknown) => unknown
) {
  if (this.has(key)) return this.get(key);
  const value = callbackfn(key);
  this.set(key, value);
  return value;
} as (this: Map<unknown, unknown>, ...args: unknown[]) => unknown);

defineIfMissing(WeakMap.prototype, "getOrInsert", function (
  this: WeakMap<object, unknown>,
  key: object,
  defaultValue: unknown
) {
  if (this.has(key)) return this.get(key);
  this.set(key, defaultValue);
  return defaultValue;
} as (this: WeakMap<object, unknown>, ...args: unknown[]) => unknown);

defineIfMissing(WeakMap.prototype, "getOrInsertComputed", function (
  this: WeakMap<object, unknown>,
  key: object,
  callbackfn: (k: object) => unknown
) {
  if (this.has(key)) return this.get(key);
  const value = callbackfn(key);
  this.set(key, value);
  return value;
} as (this: WeakMap<object, unknown>, ...args: unknown[]) => unknown);

if (typeof ReadableStream !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proto = ReadableStream.prototype as any;
  if (typeof proto[Symbol.asyncIterator] !== "function") {
    const asyncIterator = function (
      this: ReadableStream<unknown>,
      options?: { preventCancel?: boolean }
    ): AsyncIterableIterator<unknown> {
      const reader = this.getReader();
      const preventCancel = !!(options && options.preventCancel);
      const iterator: AsyncIterableIterator<unknown> = {
        next() {
          return reader.read().then(
            (result) => {
              if (result.done) {
                reader.releaseLock();
                return { value: undefined, done: true };
              }
              return { value: result.value, done: false };
            },
            (err) => {
              reader.releaseLock();
              throw err;
            }
          );
        },
        return(value?: unknown) {
          if (!preventCancel) {
            const cancelPromise = reader.cancel(value);
            reader.releaseLock();
            return cancelPromise.then(() => ({
              value,
              done: true,
            }));
          }
          reader.releaseLock();
          return Promise.resolve({ value, done: true });
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
      return iterator;
    };

    Object.defineProperty(proto, Symbol.asyncIterator, {
      value: asyncIterator,
      writable: true,
      configurable: true,
      enumerable: false,
    });
    if (typeof proto.values !== "function") {
      Object.defineProperty(proto, "values", {
        value: asyncIterator,
        writable: true,
        configurable: true,
        enumerable: false,
      });
    }
  }
}

export {};
