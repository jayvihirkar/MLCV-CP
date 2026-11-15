"""Durable single-worker queue. Keep its SQLite database on a persistent volume."""
import hashlib
import json
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path


class JobQueue:
    def __init__(self, path):
        self.path = str(path)
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.execute("pragma journal_mode=WAL")
            db.execute("""create table if not exists jobs(
                id text primary key, digest text not null, mime_type text not null,
                input blob, status text not null, result text, error text, updated real not null)""")
            if "progress" not in {row[1] for row in db.execute("pragma table_info(jobs)")}:
                db.execute("alter table jobs add column progress text")
            if "error" not in {row[1] for row in db.execute("pragma table_info(jobs)")}:
                db.execute("alter table jobs add column error text")

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=15)
        try:
            with db:
                yield db
        finally:
            db.close()

    def recover(self):
        with self.connection() as db:
            db.execute("update jobs set status='queued' where status='running'")

    def submit(self, key, data, mime_type):
        digest = hashlib.sha256(data).hexdigest()
        with self.connection() as db:
            db.execute("begin immediate")
            existing = db.execute("select digest,status from jobs where id=?", (key,)).fetchone()
            if existing and existing[0] != digest:
                raise ValueError("An idempotency key cannot identify different content.")
            if existing and existing[1] != "failed":
                return self.get(key)
            if db.execute("select count(*) from jobs where status in ('queued','running')").fetchone()[0] >= 100:
                raise OverflowError("The document queue is full.")
            db.execute("insert or replace into jobs(id,digest,mime_type,input,status,result,error,updated,progress) values (?,?,?,?,?,?,?,?,?)", (key, digest, mime_type, data, "queued", None, None, time.time(), "Waiting for the document worker"))
        return self.get(key)

    def get(self, key):
        with self.connection() as db:
            row = db.execute("select status,result,progress,updated,error from jobs where id=?", (key,)).fetchone()
            position = db.execute("select count(*) from jobs where status='running' or (status='queued' and updated <= ?)", (row[3],)).fetchone()[0] if row and row[0] == "queued" else None
        if not row:
            return None
        return {"id": key, "status": row[0], "result": json.loads(row[1]) if row[1] else None, "progress": row[2], "updatedAt": row[3], "queuePosition": position, "error": row[4]}

    def progress(self, key, message):
        with self.connection() as db:
            db.execute("update jobs set progress=?,updated=? where id=? and status='running'", (message, time.time(), key))

    def claim(self):
        with self.connection() as db:
            db.execute("begin immediate")
            row = db.execute("select id,input,mime_type from jobs where status='queued' order by updated limit 1").fetchone()
            if row:
                db.execute("update jobs set status='running',updated=? where id=?", (time.time(), row[0]))
        return row

    def finish(self, key, result=None, error=None):
        with self.connection() as db:
            # A deleted/cancelled row is never recreated by a late worker result.
            db.execute("update jobs set status=?,result=?,input=null,error=?,updated=? where id=?", ("completed" if result else "failed", json.dumps(result) if result else None, None if result else str(error or "Extraction failed.")[:500], time.time(), key))

    def delete(self, key):
        with self.connection() as db:
            db.execute("delete from jobs where id=?", (key,))

    def cleanup(self, days=7):
        with self.connection() as db:
            db.execute("delete from jobs where status in ('completed','failed') and updated < ?", (time.time() - days * 86400,))
