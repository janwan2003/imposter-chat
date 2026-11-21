// A small D1-style wrapper over Durable Object SQLite storage, so the API code reads like ordinary D1 code:
// db.prepare(sql).bind(...).first() / .all() / .run(), and db.batch([...]) as one transaction.
class Stmt {
  constructor(sql, query, args = []) {
    this.sql = sql;
    this.query = query;
    this.args = args;
  }
  bind(...args) {
    return new Stmt(this.sql, this.query, args.map((a) => (a === undefined ? null : a)));
  }
  exec() {
    const cursor = this.sql.exec(this.query, ...this.args);
    const results = cursor.toArray();
    return { results, meta: { changes: cursor.rowsWritten } };
  }
  async first() {
    return this.exec().results[0] ?? null;
  }
  async all() {
    return this.exec();
  }
  async run() {
    return this.exec();
  }
}

export function d1(storage) {
  return {
    prepare: (query) => new Stmt(storage.sql, query),
    batch: async (stmts) => storage.transactionSync(() => stmts.map((s) => s.exec())),
  };
}
