fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match stabby_search::config::parse(&args) {
        Ok(config) => println!("{config:?}"),
        Err(e) => {
            eprintln!("stabby-search: {e}");
            std::process::exit(2);
        }
    }
}
