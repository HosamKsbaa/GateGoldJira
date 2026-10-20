declare module 'sidecar_sdk' {
  export class Response {
    constructor(body: string, options?: { contentType?: string; status?: number; headers?: Record<string, string> });
  }
  export class SidecarApp {
    page(path: string, handler: () => string | Response): void;
    api(path: string, handler: (data: unknown) => unknown | Promise<unknown>, method?: string): void;
    run(): Promise<import('node:http').Server>;
    close(): Promise<void>;
  }
}
