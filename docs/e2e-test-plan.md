# Plan: Playwright end-to-end-tester för TimeReport

Status: steg 0 till 4 är genomförda. Sviten finns i `e2e/`, körs med `npm run test:e2e` och i GitHub Actions. Avsnitt 8 och 11 beskriver vad testerna hittade.

## 1. Mål och nivå

- **Nivå:** riktiga end-to-end-tester. Chromium kör mot en byggd app (`npm run build && npm start`) som pratar med en riktig PostgreSQL-databas som är dedikerad för testerna. Ingen mockning av API eller databas.
- **Mer än smoke:** varje sida får tester för sina faktiska flöden (skapa, redigera, radera, validera, tomma tillstånd, felmeddelanden, sök, paginering, drag-and-drop, CSV-nedladdning, användarisolering). Sidladdning och navigering täcks som en biprodukt.
- **Körbart när som helst:** `npm run test:e2e` startar databasen om den saknas, nollställer och seedar den, bygger appen, startar servern och kör testerna. Samma kommando körs i CI.
- **Vad E2E inte ska göra:** upprepa det vitest redan täcker (durationparsning på servern, `resolveTimeEntry`, CSV-escaping, API-klienten, `/health`, `/ready`, kontraktstesterna i `test/postgres.contract.test.ts`). E2E äger UI-beteende, routing/skydd, svenska texter, dialoger, nedladdningar och det som bara syns i en webbläsare.

## 2. Testdatabas

### 2.1 Princip

En egen databas `timereport_e2e_test`, aldrig `timereport` eller `timereport_test` (vitest). Namnet slutar på `_test` så den befintliga spärren i `scripts/db/environment.ts` (bara lokal host, bara `*_test`) fortsätter gälla. Varje testkörning:

1. `drop schema public cascade` + migrera från `drizzle/` (samma kod som `scripts/db/reset-test.ts`).
2. Seeda med `scripts/db/seed-test.ts` (admin, Alice, Bob, projekt `Client`, uppgift `Implementation`, tagg `Billable`, en tidspost, en notering och ett planeringsblock på `2026-01-05`).

Dessutom en andra, tom databas `timereport_e2e_setup_test` som bara migreras. Den behövs för att testa `/setup`-flödet (första admin-kontot), som bara går att nå när noll användare finns. Appen startas två gånger av Playwright (`webServer` som array): port 5174 mot den seedade databasen, port 5175 mot den tomma.

### 2.2 Hur databasen spinns upp

| Miljö                                          | Postgres                                                                                                                                         | Kommentar                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Lokalt med Docker                              | `docker compose up -d db` (befintlig tjänst) och `createdb`-steg i `scripts/db/ensure-e2e-databases.ts` som skapar båda databaserna om de saknas | Samma container som dev-databasen, separata databaser |
| Lokalt utan Docker (t.ex. denna molncontainer) | `scripts/e2e/local-postgres.sh` startar ett eget Postgres 16-kluster under `.e2e/pg` på port 5434 med `initdb`/`pg_ctl`                          | Ligger utanför git, ingen påverkan på dev-databasen   |
| GitHub Actions                                 | `services: postgres:17-alpine` med healthcheck                                                                                                   | Två `createdb` i ett steg före testerna               |

Miljövariabler, med förslag på fil `.env.e2e.example`:

```
E2E_DATABASE_URL=postgresql://timereport:timereport@localhost:5433/timereport_e2e_test
E2E_SETUP_DATABASE_URL=postgresql://timereport:timereport@localhost:5433/timereport_e2e_setup_test
```

Reset och seed sker i Playwrights `globalSetup`, så en körning är alltid reproducerbar oavsett vad förra körningen lämnade efter sig.

### 2.3 Isolering mellan tester

- **Färsk användare per test** som standard. En fixture `user` registrerar en unik användare via `POST /api/auth/register` (e-post `e2e-<worker>-<slug>@example.test`) och loggar in via API så att cookien redan finns när sidan öppnas. Det ger full parallellitet utan att tester stör varandra, och ingen städning behövs eftersom hela databasen nollställs nästa körning.
- **Seedade användare** (`alice@example.test`, `bob@example.test`, lösenord `TestPassword!1`) används bara i ett serial-projekt för scenarier som förutsätter känd data, t.ex. att uppgiften `Implementation` redan har en tidspost, att `Billable` följer med som default-tagg och att Bobs data inte syns hos Alice.
- Inloggning sker via API i fixturen, inte via UI, i alla tester utom auth-testerna. Det sparar sekunder per test och gör felen tydligare.

