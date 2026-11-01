//! Who is asking: the token the client sends is shown to stabbypossum, which says whose it is. The
//! token itself is never stored, logged or used as a key.

use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq)]
pub enum AuthError {
    /// The server does not know this token.
    Unauthorized,
    /// The server could not be asked, or answered something that is not an account.
    Unavailable,
}

pub trait Identify: Send + Sync {
    /// The local user name (the `uid` of stabbypossum's `user/<uid>` folder) the token belongs to.
    fn who(&self, token: &str) -> Result<String, AuthError>;
}

/// A user name that can be a folder name here and cannot be the shared owner "*".
fn uid_ok(name: &str) -> bool {
    !name.is_empty() && name.len() <= 64 && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
}

pub struct HttpIdentify {
    agent: ureq::Agent,
    url: String,
}

impl HttpIdentify {
    pub fn new(server: &str) -> HttpIdentify {
        HttpIdentify {
            agent: ureq::AgentBuilder::new().timeout_connect(Duration::from_secs(3)).timeout(Duration::from_secs(5)).build(),
            url: format!("{}/api/v1/accounts/verify_credentials", server.trim_end_matches('/')),
        }
    }
}

impl Identify for HttpIdentify {
    fn who(&self, token: &str) -> Result<String, AuthError> {
        let response = self.agent.get(&self.url).set("Authorization", &format!("Bearer {token}")).call();
        match response {
            Ok(r) => {
                let text = r.into_string().map_err(|_| AuthError::Unavailable)?;
                let body: serde_json::Value = serde_json::from_str(&text).map_err(|_| AuthError::Unavailable)?;
                match body.get("username").and_then(|u| u.as_str()) {
                    Some(name) if uid_ok(name) => Ok(name.to_string()),
                    _ => Err(AuthError::Unavailable),
                }
            }
            // stabbypossum answers 422, not 401, to verify_credentials with a bad token.
            Err(ureq::Error::Status(401 | 403 | 422, _)) => Err(AuthError::Unauthorized),
            Err(_) => Err(AuthError::Unavailable),
        }
    }
}

/// Remembers a successful answer for `ttl`, under the SHA-256 of the token. Failures are asked again.
pub struct CachedIdentify<I: Identify> {
    inner: I,
    ttl: Duration,
    seen: Mutex<HashMap<String, (String, Instant)>>,
}

/// Valid tokens only ever fill the cache; this bounds it all the same.
const MAX_CACHED: usize = 1000;

impl<I: Identify> CachedIdentify<I> {
    pub fn new(inner: I, ttl: Duration) -> CachedIdentify<I> {
        CachedIdentify { inner, ttl, seen: Mutex::new(HashMap::new()) }
    }

    #[cfg(test)]
    fn keys(&self) -> Vec<String> {
        self.seen.lock().unwrap().keys().cloned().collect()
    }
}

impl<I: Identify> Identify for CachedIdentify<I> {
    fn who(&self, token: &str) -> Result<String, AuthError> {
        let key = format!("{:x}", Sha256::digest(token.as_bytes()));
        if let Some((uid, at)) = self.seen.lock().unwrap().get(&key) {
            if at.elapsed() < self.ttl {
                return Ok(uid.clone());
            }
        }
        let uid = self.inner.who(token)?;
        let mut seen = self.seen.lock().unwrap();
        if seen.len() >= MAX_CACHED {
            seen.retain(|_, (_, at)| at.elapsed() < self.ttl);
            if seen.len() >= MAX_CACHED {
                seen.clear();
            }
        }
        seen.insert(key, (uid.clone(), Instant::now()));
        Ok(uid)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixed;
    impl Identify for Fixed {
        fn who(&self, _token: &str) -> Result<String, AuthError> {
            Ok("oh_pyt".to_string())
        }
    }

    #[test]
    fn cache_key_is_not_the_token() {
        let cache = CachedIdentify::new(Fixed, std::time::Duration::from_secs(60));
        cache.who("secret-token-123").unwrap();
        let keys = cache.keys();
        assert_eq!(keys.len(), 1);
        assert!(!keys[0].contains("secret"));
        assert_eq!(keys[0].len(), 64);
        assert!(keys[0].chars().all(|c| c.is_ascii_hexdigit()));
    }
}
