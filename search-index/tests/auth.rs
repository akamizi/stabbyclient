use stabby_search::auth::{AuthError, CachedIdentify, HttpIdentify, Identify};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// A stand-in for stabbypossum: answers one request per call with the given status and body, and
/// remembers the Authorization header it saw.
fn stub(status: u16, body: &str) -> (String, Arc<Mutex<Option<String>>>) {
    let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
    let url = format!("http://127.0.0.1:{}", server.server_addr().to_ip().unwrap().port());
    let seen = Arc::new(Mutex::new(None));
    let seen_in = seen.clone();
    let body = body.to_string();
    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            let auth = request.headers().iter().find(|h| h.field.equiv("Authorization")).map(|h| h.value.to_string());
            *seen_in.lock().unwrap() = auth;
            assert_eq!(request.url(), "/api/v1/accounts/verify_credentials");
            let _ = request.respond(tiny_http::Response::from_string(body.clone()).with_status_code(status));
        }
    });
    (url, seen)
}

#[test]
fn http_identify_reads_username() {
    let (url, seen) = stub(200, r#"{"username":"oh_pyt","acct":"oh_pyt","id":"abc"}"#);
    assert_eq!(HttpIdentify::new(&url).who("tok-1"), Ok("oh_pyt".to_string()));
    assert_eq!(seen.lock().unwrap().as_deref(), Some("Bearer tok-1"));
}

#[test]
fn http_identify_maps_401_403_and_422_to_unauthorized() {
    for status in [401, 403, 422] {
        let (url, _) = stub(status, "{}");
        assert_eq!(HttpIdentify::new(&url).who("t"), Err(AuthError::Unauthorized), "status {status}");
    }
}

#[test]
fn a_server_error_or_an_odd_answer_is_unavailable_not_unauthorized() {
    let (url, _) = stub(500, "boom");
    assert_eq!(HttpIdentify::new(&url).who("t"), Err(AuthError::Unavailable));
    let (url, _) = stub(200, "not json");
    assert_eq!(HttpIdentify::new(&url).who("t"), Err(AuthError::Unavailable));
    let (url, _) = stub(200, r#"{"acct":"x"}"#);
    assert_eq!(HttpIdentify::new(&url).who("t"), Err(AuthError::Unavailable));
}

#[test]
fn unreachable_server_is_unavailable() {
    let port = {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        l.local_addr().unwrap().port()
    };
    assert_eq!(HttpIdentify::new(&format!("http://127.0.0.1:{port}")).who("t"), Err(AuthError::Unavailable));
}

#[test]
fn a_username_that_could_pass_for_the_shared_owner_or_a_path_is_refused() {
    for name in ["*", "", "a/b", "a b"] {
        let (url, _) = stub(200, &serde_json::json!({ "username": name }).to_string());
        assert!(HttpIdentify::new(&url).who("t").is_err(), "username {name:?}");
    }
}

struct Counting {
    calls: AtomicUsize,
    answer: Mutex<Result<String, AuthError>>,
}

impl Identify for Counting {
    fn who(&self, _token: &str) -> Result<String, AuthError> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        self.answer.lock().unwrap().clone()
    }
}

fn counting(answer: Result<String, AuthError>) -> Arc<Counting> {
    Arc::new(Counting { calls: AtomicUsize::new(0), answer: Mutex::new(answer) })
}

/// The cache owns its inner Identify, the test keeps counting through a shared handle.
struct Shared(Arc<Counting>);

impl Identify for Shared {
    fn who(&self, token: &str) -> Result<String, AuthError> {
        self.0.who(token)
    }
}

#[test]
fn cache_asks_once_within_the_ttl_and_again_after() {
    let inner = counting(Ok("oh_pyt".into()));
    let cache = CachedIdentify::new(Shared(inner.clone()), Duration::from_millis(60));
    assert_eq!(cache.who("t"), Ok("oh_pyt".to_string()));
    assert_eq!(cache.who("t"), Ok("oh_pyt".to_string()));
    assert_eq!(inner.calls.load(Ordering::SeqCst), 1);
    std::thread::sleep(Duration::from_millis(90));
    cache.who("t").unwrap();
    assert_eq!(inner.calls.load(Ordering::SeqCst), 2);
}

#[test]
fn cache_does_not_remember_failures() {
    let inner = counting(Err(AuthError::Unavailable));
    let cache = CachedIdentify::new(Shared(inner.clone()), Duration::from_secs(60));
    assert!(cache.who("t").is_err());
    *inner.answer.lock().unwrap() = Ok("oh_pyt".into());
    assert_eq!(cache.who("t"), Ok("oh_pyt".to_string()));
    assert_eq!(inner.calls.load(Ordering::SeqCst), 2);
}

#[test]
fn two_tokens_are_two_entries() {
    let inner = counting(Ok("oh_pyt".into()));
    let cache = CachedIdentify::new(Shared(inner.clone()), Duration::from_secs(60));
    cache.who("a").unwrap();
    cache.who("b").unwrap();
    assert_eq!(inner.calls.load(Ordering::SeqCst), 2);
}
