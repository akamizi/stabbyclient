use stabby_search::archive::Profile;
use stabby_search::index::{Index, StatusDoc};
use stabby_search::query::to_fts;

fn doc(owner: &str, key: &str, object: &str, status: &str, created: &str, text: &str) -> StatusDoc {
    StatusDoc {
        owner: owner.into(),
        entry_key: key.into(),
        object_id: object.into(),
        status_id: status.into(),
        created_at: created.into(),
        revision: "1".into(),
        mtime: 100,
        text: text.into(),
        projection: format!("{{\"id\":\"{status}\"}}"),
    }
}

fn ids(found: Vec<String>) -> Vec<String> {
    found.iter().map(|p| serde_json::from_str::<serde_json::Value>(p).unwrap()["id"].as_str().unwrap().to_string()).collect()
}

fn search(i: &Index, user: &str, q: &str) -> Vec<String> {
    ids(i.search_statuses(user, &to_fts(q).unwrap(), 20, 0).unwrap())
}

#[test]
fn search_finds_by_prefix_and_ignores_accents_and_case() {
    let mut i = Index::open_memory().unwrap();
    i.upsert_status(&doc("oh_pyt", "k1", "o1", "s1", "2026-10-01T00:00:00.000Z", "Battaglia decisiva: perché Donbas")).unwrap();
    assert_eq!(search(&i, "oh_pyt", "perche"), vec!["s1"]);
    assert_eq!(search(&i, "oh_pyt", "DONB"), vec!["s1"]);
    assert_eq!(search(&i, "oh_pyt", "battaglia decisiva"), vec!["s1"]);
    assert!(search(&i, "oh_pyt", "ucraina").is_empty());
}

#[test]
fn results_are_newest_first() {
    let mut i = Index::open_memory().unwrap();
    i.upsert_status(&doc("u", "k1", "o1", "old", "2022-02-16T00:00:00.000Z", "tema")).unwrap();
    i.upsert_status(&doc("u", "k2", "o2", "new", "2026-11-01T00:00:00.000Z", "tema")).unwrap();
    i.upsert_status(&doc("u", "k3", "o3", "mid", "2024-05-05T00:00:00.000Z", "tema")).unwrap();
    assert_eq!(search(&i, "u", "tema"), vec!["new", "mid", "old"]);
}

#[test]
fn a_user_never_sees_another_users_entry() {
    let mut i = Index::open_memory().unwrap();
    i.upsert_status(&doc("oh_pyt", "k1", "o1", "mine", "2026-10-01T00:00:00.000Z", "segreto")).unwrap();
    i.upsert_status(&doc("admin", "k2", "o2", "his", "2026-10-02T00:00:00.000Z", "segreto")).unwrap();
    assert_eq!(search(&i, "oh_pyt", "segreto"), vec!["mine"]);
    assert_eq!(search(&i, "admin", "segreto"), vec!["his"]);
    assert!(search(&i, "nobody", "segreto").is_empty());
    assert_eq!(i.count_statuses("oh_pyt", &to_fts("segreto").unwrap()).unwrap(), 1);
}

#[test]
fn federated_entries_are_seen_by_everyone() {
    let mut i = Index::open_memory().unwrap();
    i.upsert_status(&doc("*", "k1", "o1", "pub", "2026-10-01T00:00:00.000Z", "pubblico")).unwrap();
    assert_eq!(search(&i, "oh_pyt", "pubblico"), vec!["pub"]);
    assert_eq!(search(&i, "admin", "pubblico"), vec!["pub"]);
}

#[test]
fn a_status_in_home_and_federated_is_returned_once() {
    let mut i = Index::open_memory().unwrap();
    i.upsert_status(&doc("oh_pyt", "k1", "o1", "same", "2026-10-01T00:00:00.000Z", "doppio")).unwrap();
    i.upsert_status(&doc("*", "k2", "o1", "same", "2026-10-01T00:00:00.000Z", "doppio")).unwrap();
    assert_eq!(search(&i, "oh_pyt", "doppio"), vec!["same"]);
    assert_eq!(i.count_statuses("oh_pyt", &to_fts("doppio").unwrap()).unwrap(), 1);
}

#[test]
fn limit_and_offset_page_the_results() {
    let mut i = Index::open_memory().unwrap();
    for n in 1..=5 {
        i.upsert_status(&doc("u", &format!("k{n}"), &format!("o{n}"), &format!("s{n}"), &format!("2026-10-0{n}T00:00:00.000Z"), "pagina")).unwrap();
    }
    let fts = to_fts("pagina").unwrap();
    assert_eq!(ids(i.search_statuses("u", &fts, 2, 0).unwrap()), vec!["s5", "s4"]);
    assert_eq!(ids(i.search_statuses("u", &fts, 2, 2).unwrap()), vec!["s3", "s2"]);
    assert_eq!(ids(i.search_statuses("u", &fts, 2, 4).unwrap()), vec!["s1"]);
    assert!(i.search_statuses("u", &fts, 2, 50).unwrap().is_empty());
}

