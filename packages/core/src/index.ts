// CORE_VERSION 是证据协议版本（bundle/链格式，随 bundle schemaVersion 协调演进），
// 与 packages/core/package.json 的包版本（发布节奏）无关，二者独立演进。
export const CORE_VERSION = '0.1.0';

export * from './entities';
export * from './canonical';
export * from './hashchain';
export * from './bundle';
export * from './refid';
