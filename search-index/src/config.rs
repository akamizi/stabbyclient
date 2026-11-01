use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq)]
pub struct Config {
    pub data_dir: PathBuf,
    pub index_file: PathBuf,
    pub listen: String,
    pub server: String,
    pub interval_secs: u64,
}

/// Reads the flags of the service: --data-dir and --index-file are required, the rest have defaults.
pub fn parse(args: &[String]) -> Result<Config, String> {
    let mut data_dir = None;
    let mut index_file = None;
    let mut listen = "127.0.0.1:8002".to_string();
    let mut server = "http://127.0.0.1:8001".to_string();
    let mut interval_secs = 30;
    let mut it = args.iter();
    while let Some(flag) = it.next() {
        let mut value = || it.next().cloned().ok_or_else(|| format!("{flag} needs a value"));
        match flag.as_str() {
            "--data-dir" => data_dir = Some(PathBuf::from(value()?)),
            "--index-file" => index_file = Some(PathBuf::from(value()?)),
            "--listen" => listen = value()?,
            "--server" => server = value()?,
            "--interval" => interval_secs = value()?.parse().map_err(|_| "--interval needs a whole number of seconds".to_string())?,
            other => return Err(format!("unknown flag {other}")),
        }
    }
    Ok(Config {
        data_dir: data_dir.ok_or("--data-dir is required")?,
        index_file: index_file.ok_or("--index-file is required")?,
        listen,
        server,
        interval_secs,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn parse_takes_flags_and_defaults() {
        let c = parse(&args(&["--data-dir", "/d", "--index-file", "/i.db"])).unwrap();
        assert_eq!(c.data_dir, PathBuf::from("/d"));
        assert_eq!(c.index_file, PathBuf::from("/i.db"));
        assert_eq!(c.listen, "127.0.0.1:8002");
        assert_eq!(c.server, "http://127.0.0.1:8001");
        assert_eq!(c.interval_secs, 30);
    }

    #[test]
    fn parse_takes_the_optional_flags() {
        let c = parse(&args(&["--data-dir", "/d", "--index-file", "/i.db", "--listen", "127.0.0.1:9", "--server", "http://h:1", "--interval", "5"])).unwrap();
        assert_eq!((c.listen.as_str(), c.server.as_str(), c.interval_secs), ("127.0.0.1:9", "http://h:1", 5));
    }

    #[test]
    fn parse_requires_data_dir_and_index_file() {
        assert!(parse(&args(&["--index-file", "/i.db"])).is_err());
        assert!(parse(&args(&["--data-dir", "/d"])).is_err());
    }

    #[test]
    fn parse_rejects_unknown_flag() {
        assert!(parse(&args(&["--data-dir", "/d", "--index-file", "/i.db", "--nope", "x"])).is_err());
    }
}
