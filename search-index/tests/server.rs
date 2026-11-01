use stabby_search::archive::Profile;
use stabby_search::auth::{AuthError, Identify};
use stabby_search::index::{Index, StatusDoc};
use stabby_search::server::{handle, Request, State};
use stabby_search::sync::{FormatState, Report};
use std::collections::HashMap;
use std::sync::Mutex;

struct Users(HashMap<String, String>);

impl Identify for Users {
    fn who(&self, token: &str) -> Result<String, AuthError> {
        self.0.get(token).cloned().ok_or(AuthError::Unauthorized)
    }
}

struct Down;

impl Identify for Down {
    fn who(&self, _token: &str) -> Result<String, AuthError> {
        Err(AuthError::Unavailable)
    }
}

fn doc(owner: &str, key: &str, status: &str, created: &str, text: &str, projection: &str) -> StatusDoc {
    StatusDoc {
        owner: owner.into(),
        entry_key: key.into(),
        object_id: format!("o-{key}"),
        status_id: status.into(),
        created_at: created.into(),
        revision: "1".into(),
        mtime: 1,
        text: text.into(),
        projection: projection.into(),
    }
}

fn state_with(identify: Box<dyn Identify>, index: Index) -> State {
    State { identify, index: Mutex::new(index), format: Mutex::new(FormatState::Ok), last_sync: Mutex::new(None) }
}

fn users() -> Box<dyn Identify> {
    Box::new(Users(HashMap::from([("tok-a".to_string(), "oh_pyt".to_string()), ("tok-b".to_string(), "admin".to_string())])))
}

