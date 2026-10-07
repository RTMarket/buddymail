/**
 * pdfjs-dist v5 worker 包装器：
 *
 * pdfjs 5.x 的 worker 端依赖 TC39 草案中的 Map/WeakMap upsert 方法（
 * `getOrInsert` / `getOrInsertComputed`），但 Safari < 18.4 等旧浏览器尚未原生支持。
 * 直接把官方 pdf.worker.min.mjs 设为 workerSrc 时，worker 全局缺这些方法会抛
 *   "C(this,bv).getOrInsertComputed is not a function"
 *
 * 这里通过一个自定义入口包成 worker bundle：先副作用导入 polyfill 给 worker 全局
 * 注入这些方法，再静态导入 pdfjs 官方 worker 源（其顶层副作用会自行注册 message
 * handler）。ESM 静态导入按依赖顺序自上而下执行，所以 polyfill 一定先于 pdfjs
 * worker 的代码运行。
 */
import "./polyfills";
import "pdfjs-dist/build/pdf.worker.min.mjs";

export {};
