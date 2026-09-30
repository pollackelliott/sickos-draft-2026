import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { D1Database, D1PreparedStatement, D1Result } from '../../src/server/d1-types.js';

class SqlitePreparedStatement implements D1PreparedStatement {
  constructor(
    private readonly db: DatabaseSync,
    readonly query: string,
    readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new SqlitePreparedStatement(this.db, this.query, values);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const stmt = this.db.prepare(this.query);
    const row = stmt.get(...(this.values as SQLInputValue[]));
    return (row as T | undefined) ?? null;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const stmt = this.db.prepare(this.query);
    const rows = stmt.all(...(this.values as SQLInputValue[])) as T[];
    return { success: true, results: rows, meta: { changes: 0 } };
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const stmt = this.db.prepare(this.query);
    const result = stmt.run(...(this.values as SQLInputValue[]));
    return {
      success: true,
      results: [],
      meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) },
    };
  }
}

export class SqliteD1 implements D1Database {
  readonly db = new DatabaseSync(':memory:');

  constructor(migrationSql: string) {
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec(migrationSql);
  }

  prepare(query: string): D1PreparedStatement {
    return new SqlitePreparedStatement(this.db, query);
  }

  async batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const sqliteStatements = statements as SqlitePreparedStatement[];
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const results: D1Result<T>[] = [];
      for (const statement of sqliteStatements) {
        results.push(await statement.run<T>());
      }
      this.db.exec('COMMIT;');
      return results;
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}
