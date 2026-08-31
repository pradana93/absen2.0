/** Minimal ambient types for sql.js (WASM SQLite). */
declare module "sql.js" {
  export interface Statement {
    bind(params?: unknown): boolean;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    run(params?: unknown): void;
    free(): void;
  }
  export interface Database {
    run(sql: string, params?: unknown): Database;
    exec(sql: string): { columns: string[]; values: unknown[][] }[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }
  export interface SqlJsStatic {
    Database: new (data?: Uint8Array) => Database;
  }
  export interface SqlJsConfig {
    locateFile?: (file: string) => string;
  }
  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}
