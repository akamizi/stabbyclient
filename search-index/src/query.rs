//! What a person types into the search box, as a full-text query that cannot be a syntax error:
//! every word is quoted (so AND, NEAR, -, * and brackets are just words), quotes group a phrase,
//! the last word also matches as a prefix.

fn has_text(word: &str) -> bool {
    word.chars().any(char::is_alphanumeric)
}

/// The MATCH string for `q`, or None when no word is left in it.
pub fn to_fts(q: &str) -> Option<String> {
    // Each unit is a word or a phrase (several words, flagged true).
    let mut units: Vec<(String, bool)> = Vec::new();
    // Outside the quotes: words. Between a pair of quotes: a phrase. A quote left open is ignored.
    let mut inside = false;
    let pieces: Vec<&str> = q.split('"').collect();
    let last = pieces.len().saturating_sub(1);
    for (index, piece) in pieces.iter().enumerate() {
        if inside && index != last {
            let words: Vec<&str> = piece.split_whitespace().filter(|w| has_text(w)).collect();
            if !words.is_empty() {
                units.push((words.join(" "), true));
            }
        } else {
            for word in piece.split_whitespace().filter(|w| has_text(w)) {
                units.push((word.to_string(), false));
            }
        }
        inside = !inside;
    }
    let count = units.len();
    if count == 0 {
        return None;
    }
    let quoted: Vec<String> = units
        .into_iter()
        .enumerate()
        .map(|(i, (text, phrase))| if i + 1 == count && !phrase { format!("\"{text}\"*") } else { format!("\"{text}\"") })
        .collect();
    Some(quoted.join(" "))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn words_are_anded_last_is_prefix() {
        assert_eq!(to_fts("donbas ucraina").as_deref(), Some("\"donbas\" \"ucraina\"*"));
    }

    #[test]
    fn quoted_phrase_is_one_unit() {
        assert_eq!(to_fts("\"battaglia decisiva\" donbas").as_deref(), Some("\"battaglia decisiva\" \"donbas\"*"));
    }

    #[test]
    fn a_phrase_at_the_end_gets_no_prefix() {
        assert_eq!(to_fts("donbas \"battaglia decisiva\"").as_deref(), Some("\"donbas\" \"battaglia decisiva\""));
    }

    #[test]
    fn fts_operators_are_plain_words() {
        assert_eq!(to_fts("AND NEAR ( - *").as_deref(), Some("\"AND\" \"NEAR\"*"));
    }

    #[test]
    fn unbalanced_quote_is_tolerated() {
        assert_eq!(to_fts("\"abc").as_deref(), Some("\"abc\"*"));
        assert_eq!(to_fts("\"abc def").as_deref(), Some("\"abc\" \"def\"*"));
    }

    #[test]
    fn empty_or_punctuation_only_is_none() {
        for q in ["", "   ", "()", "--", "\"\"", "\" - \""] {
            assert_eq!(to_fts(q), None, "query {q:?}");
        }
    }

    #[test]
    fn a_word_keeps_its_accents() {
        assert_eq!(to_fts("perché").as_deref(), Some("\"perché\"*"));
    }
}