fn seeded() -> State {
    let mut i = Index::open_memory().unwrap();
    i.upsert_status(&doc("oh_pyt", "k1", "s1", "2026-10-01T00:00:00.000Z", "tema comune di oh_pyt", r#"{"id":"s1","content":"<p>mio</p>","extra":{"a":1}}"#)).unwrap();
    i.upsert_status(&doc("admin", "k2", "s2", "2026-10-02T00:00:00.000Z", "tema comune di admin", r#"{"id":"s2"}"#)).unwrap();
    i.upsert_status(&doc("*", "k3", "s3", "2026-10-03T00:00:00.000Z", "tema comune federato", r#"{"id":"s3"}"#)).unwrap();
    i.upsert_profile(&Profile { id: "https://h.org/u/mario".into(), username: "mario".into(), display_name: "Mario Rossi".into(), acct: "mario@h.org".into(), note: String::new() }, 1).unwrap();
    state_with(users(), i)
}

fn get(state: &State, path: &str, query: &str, token: Option<&str>) -> (u16, serde_json::Value) {
    let r = handle(state, &Request { path: path.into(), query: query.into(), token: token.map(str::to_string) });
    (r.status, serde_json::from_str(&r.body).unwrap_or_else(|e| panic!("body is not JSON ({e}): {}", r.body)))
}

fn ids(body: &serde_json::Value) -> Vec<String> {
    body["statuses"].as_array().unwrap().iter().map(|s| s["id"].as_str().unwrap().to_string()).collect()
}

#[test]
fn search_returns_only_the_askers_statuses_newest_first() {
    let state = seeded();
    let (status, body) = get(&state, "/v1/search", "q=tema", Some("tok-a"));
    assert_eq!(status, 200);
    assert_eq!(ids(&body), vec!["s3", "s1"]);
    assert_eq!(body["total"], 2);
    let (_, body) = get(&state, "/v1/search", "q=tema", Some("tok-b"));
    assert_eq!(ids(&body), vec!["s3", "s2"]);
}

#[test]
fn the_stored_projection_is_returned_as_it_is() {
    let state = seeded();
    let (_, body) = get(&state, "/v1/search", "q=oh_pyt", Some("tok-a"));
    assert_eq!(body["statuses"][0], serde_json::json!({"id":"s1","content":"<p>mio</p>","extra":{"a":1}}));
}

#[test]
fn no_token_is_401_and_an_unknown_token_is_401() {
    let state = seeded();
    assert_eq!(get(&state, "/v1/search", "q=tema", None).0, 401);
    let (status, body) = get(&state, "/v1/search", "q=tema", Some("nope"));
    assert_eq!(status, 401);
    assert_eq!(body["error"], "unauthorized");
}

#[test]
fn identity_unavailable_is_503() {
    let state = state_with(Box::new(Down), Index::open_memory().unwrap());
    let (status, body) = get(&state, "/v1/search", "q=tema", Some("tok-a"));
    assert_eq!(status, 503);
    assert_eq!(body["error"], "identity_unavailable");
}

#[test]
fn unrecognized_format_is_503_on_search_but_status_still_answers() {
    let state = seeded();
    *state.format.lock().unwrap() = FormatState::Unrecognized;
    let (status, body) = get(&state, "/v1/search", "q=tema", Some("tok-a"));
    assert_eq!((status, body["error"].as_str()), (503, Some("format_unrecognized")));
    let (status, body) = get(&state, "/v1/status", "", None);
    assert_eq!(status, 200);
    assert_eq!(body["format"], "unrecognized");
}

#[test]
fn empty_query_gives_empty_lists_not_an_error() {
    let state = seeded();
    for q in ["", "q=", "q=%20%20", "q=%28%29", "q=--"] {
        let (status, body) = get(&state, "/v1/search", q, Some("tok-a"));
        assert_eq!(status, 200, "query {q:?}");
        assert_eq!((ids(&body).len(), body["accounts"].as_array().unwrap().len(), &body["total"]), (0, 0, &serde_json::json!(0)));
    }
}

#[test]
fn fts_syntax_in_the_query_is_not_an_error() {
    let state = seeded();
    for q in ["q=%28%22abc", "q=AND%20OR%20NEAR", "q=%2A", "q=col%3Aval", "q=%22%22%22"] {
        assert_eq!(get(&state, "/v1/search", q, Some("tok-a")).0, 200, "query {q:?}");
    }
}

#[test]
fn percent_encoding_and_plus_are_decoded() {
    let mut i = Index::open_memory().unwrap();
    i.upsert_status(&doc("oh_pyt", "k1", "s1", "2026-10-01T00:00:00.000Z", "Battaglia decisiva: perché", r#"{"id":"s1"}"#)).unwrap();
    let state = state_with(users(), i);
    assert_eq!(ids(&get(&state, "/v1/search", "q=perch%C3%A9", Some("tok-a")).1), vec!["s1"]);
    assert_eq!(ids(&get(&state, "/v1/search", "q=battaglia+decisiva", Some("tok-a")).1), vec!["s1"]);
}

#[test]
fn limit_defaults_to_20_is_capped_at_40_and_total_counts_everything() {
    let mut i = Index::open_memory().unwrap();
    for n in 0..45 {
        i.upsert_status(&doc("oh_pyt", &format!("k{n}"), &format!("s{n:02}"), &format!("2026-10-01T00:00:{n:02}.000Z"), "pagina", &format!(r#"{{"id":"s{n:02}"}}"#))).unwrap();
    }
    let state = state_with(users(), i);
    let (_, body) = get(&state, "/v1/search", "q=pagina", Some("tok-a"));
    assert_eq!((ids(&body).len(), &body["total"]), (20, &serde_json::json!(45)));
    assert_eq!(ids(&get(&state, "/v1/search", "q=pagina&limit=100", Some("tok-a")).1).len(), 40);
    assert_eq!(ids(&get(&state, "/v1/search", "q=pagina&limit=0", Some("tok-a")).1).len(), 1);
    let (_, last) = get(&state, "/v1/search", "q=pagina&limit=20&offset=40", Some("tok-a"));
    assert_eq!(ids(&last), vec!["s04", "s03", "s02", "s01", "s00"]);
}

#[test]
fn accounts_come_only_on_the_first_page() {
    let state = seeded();
    let (_, first) = get(&state, "/v1/search", "q=mario", Some("tok-a"));
    assert_eq!(first["accounts"], serde_json::json!([{"acct":"mario@h.org","display_name":"Mario Rossi"}]));
    let (_, second) = get(&state, "/v1/search", "q=mario&offset=20", Some("tok-a"));
    assert_eq!(second["accounts"], serde_json::json!([]));
}

#[test]
fn status_reports_the_counts_without_a_token() {
    let state = seeded();
    *state.last_sync.lock().unwrap() = Some(("2026-11-01T10:00:00Z".to_string(), Report { added: 3, updated: 0, removed: 0, skipped: 1, total: 4 }));
    let (status, body) = get(&state, "/v1/status", "", None);
    assert_eq!(status, 200);
    assert_eq!((body["statuses"].as_u64(), body["profiles"].as_u64(), body["format"].as_str()), (Some(3), Some(1), Some("ok")));
    assert_eq!(body["last_sync"]["skipped"], 1);
    assert_eq!(body["last_sync"]["at"], "2026-11-01T10:00:00Z");
}

#[test]
fn unknown_path_is_404() {
    let state = seeded();
    assert_eq!(get(&state, "/v1/nope", "", Some("tok-a")).0, 404);
    assert_eq!(get(&state, "/", "", None).0, 404);
}

#[test]
fn the_token_is_never_in_a_response_body() {
    let state = seeded();
    let secret = "SECRETTOKENVALUE";
    for (path, query, token) in [("/v1/search", "q=tema", Some(secret)), ("/v1/search", "q=tema", None), ("/v1/status", "", Some(secret)), ("/v1/nope", "", Some(secret))] {
        let r = handle(&state, &Request { path: path.into(), query: query.into(), token: token.map(str::to_string) });
        assert!(!r.body.contains(secret), "{path}: {}", r.body);
    }
}
