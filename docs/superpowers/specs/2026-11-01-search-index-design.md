# Indice di ricerca — progetto

Servizio separato, di supporto al client, che indicizza i post e i profili
salvati da stabbypossum e risponde alle ricerche in millisecondi.

Convenzione: ciò che è detto dall'utente è scritto senza etichette; le scelte
mie (di chi ha scritto il documento) sono segnate **[scelta mia]**; i fatti
sull'host sono stati verificati il 2026-11-01 in sola lettura (istanza
`x.y05.eu`, stabbypossum `1.4.5+parang`, container `xenomorph`).

## 1. Perché esiste

- La ricerca di testo di stabbypossum (`Content_Search`, `/api/v2/search`) non
  usa un indice: legge dal disco il file di ogni post della Home e della
  timeline federata e applica il testo cercato, e sceglie i candidati con una
  selezione quadratica. Sull'istanza dell'utente una ricerca non risponde per
  decine di secondi (a volte oltre 40 s). Non c'entra la rete: la ricerca di
  testo è tutta locale.
- Stabbypossum **non è dell'utente e non accetta modifiche da lui**: il rimedio
  deve stare fuori dal server. Un servizio a parte non lo tocca e può essere
  tolto senza conseguenze.
- Il client (`app/js/more.js`, `searchPage`) oggi si limita a mostrare che la
  ricerca è in corso (riga di stato, secondi, Ferma, attesa fino a 180 s) e a
  elencare per primi i contatti per inizio del nome. Non può renderla veloce.

## 2. Obiettivi, non obiettivi, anti-obiettivi

Obiettivi
- Trovare un **vecchio post per argomento** (testo libero) e **un utente**
  per nome, tra **tutto ciò che il server ha salvato**, con risposta in
  frazioni di secondo.
- **Ognuno vede i suoi**: un utente locale trova solo ciò che avrebbe potuto
  vedere.
- Risultati **dal più recente al più vecchio**.
- Nessun cambiamento a stabbypossum.

Non obiettivi
- Non è un servizio generale per altre installazioni: se funziona anche per
  altri, bene, ma non è richiesto.
- Non sostituisce la ricerca del server per ciò che il server fa bene (hashtag,
  recupero di un profilo remoto per `utente@istanza`, recupero di un post da
  un indirizzo): il client continua a usarla per quelle.
- Niente ricerca per pertinenza, niente sinonimi, niente correzione dei refusi.
- Niente espressioni regolari (la ricerca del server le accetta, forse per
  caso). **[scelta mia]**

Anti-obiettivi (sarebbe un fallimento anche se "funziona")
- Che un utente trovi un post che non poteva vedere.
- Che l'indice mostri post cancellati.
- Che il servizio legga o esponga ciò che non serve: token, chiavi
  (`key.keystore`), sessioni.
- Che il client smetta di funzionare quando il servizio è spento: deve
  ripiegare sulla ricerca del server.

## 3. Fatti verificati sull'host

- Dati di stabbypossum: `/srv/xenomorph/data` sull'host, montato come
  `/var/lib/stabbypossum` nel container. File e cartelle sono leggibili da
  chiunque (permessi 644/755). Tutto pesa 437 MB.
- Archivio degli oggetti: `data/object/`, una sola cartella piatta con circa
  20.900 file `<md5 dell'id>.json`. Dentro: circa **19.050 post** (Note, Page,
  Article, Question, Video, Event, dal 2022-02-16 a oggi), **1.550 profili**
  (Person), 261 Tombstone (post cancellati). Campi di un post: `id`,
  `published`, `attributedTo`, `to`, `cc`, `content`, `inReplyTo`, `summary`,
  `updated`, `tag`, `attachment`, `url`. Altri 22.300 file `.idx` sono indici
  interni, da ignorare. Nessun JSON rovinato.
- Timeline in formato Maildir:
  - Home di ogni utente: `data/user/<uid>/maildir-v1/home/{new,cur,gone}/<partizione>/…`
    (`oh_pyt`: circa 17.900 voci, `admin`: circa 250 voci).
  - Federata, condivisa: `data/maildir-v1/federated/…` (circa 3.900 voci).
  - Una voce è un file `.json` il cui nome contiene l'ordine di arrivo, la data,
    gli md5 e il tipo (`…_status_….json`). Dentro, una busta con `object_id`,
    `deleted`, `projection_kind`, `revision` e **`projection`**: il post già
    nella forma dell'API Mastodon (campi `id`, `account`, `content`,
    `created_at`, `visibility`, `reblog`, `tags`, `mentions`, `url`, …), pronto
    per `renderCard` del client.
  - Nel campione guardato (300 voci) tutte `status`, nessuna cancellata,
    visibilità `public`, `unlisted`, `private`.
