//! Reads stabbypossum's archive, never writing to it. This is the only module that knows the
//! server's file formats: timeline entries (Maildir folders of JSON envelopes holding the post as
//! the Mastodon API shows it) and the object store (one JSON file per object).

use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Debug, Clone, PartialEq)]
pub enum Owner {
    User(String),
    Federated,
}

impl Owner {
    /// The name the index files an entry under: the user's, or "*" for what everybody sees.
    pub fn key(&self) -> String {
        match self {
            Owner::User(uid) => uid.clone(),
            Owner::Federated => "*".to_string(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct EntryRef {
    pub owner: Owner,
    pub path: PathBuf,
    pub name: String,
    pub mtime: i64,
}

#[derive(Debug)]
pub struct Entry {
    pub object_id: String,
    pub deleted: bool,
    pub revision: String,
    pub projection: Value,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Profile {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub acct: String,
    pub note: String,
}

#[derive(Debug, PartialEq)]
pub enum Object {
    Profile(Profile),
    Tombstone { id: String },
    Other,
}

#[derive(Debug, Clone)]
pub struct ObjectRef {
    pub path: PathBuf,
    pub mtime: i64,
}

#[derive(Debug)]
pub enum ReadError {
    /// The file could not be read (gone, or being replaced): worth trying again later.
    Io(String),
    /// The file was read but is not what the server writes: counted, and a lot of them stops the index.
    Format(String),
}

fn mtime_of(path: &Path) -> i64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn json_files_under(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(read) = fs::read_dir(dir) else { return };
    for item in read.flatten() {
        let path = item.path();
        if path.is_dir() {
            json_files_under(&path, out);
        } else if path.extension().is_some_and(|e| e == "json") {
            out.push(path);
        }
    }
}

fn entries_in(timeline: &Path, owner: &Owner, out: &mut Vec<EntryRef>) {
    for state in ["new", "cur"] {
        let mut files = Vec::new();
        json_files_under(&timeline.join(state), &mut files);
        for path in files {
            let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            let mtime = mtime_of(&path);
            out.push(EntryRef { owner: owner.clone(), path, name, mtime });
        }
    }
}

/// Every live entry of every user's Home and of the federated timeline (not `gone`, not `tmp`).
pub fn list_entries(data_dir: &Path) -> Vec<EntryRef> {
    let mut out = Vec::new();
    if let Ok(users) = fs::read_dir(data_dir.join("user")) {
        for user in users.flatten() {
            let uid = user.file_name().to_string_lossy().into_owned();
            entries_in(&user.path().join("maildir-v1").join("home"), &Owner::User(uid), &mut out);
        }
    }
    entries_in(&data_dir.join("maildir-v1").join("federated"), &Owner::Federated, &mut out);
    out
}

fn read_json(path: &Path) -> Result<Value, ReadError> {
    let bytes = fs::read(path).map_err(|e| ReadError::Io(format!("{}: {e}", path.display())))?;
    serde_json::from_slice(&bytes).map_err(|e| ReadError::Format(format!("{}: {e}", path.display())))
}

fn text(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(str::to_string)
}

pub fn read_entry(path: &Path) -> Result<Entry, ReadError> {
    let v = read_json(path)?;
    let bad = |what: &str| ReadError::Format(format!("{}: {what}", path.display()));
    let object_id = text(&v, "object_id").ok_or_else(|| bad("no object_id"))?;
    let deleted = v.get("deleted").and_then(Value::as_bool).unwrap_or(false);
    let revision = match v.get("revision") {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        _ => return Err(bad("no revision")),
    };
    let projection = v.get("projection").filter(|p| p.is_object()).cloned().ok_or_else(|| bad("no projection"))?;
    // A deleted post's projection is empty: only a live one must carry what the index needs.
    if !deleted && (text(&projection, "id").is_none() || text(&projection, "created_at").is_none()) {
        return Err(bad("the post has no id or date"));
    }
    Ok(Entry { object_id, deleted, revision, projection })
}

/// Every `object/<md5>.json` (the `.idx` files beside them are the server's own counters).
pub fn list_objects(data_dir: &Path) -> Vec<ObjectRef> {
    let Ok(read) = fs::read_dir(data_dir.join("object")) else { return Vec::new() };
    read.flatten()
        .map(|i| i.path())
        .filter(|p| p.extension().is_some_and(|e| e == "json"))
        .map(|path| ObjectRef { mtime: mtime_of(&path), path })
        .collect()
}

fn host_of(id: &str) -> Option<&str> {
    let rest = id.split_once("://")?.1;
    let host = rest.split('/').next()?;
    (!host.is_empty()).then_some(host)
}

pub fn read_object(path: &Path) -> Result<Object, ReadError> {
    let v = read_json(path)?;
    let bad = |what: &str| ReadError::Format(format!("{}: {what}", path.display()));
    match v.get("type").and_then(Value::as_str) {
        Some("Person" | "Service" | "Group" | "Application" | "Organization") => {
            let id = text(&v, "id").ok_or_else(|| bad("a profile without id"))?;
            let username = text(&v, "preferredUsername").ok_or_else(|| bad("a profile without preferredUsername"))?;
            let host = host_of(&id).ok_or_else(|| bad("a profile whose id has no host"))?;
            Ok(Object::Profile(Profile {
                acct: format!("{username}@{host}"),
                display_name: text(&v, "name").unwrap_or_default(),
                note: text(&v, "summary").unwrap_or_default(),
                id,
                username,
            }))
        }
        Some("Tombstone") => Ok(Object::Tombstone { id: text(&v, "id").ok_or_else(|| bad("a tombstone without id"))? }),
        _ => Ok(Object::Other),
    }
}
