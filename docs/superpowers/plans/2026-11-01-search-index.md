# Indice di ricerca — piano di realizzazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un servizio Rust che indicizza i post e i profili salvati da stabbypossum e risponde alle ricerche del client in frazioni di secondo, un utente alla volta con i soli post che poteva vedere.

**Architecture:** Un eseguibile (`search-index/`) con quattro strati: lettore dell'archivio (solo lettura, l'unico che conosce il formato del server), indice SQLite FTS5, riconciliazione periodica, server HTTP locale che si fida del token solo dopo averlo fatto riconoscere a stabbypossum. Il client lo interroga per primo e ripiega sulla ricerca del server se manca.

**Tech Stack:** Rust 1.99 (`cargo` locale), `rusqlite` con `bundled` (FTS5), `serde_json`, `tiny_http`, `ureq`, `sha2`; test con `cargo test` (e con `tempfile`). Lato client: JavaScript e `node --test` (`npm test`).

**Spec:** `docs/superpowers/specs/2026-11-01-search-index-design.md`

## Global Constraints

- Il servizio non scrive mai nei dati di stabbypossum e non legge mai `token/`, `ui-session/`, `key.keystore`.
- Ascolta solo su `127.0.0.1` (porta predefinita `8002`); nginx lo espone sotto `/app/search/`.
- Risultati dal più recente (`created_at` decrescente); parole in AND, l'ultima anche prefisso, virgolette per le frasi, senza maiuscole né accenti; niente espressioni regolari.
- Ognuno vede i suoi: la separazione per utente è nella condizione della query. Le voci della federata (`owner = "*"`) le vedono tutti; i profili sono pubblici.
- Se il formato dei file non è riconosciuto il servizio smette di aggiornarsi e lo dice; il client ripiega sulla ricerca di sempre.
- Le stringhe dell'interfaccia stanno nei cataloghi `app/js/locales/{en,it}.js`; nei commit non si cita Claude (CLAUDE.md del progetto).
- Il percorso dei dati sull'host è `/srv/xenomorph/data/data` (contiene `object/`, `user/`, `maildir-v1/`).
- Compilare qui (glibc 2.41, come l'host Debian 13), `x86_64-unknown-linux-gnu`; se la glibc locale supera quella dell'host si ricompila sull'host.

## Review Focus

- Query con caratteri speciali di FTS5 (virgolette dispari, `*`, `-`, `(`, `AND`, `NEAR`): trattate come parole, mai un errore. → Task 4.
- Query vuota o di sola punteggiatura: risposta vuota, non un errore. → Task 4 e 8.
- Isolamento: un post nella Home di `oh_pyt` non compare per `admin`; un post in Home e nella federata compare una volta. → Task 5 e 9.
- Voce cancellata (`deleted` vero), voce sparita dalla timeline, oggetto diventato Tombstone: tolti dall'indice. → Task 6.
- File troncato o scritto a metà, JSON rovinato: saltato e contato, mai un crash; troppe voci illeggibili fermano l'aggiornamento. → Task 3 e 6.

---

### Task 1: Scheletro del crate e configurazione

**Files:**
- Create: `search-index/Cargo.toml`, `search-index/src/main.rs`, `search-index/src/lib.rs`, `search-index/src/config.rs`
- Modify: `.gitignore` (aggiungere `search-index/target/`)
- Test: `search-index/src/config.rs` (modulo `tests`)

**Interfaces:**
- Produces: `pub struct Config { pub data_dir: PathBuf, pub index_file: PathBuf, pub listen: String, pub server: String, pub interval_secs: u64 }`; `pub fn parse(args: &[String]) -> Result<Config, String>`.

- [ ] **Step 1: Test** `parse_takes_flags_and_defaults`: con `["--data-dir","/d","--index-file","/i.db"]` dà `listen == "127.0.0.1:8002"`, `server == "http://127.0.0.1:8001"`, `interval_secs == 30`; `parse_requires_data_dir_and_index_file` (errore se manca uno); `parse_rejects_unknown_flag`.
- [ ] **Step 2:** `cargo test --manifest-path search-index/Cargo.toml` → FAIL (`parse` non definita).
- [ ] **Step 3: Implementare** `Cargo.toml` (edition 2021, dipendenze di cui sopra, `rusqlite = { features = ["bundled"] }`), `lib.rs` che dichiara i moduli man mano, `config::parse` senza librerie per gli argomenti, e `main.rs` che per ora stampa la configurazione.
- [ ] **Step 4:** stesso comando → PASS.
- [ ] **Step 5: Commit** `git add search-index .gitignore` — "The search index service starts as a Rust crate that reads its flags".

### Task 2: Testo semplice dall'HTML

**Files:**
- Create: `search-index/src/text.rs`
- Test: stesso file

**Interfaces:**
- Produces: `pub fn plain_text(html: &str) -> String`.

- [ ] **Step 1: Test** `strips_tags_and_decodes_entities`: `"a &amp; b <b>c</b> &lt;d&gt; &quot;e&quot; &#39;f&#39; &#233;"` → `"a & b c <d> \"e\" 'f' é"` (le sei entità nominate `&amp; &lt; &gt; &quot; &#39; &nbsp;` più le numeriche `&#NNN;`; le altre restano com'è). `breaks_become_spaces`: `"uno<br>due</p><p>tre"` → `"uno due tre"`. `collapses_whitespace`: `"a \n\t b"` → `"a b"`. `keeps_accents_and_emoji`: `"perché 🎉"` invariato.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3: Implementare** `plain_text` a mano (scansione dei tag, `<br>`, `</p>` come spazio, entità numeriche e le sei nominate, spazi compressi).
- [ ] **Step 4:** → PASS. **Step 5: Commit** — "The text of a post is read without its HTML".

### Task 3: Lettore dell'archivio

**Files:**
- Create: `search-index/src/archive.rs`, `search-index/tests/fixtures/mod.rs` (costruisce un archivio finto in una cartella temporanea)
- Test: `search-index/tests/archive.rs`

**Interfaces:**
- Produces:
  - `pub enum Owner { User(String), Federated }` con `fn key(&self) -> String` (uid, oppure `"*"`).
  - `pub struct EntryRef { pub owner: Owner, pub path: PathBuf, pub name: String, pub mtime: i64 }`
  - `pub struct Entry { pub object_id: String, pub deleted: bool, pub revision: String, pub projection: serde_json::Value }`
  - `pub struct Profile { pub id: String, pub username: String, pub display_name: String, pub acct: String, pub note: String }`
  - `pub enum Object { Profile(Profile), Tombstone { id: String }, Other }`
  - `pub struct ObjectRef { pub path: PathBuf, pub mtime: i64 }`
  - `pub enum ReadError { Io(String), Format(String) }`
  - `pub fn list_entries(data_dir: &Path) -> Vec<EntryRef>`: voci `*.json` sotto `user/*/maildir-v1/home/{new,cur}/**` e `maildir-v1/federated/{new,cur}/**`; ignora `gone`, `tmp`.
  - `pub fn read_entry(path: &Path) -> Result<Entry, ReadError>`: busta con `object_id`, `deleted`, `revision`, `projection` (oggetto con `id` e `created_at`); manca un campo → `Format`.
  - `pub fn list_objects(data_dir: &Path) -> Vec<ObjectRef>`: `object/*.json`; `pub fn read_object(path: &Path) -> Result<Object, ReadError>`: `Person`/`Service`/`Group` → `Profile` con `acct = preferredUsername@host dell'id`; `Tombstone` → `Tombstone`; altro `Other`.

- [ ] **Step 1: Prima di scrivere codice, guardare sull'host** (sola lettura) come sono fatti un post nascosto e una voce cancellata: `ls /srv/xenomorph/data/data/user/oh_pyt/hidden | head`, un file di `.../home/gone` e di `.../home/new` con `"deleted": true` (se esiste), e come `read_object` deve ricavare `host` da un `id` come `https://mastodon.uno/users/valigiablu`. Annotare l'esito nella sezione 9 della specifica. Se `hidden` elenca id di oggetti, aggiungere `pub fn hidden_ids(data_dir:&Path, uid:&str) -> HashSet<String>` (con test) e usarlo nel Task 6; se i nascosti sono già assenti dalle timeline, scriverlo nella specifica e non aggiungere nulla.
- [ ] **Step 2: Test** (con archivio finto): `lists_home_and_federated_not_gone`; `reads_a_valid_entry`; `entry_without_projection_is_format_error`; `truncated_json_is_format_error_not_panic`; `person_gives_profile_with_acct` (`id "https://mastodon.uno/users/valigiablu"`, `preferredUsername "valigiablu"` → `acct "valigiablu@mastodon.uno"`); `tombstone_is_recognised`; `note_object_is_other`.
- [ ] **Step 3:** → FAIL. **Step 4: Implementare** (solo `std::fs`, `serde_json`; nessuna scrittura). **Step 5:** → PASS. **Step 6: Commit** — "The archive reader: timeline entries, profiles and tombstones, read-only".

### Task 4: Sintassi della ricerca

**Files:**
- Create: `search-index/src/query.rs`
- Test: stesso file

**Interfaces:**
- Produces: `pub fn to_fts(q: &str) -> Option<String>` — `None` se non resta nessuna parola; altrimenti una stringa MATCH di FTS5 dove ogni parola è racchiusa tra virgolette doppie (con `"` interne raddoppiate), l'ultima parola (se non fa parte di una frase tra virgolette) seguita da `*`, le frasi tra virgolette sono una sola unità, le parole sono in AND implicito.

- [ ] **Step 1: Test:** `words_are_anded_last_is_prefix` (`"donbas ucraina"` → `"\"donbas\" \"ucraina\"*"`); `quoted_phrase_is_one_unit` (`"\"battaglia decisiva\" donbas"` → `"\"battaglia decisiva\" \"donbas\"*"`); `fts_operators_are_plain_words` (`"AND NEAR ( - *"` non produce errore e ogni token è tra virgolette); `unbalanced_quote_is_tolerated` (`"\"abc"` → `"\"abc\"*"`); `empty_or_punctuation_only_is_none` (`""`, `"   "`, `"()"`, `"--"`).
- [ ] **Step 2:** → FAIL. **Step 3: Implementare** il tokenizzatore (spazi e virgolette; scartare i token senza lettere né cifre). **Step 4:** → PASS. **Step 5: Commit** — "The search words become a safe full-text query".

### Task 5: Indice SQLite

**Files:**
- Create: `search-index/src/index.rs`
- Test: `search-index/tests/index.rs`

**Interfaces:**
- Consumes: `archive::Profile`.
- Produces:
  - `pub struct StatusDoc { pub owner: String, pub entry_key: String, pub object_id: String, pub status_id: String, pub created_at: String, pub revision: String, pub mtime: i64, pub text: String, pub projection: String }`
  - `pub struct Index` con `open(path: &Path) -> rusqlite::Result<Index>`, `open_memory() -> rusqlite::Result<Index>`;
  - `upsert_status(&mut self, d: &StatusDoc) -> rusqlite::Result<()>`; `remove_status(&mut self, owner: &str, entry_key: &str) -> rusqlite::Result<()>`; `remove_object(&mut self, object_id: &str) -> rusqlite::Result<usize>`;
  - `known_entries(&self) -> rusqlite::Result<HashMap<(String, String), (String, i64)>>` (chiave `(owner, entry_key)`, valore `(revision, mtime)`);
  - `search_statuses(&self, user: &str, fts: &str, limit: usize, offset: usize) -> rusqlite::Result<Vec<String>>` (le `projection`, `created_at` decrescente, una per `status_id` anche se la voce c'è per più proprietari); `count_statuses(&self, user: &str, fts: &str) -> rusqlite::Result<usize>`;
  - `upsert_profile(&mut self, p: &Profile, mtime: i64)`; `remove_profile(&mut self, id: &str)`; `known_profiles(&self) -> HashMap<String, i64>`; `search_profiles(&self, fts: &str, limit: usize) -> rusqlite::Result<Vec<Profile>>`;
  - `counts(&self) -> (usize, usize)` (post, profili).
- Schema: tabella `entries(id INTEGER PRIMARY KEY, owner, entry_key, object_id, status_id, created_at, revision, mtime, projection, UNIQUE(owner, entry_key))` e tabella FTS5 `entries_fts(text)` con `tokenize='unicode61 remove_diacritics 2'`, rowid = `entries.id`; stesso schema per i profili (testo = nome utente, nome visualizzato, acct, nota). La visibilità sta nella condizione: `owner = ?user OR owner = '*'`.

- [ ] **Step 1: Test:** `search_finds_by_prefix_and_ignores_accents_and_case` (`"perché"` trovato con `perche`); `results_are_newest_first`; `a_user_never_sees_another_users_entry` (stesso testo in `oh_pyt` e in `admin`: ognuno vede solo il proprio); `federated_entries_are_seen_by_everyone`; `a_status_in_home_and_federated_is_returned_once` (stesso `status_id`); `limit_and_offset_page_the_results`; `upsert_replaces_text_of_a_changed_entry`; `remove_object_drops_every_entry_of_that_object`; `profiles_are_found_by_username_prefix_and_display_name`; `offset_past_the_end_is_empty`.
- [ ] **Step 2:** → FAIL. **Step 3: Implementare** con `rusqlite`, in modalità WAL per il file; `upsert` in una transazione che tiene allineate `entries` e `entries_fts`. **Step 4:** → PASS. **Step 5: Commit** — "The index: per-user visibility, newest first, accents ignored".

### Task 6: Riconciliazione

**Files:**
- Create: `search-index/src/sync.rs`
- Test: `search-index/tests/sync.rs`

**Interfaces:**
- Consumes: `archive::{list_entries, read_entry, list_objects, read_object, EntryRef, Owner}`, `index::{Index, StatusDoc}`, `text::plain_text`.
- Produces: `pub struct Report { pub added: usize, pub updated: usize, pub removed: usize, pub skipped: usize, pub total: usize }`; `pub enum FormatState { Ok, Unrecognized }`; `pub fn sync_once(data_dir: &Path, index: &mut Index) -> Report`; `pub fn format_state(r: &Report) -> FormatState` (`Unrecognized` se `skipped > 50 && skipped * 5 > total`; i soli errori `ReadError::Format` contano in `skipped`, un `Io` si riprova al giro dopo).
- Testo indicizzato di un post: `plain_text(content)` + `spoiler_text` + `account.display_name` + `account.acct` + i `tags[].name`; per un boost (`projection.reblog` non nullo) quelli del post boostato più il nome di chi boosta; `status_id` = `projection.id` (per un boost, l'id esterno), `created_at` = `projection.created_at`.

- [ ] **Step 1: Test:** `first_sync_adds_every_entry_and_profile`; `second_sync_changes_nothing`; `a_changed_revision_updates_the_text`; `an_entry_that_leaves_the_timeline_is_removed`; `a_deleted_entry_is_not_indexed_and_is_removed_if_present`; `a_tombstone_object_removes_its_entries`; `a_truncated_entry_is_skipped_and_counted_and_the_rest_is_indexed`; `a_boost_is_found_by_the_boosted_posts_text`; `format_state_turns_unrecognized_past_the_threshold` (51 voci rovinate su 200 → `Unrecognized`; 50 su 200 → `Ok`).
- [ ] **Step 2:** → FAIL. **Step 3: Implementare** `sync_once`: confronta `known_entries()` con `list_entries()` (stessa `revision`/`mtime` → nessuna lettura); rimuove ciò che non c'è più; poi i profili con `list_objects()` e `known_profiles()`; i Tombstone chiamano `remove_object`. Se il Task 3 ha trovato un elenco di nascosti, escludere quegli `object_id` per quell'utente. **Step 4:** → PASS. **Step 5: Commit** — "The sync keeps the index in step with the archive and says when it cannot read it".

### Task 7: Chi sta chiedendo

**Files:**
- Create: `search-index/src/auth.rs`
- Test: `search-index/tests/auth.rs`

**Interfaces:**
- Produces: `pub enum AuthError { Unauthorized, Unavailable }`; `pub trait Identify: Send + Sync { fn who(&self, token: &str) -> Result<String, AuthError>; }`; `pub struct HttpIdentify { … }` con `HttpIdentify::new(server: &str)`: `GET {server}/api/v1/accounts/verify_credentials` con `Authorization: Bearer …`, ricava `username` (l'`uid` locale); 401/403/422 → `Unauthorized`, altro errore o nessuna risposta → `Unavailable`; `pub struct CachedIdentify<I: Identify> { … }` con `CachedIdentify::new(inner: I, ttl: Duration)` che tiene l'esito per circa un minuto, con chiave `sha256(token)` in esadecimale, mai il token, e non memorizza gli errori.

- [ ] **Step 1: Test:** `http_identify_reads_username` (un `tiny_http` locale di prova risponde `{"username":"oh_pyt"}`); `http_identify_maps_401_and_422_to_unauthorized`; `unreachable_server_is_unavailable`; `cache_asks_once_within_the_ttl_and_again_after`; `cache_does_not_remember_failures`; `cache_key_is_not_the_token` (ispezionando le chiavi interne con un metodo `#[cfg(test)]`).
- [ ] **Step 2:** → FAIL. **Step 3: Implementare** con `ureq` e `sha2`. **Step 4:** → PASS. **Step 5: Commit** — "The service learns who is asking from stabbypossum, and remembers it for a minute".

### Task 8: Server HTTP

**Files:**
- Create: `search-index/src/server.rs`
- Test: `search-index/tests/server.rs`

**Interfaces:**
- Consumes: `index::Index`, `query::to_fts`, `auth::Identify`, `sync::{Report, FormatState}`.
- Produces: `pub struct Request { pub path: String, pub query: String, pub token: Option<String> }`; `pub struct Response { pub status: u16, pub body: String }`; `pub struct State { pub identify: Box<dyn Identify>, pub index: Mutex<Index>, pub format: Mutex<FormatState>, pub last_sync: Mutex<Option<(String, Report)>> }`; `pub fn handle(state: &State, req: &Request) -> Response`; `pub fn serve(state: Arc<State>, listen: &str) -> std::io::Result<()>` (un thread per richiesta, `tiny_http`, legge il token da `Authorization: Bearer`).
- Percorsi (nginx toglie il prefisso `/app/search/`): `GET /v1/search?q=…&limit=20&offset=0` → `200 {"statuses":[<projection>…],"accounts":[{"acct","display_name"}…],"total":N}` (`limit` al massimo 40, predefinito 20; gli account al massimo 10, solo con `offset=0`); `GET /v1/status` (senza token) → `{"statuses":N,"profiles":M,"format":"ok"|"unrecognized","last_sync":{…}|null}`.
- Codici: senza token o `Unauthorized` → 401 `{"error":"unauthorized"}`; `Unavailable` → 503 `{"error":"identity_unavailable"}`; `FormatState::Unrecognized` → 503 `{"error":"format_unrecognized"}`; query senza parole → 200 con liste vuote e `total` 0; altro percorso → 404.

- [ ] **Step 1: Test** (con un `Identify` finto): `search_returns_only_the_askers_statuses`; `status_ids_and_projection_are_returned_as_stored`; `no_token_is_401_and_invalid_token_is_401`; `identity_unavailable_is_503`; `unrecognized_format_is_503_on_search_but_status_still_answers`; `empty_query_gives_empty_lists_not_an_error`; `fts_syntax_in_the_query_is_not_an_error` (`q=("abc`); `limit_is_capped_at_40`; `accounts_only_on_the_first_page`; `unknown_path_is_404`; `the_token_is_never_in_a_response_body`.
- [ ] **Step 2:** → FAIL. **Step 3: Implementare** `handle` come funzione pura sullo stato e `serve` come involucro sottile. **Step 4:** → PASS. **Step 5: Commit** — "The search service answers /v1/search and /v1/status".

### Task 9: Avvio e prova di insieme

**Files:**
- Modify: `search-index/src/main.rs`
- Test: `search-index/tests/end_to_end.rs`

**Interfaces:**
- Consumes: tutti i moduli. `main`: `config::parse`, apre l'indice, esegue `sync_once` prima di mettersi in ascolto, avvia un thread che ripete `sync_once` ogni `interval_secs` e aggiorna `State.format` e `State.last_sync`, poi `serve`. Scrive sul log una riga per giro (`added/updated/removed/skipped`, durata); mai il token.

- [ ] **Step 1: Test** `two_users_see_only_their_own_through_http`: archivio finto con `oh_pyt` (due post), `admin` (un post) e una voce in federata; `Identify` finto che mappa `tok-a` → `oh_pyt` e `tok-b` → `admin`; si avvia il servizio su una porta libera; `GET /v1/search?q=…` con ciascun token restituisce i post attesi e nessuno dell'altro; il post della federata compare per entrambi una volta.
- [ ] **Step 2:** → FAIL. **Step 3: Implementare** `main`. **Step 4:** `cargo test --manifest-path search-index/Cargo.toml` → tutto PASS; `cargo build --release --manifest-path search-index/Cargo.toml` → compila. **Step 5: Commit** — "The search service starts, indexes, keeps up and answers".

### Task 10: Il client usa il servizio

**Files:**
- Create: `app/js/search-index.js`, `tests/search-index.test.js`
- Modify: `app/js/more.js` (`searchPage`), `app/sw.js` (elenco `PRECACHE`), `tests/more.test.js`

**Interfaces:**
- Produces: `export const INDEX_PATH = "/app/search/v1/search"`; `export async function searchIndex(api, query, { signal } = {}): Promise<{ statuses: object[], accounts: { acct: string, display_name: string }[], total: number } | null>` — `null` per 404, 401, 503 o errore di rete (il client ripiega); un `AbortError` o `TimeoutError` si rilancia. Usa `api.get(INDEX_PATH, { q: query, limit: "20" }, { signal, timeoutMs: 10000 })`.
- Comportamento di `searchPage`: prima `searchIndex`; se risponde non `null`, mostra i post (`renderCard`) e risolve i primi dieci `acct` con `/api/v1/accounts/lookup` (`person(a)`), e per il resto chiama il server con `type: "hashtags"` e, solo se la query è un indirizzo `@utente@istanza`/`utente@istanza` o inizia con `https://`, anche con `type: "accounts"`; **non** lancia la ricerca di testo lenta. Se `searchIndex` dà `null`, tutto resta com'è oggi (contatti più ricerca del server). La riga di stato e Ferma valgono per entrambi i percorsi.

- [ ] **Step 1: Test** (`search-index.test.js`): `returns_the_service_answer`; `404_and_503_and_network_error_give_null`; `abort_is_not_swallowed`. (`more.test.js`): `search_uses_the_index_when_it_answers_and_does_not_start_the_slow_search` (nessuna chiamata a `/api/v2/search` senza `type`); `search_falls_back_to_the_server_when_the_index_is_missing`; `a_full_handle_also_asks_the_server_for_accounts`; `index_accounts_are_resolved_with_lookup_at_most_ten`; `an_empty_index_answer_says_nothing_found`.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3: Implementare**; aggiungere `/app/js/search-index.js` al `PRECACHE` di `app/sw.js` in ordine alfabetico (il test `deploy.test.js` lo esige). **Step 4:** `npm test` → PASS. **Step 5: Commit** — "The search asks the index service first and falls back to the server".

### Task 11: Distribuzione

**Files:**
- Create: `search-index/deploy/stabby-search.service`, `tools/deploy-search.sh`
- Modify: `deploy/nginx-app.conf`, `deploy/README.md`

**Interfaces:**
- `deploy/nginx-app.conf`: una `location /app/search/ { proxy_pass http://127.0.0.1:8002/; }` **prima** di `location /app/`, con le stesse intestazioni di sicurezza delle altre.
- `stabby-search.service`: utente `stabbysearch`, `ExecStart=/usr/local/bin/stabby-search --data-dir /srv/xenomorph/data/data --index-file /var/lib/stabbysearch/index.db`, `StateDirectory=stabbysearch`, `ReadOnlyPaths=/srv/xenomorph/data`, `NoNewPrivileges=yes`, `ProtectSystem=strict`, `Restart=on-failure`.
- `tools/deploy-search.sh root@HOST`: `cargo build --release`, copia l'eseguibile e l'unità, crea l'utente se manca, `systemctl daemon-reload`, `enable --now`, riavvia; non tocca nginx (resta un passo manuale documentato in `deploy/README.md`: aggiungere la `location`, `nginx -t`, ricaricare).

- [ ] **Step 1:** scrivere i tre file. **Step 2:** `sh -n tools/deploy-search.sh` senza errori e controllare che `deploy.test.js` (`npm test`) passi ancora. **Step 3: Commit** — "Deployment of the search service: unit, script, nginx location".
- [ ] **Step 4 (chiede il via dell'utente, tocca l'host):** `tools/deploy-search.sh root@x.y05.eu`, poi aggiungere a mano la `location` e ricaricare nginx.

### Task 12: Verifica sull'host

- [ ] **Step 1:** `curl -s http://127.0.0.1:8002/v1/status` sull'host → `"format":"ok"` e conteggi vicini a ~19.000 post e ~1.550 profili; annotare il tempo della prima scansione dal log (`journalctl -u stabby-search`).
- [ ] **Step 2:** dal browser, una ricerca di testo (es. `Donbas`) risponde in meno di un secondo e mostra gli stessi post che il server trova (la ricerca lenta del server si usa una volta sola come confronto, con Ferma pronto).
- [ ] **Step 3:** con il servizio fermato (`systemctl stop stabby-search`) la ricerca del client torna alla ricerca di sempre, senza errori visibili.
- [ ] **Step 4:** aggiornare la sezione 9 della specifica con ciò che si è verificato, e il `TODO.md` con ciò che resta. **Commit** — "The search index: what was verified on the host".