## 3. Determinism

Appen använder dagens datum på flera ställen. Planen låser detta så här:

- **Fast datum:** `2026-01-05` (måndag, ISO-vecka 2) är seedens ankare och blir testernas "idag". Dashboard deep-linkas alltid med `?date=2026-01-05`.
- **Fast klocka i webbläsaren:** `page.clock.install({ time: '2026-01-05T09:00:00' })` i en fixture. Det låser `Idag`-instrumentet, planerarens startvecka (som saknar URL-parameter), exportsidans standardintervall och sidomenyns dashboard-länk.
- **Tidszon och locale:** `timezoneId: 'Europe/Stockholm'`, `locale: 'sv-SE'` i Playwright-konfigen. Servern körs med `TZ=UTC` som i produktion.
- **Tidsstyrda UI-element:** `Uppgift skapad` (2 s), `Profilen sparades.` (3 s) och TagInputs blur-timeout (150 ms) hanteras med `expect` mot texten direkt efter åtgärden, aldrig med `waitForTimeout`.
- **Optimistiska uppdateringar:** för reorder, planerare och radering verifieras slutläget efter en omladdning eller via `GET`-anrop, inte bara i DOM.

## 4. Struktur och verktyg

```
e2e/
  playwright.config.ts
  global-setup.ts            # reset + seed båda databaserna
  fixtures/
    test.ts                  # utökad test() med user, api, clock, seededAlice
    api.ts                   # tunn klient mot /api för arrange-steg
    users.ts                 # registrera/logga in via API
  pages/                     # Page objects, en per sida
    LoginPage.ts  DashboardPage.ts  TimeEntryForm.ts  PlannerPage.ts
    TasksPage.ts  ProjectsPage.ts  NotesPage.ts  ExportPage.ts  ProfilePage.ts  Sidebar.ts
  specs/
    auth/         setup.spec.ts  login.spec.ts  register.spec.ts  guard.spec.ts
    dashboard/    entries.spec.ts  form-validation.spec.ts  reorder.spec.ts  weekly-summary.spec.ts  daily-note.spec.ts
    tasks/        tasks.spec.ts
    projects/     projects.spec.ts
    tags/         tags.spec.ts
    planner/      planner.spec.ts
    notes/        notes.spec.ts
    export/       export.spec.ts
    profile/      profile.spec.ts
    navigation/   sidebar.spec.ts  mobile-drawer.spec.ts
    isolation/    cross-user.spec.ts
scripts/
  db/ensure-e2e-databases.ts
  db/reset-e2e.ts
  e2e/local-postgres.sh
.github/workflows/ci.yml
```

- Paket: `@playwright/test` som devDependency, låst version. Chromium via `npx playwright install --with-deps chromium`. Firefox och WebKit hålls utanför tills grunden är stabil.
- Projekt i konfigen: `chromium` (parallellt, färska användare; specarna mot seedad data är rena läsningar och kan därför köras parallellt), `setup` (mot port 5175, serial), `mobile` (Pixel 7-viewport, navigation och dashboard).
- Page objects håller selektorer på ett ställe. Selektorer prioriteras i ordningen roll/label, `aria-label`, `title`, placeholder, och sist `data-testid`.
- `test:e2e`-skript i `package.json`:

```
"test:e2e": "playwright test -c e2e/playwright.config.ts",
"test:e2e:ui": "playwright test -c e2e/playwright.config.ts --ui",
"db:reset:e2e": "node --env-file-if-exists=.env.e2e --import tsx scripts/db/reset-e2e.ts"
```

- `webServer` i konfigen kör `npm run build` en gång och startar `node serve.js` med `PORT`, `DATABASE_URL`, `BETTER_AUTH_URL` och `NODE_ENV=test`. `reuseExistingServer: !process.env.CI`.
- Rapport: HTML-rapport lokalt, `github`-reporter plus HTML-artefakt i CI. `trace: 'on-first-retry'`, `retries: 2` i CI, `0` lokalt.

## 5. Små ändringar i appen för testbarhet

Ett fåtal saknade `htmlFor`/`aria-label` gör testerna sköra. Planen lägger till följande, som också förbättrar tillgängligheten:

