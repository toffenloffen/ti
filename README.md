# Token info

Et norsk skrivebordsprogram som følger Codex-bruken automatisk. Eget Windows-vindu med ikon, uten adresselinje, nettleserfane eller konsoll.

## Nedlastbar Windows-release

Last ned `Token-info-1.1.0-win-x64.zip` fra GitHub Releases, pakk ut hele arkivet og åpne **Token info.exe**. Du trenger ikke Node eller npm. Den valgfrie filen **Lag skrivebordssnarvei.vbs** oppretter en snarvei til den utpakkede appen. Behold mappen etterpå. Programfilen er ikke kodesignert. Dette er et uavhengig prosjekt, ikke et offisielt OpenAI-produkt.

Bygg lokalt med `powershell -NoProfile -ExecutionPolicy Bypass -File Build-Release.ps1`. Bygget kontrollerer Electron med en fast SHA-256-verdi, pakker bare eksplisitt valgte appfiler og legger ZIP + kontrollsum i `dist/`. Personlige logger, innlogging og testdata pakkes ikke. GitHub Actions kjører tester og lager en releasekladd når en versjonstag som `v1.1.0` pushes.

## Start og stopp

Dobbeltklikk **Token info** på Windows-skrivebordet. Snarveien starter appen direkte. Du kan også bruke **Start Token info.cmd** i prosjektmappen. Gjentatt oppstart viser det eksisterende vinduet i stedet for flere kopier.

Lukk med **X** for å avslutte appen og kontoforbindelsen. Minimer for å la overvåkingen fortsette. Ved neste oppstart leses historikken på nytt, også aktivitet som skjedde mens appen var lukket. Programmet starter ikke automatisk ved Windows-pålogging.

Skrivebordsskallet inkluderer Node gjennom Electron 44.3.0. Electron ligger i `.runtime/electron`, hentet fra prosjektets offisielle GitHub-utgivelse og kontrollert med SHA-256. Kjør `Install-Desktop.ps1` for å gjenopprette runtime/snarvei ved behov. Codex må være installert og innlogget for kontodata. Ingen separat API-nøkkel er nødvendig, og programmet starter ingen modellforespørsler. Prosjektmappen må beholdes siden skrivebordssnarveien peker hit.

## Hva tallene betyr

- **Tokens i dag:** Registrert input + output i lokale Codex-logger, gruppert etter `Europe/Oslo`. Input fra hurtigbuffer og resonnering er underkategorier og legges ikke til totalen igjen.
- **Kontohistorikk og kontototal:** Hentes fra Codex-tjenesten. Historikken kan ligge etter, og manglende dager vises som «ikke rapportert». Kontoens dagstidssone er ikke dokumentert i responsen. Kontohistorikk blandes ikke med lokale dagstall.
- **Prosjekter:** Bare faktisk registrerte Codex-prosjekter fra lokale metadata. Bruk knyttes til et registrert prosjekt via eksplisitt oppgavetilknytning, registrert rotmappe eller Git-worktree-metadata. Eksplisitt prosjektløse oppgaver blir ikke prosjekter. Registrerte prosjekter uten lokale bruksdata vises med «Ingen lokale bruksdata ennå». Listen viser alle, med søk og scrolling.
- **Nylige:** Samtaler uten registrert prosjekt, med tittel fra Codex sin lokale oppgaveindeks der den finnes. Underagenter samles med hovedoppgaven. Prosjekter + Nylige summerer til den samme lokale totalen. Ukjente mappenavn blir aldri egne prosjekter.
- **Modeller:** Modellfordeling fra logger på denne PC-en. Flyttede/slettede logger, eldre aktivitet og andre PC-er kan mangle.
- **Kontogrenser:** Hentes som prosent og nullstillingstidspunkt fra kontoen. Prosent omregnes aldri til tokens. Ved forbindelsesfeil beholdes sist kjente verdier med tidsstempel og varsel. Har programmet aldri hentet kontogrenser, kan det vise siste loggførte kvote, tydelig merket som historisk.