- Il server fa lo stesso per la sua ricerca: i candidati sono la Home
  dell'utente più la federata, tolti i post nascosti (`Content_Search`).
- Le Home sono **per utente**: sull'istanza gli utenti locali sono `oh_pyt` e
  `admin`. L'utente nota che `admin` non ha post suoi; ha comunque circa 250
  voci in Home, abbastanza per provare l'isolamento.
- Il formato interno è cambiato di recente (le timeline Maildir sono della
  1.3.0, 2026-10-28): non è un'interfaccia stabile.

## 4. Decisioni dell'utente

- Si indicizza **tutto ciò che il server ha salvato**, non solo la Home.
- Si include **la timeline federata**.
- Il servizio è scritto in **Rust**.
- **Ognuno vede i suoi** post: la ricerca è per utente.
- I risultati sono ordinati **dal più recente**.

## 5. Progetto

### 5.1 Parti

Un solo eseguibile Rust con tre compiti:
1. **Lettore** dell'archivio (sola lettura): trasforma file di stabbypossum in
   documenti da indicizzare. È l'**unico modulo che conosce il formato del
   server**. **[scelta mia]**
2. **Indice** in SQLite con ricerca di testo (FTS5), in un solo file.
   **[scelta mia]**
3. **Server HTTP** locale che risponde alle ricerche.

### 5.2 Che cosa si indicizza

- **Post**, per ogni voce delle Home e della federata: il testo del
  `projection.content` senza HTML, l'avviso di contenuto (`spoiler_text`), il
  nome e l'indirizzo dell'autore, i tag. Per un boost (`projection.reblog` non
  nullo) si indicizza il post boostato e se ne tiene anche l'autore del boost.
  Si conserva il `projection` così com'è, per restituirlo ai client.
  **[scelta mia: conservare il projection e non rileggere il file a ogni
  ricerca]**
- **Profili**, dagli oggetti `Person` (e `Service`, `Group`) di `data/object/`:
  nome utente (`preferredUsername`), nome visualizzato, indirizzo
  `utente@istanza` ricavato dall'`id`, biografia. I profili sono dati
  pubblici: li vedono tutti gli utenti locali. **[scelta mia]**
- Chi può vedere un post: l'insieme degli utenti nelle cui Home sta quella
  voce, più **tutti** gli utenti per le voci della federata. Un oggetto che
  non è in nessuna timeline non è cercabile da nessuno: è lo stesso
  comportamento della ricerca del server. **[scelta mia]**

### 5.3 Aggiornamento

- All'avvio: scansione completa e costruzione dell'indice (con 19.000 post
  dovrebbe richiedere secondi; da misurare).
- Poi: riconciliazione periodica, ad esempio ogni 30 secondi, leggendo le
  voci nuove o cambiate nelle timeline e togliendo dall'indice quelle sparite
  o con `deleted` vero, quelle spostate in `gone`, e i post il cui oggetto è
  diventato Tombstone. Una modifica (`edited_at` / `revision` diversi) rifà il
  documento. Il modo (cambio di data di modifica, inotify) lo sceglie chi
  costruisce.
- Se il lettore incontra un formato che non riconosce (un campo mancante, un
  tipo nuovo), **non indovina**: salta la voce, la conta, lo scrive nel log e,
  oltre una soglia, smette di aggiornare e segnala "formato non riconosciuto"
  nello stato.

### 5.4 Chi sta chiedendo

- Il client manda lo stesso token che usa per l'API. Il servizio chiede a
  stabbypossum, su `http://127.0.0.1:8001/api/v1/accounts/verify_credentials`,
  chi è, e ne ricava l'utente locale. Il risultato si tiene in memoria per
  circa un minuto, con chiave l'impronta del token, mai il token.
- Il servizio **non legge mai** `data/token/`, `ui-session/` o
  `key.keystore`.
- Token mancante o non valido: 401. Servizio non raggiungibile: il client
  ripiega.

### 5.5 API del servizio

Sotto un prefisso che nginx instrada al servizio **[scelta mia]**, ad esempio
`/app/search/`:

- `GET /app/search/v1/search?q=…&limit=20&offset=0` →
  `{ "statuses": [ <projection>, … ], "accounts": [ { "acct": "utente@istanza", "display_name": "…" }, … ], "total": N }`.
- `GET /app/search/v1/status` → conteggio di post e profili, ultima
  riconciliazione, numero di voci saltate, stato del formato. Senza dati
  sensibili.

Sintassi della ricerca **[scelta mia]**: le parole separate da spazio sono in
AND, l'ultima vale anche come prefisso, le virgolette cercano una frase, senza
distinzione di maiuscole né di accenti. I post sono ordinati per `created_at`
decrescente. Gli account sono quelli il cui nome utente o nome visualizzato
inizia o contiene le parole, ordinati per corrispondenza e poi per nome.

