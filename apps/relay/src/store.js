// 저장소 구현. 저장하는 것은 keyId · 봉투(from, iv, ct, ts) · receivedAt 뿐이다.
// 인터페이스:
//   insert(row)                      row = { id, keyId, from, iv, ct, ts, receivedAt }
//   list(keyId, { from, after, limit, notBefore })  → rows (id 오름차순)
//   deleteOne(keyId, id)             → boolean
//   deleteAll(keyId)                 → number (삭제 건수)
//   sweep(before)                    → number (receivedAt < before 인 것 삭제)
//   count()                          → number
//   close()

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function pickRow(r) {
  return { id: r.id, keyId: r.keyId, from: r.from, iv: r.iv, ct: r.ct, ts: r.ts, receivedAt: r.receivedAt };
}

/** 메모리 저장소 (+ 선택적 JSON 파일 영속화). */
export class MemoryStore {
  /** @param {{ file?: string, saveDelayMs?: number }} [opts] */
  constructor(opts = {}) {
    /** @type {Map<string, Array<object>>} keyId → rows (id 오름차순) */
    this.boxes = new Map();
    this.file = opts.file || null;
    this.saveDelayMs = opts.saveDelayMs ?? 500;
    this._saveTimer = null;
    this._dirty = false;
    if (this.file) this._load();
  }

  _load() {
    if (!existsSync(this.file)) return;
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8'));
      for (const r of Array.isArray(data?.rows) ? data.rows : []) {
        if (!r || typeof r.id !== 'string' || typeof r.keyId !== 'string') continue;
        this._box(r.keyId).push(pickRow(r));
      }
      for (const rows of this.boxes.values()) rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    } catch (err) {
      console.error(`[relay] data file load failed (${this.file}): ${err.message}`);
    }
  }

  _scheduleSave() {
    if (!this.file) return;
    this._dirty = true;
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.flush();
    }, this.saveDelayMs);
    this._saveTimer.unref?.();
  }

  /** 즉시 디스크에 기록 (원자적 교체). */
  flush() {
    if (!this.file || !this._dirty) return;
    this._dirty = false;
    const rows = [];
    for (const list of this.boxes.values()) rows.push(...list);
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify({ v: 1, rows }));
      renameSync(tmp, this.file);
    } catch (err) {
      console.error(`[relay] data file save failed (${this.file}): ${err.message}`);
    }
  }

  _box(keyId) {
    let rows = this.boxes.get(keyId);
    if (!rows) {
      rows = [];
      this.boxes.set(keyId, rows);
    }
    return rows;
  }

  insert(row) {
    this._box(row.keyId).push(pickRow(row));
    this._scheduleSave();
  }

  list(keyId, { from = null, after = null, limit = 200, notBefore = 0 } = {}) {
    const rows = this.boxes.get(keyId);
    if (!rows) return [];
    const out = [];
    for (const r of rows) {
      if (from && r.from !== from) continue;
      if (after && !(r.id > after)) continue;
      if (r.receivedAt < notBefore) continue;
      out.push(r);
      if (out.length >= limit) break;
    }
    return out;
  }

  deleteOne(keyId, id) {
    const rows = this.boxes.get(keyId);
    if (!rows) return false;
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) return false;
    rows.splice(i, 1);
    if (rows.length === 0) this.boxes.delete(keyId);
    this._scheduleSave();
    return true;
  }

  deleteAll(keyId) {
    const rows = this.boxes.get(keyId);
    if (!rows) return 0;
    this.boxes.delete(keyId);
    this._scheduleSave();
    return rows.length;
  }

  sweep(before) {
    let n = 0;
    for (const [keyId, rows] of this.boxes) {
      const kept = rows.filter((r) => r.receivedAt >= before);
      n += rows.length - kept.length;
      if (kept.length === 0) this.boxes.delete(keyId);
      else if (kept.length !== rows.length) this.boxes.set(keyId, kept);
    }
    if (n) this._scheduleSave();
    return n;
  }

  count() {
    let n = 0;
    for (const rows of this.boxes.values()) n += rows.length;
    return n;
  }

  close() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this.flush();
  }
}

/** SQLite 저장소 (node:sqlite, Node 22.5+ / 24 내장). */
export class SqliteStore {
  /** @param {string} path 파일 경로 (":memory:" 가능) */
  constructor(path, DatabaseSync) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS messages (
        id          TEXT PRIMARY KEY,
        key_id      TEXT NOT NULL,
        from_side   TEXT NOT NULL,
        iv          TEXT NOT NULL,
        ct          TEXT NOT NULL,
        ts          TEXT NOT NULL,
        received_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS messages_box ON messages (key_id, id);
      CREATE INDEX IF NOT EXISTS messages_received ON messages (received_at);
    `);
    this.stmts = {
      insert: this.db.prepare(
        'INSERT INTO messages (id, key_id, from_side, iv, ct, ts, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ),
      list: this.db.prepare(
        `SELECT id, key_id AS keyId, from_side AS "from", iv, ct, ts, received_at AS receivedAt
         FROM messages
         WHERE key_id = ? AND (? IS NULL OR from_side = ?) AND (? IS NULL OR id > ?) AND received_at >= ?
         ORDER BY id ASC LIMIT ?`,
      ),
      deleteOne: this.db.prepare('DELETE FROM messages WHERE key_id = ? AND id = ?'),
      deleteAll: this.db.prepare('DELETE FROM messages WHERE key_id = ?'),
      sweep: this.db.prepare('DELETE FROM messages WHERE received_at < ?'),
      count: this.db.prepare('SELECT COUNT(*) AS n FROM messages'),
    };
  }

  static async open(path) {
    const { DatabaseSync } = await import('node:sqlite');
    return new SqliteStore(path, DatabaseSync);
  }

  insert(row) {
    this.stmts.insert.run(row.id, row.keyId, row.from, row.iv, row.ct, row.ts, row.receivedAt);
  }

  list(keyId, { from = null, after = null, limit = 200, notBefore = 0 } = {}) {
    return this.stmts.list.all(keyId, from, from, after, after, notBefore, limit);
  }

  deleteOne(keyId, id) {
    return this.stmts.deleteOne.run(keyId, id).changes > 0;
  }

  deleteAll(keyId) {
    return Number(this.stmts.deleteAll.run(keyId).changes);
  }

  sweep(before) {
    return Number(this.stmts.sweep.run(before).changes);
  }

  count() {
    return Number(this.stmts.count.get().n);
  }

  close() {
    this.db.close();
  }
}

/** 환경변수에 따라 저장소를 고른다. RELAY_DB → SQLite, RELAY_DATA_FILE → JSON 파일, 그 외 메모리. */
export async function openStoreFromEnv(env = process.env) {
  if (env.RELAY_DB) {
    const store = await SqliteStore.open(env.RELAY_DB);
    return { store, kind: `sqlite:${env.RELAY_DB}` };
  }
  if (env.RELAY_DATA_FILE) {
    return { store: new MemoryStore({ file: env.RELAY_DATA_FILE }), kind: `memory+file:${env.RELAY_DATA_FILE}` };
  }
  return { store: new MemoryStore(), kind: 'memory' };
}