Lokale data leses hvert 10. sekund, kontodata hvert minutt, og skjermen følger med hvert 5. sekund. Bare endrede loggfiler parses på nytt. Det leses fra `CODEX_HOME` eller `%USERPROFILE%\.codex`, inkludert `sessions` og `archived_sessions`. Samtaletekst sendes ikke til nettleseren eller noen ekstern tjeneste. Programmet leser ikke `auth.json` selv; innlogging håndteres av Codex.

Lokale loggformater er interne og kan endres. Moderne `token_usage_record` telles med unik response-ID, slik at kopiert historikk ikke dobbelttelles. Speilede `token_count`-hendelser ignoreres i filer med moderne tokenposter. Eldre filer uten moderne poster bruker differanser i kumulative tellere og merkes med begrensninger. En blanding av gammel og ny logging i samme fil kan gi ufullstendig eldre historikk. Modellnavn følger loggens `turn_context` hvis tokenposten ikke har modellnavn.

## Integrasjon og utvikling

Klikk på et prosjekt eller en samtale under **Nylige** for å se modellrutene. Hver rute viser eksakt modell-ID, navn fra lokal modellkatalog når tilgjengelig, input uten cache, gjenbrukt input, output, total, responstall og periode. Totalsummen under rutene er summen av alle modellene, også ukjent modell. Oppgavedelene viser hovedoppgaver og underagenter med egen modellrekkefølge; dette er en annen inndeling av samme forbruk og legges ikke til totalen igjen.

Historisk modell kobles først fra responsens eget modellfelt, deretter via samme `turn_id` i `turn_context`. Hvis responsen har en tur-ID uten match, er modellen ukjent. Eldre poster uten tur-ID kan bruke foregående kontekst, tydelig merket som mindre sikkert. Antall kall kan ikke utledes sikkert fra eldre kumulative tellerhendelser, så disse telles separat. Modeller fra nåværende konfigurasjon brukes aldri til å fylle historiske hull. Tidslinjen grupperer sammenhengende modellbruk per oppgave, slik at parallelle underagenter ikke ser ut som modellbytter i hovedoppgaven.

Andeler i oversikten har hele det lokale tokenforbruket, alle registrerte dager, som nevner. Søk endrer ikke nevneren. Inne i modellrutene er nevneren det valgte prosjektets eller samtalens lokale total i den viste perioden. Disse prosentene er aldri kontokvote. Åpne detaljer oppdateres automatisk mens appen går.

Offisiell kilde: [Codex App Server](https://learn.chatgpt.com/docs/app-server). Programmet starter en lokal `codex app-server --listen stdio://`, fullfører `initialize` / `initialized` og bruker bare `account/rateLimits/read` og `account/usage/read`. Ingen kjøp, nullstilling, meldinger eller inferenskall utføres. Kontointegrasjonen krever nett; lokal oversikt fungerer uten nett.

Utvikling: `node server.mjs` tilbyr fortsatt nettleservisning på `http://127.0.0.1:43117`; Ctrl+C stopper utviklingsserveren. Skrivebordsappen bruker samme datatjeneste inne i sin egen prosess på en automatisk valgt loopback-port. Ingen separat bakgrunnsserver må administreres. Test: `node --test` (Node 20+). Appens renderer er sandboxed uten Node-tilgang; kontodata leses av hovedprosessen. Vindusstørrelse huskes i `%APPDATA%/Token info/window.json`.

Valgfrie miljøvariabler: `TOKEN_INFO_PORT`, `TOKEN_INFO_CODEX` (sti til codex.exe), `TOKEN_INFO_TIMEZONE` og `CODEX_HOME`. Standard tidssone er Oslo. Skjermens tidsstempler vises i Oslo-tid. Det gjøres ingen endringer i Codex sine data. Ingen data publiseres. Oppstartslogger ligger i `.runtime`, som ignoreres av Git.
