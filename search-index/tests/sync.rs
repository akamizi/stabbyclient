mod fixtures;

use fixtures::{deleted_entry_json, entry_json, Fixture};
use stabby_search::index::Index;
use stabby_search::query::to_fts;
use stabby_search::sync::{format_state, sync_once, FormatState, Report};
use std::fs;

const T: &str = "2026-10-26T07:07:24.000Z";

fn found(i: &Index, user: &str, q: &str) -> Vec<String> {
    i.search_statuses(user, &to_fts(q).unwrap(), 20, 0)
        .unwrap()
        .iter()
        .map(|p| serde_json::from_str::<serde_json::Value>(p).unwrap()["id"].as_str().unwrap().to_string())
        .collect()
}

fn seeded() -> (Fixture, Index) {
    let f = Fixture::new();
    f.home_entry("oh_pyt", "new", "a.json", &entry_json("https://h/1", "1", "s1", T, "<p>Battaglia nel Donbas</p>"));
    f.home_entry("oh_pyt", "new", "b.json", &entry_json("https://h/2", "1", "s2", T, "Una ricetta di pasta"));
    f.federated_entry("new", "c.json", &entry_json("https://h/3", "1", "s3", T, "Notizie dal mondo"));
    f.object("p1", r#"{"type":"Person","id":"https://mastodon.uno/users/valigiablu","preferredUsername":"valigiablu","name":"Valigia Blu"}"#);
    f.object("n1", r#"{"type":"Note","id":"https://h/1","content":"x"}"#);
    (f, Index::open_memory().unwrap())
}

#[test]
fn first_sync_adds_every_entry_and_profile() {
    let (f, mut i) = seeded();
    let r = sync_once(f.root(), &mut i);
    assert_eq!((r.added, r.updated, r.removed, r.skipped), (3, 0, 0, 0));
    assert_eq!(i.counts(), (3, 1));
    assert_eq!(found(&i, "oh_pyt", "donbas"), vec!["s1"]);
    assert_eq!(found(&i, "admin", "mondo"), vec!["s3"]);
    assert!(found(&i, "admin", "donbas").is_empty());
}

#[test]
fn second_sync_changes_nothing() {
    let (f, mut i) = seeded();
    sync_once(f.root(), &mut i);
    let r = sync_once(f.root(), &mut i);
    assert_eq!((r.added, r.updated, r.removed, r.skipped), (0, 0, 0, 0));
}

#[test]
fn a_changed_revision_updates_the_text() {
    let (f, mut i) = seeded();
    sync_once(f.root(), &mut i);
    f.home_entry("oh_pyt", "new", "a.json", &entry_json("https://h/1", "2", "s1", T, "Testo corretto sul Donbas"));
    let r = sync_once(f.root(), &mut i);
    assert_eq!((r.added, r.updated, r.removed), (0, 1, 0));
    assert!(found(&i, "oh_pyt", "battaglia").is_empty());
    assert_eq!(found(&i, "oh_pyt", "corretto"), vec!["s1"]);
}

#[test]
fn an_entry_that_leaves_the_timeline_is_removed() {
    let (f, mut i) = seeded();
    sync_once(f.root(), &mut i);
    fs::remove_file(f.root().join("user/oh_pyt/maildir-v1/home/new/0001/b.json")).unwrap();
    let r = sync_once(f.root(), &mut i);
    assert_eq!(r.removed, 1);
    assert!(found(&i, "oh_pyt", "ricetta").is_empty());
    assert_eq!(found(&i, "oh_pyt", "donbas"), vec!["s1"]);
}

#[test]
fn a_deleted_entry_is_not_indexed_and_is_removed_if_present() {
    let (f, mut i) = seeded();
    f.home_entry("oh_pyt", "new", "d.json", &deleted_entry_json("https://h/9"));
    let r = sync_once(f.root(), &mut i);
    assert_eq!((r.added, r.skipped), (3, 0));
    f.home_entry("oh_pyt", "new", "a.json", &deleted_entry_json("https://h/1"));
    let r = sync_once(f.root(), &mut i);
    assert_eq!(r.removed, 1);
    assert!(found(&i, "oh_pyt", "donbas").is_empty());
}

#[test]
fn a_tombstone_object_removes_its_entries() {
    let (f, mut i) = seeded();
    sync_once(f.root(), &mut i);
    f.object("t1", r#"{"type":"Tombstone","id":"https://h/2","formerType":"Note"}"#);
    let r = sync_once(f.root(), &mut i);
    assert_eq!(r.removed, 1);
    assert!(found(&i, "oh_pyt", "ricetta").is_empty());
}

#[test]
fn a_truncated_entry_is_skipped_and_counted_and_the_rest_is_indexed() {
    let (f, mut i) = seeded();
    let full = entry_json("https://h/7", "1", "s7", T, "mezzo");
    f.home_entry("oh_pyt", "new", "half.json", &full[..full.len() / 2]);
    let r = sync_once(f.root(), &mut i);
    assert_eq!((r.added, r.skipped), (3, 1));
    assert_eq!(found(&i, "oh_pyt", "donbas"), vec!["s1"]);
    let again = sync_once(f.root(), &mut i);
    assert_eq!(again.skipped, 1, "an unreadable entry is counted every round until it is fixed");
}

#[test]
fn a_boost_is_found_by_the_boosted_posts_text_and_its_author() {
    let f = Fixture::new();
    let body = serde_json::json!({
        "object_id": "https://h/b1", "deleted": false, "revision": "1", "projection_kind": "status",
        "projection": {
            "id": "boost1", "created_at": T, "content": "", "spoiler_text": "",
            "account": { "display_name": "Mizi", "acct": "oh_pyt" }, "tags": [],
            "reblog": {
                "id": "orig1", "created_at": "2026-10-25T00:00:00.000Z", "content": "<p>Ucraina e Russia</p>",
                "spoiler_text": "guerra", "account": { "display_name": "Valigia Blu", "acct": "valigiablu@mastodon.uno" },
                "tags": [{ "name": "donbas" }]
            }
        }
    })
    .to_string();
    f.home_entry("oh_pyt", "new", "boost.json", &body);
    let mut i = Index::open_memory().unwrap();
    sync_once(f.root(), &mut i);
    assert_eq!(found(&i, "oh_pyt", "ucraina"), vec!["boost1"]);
    assert_eq!(found(&i, "oh_pyt", "valigia"), vec!["boost1"]);
    assert_eq!(found(&i, "oh_pyt", "donbas"), vec!["boost1"]);
    assert_eq!(found(&i, "oh_pyt", "guerra"), vec!["boost1"]);
    assert_eq!(found(&i, "oh_pyt", "mizi"), vec!["boost1"]);
}

#[test]
fn an_empty_listing_does_not_wipe_the_index() {
    let (f, mut i) = seeded();
    sync_once(f.root(), &mut i);
    fs::remove_dir_all(f.root().join("user")).unwrap();
    fs::remove_dir_all(f.root().join("maildir-v1")).unwrap();
    let r = sync_once(f.root(), &mut i);
    assert_eq!(r.removed, 0);
    assert_eq!(found(&i, "oh_pyt", "donbas"), vec!["s1"]);
}

#[test]
fn format_state_turns_unrecognized_past_the_threshold() {
    let r = |skipped, total| Report { added: 0, updated: 0, removed: 0, skipped, total };
    assert_eq!(format_state(&r(51, 200)), FormatState::Unrecognized);
    assert_eq!(format_state(&r(50, 200)), FormatState::Ok);
    assert_eq!(format_state(&r(51, 5000)), FormatState::Ok);
    assert_eq!(format_state(&r(0, 0)), FormatState::Ok);
}

#[test]
fn an_indexed_entry_rewritten_unreadable_is_dropped_not_kept() {
    let (f, mut i) = seeded();
    sync_once(f.root(), &mut i);
    let full = entry_json("https://h/1", "2", "s1", T, "testo nuovo");
    f.home_entry("oh_pyt", "new", "a.json", &full[..full.len() / 2]);
    let r = sync_once(f.root(), &mut i);
    assert_eq!((r.skipped, r.removed), (1, 1));
    assert!(found(&i, "oh_pyt", "donbas").is_empty(), "the old text must not stay searchable");
    assert_eq!(found(&i, "oh_pyt", "ricetta"), vec!["s2"]);
}

#[test]
fn a_format_change_does_not_empty_the_index() {
    let f = Fixture::new();
    for n in 0..60 {
        f.home_entry("oh_pyt", "new", &format!("e{n}.json"), &entry_json(&format!("https://h/{n}"), "1", &format!("s{n}"), T, "contenuto"));
    }
    let mut i = Index::open_memory().unwrap();
    assert_eq!(sync_once(f.root(), &mut i).added, 60);
    for n in 0..60 {
        f.home_entry("oh_pyt", "new", &format!("e{n}.json"), r#"{"a_new":"shape"}"#);
    }
    let r = sync_once(f.root(), &mut i);
    assert_eq!(format_state(&r), FormatState::Unrecognized);
    assert_eq!(r.removed, 0);
    assert_eq!(i.counts().0, 60, "nothing is dropped when the format is what changed");
}

#[test]
fn a_tombstone_for_a_profile_removes_the_profile() {
    let (f, mut i) = seeded();
    sync_once(f.root(), &mut i);
    assert_eq!(i.counts().1, 1);
    f.object("p1", r#"{"type":"Tombstone","id":"https://mastodon.uno/users/valigiablu","formerType":"Person"}"#);
    sync_once(f.root(), &mut i);
    assert_eq!(i.counts().1, 0);
    assert!(i.search_profiles(&to_fts("valigia").unwrap(), 10).unwrap().is_empty());
}
