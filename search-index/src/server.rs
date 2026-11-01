//! The HTTP side: two routes, answered by a plain function (`handle`) so they can be tested without a
//! socket, and a thin `serve` around `tiny_http`. nginx removes the `/app/search/` prefix.

use crate::auth::{AuthError, Identify};
use crate::index::Index;
use crate::query::to_fts;
use crate::sync::{FormatState, Report};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};

pub struct Request {
    pub path: String,
    /// The raw query string, without the `?`.
    pub query: String,
    /// The token of `Authorization: Bearer …`.
    pub token: Option<String>,
}

pub struct Response {
    pub status: u16,
    pub body: String,
}

pub struct State {
    pub identify: Box<dyn Identify>,
    pub index: Mutex<Index>,
    pub format: Mutex<FormatState>,
    /// When the index last followed the archive (a timestamp the caller writes) and what that pass did.
    pub last_sync: Mutex<Option<(String, Report)>>,
}

const DEFAULT_LIMIT: usize = 20;
const MAX_LIMIT: usize = 40;
const MAX_ACCOUNTS: usize = 10;

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn reply(status: u16, body: Value) -> Response {
    Response { status, body: body.to_string() }
}

fn error(status: u16, code: &str) -> Response {
    reply(status, json!({ "error": code }))
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < bytes.len() && bytes[i + 1].is_ascii_hexdigit() && bytes[i + 2].is_ascii_hexdigit() => {
                out.push(u8::from_str_radix(&s[i + 1..i + 3], 16).unwrap());
                i += 2;
            }
            b => out.push(b),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn params(query: &str) -> HashMap<String, String> {
    query
        .split('&')
        .filter(|p| !p.is_empty())
        .map(|pair| {
            let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
            (percent_decode(k), percent_decode(v))
        })
        .collect()
}

pub fn handle(state: &State, req: &Request) -> Response {
    match req.path.as_str() {
        "/v1/status" => status(state),
        "/v1/search" => search(state, req),
        _ => error(404, "not_found"),
    }
}

fn status(state: &State) -> Response {
    let (statuses, profiles) = lock(&state.index).counts();
    let format = match *lock(&state.format) {
        FormatState::Ok => "ok",
        FormatState::Unrecognized => "unrecognized",
    };
    let last_sync = lock(&state.last_sync).as_ref().map(|(at, r)| {
        json!({ "at": at, "added": r.added, "updated": r.updated, "removed": r.removed, "skipped": r.skipped, "total": r.total })
    });
    reply(200, json!({ "statuses": statuses, "profiles": profiles, "format": format, "last_sync": last_sync }))
}

fn search(state: &State, req: &Request) -> Response {
    let Some(token) = req.token.as_deref().filter(|t| !t.is_empty()) else {
        return error(401, "unauthorized");
    };
    let uid = match state.identify.who(token) {
        Ok(uid) => uid,
        Err(AuthError::Unauthorized) => return error(401, "unauthorized"),
        Err(AuthError::Unavailable) => return error(503, "identity_unavailable"),
    };
    if *lock(&state.format) == FormatState::Unrecognized {
        return error(503, "format_unrecognized");
    }

    let p = params(&req.query);
    let Some(fts) = p.get("q").and_then(|q| to_fts(q)) else {
        return reply(200, json!({ "statuses": [], "accounts": [], "total": 0 }));
    };
    let limit = p.get("limit").and_then(|v| v.parse::<usize>().ok()).unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let offset = p.get("offset").and_then(|v| v.parse::<usize>().ok()).unwrap_or(0);

    let index = lock(&state.index);
    let found = index.search_statuses(&uid, &fts, limit, offset);
    let total = index.count_statuses(&uid, &fts);
    let accounts = if offset == 0 { index.search_profiles(&fts, MAX_ACCOUNTS) } else { Ok(Vec::new()) };
    let (Ok(found), Ok(total), Ok(accounts)) = (found, total, accounts) else {
        return error(500, "internal");
    };
    let statuses: Vec<Value> = found.iter().filter_map(|s| serde_json::from_str(s).ok()).collect();
    let accounts: Vec<Value> = accounts.iter().map(|a| json!({ "acct": a.acct, "display_name": a.display_name })).collect();
    reply(200, json!({ "statuses": statuses, "accounts": accounts, "total": total }))
}

fn respond(state: &State, request: tiny_http::Request) {
    let header = |name: &str, value: &str| tiny_http::Header::from_bytes(name.as_bytes(), value.as_bytes()).unwrap();
    let answer = if request.method() != &tiny_http::Method::Get {
        error(405, "method_not_allowed")
    } else {
        let url = request.url().to_string();
        let (path, query) = url.split_once('?').unwrap_or((url.as_str(), ""));
        let token = request
            .headers()
            .iter()
            .find(|h| h.field.equiv("Authorization"))
            .and_then(|h| {
                let v = h.value.as_str();
                (v.len() > 7 && v[..7].eq_ignore_ascii_case("bearer ")).then(|| v[7..].trim().to_string())
            });
        handle(state, &Request { path: path.to_string(), query: query.to_string(), token })
    };
    let response = tiny_http::Response::from_string(answer.body)
        .with_status_code(answer.status)
        .with_header(header("Content-Type", "application/json"))
        .with_header(header("Cache-Control", "no-store"));
    let _ = request.respond(response);
}

/// Listens on `listen` (meant to be 127.0.0.1) and answers until the process ends.
pub fn serve(state: Arc<State>, listen: &str) -> std::io::Result<()> {
    let server = tiny_http::Server::http(listen).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
    for request in server.incoming_requests() {
        let state = Arc::clone(&state);
        std::thread::spawn(move || respond(&state, request));
    }
    Ok(())
}