#[test]
fn upsert_replaces_text_of_a_changed_entry() {
    let mut i = Index::open_memory().unwrap();
    i.upsert_status(&doc("u", "k1", "o1", "s1", "2026-10-01T00:00:00.000Z", "vecchio testo")).unwrap();
    i.upsert_status(&doc("u", "k1", "o1", "s1", "2026-10-01T00:00:00.000Z", "nuovo contenuto")).unwrap();
    assert!(search(&i, "u", "vecchio").is_empty());
    assert_eq!(search(&i, "u", "nuovo"), vec!["s1"]);
    assert_eq!(i.counts().0, 1);
}

#[test]
fn remove_status_and_remove_object_drop_entries() {
    let mut i = Index::open_memory().unwrap();
    i.upsert_status(&doc("a", "k1", "o1", "s1", "2026-10-01T00:00:00.000Z", "alfa")).unwrap();
    i.upsert_status(&doc("b", "k2", "o1", "s1", "2026-10-01T00:00:00.000Z", "alfa")).unwrap();
    i.upsert_status(&doc("a", "k3", "o2", "s2", "2026-10-02T00:00:00.000Z", "alfa")).unwrap();
    i.remove_status("a", "k3").unwrap();
    assert_eq!(search(&i, "a", "alfa"), vec!["s1"]);
    assert_eq!(i.remove_object("o1").unwrap(), 2);
    assert!(search(&i, "a", "alfa").is_empty());
    assert!(search(&i, "b", "alfa").is_empty());
}

#[test]
fn known_entries_give_revision_and_mtime_by_owner_and_key() {
    let mut i = Index::open_memory().unwrap();
    let mut d = doc("u", "k1", "o1", "s1", "2026-10-01T00:00:00.000Z", "x");
    d.revision = "7".into();
    d.mtime = 555;
    i.upsert_status(&d).unwrap();
    let known = i.known_entries().unwrap();
    assert_eq!(known.get(&("u".to_string(), "k1".to_string())), Some(&("7".to_string(), 555)));
}

fn profile(id: &str, user: &str, name: &str, note: &str) -> Profile {
    Profile { id: id.into(), username: user.into(), display_name: name.into(), acct: format!("{user}@h.org"), note: note.into() }
}

#[test]
fn profiles_are_found_by_username_prefix_and_display_name() {
    let mut i = Index::open_memory().unwrap();
    i.upsert_profile(&profile("https://h.org/u/mario", "mario", "Mario Rossi", "<p>fotografo</p>"), 1).unwrap();
    i.upsert_profile(&profile("https://h.org/u/marta", "marta", "Marta B", ""), 1).unwrap();
    i.upsert_profile(&profile("https://h.org/u/zed", "zed", "Maria Verdi", ""), 1).unwrap();
    fn names(i: &Index, q: &str) -> Vec<String> {
        i.search_profiles(&to_fts(q).unwrap(), 10).unwrap().into_iter().map(|p| p.username).collect()
    }
    let mut by_prefix = names(&i, "mar");
    by_prefix.sort();
    assert_eq!(by_prefix, vec!["mario", "marta", "zed"]);
    assert_eq!(names(&i, "fotografo"), vec!["mario"]);
    assert_eq!(names(&i, "mario@h"), vec!["mario"]);
    assert_eq!(i.known_profiles().unwrap().get("https://h.org/u/mario"), Some(&1));
    i.remove_profile("https://h.org/u/mario").unwrap();
    assert!(!names(&i, "mar").contains(&"mario".to_string()));
    assert_eq!(i.counts().1, 2);
}

#[test]
fn odd_queries_never_make_the_index_fail() {
    let mut i = Index::open_memory().unwrap();
    i.upsert_status(&doc("u", "k1", "o1", "s1", "2026-10-01T00:00:00.000Z", "uno due tre")).unwrap();
    for q in ["\"abc", "AND", "NEAR(", "a OR b", "-x", "*", "x*y", "col:val", "( ) ] [", "' ; DROP TABLE entries; --", "\\"] {
        if let Some(fts) = to_fts(q) {
            i.search_statuses("u", &fts, 10, 0).unwrap_or_else(|e| panic!("{q:?} -> {fts:?}: {e}"));
            i.search_profiles(&fts, 10).unwrap_or_else(|e| panic!("{q:?} -> {fts:?}: {e}"));
            i.count_statuses("u", &fts).unwrap();
        }
    }
}

#[test]
fn the_index_survives_being_reopened_from_a_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("index.db");
    {
        let mut i = Index::open(&path).unwrap();
        i.upsert_status(&doc("u", "k1", "o1", "s1", "2026-10-01T00:00:00.000Z", "persistente")).unwrap();
    }
    let i = Index::open(&path).unwrap();
    assert_eq!(search(&i, "u", "persistente"), vec!["s1"]);
}
