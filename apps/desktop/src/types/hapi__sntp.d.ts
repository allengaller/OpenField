// @hapi/sntp@4 不随包发布类型声明（lib/ 仅有 index.js），此处提供最小 Ambient 声明。
// 完整 API 见 https://hapi.dev/family/sntp/api ；若后续安装 @types/hapi__sntp 或包自带类型，可删除本文件。
declare module '@hapi/sntp' {
  export interface SntpOffsetOptions {
    host?: string;
    port?: number;
    timeout?: number;
    [key: string]: unknown;
  }

  const Sntp: {
    offset(options?: SntpOffsetOptions): Promise<number>;
  };
  export default Sntp;
}
