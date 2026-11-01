mod fixtures;

use fixtures::{deleted_entry_json, entry_json, Fixture};
use stabby_search::archive::{list_entries, list_objects, read_entry, read_object, Object, Owner, ReadError};

const NAME: &str = "1792998444000000-000_20261026T070724Z_aaaa_aaaa_status_1.json";

#[test]
fn lists_home_and_federated_not_gone() {
    let f = Fixture::new();
    f.home_entry("oh_pyt", "new", NAME, &entry_json("https://h/1", "1", "s1", "2026-10-26T07:07:24.000Z", "x"));
    f.home_entry("oh_pyt", "cur", "b.json", &entry_json("https://h/2", "1", "s2", "2026-10-26T07:07:24.000Z", "x"));
    f.home_entry("oh_pyt", "gone", "c.json", &deleted_entry_json("https://h/3"));
    f.home_entry("admin", "new", "d.json", &entry_json("https://h/4", "1", "s4", "2026-10-26T07:07:24.000Z", "x"));
    f.federated_entry("new", "e.json", &entry_json("https://h/5", "1", "s5", "2026-10-26T07:07:24.000Z", "x"));
    f.federated_entry("tmp", "f.json", "half");
    let mut found: Vec<(String, String)> = list_entries(f.root()).into_iter().map(|e| (e.owner.key(), e.name)).collect();
    found.sort();
    assert_eq!(
        found,
        vec![
            ("*".to_string(), "e.json".to_string()),
            ("admin".to_string(), "d.json".to_string()),
            ("oh_pyt".to_string(), NAME.to_string()),
            ("oh_pyt".to_string(), "b.json".to_string()),
        ]
    );
}

#[test]
fn an_entry_knows_its_owner() {
    let f = Fixture::new();
    f.home_entry("admin", "new", "d.json", &entry_json("https://h/4", "1", "s4", "2026-10-26T07:07:24.000Z", "x"));
    f.federated_entry("new", "e.json", &entry_json("https://h/5", "1", "s5", "2026-10-26T07:07:24.000Z", "x"));
    let entries = list_entries(f.root());
    assert!(entries.iter().any(|e| e.owner == Owner::User("admin".into())));
    assert!(entries.iter().any(|e| e.owner == Owner::Federated));
    assert!(entries.iter().all(|e| e.mtime > 0));
}

#[test]
fn reads_a_valid_entry() {
    let f = Fixture::new();
    let p = f.home_entry("oh_pyt", "new", NAME, &entry_json("https://h/1", "7", "s1", "2026-10-26T07:07:24.000Z", "<p>ciao</p>"));
    let e = read_entry(&p).unwrap();
    assert_eq!(e.object_id, "https://h/1");
    assert_eq!(e.revision, "7");
    assert!(!e.deleted);
    assert_eq!(e.projection["id"], "s1");
    assert_eq!(e.projection["content"], "<p>ciao</p>");
}

#[test]
fn a_deleted_entry_is_read_though_its_projection_is_empty() {
    let f = Fixture::new();
    let p = f.home_entry("oh_pyt", "new", "x.json", &deleted_entry_json("https://h/9"));
    let e = read_entry(&p).unwrap();
    assert!(e.deleted);
    assert_eq!(e.object_id, "https://h/9");
}

