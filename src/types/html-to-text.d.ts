declare module 'html-to-text' {
  interface SelectorOptions {
    selector: string;
    options?: Record<string, unknown>;
    format?: string;
  }

  interface ConvertOptions {
    wordwrap?: number | false;
    selectors?: SelectorOptions[];
  }

  export function convert(html: string, options?: ConvertOptions): string;
}
