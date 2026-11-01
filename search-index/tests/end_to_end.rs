mod fixtures;

use fixtures::{entry_json, Fixture};
use stabby_search::auth::{AuthError, Identify};
use stabby_search::index::Index;
use stabby_search::service::{start, Running};
use std::time::Duration;

const T: &str = "2026-10-26T07:07:24.000Z";

struct Users;

impl Identify for Users {
    fn who(&self, token: &str) -> Result<String, AuthError> {
        match token {
            "tok-a" => Ok("oh_pyt".into()),
            "tok-b" => Ok("admin".into()),
            _ => Err(AuthError::Unauthorized),
        }
    }
}

fn free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port()
}

fn get(port: u16, path: &str, token: Option<&str>) -> (u16, serde_json::Value) {
    let mut req = ureq::get(&format!("http://127.0.0.1:{port}{path}"));
    if let Some(t) = token {
        req = req.set("Authorization", &format!("Bearer {t}"));
    }
    let (status, text) = match req.call() {
        Ok(r) => (r.status(), r.into_string().unwrap()),
        Err(ureq::Error::Status(s, r)) => (s, r.into_string().unwrap()),
        Err(e) => panic!("{e}"),
    };
    (status, serde_json::from_str(&text).unwrap())
}

fn ids(body: &serde_json::Value) -> Vec<String> {
    body["statuses"].as_array().unwrap().iter().map(|s| s["id"].as_str().unwrap().to_string()).collect()
}

fn running() -> (Fixture, Running, u16) {
    let f = Fixture::new();
    f.home_entry("oh_pyt", "new", "a.json", &entry_json("https://h/1", "1", "p1", "2026-10-26T07:00:00.000Z", "tema di oh_pyt uno"));
    f.home_entry("oh_pyt", "new", "b.json", &entry_json("https://h/2", "1", "p2", "2026-10-26T08:00:00.000Z", "tema di oh_pyt due"));
    f.home_entry("admin", "new", "c.json", &entry_json("https://h/3", "1", "a1", T, "tema di admin"));
    f.federated_entry("new", "d.json", &entry_json("https://h/4", "1", "f1", "2026-10-26T09:00:00.000Z", "tema federato"));
    // the same federated post also sits in oh_pyt's Home: it must still come out once
    f.home_entry("oh_pyt", "new", "e.json", &entry_json("https://h/4", "1", "f1", "2026-10-26T09:00:00.000Z", "tema federato"));
    let port = free_port();
    let index = Index::open_memory().unwrap();
    let running = start(f.root().to_path_buf(), index, Box::new(Users), &format!("127.0.0.1:{port}"), Duration::from_millis(100)).unwrap();
    (f, running, port)
}

#[test]
fn two_users_see_only_their_own_through_http() {
    let (_f, _running, port) = running();
    let (status, a) = get(port, "/v1/search?q=tema", Some("tok-a"));
    assert_eq!(status, 200);
    assert_eq!(ids(&a), vec!["f1", "p2", "p1"]);
    let (_, b) = get(port, "/v1/search?q=tema", Some("tok-b"));
    assert_eq!(ids(&b), vec!["f1", "a1"]);
    assert_eq!(get(port, "/v1/search?q=tema", Some("nope")).0, 401);
    assert_eq!(get(port, "/v1/search?q=tema", None).0, 401);
}

#[test]
fn the_service_keeps_following_the_archive() {
    let (f, _running, port) = running();
    f.home_entry("admin", "new", "late.json", &entry_json("https://h/9", "1", "a9", T, "tema arrivato dopo"));
    let mut seen = false;
    for _ in 0..50 {
        if ids(&get(port, "/v1/search?q=arrivato", Some("tok-b")).1) == vec!["a9"] {
            seen = true;
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    assert!(seen, "a post written after start was never indexed");
    let (_, status) = get(port, "/v1/status", None);
    assert_eq!(status["format"], "ok");
    assert!(status["last_sync"]["at"].is_string());
}