| Ställe                                             | Ändring                                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `TimeEntryForm` uppgiftsväljare                    | `aria-label="Uppgift"`, `role="combobox"`, `role="listbox"`/`option` på listan                |
| `TimeEntryForm` Start/Slut                         | `htmlFor` + `id` på båda tidsfälten                                                           |
| `BlockModal` Datum/Starttid/Sluttid, stäng-knapp   | `htmlFor` + `id`, `aria-label="Stäng"`                                                        |
| `ProfilePage` alla fält                            | `htmlFor` + `id`                                                                              |
| `ExportPage` Från/Till                             | `htmlFor` + `id` med sektionsprefix                                                           |
| `TasksPage`/`ProjectsPage` glyfknappar `✎` och `✕` | `aria-label="Redigera <namn>"` / `"Ta bort <namn>"`                                           |
| Flikar `Aktiva`/`Arkiverade`                       | `aria-pressed`                                                                                |
| `TimeEntryCard`                                    | `data-testid="time-entry"` på kortet                                                          |
| `AppSidebar`                                       | `data-testid="desktop-sidebar"` och `"mobile-drawer"`, så länkar som finns dubbelt kan scopas |

Inga andra beteendeändringar görs i appen inom denna plan.

## 6. Testinventering

P1 måste finnas innan pipelinen aktiveras, P2 direkt därefter, P3 när grunden är grön. Uppskattat antal tester i parentes.

### Auth (P1, ~12)

- `/setup` på tom databas: skapar admin, hamnar på dashboard, `GET /api/auth/me` visar `isAdmin: true`. Lösenord under 8 tecken och olika lösenord ger rätt fel. Andra försök ger `Setup already completed`.
- Login: rätt uppgifter, fel lösenord (`Invalid email or password`), tom form stoppas av HTML5-validering, redirect till `/dashboard?date=…`.
- Register: ny användare, dubblett (`Email already in use`), lösenord matchar inte.
- Skydd: oinloggad på `/dashboard`, `/planner`, `/profile` skickas till `/login`. Utloggning tömmer sessionen, tillbaka-knappen leder till login, `/api/tasks` ger 401.

### Dashboard och tidsposter (P1, ~22)

- Tomt tillstånd `Inga tidsposter för 5 januari 2026`, dag-navigering med `Föregående dag`/`Nästa dag`, datumväljaren ändrar `?date=`.
- Skapa post med uppgift plus varaktighet `1h 30m`; kortet visar titel, `1h 30m` och totalen. Skapa med start/slut och verifiera att varaktigheten räknas ut automatiskt, och omvänt att sluttiden fylls i från start plus varaktighet.
- Välja seedad uppgift `Implementation` fyller i default-taggen `Billable` och beskrivningen `Seed entry` (seeded-projektet).
- Skapa ny uppgift från väljaren via `+ Skapa ny uppgift "…"`; uppgiften syns sedan under `/tasks`.
- Redigera post, byta varaktighet, spara. Duplicera post, hamnar direkt efter originalet med taggar. Radera med `confirm`, både OK och Avbryt.
- Validering: ingen uppgift ger `Välj en uppgift`; slut före start ger `End time must be after start time`; varken tid eller start/slut ger `Provide duration or start/end time`.
- Taggar: skapa ny tagg i TagInput, ta bort tagg med `Ta bort tagg <namn>`, dubblett-tagg ger fel.
- Reorder med tangentbord (`Space`, `ArrowDown`, `Space` på `Dra för att sortera`); ordningen består efter omladdning.
- Beskrivningseditor: fetstil via `Ctrl+B` och punktlista renderas som markdown på kortet.
- Jira-knappen: dold utan Jira-URL, inaktiverad utan start/slut, ger `Jira credentials not configured` när uppgifter saknas.

### Veckosammanfattning och daglig notering (P2, ~7)

- `Vecka 2` visar totalen, klargrad (60 min ger 3 %), dagen `2026-01-05` markerad med `aria-pressed`. Klick på annan dag byter datum. Ny post uppdaterar vecko-totalen.
- Notering: öppna, skriva, spara, panelen stängs, texten finns kvar efter omladdning och syns under `/notes`.

### Uppgifter (P2, ~12)

- Skapa med projekt och default-taggar, redigera, favoritmarkera (sorteras först), sök per tangenttryck (`Sök uppgifter...`), tomt resultat `Inga uppgifter.`.
- Radera uppgift utan tidsposter tas bort helt; radera uppgift med tidsposter arkiveras och dyker upp under `Arkiverade` med `Återställ`.
- Tom titel avvisas, arkiverat projekt visas inte i projektlistan i formuläret.

