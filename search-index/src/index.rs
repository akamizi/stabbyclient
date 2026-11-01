//! The index: SQLite with FTS5. A status is filed once per owner (a user's Home, or "*" for the
//! federated timeline everybody sees) and a search only looks at the asker's own and the shared ones.

use crate::archive::Profile;
use crate::text::plain_text;
use rusqlite::{params, Connection, OptionalExtension, Result};
use std::collections::HashMap;
use std::path::Path;

pub struct StatusDoc {
    pub owner: String,
    pub entry_key: String,
    pub object_id: String,
    pub status_id: String,
    pub created_at: String,
    pub revision: String,
    pub mtime: i64,
    pub text: String,
    pub projection: String,
}

pub struct Index {
    conn: Connection,
}

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS entries(
    id INTEGER PRIMARY KEY,
    owner TEXT NOT NULL,
    entry_key TEXT NOT NULL,
    object_id TEXT NOT NULL,
    status_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    revision TEXT NOT NULL,
    mtime INTEGER NOT NULL,
    projection TEXT NOT NULL,
    UNIQUE(owner, entry_key)
);
CREATE INDEX IF NOT EXISTS entries_object ON entries(object_id);
CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(text, tokenize='unicode61 remove_diacritics 2');
CREATE TABLE IF NOT EXISTS profiles(
    id INTEGER PRIMARY KEY,
    uri TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    display_name TEXT NOT NULL,
    acct TEXT NOT NULL,
    mtime INTEGER NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS profiles_fts USING fts5(text, tokenize='unicode61 remove_diacritics 2');
";

impl Index {
    pub fn open(path: &Path) -> Result<Index> {
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        Index::init(conn)
    }

    pub fn open_memory() -> Result<Index> {
        Index::init(Connection::open_in_memory()?)
    }

    fn init(conn: Connection) -> Result<Index> {
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        conn.execute_batch(SCHEMA)?;
        Ok(Index { conn })
    }

    pub fn upsert_status(&mut self, d: &StatusDoc) -> Result<()> {
        let tx = self.conn.transaction()?;
        let existing: Option<i64> = tx
            .query_row("SELECT id FROM entries WHERE owner = ?1 AND entry_key = ?2", params![d.owner, d.entry_key], |r| r.get(0))
            .optional()?;
        let id = match existing {
            Some(id) => {
                tx.execute(
                    "UPDATE entries SET object_id=?2, status_id=?3, created_at=?4, revision=?5, mtime=?6, projection=?7 WHERE id=?1",
                    params![id, d.object_id, d.status_id, d.created_at, d.revision, d.mtime, d.projection],
                )?;
                tx.execute("DELETE FROM entries_fts WHERE rowid = ?1", [id])?;
                id
            }
            None => {
                tx.execute(
                    "INSERT INTO entries(owner, entry_key, object_id, status_id, created_at, revision, mtime, projection) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                    params![d.owner, d.entry_key, d.object_id, d.status_id, d.created_at, d.revision, d.mtime, d.projection],
                )?;
                tx.last_insert_rowid()
            }
        };
        tx.execute("INSERT INTO entries_fts(rowid, text) VALUES (?1, ?2)", params![id, d.text])?;
        tx.commit()
    }

    pub fn remove_status(&mut self, owner: &str, entry_key: &str) -> Result<()> {
        let tx = self.conn.transaction()?;
        let id: Option<i64> = tx
            .query_row("SELECT id FROM entries WHERE owner = ?1 AND entry_key = ?2", params![owner, entry_key], |r| r.get(0))
            .optional()?;
        if let Some(id) = id {
            tx.execute("DELETE FROM entries_fts WHERE rowid = ?1", [id])?;
            tx.execute("DELETE FROM entries WHERE id = ?1", [id])?;
        }
        tx.commit()
    }

    /// Drops every entry of an object (a deleted post), whoever's it is; how many went.
    pub fn remove_object(&mut self, object_id: &str) -> Result<usize> {
        let tx = self.conn.transaction()?;
        let ids: Vec<i64> = {
            let mut stmt = tx.prepare("SELECT id FROM entries WHERE object_id = ?1")?;
            let rows = stmt.query_map([object_id], |r| r.get(0))?;
            rows.collect::<Result<_>>()?
        };
        for id in &ids {
            tx.execute("DELETE FROM entries_fts WHERE rowid = ?1", [id])?;
            tx.execute("DELETE FROM entries WHERE id = ?1", [id])?;
        }
        tx.commit()?;
        Ok(ids.len())
    }

    /// What is filed, by (owner, entry_key): its revision and the file's modification time.
    pub fn known_entries(&self) -> Result<HashMap<(String, String), (String, i64)>> {
        let mut stmt = self.conn.prepare("SELECT owner, entry_key, revision, mtime FROM entries")?;
        let rows = stmt.query_map([], |r| Ok(((r.get(0)?, r.get(1)?), (r.get(2)?, r.get(3)?))))?;
        rows.collect()
    }

    /// The posts `user` may find, newest first, each once however many timelines it is in.
    pub fn search_statuses(&self, user: &str, fts: &str, limit: usize, offset: usize) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT e.projection, MAX(e.created_at) AS newest
             FROM entries_fts f JOIN entries e ON e.id = f.rowid
             WHERE entries_fts MATCH ?1 AND (e.owner = ?2 OR e.owner = '*')
             GROUP BY e.status_id
             ORDER BY newest DESC, e.status_id DESC
             LIMIT ?3 OFFSET ?4",
        )?;
        let rows = stmt.query_map(params![fts, user, limit as i64, offset as i64], |r| r.get(0))?;
        rows.collect()
    }

    pub fn count_statuses(&self, user: &str, fts: &str) -> Result<usize> {
        let n: i64 = self.conn.query_row(
            "SELECT COUNT(DISTINCT e.status_id)
             FROM entries_fts f JOIN entries e ON e.id = f.rowid
             WHERE entries_fts MATCH ?1 AND (e.owner = ?2 OR e.owner = '*')",
            params![fts, user],
            |r| r.get(0),
        )?;
        Ok(n as usize)
    }

    pub fn upsert_profile(&mut self, p: &Profile, mtime: i64) -> Result<()> {
        let tx = self.conn.transaction()?;
        let text = format!("{} {} {} {}", p.username, p.display_name, p.acct, plain_text(&p.note));
        let existing: Option<i64> = tx.query_row("SELECT id FROM profiles WHERE uri = ?1", [&p.id], |r| r.get(0)).optional()?;
        let id = match existing {
            Some(id) => {
                tx.execute(
                    "UPDATE profiles SET username=?2, display_name=?3, acct=?4, mtime=?5 WHERE id=?1",
                    params![id, p.username, p.display_name, p.acct, mtime],
                )?;
                tx.execute("DELETE FROM profiles_fts WHERE rowid = ?1", [id])?;
                id
            }
            None => {
                tx.execute(
                    "INSERT INTO profiles(uri, username, display_name, acct, mtime) VALUES (?1,?2,?3,?4,?5)",
                    params![p.id, p.username, p.display_name, p.acct, mtime],
                )?;
                tx.last_insert_rowid()
            }
        };
        tx.execute("INSERT INTO profiles_fts(rowid, text) VALUES (?1, ?2)", params![id, text])?;
        tx.commit()
    }

    pub fn remove_profile(&mut self, uri: &str) -> Result<()> {
        let tx = self.conn.transaction()?;
        let id: Option<i64> = tx.query_row("SELECT id FROM profiles WHERE uri = ?1", [uri], |r| r.get(0)).optional()?;
        if let Some(id) = id {
            tx.execute("DELETE FROM profiles_fts WHERE rowid = ?1", [id])?;
            tx.execute("DELETE FROM profiles WHERE id = ?1", [id])?;
        }
        tx.commit()
    }

    pub fn known_profiles(&self) -> Result<HashMap<String, i64>> {
        let mut stmt = self.conn.prepare("SELECT uri, mtime FROM profiles")?;
        let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
        rows.collect()
    }

    /// Profiles matching the words, the best match first, then by name. The note is not returned.
    pub fn search_profiles(&self, fts: &str, limit: usize) -> Result<Vec<Profile>> {
        let mut stmt = self.conn.prepare(
            "SELECT p.uri, p.username, p.display_name, p.acct
             FROM profiles_fts f JOIN profiles p ON p.id = f.rowid
             WHERE profiles_fts MATCH ?1
             ORDER BY f.rank, p.username COLLATE NOCASE
             LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![fts, limit as i64], |r| {
            Ok(Profile { id: r.get(0)?, username: r.get(1)?, display_name: r.get(2)?, acct: r.get(3)?, note: String::new() })
        })?;
        rows.collect()
    }

    /// How many different posts and how many profiles are filed.
    pub fn counts(&self) -> (usize, usize) {
        let one = |sql: &str| -> usize { self.conn.query_row(sql, [], |r| r.get::<_, i64>(0)).unwrap_or(0) as usize };
        (one("SELECT COUNT(DISTINCT status_id) FROM entries"), one("SELECT COUNT(*) FROM profiles"))
    }
}
