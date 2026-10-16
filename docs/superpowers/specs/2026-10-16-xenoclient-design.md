# Xenoclient — progetto

Client web installabile (PWA) per telefono, scritto su misura per il sottoinsieme
di API che il server **xenomorph** implementa davvero.

Convenzione: ciò che è detto dall'utente è scritto senza etichette; le scelte
mie (di chi ha scritto il documento) sono segnate **[scelta mia]**; i fatti
sul server sono stati verificati leggendo il suo codice (repo
`~/Sorgenti/Varie/xenomorph`, file citati tra parentesi).

## 1. Perché esiste

- Xenomorph è un server ActivityPub in Ada, derivato da snac2. L'utente lo usa
  ma **non è suo e l'autore non accetta contributi**: perciò il client è un
  progetto separato e **non può chiedere modifiche al server**.
- La UI web di xenomorph non basta all'utente (soprattutto da telefono).
- I client Mastodon esistenti (l'utente usa Phanpy) funzionano ma non sono su
  misura: ad esempio nessuno mostra il tasto **dislike** che la UI web di
  xenomorph ha (nella UI si chiama "Hate", icona 💩).

## 2. Obiettivi

Le quattro azioni che contano, in ordine di importanza dichiarata, e che
devono essere comode col pollice:

1. **Leggere la timeline** (si parte dalla home).
2. **Mettere e togliere il dislike**.
3. **Rispondere e scrivere post**.
4. **Leggere un thread intero senza lasciare la pagina.** Scelta dell'utente
   (mockup "A"): le risposte si aprono *sul posto*, sotto il post, rientrate.
   Il resto della timeline scorre intorno.
   **[scelta mia]** Thread lunghi: mostrare le prime risposte con un pulsante
   "mostra altre", per non spingere via la timeline.

Altri obiettivi:
- Installabile come app sul telefono; all'apertura mostra subito l'ultima
  timeline vista (cache locale) mentre carica quella nuova. **[scelta mia]**
- Mostrare soltanto ciò che il server sa fare: niente pulsanti che finiscono
  in 404.

## 3. Non-obiettivi

- Nessuna modifica a xenomorph, nessun endpoint nuovo, nessun lavoro lato server.
- Nessun database né componente server proprio: il client è solo file statici.
- Per ora **fuori ambito** (si aggiungeranno dopo, l'utente ha detto
  "valutiamo più avanti"): amministrazione, gruppi, bozze e post programmati,
  reazioni emoji, profili e ricerca, liste, segnalibri, altre timeline
  (federata, hashtag), impostazioni.

## 4. Anti-obiettivi (sarebbe un fallimento anche se "funziona")

- Perdere la posizione di scorrimento della timeline quando si apre o chiude
  un thread.
- Pulsanti che promettono funzioni che il server non ha (vedi sezione 6).
- Un'interfaccia che sembra una copia del web di xenomorph senza essere
  migliore da telefono.
- Dipendere da un passaggio di build, da servizi esterni o da librerie
  scaricate a runtime.

## 5. Vincoli e scelte tecniche (tutte **[scelta mia]**, da rivedere)

- App statica a pagina singola, JavaScript semplice, nessun passaggio di
  build, asset vendorizzati (come fa xenomorph con Semantic UI e il font).
  Un solo posto (un modulo) elenca le rotte API usate.
- Ospitabile ovunque, anche su un dominio diverso da quello dell'istanza.
  Il server risponde con CORS aperto (`access-control-allow-origin: *`) sulle
  rotte API/OAuth, esclusi `/api/v1/admin` e `/admin`
  (`src/http/xenomorph_http.adb`, ~riga 420), quindi le chiamate cross-origin
  con token Bearer funzionano.
- Accesso: registrazione app `POST /api/v1/apps` (parametri `client_name`,
  `redirect_uris`, `scope`), poi flusso OAuth standard su `/oauth/…`
  (`src/http/xenomorph_oauth.adb`). Il `redirect_uri` registrato deve
  coincidere con l'indirizzo della PWA. Il server non mostra segni di PKCE.
- Aspetto di partenza: la UI web di xenomorph (barra in alto nera e fissa,
  colonna singola larga al massimo 760 px, font Atkinson Hyperlegible Mono,
  riquadri-post con riga di azioni). L'utente concede "larghe ottimizzazioni
  e cambiamenti": la partenza è un riferimento, non un vincolo.
- Il codice del server è sotto EUPL. **[scelta mia]** Il client si scrive da
  zero; `static/xenomorph/ui.js` (già un client dell'API Mastodon in ~2500
  righe) serve come *riferimento* per sapere quali chiamate e campi
  funzionano, senza copiarne il codice.
- Lingua dell'interfaccia: da decidere (vedi sezione 8).

## 6. Cosa il server fa e non fa (fatti verificati)

Fa:
- Timeline: `GET /api/v1/timelines/home` (e public, tag, list).
- Thread: `GET /api/v1/statuses/:id/context` → antenati e discendenti.
- Dislike: operazioni `dislike` / `undislike` sotto `/api/v1/statuses/:id/…`,
  come favourite/unfavourite. Lo stato ha il campo booleano `disliked`.
- Creazione post: `POST /api/v1/statuses` con parametri tra cui `status`,
  `in_reply_to_id`, `spoiler_text`, `visibility`, `language`, `scheduled_at`,
  `poll[…]`, `quoted_status_id` (citazione), `xenomorph_group`; media via
  `POST /api/v1/media` (e v2).
- Notifiche: `GET /api/v1/notifications`.
- Estensioni sotto `/api/v1/xenomorph/` (gruppi, admirations, bozze,
  programmati, feed, amministrazione): non servono nella prima versione.

Non fa:
- `dislikes_count` è **sempre 0**: il client può mostrare *se hai messo
  dislike tu*, mai quanti ne ha un post.
- **Niente push**: `POST /api/v1/push/subscription` è solo una finta risposta.
  **Niente streaming** (nessun WebSocket/SSE). Le notifiche si ottengono
  solo interrogando il server mentre l'app è aperta.
- Alcune rotte rispondono con elenchi vuoti fissi (filtri, blocchi, trend):
  vanno trattate come "non supportato", non come "vuoto vero".

## 7. Primo rilascio

Login → home con scorrimento infinito (paginazione tramite intestazione
`Link`) → apertura thread sul posto → like / dislike / rispondi / nuovo post
(testo, avvisi di contenuto, visibilità, immagini) → installabilità e cache
dell'ultima timeline. Notifiche: pagina con aggiornamento a intervalli solo
ad app aperta **[scelta mia]**.

## 8. Lasciato a chi costruisce

- Struttura interna del codice, gestione dello stato, scelta del test runner.
- Dettagli visivi e di scrittura del compositore (l'utente: "al momento non
  saprei, valutiamo più avanti").
- Strategia di cache e di gestione degli errori di rete.
- Come ospitare e pubblicare i file statici.
- Lingua dell'interfaccia (italiano o inglese, come la UI di xenomorph).

## 9. Dettagli verificati dopo la revisione

Letti nel codice del server (`src/http/xenomorph_mastoapi.adb`,
`xenomorph_oauth.adb`):
- **Dislike**: `POST /api/v1/statuses/:id/dislike` e `…/undislike`, stessa
  famiglia di `favourite`/`unfavourite`. Il server aggiorna anche, in
  locale, una "reputazione" dell'istanza del post (voto positivo/negativo per
  host remoto): un effetto collaterale voluto del server, da non nascondere.
  Il campo `disliked` è nello stato restituito; il costruttore deve
  verificare nella prima prova che compaia anche negli stati di `/context`
  e nelle notifiche.
- **Thread**: `GET /api/v1/statuses/:id/context` → `{"ancestors":[…],
  "descendants":[…]}`, elenchi piatti. Il client costruisce l'albero e il
  rientro da `in_reply_to_id`. Nel codice non compare un tetto al numero di
  risposte; non è stato provato su thread reali.
- **Token OAuth**: il server richiede `client_secret` insieme al codice
  (`grant_type=authorization_code`); il segreto lo riceve alla registrazione
  dell'app (`POST /api/v1/apps`). Non è un client "pubblico" puro, ma il
  segreto è ottenibile dal browser. Gli ambiti (`scope`) accettati non sono
  stati verificati.
- **Primo passo di costruzione = prova di login** (registrazione app →
  autorizzazione → token → `verify_credentials`) contro l'istanza reale,
  da browser su un dominio diverso, prima di costruire altro. Se il CORS
  non copre `/oauth/*` o gli ambiti non bastano, il piano cambia (ripiego:
  incollare a mano un token).

## 9b. Risposte dell'utente alla revisione

- **Ospitalità**: i file statici stanno sullo stesso server dell'istanza
  (Docker) e, se possibile, **sullo stesso dominio**, dietro il reverse proxy
  nginx esistente, legati **solo alla sua istanza** (istanza fissa, niente
  schermata "scegli istanza").
  Conseguenze **[scelta mia]**: la PWA vive sotto un percorso dedicato del
  dominio (es. `/app/`, servito da nginx senza passare da xenomorph), così
  non serve CORS, il `redirect_uri` è sullo stesso dominio e l'indirizzo
  dell'istanza è una costante di configurazione. Il percorso preciso e la
  regola nginx si decidono in costruzione. Rischio da tenere presente: stando
  sullo stesso dominio, uno script difettoso del client condividerebbe
  l'origine con la UI web di xenomorph e con il suo cookie di sessione;
  quindi niente script di terze parti e nessuna libreria scaricata a runtime.
- **Dispositivo**: Android (Chrome). iOS non è un obiettivo. Tema scuro non
  richiesto in origine; poi l'utente ha chiesto un **selettore del tema con
  tre valori: chiaro, scuro, auto** (auto = segue il sistema, è il valore
  iniziale **[scelta mia]**). La scelta si ricorda sul dispositivo e si
  cambia dentro l'app; dove stia il selettore è lasciato a chi costruisce.
- **Prove**: l'utente crea un utente di prova sull'istanza reale; le prove
  contro il server si fanno con quell'utente.

## 10. Scelte mie sui punti minori (da controllare)

- Timeline: si mette in cache una pagina; all'apertura si mostra la cache e
  si carica la nuova. I post nuovi non spostano ciò che stai leggendo:
  compare un indicatore "nuovi post" in alto.
- Compositore, prima versione: testo, avviso di contenuto, visibilità,
  immagini **con testo alternativo**. Le citazioni (`quoted_status_id`) sono
  fuori dalla prima versione. L'invio dei media usa `/api/v1/media`; limiti e
  ridimensionamento si decidono provando con l'istanza.
- Notifiche: aggiornamento ogni 60 secondi ad app aperta e pastiglia con il
  numero di non lette; tipi sconosciuti mostrati in forma generica; da una
  notifica si apre il post (e il suo thread).
- Test: i comportamenti del server si verificano con prove contro
  un'istanza vera; un finto server serve solo per prove veloci della
  interfaccia e va confrontato con quello vero ogni tanto.