### Projekt (P2, ~9)

- Skapa, redigera, arkivera/återställ, radera med `confirm`, dubblettnamn (`A project with that name already exists`), `Inga projekt.`, räknare `n uppgifter` och total tid uppdateras när en tidspost skapas på en uppgift i projektet.
- Länken till `/projects/:id` saknar route i dag; testet skrivs som `test.fixme` tills beteendet är bestämt (se avsnitt 8).

### Planering (P2, ~10)

- Veckorubrik `Vecka 2 · 5 jan–9 jan` med fast klocka, `Föregående`/`Nästa`/`Idag`.
- Skapa block via `+ Nytt block` och via klick i kolumnen `data-date="2026-01-06"`, färgval med `aria-pressed`, `Escape` stänger.
- Redigera block, radera (ingen bekräftelse), konvertera till uppgift visar `Uppgift skapad` och uppgiften finns under `/tasks`.
- Flytta block till annan dag med musdrag i steg (PointerSensor, 5 px aktivering) och ändra storlek via nederkanten; verifiera via `GET /api/planner-blocks` att tiderna snappat till 30 min.

### Noteringar (P2, ~7)

- Lista seedad notering, singular `1 notering`, tomt tillstånd utan sök (`Inga noteringar än.`) och med sök (`Inga noteringar matchar sökningen.`).
- Paginering: skapa 12 noteringar via API, `Sida 1 av 2`, `Nästa`, `Föregående` saknas som knapp på sida 1. `Öppna i dashboard` landar på rätt datum.

### Export (P2, ~6)

- Standardintervall med fast klocka blir förra veckan. Ladda ner tidrapport och verifiera filnamn `tidrapport_2026-01-05_2026-01-11.csv`, header `Datum,Projekt,Uppgift,Beskrivning,Start,Slut,Minuter,Taggar` och seedraden. Samma för noteringar (`anteckningar_…`, `Datum,Notering`). Tomt intervall ger bara header.
- Fält med komma i beskrivningen citeras korrekt i filen.

### Profil (P2, ~7)

- Ändra namn, `Profilen sparades.`, namnet syns i sidomenyn. Byt lösenord och logga in igen med det nya; det gamla avvisas. Olika lösenord och kort lösenord ger rätt fel.
- Spara Jira-uppgifter; placeholdern för token blir `••••••••`. Tömma Jira-URL sparas inte (dokumenterad avvikelse, `test.fixme`).

### Navigation och mobil (P3, ~8)

- `aria-current="page"` följer med vid navigering, dashboard-länken bär `?date=` från den fasta klockan.
- Mobil: `Öppna meny`, drawer med `role="dialog"`, fokus på `Stäng meny`, `Escape` stänger, Tab stannar i menyn, scroll låst.

### Användarisolering (P1, ~5)

- Alice ser inte Bobs projekt `Private`, tagg `Other` eller arkiverade uppgift i väljare, listor eller sök. Direkta anrop mot Bobs id ger 404 genom UI:t (t.ex. `/dashboard` med `?date=` visar aldrig Bobs poster).

Totalt cirka 105 tester. Uppskattad körtid med 4 workers: 3 till 5 minuter inklusive bygge.

## 7. CI-pipeline

`.github/workflows/ci.yml`, körs på push till `main` och på pull requests:

