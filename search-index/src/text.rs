//! The text of a post as it is searched: tags gone, entities decoded, blocks and breaks as spaces.

const BLOCKS: [&str; 12] = ["br", "p", "div", "li", "ul", "ol", "blockquote", "pre", "tr", "h1", "h2", "h3"];

fn is_tag_start(rest: &str) -> bool {
    let mut chars = rest.chars();
    chars.next() == Some('<') && matches!(chars.next(), Some(c) if c.is_ascii_alphabetic() || c == '/' || c == '!')
}

fn is_block(tag: &str) -> bool {
    let name: String = tag.trim_start_matches('/').chars().take_while(|c| c.is_ascii_alphanumeric()).collect();
    BLOCKS.contains(&name.to_ascii_lowercase().as_str())
}

fn entity(name: &str) -> Option<char> {
    match name {
        "amp" => Some('&'),
        "lt" => Some('<'),
        "gt" => Some('>'),
        "quot" => Some('"'),
        "nbsp" => Some(' '),
        _ => {
            let digits = name.strip_prefix('#')?;
            let code = match digits.strip_prefix(['x', 'X']) {
                Some(hex) => u32::from_str_radix(hex, 16).ok()?,
                None => digits.parse().ok()?,
            };
            char::from_u32(code)
        }
    }
}

/// `html` without its markup, as plain text with single spaces.
pub fn plain_text(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut i = 0;
    while i < html.len() {
        let rest = &html[i..];
        if is_tag_start(rest) {
            match rest.find('>') {
                Some(end) => {
                    if is_block(&rest[1..end]) {
                        out.push(' ');
                    }
                    i += end + 1;
                    continue;
                }
                None => {
                    // An unclosed tag is cut off, as a browser would.
                    break;
                }
            }
        }
        if rest.starts_with('&') {
            // The longest entity is "&#x10FFFF;": look only that far for the semicolon, so a text full of
            // ampersands is read in linear time. ';' is ASCII, so the index is a character boundary.
            let window = &rest.as_bytes()[1..rest.len().min(11)];
            if let Some(end) = window.iter().position(|&b| b == b';') {
                if let Some(c) = entity(&rest[1..1 + end]) {
                    out.push(c);
                    i += end + 2;
                    continue;
                }
            }
        }
        let c = rest.chars().next().unwrap();
        out.push(c);
        i += c.len_utf8();
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_tags_and_decodes_entities() {
        assert_eq!(plain_text("a &amp; b <b>c</b> &lt;d&gt; &quot;e&quot; &#39;f&#39; &#233;"), "a & b c <d> \"e\" 'f' é");
    }

    #[test]
    fn unknown_entities_stay_as_they_are() {
        assert_eq!(plain_text("x &foo; y"), "x &foo; y");
    }

    #[test]
    fn breaks_become_spaces() {
        assert_eq!(plain_text("uno<br>due</p><p>tre"), "uno due tre");
    }

    #[test]
    fn collapses_whitespace() {
        assert_eq!(plain_text("a \n\t b"), "a b");
    }

    #[test]
    fn keeps_accents_and_emoji() {
        assert_eq!(plain_text("perché 🎉"), "perché 🎉");
    }

    #[test]
    fn many_ampersands_without_a_semicolon_are_read_in_linear_time() {
        let html = "&".repeat(400_000);
        let started = std::time::Instant::now();
        assert_eq!(plain_text(&html).len(), 400_000);
        assert!(started.elapsed() < std::time::Duration::from_secs(1), "took {:?}", started.elapsed());
    }

    #[test]
    fn a_lone_angle_bracket_is_text() {
        assert_eq!(plain_text("1 < 2 e 3 > 2"), "1 < 2 e 3 > 2");
    }
}
