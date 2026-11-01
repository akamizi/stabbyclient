//! Keeps the index in step with the archive: reads what is new or changed, drops what is gone, and
//! counts what it cannot read so that a changed format stops the index instead of emptying it.

use crate::archive::{list_entries, list_objects, read_entry, read_object, Entry, EntryRef, Object, ReadError};
use crate::index::{Index, StatusDoc};
use crate::text::plain_text;
use serde_json::Value;
use std::collections::HashSet;
use std::path::Path;

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Report {
    pub added: usize,
    pub updated: usize,
    pub removed: usize,
    pub skipped: usize,
    pub total: usize,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum FormatState {
    Ok,
    Unrecognized,
}

/// More than fifty unreadable files and more than a fifth of what was looked at: the format is not
/// the one this reads, and the index stops following the archive.
pub fn format_state(r: &Report) -> FormatState {
    if r.skipped > 50 && r.skipped * 5 > r.total {
        FormatState::Unrecognized
    } else {
        FormatState::Ok
    }
}

const OBJECTS_SEEN: &str = "objects_seen";
/// Objects whose modification time is within this much of the newest one already read are read again.
const OBJECT_OVERLAP_NS: i64 = 2_000_000_000;

fn field<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}

/// What of a post is searched: its text, its warning, who wrote it and its tags.
fn post_text(p: &Value, out: &mut Vec<String>) {
    out.push(plain_text(field(p, "content")));
    out.push(field(p, "spoiler_text").to_string());
    if let Some(account) = p.get("account") {
        out.push(field(account, "display_name").to_string());
        out.push(field(account, "acct").to_string());
    }
    if let Some(tags) = p.get("tags").and_then(Value::as_array) {
        out.extend(tags.iter().map(|t| field(t, "name").to_string()));
    }
}

fn status_doc(r: &EntryRef, e: &Entry) -> StatusDoc {
    let mut parts = Vec::new();
    post_text(&e.projection, &mut parts);
    if let Some(inner) = e.projection.get("reblog").filter(|b| b.is_object()) {
        post_text(inner, &mut parts);
    }
    let text = parts.into_iter().filter(|p| !p.is_empty()).collect::<Vec<_>>().join(" ");
    StatusDoc {
        owner: r.owner.key(),
        entry_key: r.name.clone(),
        object_id: e.object_id.clone(),
        status_id: field(&e.projection, "id").to_string(),
        created_at: field(&e.projection, "created_at").to_string(),
        revision: e.revision.clone(),
        mtime: r.mtime,
        text,
        projection: e.projection.to_string(),
    }
}

/// One pass: new and changed entries in, vanished and deleted ones out, profiles and tombstones.
pub fn sync_once(data_dir: &Path, index: &mut Index) -> Report {
    let mut report = Report::default();
    let known = index.known_entries().unwrap_or_default();
    let entries = list_entries(data_dir);
    report.total = entries.len();
    let mut listed: HashSet<(String, String)> = HashSet::with_capacity(entries.len());
    // Indexed entries that were rewritten into something unreadable: their old text must not stay
    // searchable, unless it is the format itself that changed (decided once the pass is done).
    let mut unreadable: Vec<(String, String)> = Vec::new();

    for r in &entries {
        let key = (r.owner.key(), r.name.clone());
        listed.insert(key.clone());
        let before = known.get(&key);
        if before.is_some_and(|(_, mtime)| *mtime == r.mtime) {
            continue;
        }
        match read_entry(&r.path) {
            Ok(entry) if entry.deleted => {
                if before.is_some() && index.remove_status(&key.0, &key.1).is_ok() {
                    report.removed += 1;
                }
            }
            Ok(entry) => {
                if index.upsert_status(&status_doc(r, &entry)).is_ok() {
                    match before {
                        None => report.added += 1,
                        Some((revision, _)) if *revision != entry.revision => report.updated += 1,
                        Some(_) => {}
                    }
                }
            }
            // Gone or being replaced: looked at again next time, and not counted against the format.
            Err(ReadError::Io(_)) => {}
            Err(ReadError::Format(_)) => {
                report.skipped += 1;
                if before.is_some() {
                    unreadable.push(key);
                }
            }
        }
    }
    if format_state(&report) == FormatState::Ok {
        for key in &unreadable {
            if index.remove_status(&key.0, &key.1).is_ok() {
                report.removed += 1;
            }
        }
    }

    // A listing that came back empty while the index is full means the archive could not be read (a
    // mount gone, a folder renamed), not that every post was deleted: nothing is dropped then.
    if !(entries.is_empty() && !known.is_empty()) {
        for key in known.keys().filter(|k| !listed.contains(*k)) {
            if index.remove_status(&key.0, &key.1).is_ok() {
                report.removed += 1;
            }
        }
    }

    sync_objects(data_dir, index, &mut report);
    report
}

/// Profiles come in and tombstones take their posts out; objects not changed since the last pass are
/// not read again.
fn sync_objects(data_dir: &Path, index: &mut Index, report: &mut Report) {
    let seen: i64 = index.meta(OBJECTS_SEEN).ok().flatten().and_then(|v| v.parse().ok()).unwrap_or(i64::MIN);
    let from = seen.saturating_sub(OBJECT_OVERLAP_NS);
    let known = index.known_profiles().unwrap_or_default();
    let mut newest = seen;
    for object in list_objects(data_dir).into_iter().filter(|o| o.mtime >= from) {
        report.total += 1;
        newest = newest.max(object.mtime);
        match read_object(&object.path) {
            Ok(Object::Profile(p)) => {
                if known.get(&p.id) != Some(&object.mtime) {
                    let _ = index.upsert_profile(&p, object.mtime);
                }
            }
            Ok(Object::Tombstone { id }) => {
                // A deleted post, or a deleted account: neither stays searchable.
                if let Ok(n) = index.remove_object(&id) {
                    report.removed += n;
                }
                if known.contains_key(&id) && index.remove_profile(&id).is_ok() {
                    report.removed += 1;
                }
            }
            Ok(Object::Other) | Err(ReadError::Io(_)) => {}
            Err(ReadError::Format(_)) => report.skipped += 1,
        }
    }
    if newest != seen {
        let _ = index.set_meta(OBJECTS_SEEN, &newest.to_string());
    }
}
