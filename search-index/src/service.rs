//! Puts the parts together: a first pass over the archive, then a thread that repeats it and a server
//! that answers. Nothing here logs a token.

use crate::auth::Identify;
use crate::index::Index;
use crate::server::{serve, State};
use crate::sync::{format_state, sync_once, FormatState, Report};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub struct Running {
    pub state: Arc<State>,
}

/// `2026-11-01T10:00:00Z` for now (days-to-date by the civil calendar algorithm, no time library).
fn now_iso() -> String {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
    let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z", rem / 3600, rem % 3600 / 60, rem % 60)
}

fn pass(state: &State, data_dir: &std::path::Path) {
    let started = Instant::now();
    let report: Report = {
        let mut index = state.index.lock().unwrap_or_else(|p| p.into_inner());
        sync_once(data_dir, &mut index)
    };
    let format = format_state(&report);
    *state.format.lock().unwrap_or_else(|p| p.into_inner()) = format;
    eprintln!(
        "sync: added={} updated={} removed={} skipped={} total={} format={} in {:?}",
        report.added,
        report.updated,
        report.removed,
        report.skipped,
        report.total,
        if format == FormatState::Ok { "ok" } else { "UNRECOGNIZED" },
        started.elapsed()
    );
    *state.last_sync.lock().unwrap_or_else(|p| p.into_inner()) = Some((now_iso(), report));
}

/// Indexes once, then listens on `listen` and keeps indexing every `interval`, both on threads of
/// their own. Fails only if the address cannot be bound.
pub fn start(data_dir: PathBuf, index: Index, identify: Box<dyn Identify>, listen: &str, interval: Duration) -> std::io::Result<Running> {
    let state = Arc::new(State { identify, index: Mutex::new(index), format: Mutex::new(FormatState::Ok), last_sync: Mutex::new(None) });
    pass(&state, &data_dir);

    let server = tiny_http::Server::http(listen).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
    let for_server = Arc::clone(&state);
    std::thread::spawn(move || serve(for_server, server));
    let for_sync = Arc::clone(&state);
    std::thread::spawn(move || loop {
        std::thread::sleep(interval);
        pass(&for_sync, &data_dir);
    });
    Ok(Running { state })
}
