/**
 * quill@1.3.7 未带 TS 声明；仅声明本页用到的 API
 */
declare module "quill" {
  export default class Quill {
    root: HTMLElement;
    container: HTMLElement;
    constructor(container: HTMLElement | string, options?: Record<string, unknown>);
    static import(path: string): unknown;
    static register(target: unknown, overwrite?: boolean): void;
    static find(node: Node): unknown;
    on(event: string, handler: (...args: unknown[]) => void): void;
    getSelection(focus?: boolean): { index: number; length: number } | null;
    setSelection(index: number, length?: number, source?: string): void;
    getIndex(blot: unknown): number;
    formatText(index: number, length: number, name: string, value: string, source?: string): void;
    insertEmbed(index: number, type: string, value: string, source?: string): void;
    getLength(): number;
    update(source?: string): void;
    clipboard: {
      dangerouslyPasteHTML(html: string, source?: string): void;
      dangerouslyPasteHTML(index: number, html: string, source?: string): void;
    };
  }
}
