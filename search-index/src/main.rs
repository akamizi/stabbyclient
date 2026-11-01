use stabby_search::auth::{CachedIdentify, HttpIdentify};
use stabby_search::index::Index;
use std::time::Duration;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let config = match stabby_search::config::parse(&args) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("stabby-search: {e}");
            std::process::exit(2);
        }
    };
    let index = match Index::open(&config.index_file) {
        Ok(i) => i,
        Err(e) => {
            eprintln!("stabby-search: cannot open {}: {e}", config.index_file.display());
            std::process::exit(1);
        }
    };
    let identify = CachedIdentify::new(HttpIdentify::new(&config.server), Duration::from_secs(60));
    match stabby_search::service::start(config.data_dir, index, Box::new(identify), &config.listen, Duration::from_secs(config.interval_secs)) {
        Ok(_running) => {
            eprintln!("stabby-search: listening on {}", config.listen);
            loop {
                std::thread::park();
            }
        }
        Err(e) => {
            eprintln!("stabby-search: cannot listen on {}: {e}", config.listen);
            std::process::exit(1);
        }
    }
}