1. Jobb `checks`: Node 24, `npm ci`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` med `TEST_DATABASE_URL` mot en Postgres-service och `npm run db:reset:test` före.
2. Jobb `e2e`: samma Postgres-service, skapa `timereport_e2e_test` och `timereport_e2e_setup`, `npx playwright install --with-deps chromium`, `npm run test:e2e`. HTML-rapport och traces laddas upp som artefakter vid fel, spara i 14 dagar.
3. Playwright-versionen låses i `package-lock.json`; browsern cacheas med `actions/cache` nyckel på versionen.

Ingen befintlig CI finns i dag, så jobbet `checks` är också nytt men billigt att ta med.

## 8. Fynd under kartläggningen

Följande avvikelser upptäcktes när flödena kartlades. De åtgärdas inte i testarbetet utan skrivs som `test.fixme` med hänvisning hit, så att de blir gröna när de rättas:

1. `ProjectsPage` länkar till `/projects/:id` men ingen sådan route finns. `GET /api/projects/:id`, `add-task` och `remove-task` nås inte från UI:t.
2. Klienten (`Math.round`) och servern (avrundning till jämnt) avrundar bråkminuter olika; `0.5m` ger 1 min i formuläret men `null` i databasen.
3. Planeraren räknar veckonummer med en egen algoritm som kan skilja sig från serverns ISO-vecka vid årsskiften.
4. Planeraren hämtar måndag till söndag men visar bara måndag till fredag; helgblock kan inte nås.
5. Profilsidan kan inte tömma Jira-fält, tomma strängar skickas inte.
6. Daglig notering-panelen stängs när innehållet hämtas om, vilket kan kasta pågående redigering.
7. API-klienten översätter alla 401-svar till texten `Unauthorized` innan sidan ser dem, så inloggningssidan visar aldrig serverns `Invalid email or password`. Testerna verifierar det verkliga beteendet.
8. TagInput stänger sin lista 150 ms efter blur utan att avbryta timern vid ny fokus, så två snabba val i rad kan stänga listan direkt efter att den öppnats. Page objectet väntar ut timern.

Två fel var så allvarliga att sviten inte gick att få grön utan att rätta dem, och rättningarna ingår i samma branch (se avsnitt 11):

9. Uppgiftslistan räknade fel antal poster och tid: subfrågorna i `src/server/routes/tasks.ts` refererade `${tasks.id}`, som Drizzle renderar okvalificerat i en select utan joins, så `task_id="id"` band till `time_entries.id`. Alla uppgifter visade samma siffra.
10. Planeraren renderade alla block med höjd 0: API:t returnerade tider som `YYYY-MM-DD HH:mm:ss` (Postgres-format) medan klienten bara tolkar `T`-separatorn. Serverns DTO normaliserar nu till ISO-format.

## 9. Genomförande i steg

| Steg | Innehåll                                                                                                      | Klart när                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 0    | Playwright, konfig, fixtures, DB-skript, `local-postgres.sh`, CI-workflow, testbarhetsändringarna i avsnitt 5 | `npm run test:e2e` kör ett login-test grönt lokalt och i CI |
| 1    | P1: auth, setup, skydd, dashboard-poster, isolering                                                           | ~40 tester gröna                                            |
| 2    | P2: uppgifter, projekt, taggar, veckosammanfattning, notering, noteringar, export, profil                     | ~90 tester gröna                                            |
| 3    | P2: planeraren inklusive drag och resize                                                                      | ~100 tester gröna                                           |
| 4    | P3: mobil, navigation, `fixme`-tester för fynden i avsnitt 8                                                  | Fullt inventarium, dokumentation i README                   |

Varje steg levereras som en egen commit på branchen så att det går att granska i delar.

## 10. Öppna val

Planen antar följande. Säg till om något ska ändras.

- Testerna körs mot produktionsbygget, inte `vite dev`. Det är långsammare per körning (bygget tar ~30 s) men testar det som deployas.
- Testbarhetsändringarna i avsnitt 5 görs i appkoden som en del av steg 0.
- Fynden i avsnitt 8 rättas inte inom detta arbete.
- Bara Chromium i CI. Fler webbläsare läggs till som en matris senare om det behövs.
- CI körs på GitHub Actions med Node 24.

## 11. Utfall

- 97 tester i 19 spec-filer, varav 3 `test.fixme` för fynd 1, 4 och 5. Körtid lokalt cirka 90 sekunder inklusive bygge.
- Testbarhetsändringarna i avsnitt 5 är gjorda, plus `role="alert"`/`role="status"` på fel- och bekräftelsetexter och ett `aria-label` på markdown-editorns textyta.
- Rättade appfel: fynd 9 (uppgiftsräknare) och 10 (planerarblock). Båda är regressioner från Hono-omskrivningen som ingen befintlig testnivå fångade; kontraktstestet för uppgifter passerade av en slump eftersom seedens första tidspost har samma id som dess uppgift.
- Playwright är låst till 1.56.1, versionen vars Chromium finns förinstallerad i utvecklingsmiljön där sviten togs fram. Versionen kan höjas fritt; CI installerar rätt webbläsare själv.
- `test/api-client.test.ts` var inte Prettier-formaterad, vilket skulle ha fällt `format:check` i det nya CI-jobbet. Filen är omformaterad utan andra ändringar.