### 5.6 Il client

- La pagina di ricerca chiama il servizio per primo, **in parallelo** con la
  ricerca del server per ciò che il servizio non copre (hashtag, indirizzi
  completi `utente@istanza`, recupero da `https://…`).
- I risultati del servizio sono mostrati subito, con la riga di stato che
  esiste già; la ricerca di testo del server **non** viene più lanciata se il
  servizio risponde (è quella lenta). **[scelta mia]**
- Per gli account il client risolve `acct` con `/api/v1/accounts/lookup` solo
  per quelli mostrati (al massimo una decina). **[scelta mia]**
- Se il servizio non c'è (404, errore di rete) o dice "formato non
  riconosciuto", il client usa la ricerca di sempre. Per questo il servizio è
  opzionale e il client resta valido per chi non lo ha.

### 5.7 Distribuzione

- Codice nel repository del client, cartella `search-index/` (crate Rust).
  **[scelta mia]**
- Eseguibile unico copiato sull'host (`x.y05.eu`) da uno script a parte (come
  `tools/deploy.sh`, che oggi copia solo `app/`), eseguito da systemd con un
  utente senza privilegi, che vede `/srv/xenomorph/data` **in sola lettura**,
  e scrive il proprio indice in una cartella sua.
- Ascolta solo su `127.0.0.1`; nginx lo espone sotto il prefisso del client.
  Servono la `location` in `deploy/nginx-app.conf` e un'unità systemd nel
  repository.
- L'indice è rigenerabile: cancellarlo è sicuro, il servizio lo ricostruisce.
  **[scelta mia]**

## 6. Privacy e sicurezza

- L'indice contiene anche post `private` e messaggi diretti che gli utenti
  hanno ricevuto: il file ha permessi stretti (solo l'utente del servizio) e
  non è mai esposto da nginx.
- Il servizio ascolta solo in locale e risponde solo con un token valido.
- I risultati di un utente non contengono mai documenti di un altro: la
  separazione è una condizione della ricerca, non un filtro sul risultato, e
  ha un test con `admin` contro `oh_pyt`.

## 7. Rischi

- **Formato interno instabile**: stabbypossum lo ha cambiato il 2026-10-28.
  Mitigazione: modulo lettore isolato, controllo del formato, ripiego del
  client.
- **Regola di visibilità non identica a quella del server**: copiamo
  "Home più federata, meno i nascosti" ma non l'abbiamo letta per intero
  nel codice. Un test confronta, per alcuni post, l'insieme trovato con
  quello del server.
- **Post nascosti dall'utente** (`user/<uid>/hidden`): **non** vengono esclusi
  dall'indice (decisione dell'utente): un post nascosto resta cercabile.
- **Dati in ritardo**: tra l'arrivo di un post e la riconciliazione passano al
  più 30 s: accettabile per una ricerca.

## 8. Cosa lascio a chi costruisce

- Struttura interna del crate e scelta delle librerie (server HTTP, SQLite,
  lettura di JSON, osservazione dei file).
- Modo di rilevare i cambiamenti (cambio di data o inotify).
- Dettagli di FTS5 (tokenizzatore, rimozione degli accenti, prefissi).
- Soglie (intervallo di riconciliazione, voci saltate prima di fermarsi).
- Forma esatta dei log.

## 9. Da verificare prima o durante la costruzione

- Se una voce cancellata sparisce da `new`/`cur` o resta con `deleted` vero.
- Il tempo reale della scansione iniziale su `x.y05.eu`.
- Se `verify_credentials` restituisce l'utente locale in un campo da cui si
  ricava l'`uid` (es. `username`) e non solo un id numerico.

### Verificato sull'host (2026-11-01)

- Prima scansione: 12 s, 18.662 post e 1.656 profili, nessun file illeggibile, `format: ok`; i giri successivi (30 s) non cambiano nulla.
- Servizio systemd `stabby-search` (utente `stabbysearch`, gruppo `xenomorph-data` = gid 10001 per leggere la cartella dati chiusa agli altri), in ascolto solo su 127.0.0.1:8002; nginx `/app/search/` risponde 200 su `/v1/status` e 401 senza token.
- Ricerca di testo dal browser: veloce e con risultati corretti (verificato dall'utente).
- Non verificato sull'host: il ritorno alla ricerca del server a servizio fermato (coperto dai test del client, `search falls back to the server when the index is missing`).
- Noto: una voce riscritta più tardi per un oggetto già con Tombstone viene indicizzata di nuovo; un profilo il cui file sparisce senza Tombstone resta ricercabile.