#[test]
fn entry_without_projection_is_format_error() {
    let f = Fixture::new();
    let p = f.home_entry("oh_pyt", "new", "x.json", r#"{"object_id":"u","deleted":false,"revision":"1"}"#);
    assert!(matches!(read_entry(&p), Err(ReadError::Format(_))));
}

#[test]
fn a_live_entry_without_id_or_date_is_format_error() {
    let f = Fixture::new();
    let p = f.home_entry("oh_pyt", "new", "x.json", r#"{"object_id":"u","deleted":false,"revision":"1","projection":{"content":"x"}}"#);
    assert!(matches!(read_entry(&p), Err(ReadError::Format(_))));
}

#[test]
fn truncated_json_is_format_error_not_panic() {
    let f = Fixture::new();
    let full = entry_json("https://h/1", "1", "s1", "2026-10-26T07:07:24.000Z", "x");
    let p = f.home_entry("oh_pyt", "new", "x.json", &full[..full.len() / 2]);
    assert!(matches!(read_entry(&p), Err(ReadError::Format(_))));
}

#[test]
fn a_missing_file_is_an_io_error() {
    let f = Fixture::new();
    assert!(matches!(read_entry(&f.root().join("nope.json")), Err(ReadError::Io(_))));
}

#[test]
fn person_gives_profile_with_acct() {
    let f = Fixture::new();
    let p = f.object(
        "p1",
        r#"{"type":"Person","id":"https://mastodon.uno/users/valigiablu","preferredUsername":"valigiablu","name":"Valigia Blu","summary":"<p>giornalismo</p>"}"#,
    );
    match read_object(&p).unwrap() {
        Object::Profile(pr) => {
            assert_eq!(pr.id, "https://mastodon.uno/users/valigiablu");
            assert_eq!(pr.username, "valigiablu");
            assert_eq!(pr.display_name, "Valigia Blu");
            assert_eq!(pr.acct, "valigiablu@mastodon.uno");
            assert_eq!(pr.note, "<p>giornalismo</p>");
        }
        other => panic!("not a profile: {other:?}"),
    }
}

#[test]
fn tombstone_is_recognised() {
    let f = Fixture::new();
    let p = f.object("t1", r#"{"type":"Tombstone","id":"https://h/users/a/statuses/1","formerType":"Note","deleted":"2026-10-30T00:00:00Z"}"#);
    assert_eq!(read_object(&p).unwrap(), Object::Tombstone { id: "https://h/users/a/statuses/1".into() });
}

#[test]
fn note_object_is_other_and_a_person_without_username_is_a_format_error() {
    let f = Fixture::new();
    let n = f.object("n1", r#"{"type":"Note","id":"https://h/1","content":"x"}"#);
    assert_eq!(read_object(&n).unwrap(), Object::Other);
    let bad = f.object("p2", r#"{"type":"Person","id":"https://h/users/a"}"#);
    assert!(matches!(read_object(&bad), Err(ReadError::Format(_))));
}

#[test]
fn lists_only_json_objects() {
    let f = Fixture::new();
    f.object("n1", r#"{"type":"Note"}"#);
    std::fs::write(f.root().join("object/n1_c.idx"), "x").unwrap();
    let objs = list_objects(f.root());
    assert_eq!(objs.len(), 1);
    assert!(objs[0].path.ends_with("n1.json"));
}

#[test]
fn a_profile_id_with_credentials_is_a_format_error() {
    let f = Fixture::new();
    let p = f.object("p3", r#"{"type":"Person","id":"https://evil@victim.example/users/a","preferredUsername":"a"}"#);
    assert!(matches!(read_object(&p), Err(ReadError::Format(_))));
}

#[test]
fn a_username_that_looks_like_an_address_is_a_format_error() {
    let f = Fixture::new();
    for (n, name) in ["bob@victim.example", "a/b", "a b", ""].iter().enumerate() {
        let body = serde_json::json!({"type":"Person","id":"https://h.example/users/x","preferredUsername":name}).to_string();
        let p = f.object(&format!("u{n}"), &body);
        assert!(matches!(read_object(&p), Err(ReadError::Format(_))), "username {name:?}");
    }
}

#[test]
fn the_port_of_a_profile_host_is_kept_and_a_query_or_fragment_is_not_part_of_it() {
    let f = Fixture::new();
    let a = f.object("h1", r#"{"type":"Person","id":"https://h.example:8443/users/a","preferredUsername":"a"}"#);
    let b = f.object("h2", r#"{"type":"Person","id":"https://h.example?x=1","preferredUsername":"b"}"#);
    let acct = |p| match read_object(p).unwrap() {
        Object::Profile(pr) => pr.acct,
        other => panic!("{other:?}"),
    };
    assert_eq!(acct(&a), "a@h.example:8443");
    assert_eq!(acct(&b), "b@h.example");
}

#[test]
fn a_deleted_entry_without_a_projection_is_read() {
    let f = Fixture::new();
    let p = f.home_entry("oh_pyt", "new", "x.json", r#"{"object_id":"https://h/9","deleted":true,"revision":"3"}"#);
    let e = read_entry(&p).unwrap();
    assert!(e.deleted);
    assert_eq!(e.object_id, "https://h/9");
}
