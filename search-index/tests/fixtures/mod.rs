//! A made-up archive in a temporary folder, shaped like what stabbypossum writes.
#![allow(dead_code)]

use std::fs;
use std::path::{Path, PathBuf};

pub struct Fixture {
    pub dir: tempfile::TempDir,
}

impl Fixture {
    pub fn new() -> Fixture {
        Fixture { dir: tempfile::tempdir().unwrap() }
    }

    pub fn root(&self) -> &Path {
        self.dir.path()
    }

    fn write(&self, rel: &str, body: &str) -> PathBuf {
        let path = self.root().join(rel);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, body).unwrap();
        path
    }

    /// A file of `uid`'s Home timeline; `state` is new, cur or gone.
    pub fn home_entry(&self, uid: &str, state: &str, name: &str, body: &str) -> PathBuf {
        self.write(&format!("user/{uid}/maildir-v1/home/{state}/0001/{name}"), body)
    }

    pub fn federated_entry(&self, state: &str, name: &str, body: &str) -> PathBuf {
        self.write(&format!("maildir-v1/federated/{state}/0001/{name}"), body)
    }

    /// An object of the archive, named by the md5 of its id.
    pub fn object(&self, key: &str, body: &str) -> PathBuf {
        self.write(&format!("object/{key}.json"), body)
    }
}

/// The envelope of a timeline entry with a post inside it.
pub fn entry_json(object_id: &str, revision: &str, status_id: &str, created_at: &str, content: &str) -> String {
    serde_json::json!({
        "object_id": object_id,
        "entry_id": object_id,
        "deleted": false,
        "revision": revision,
        "projection_kind": "status",
        "projection": {
            "id": status_id,
            "created_at": created_at,
            "content": content,
            "spoiler_text": "",
            "account": { "display_name": "Ann", "acct": "ann@example.org" },
            "tags": [],
            "reblog": null,
            "visibility": "public"
        }
    })
    .to_string()
}

/// A timeline entry for a post that was deleted: the projection has no id any more.
pub fn deleted_entry_json(object_id: &str) -> String {
    serde_json::json!({
        "object_id": object_id,
        "deleted": true,
        "revision": "9",
        "projection_kind": "status",
        "projection": {}
    })
    .to_string()
}
