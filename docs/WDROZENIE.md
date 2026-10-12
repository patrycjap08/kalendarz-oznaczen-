# Wdrożenie — konto patrycjap08

Repozytorium: `patrycjap08/kalendarz-oznaczen-`. Końcowy myślnik jest częścią adresu. Projekt Supabase: `pmdkppkgnihscupgthxh`. Publiczny frontend: `https://patrycjap08.github.io/kalendarz-oznaczen-/`.

## 1. Co jest już przygotowane — niczego nie instaluj

Ta instrukcja jest dla właścicielki aplikacji. Wszystkie kroki wykonujesz w przeglądarce na GitHubie i w Supabase. Nie potrzebujesz Node, terminala ani poleceń npm. Nie musisz kopiować plików ani samodzielnie zmieniać kodu.

W kodzie i automatycznym publikowaniu są już wpisane:

- adres Twojego projektu Supabase i podany przez Ciebie klucz publiczny;
- poprawna ścieżka strony `/kalendarz-oznaczen-/`;
- dozwolone połączenia z Twoim projektem Supabase;
- automatyczne instalowanie narzędzi, testowanie i budowanie strony na serwerach GitHuba.

Możesz przejść od razu do punktu 2. Ustawienia w panelach wymagają Twojego zalogowanego konta. Klucz publiczny nie daje dostępu do wdrażania bazy.

## 2. Zapisz sekrety wdrożenia w GitHubie

1. Otwórz [ustawienia środowisk repozytorium](https://github.com/patrycjap08/kalendarz-oznaczen-/settings/environments).
2. Kliknij **New environment** (nowe środowisko).
3. Wpisz dokładnie `supabase-production` i kliknij **Configure environment**.
4. Znajdź sekcję **Environment secrets** i kliknij **Add environment secret**. To miejsce na chronione wartości potrzebne do wdrożenia.
5. Dla każdej pozycji z tabeli wpisz jej nazwę w polu **Name**, wartość w **Value** i zapisz przyciskiem **Add secret**.

Jeśli środowisko już istnieje, otwórz je i dodaj brakujące wartości. Nie twórz drugiego o innej nazwie. Opcjonalne zabezpieczenia wdrożeń są opisane w części technicznej na końcu.

W tym środowisku dodaj **Environment secrets**:

| Nazwa | Skąd wziąć |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | [Supabase → Access Tokens](https://supabase.com/dashboard/account/tokens) → Generate new token; nadaj nazwę np. `kalendarz-wdrozenie` i skopiuj wygenerowaną wartość |
| `SUPABASE_DB_PASSWORD` | Hasło bazy ustalone przy tworzeniu projektu; w razie potrzeby zresetuj w ustawieniach bazy |
| `AUTH_RATE_LIMIT_SALT` | W menedżerze haseł wygeneruj losowy ciąg 64 liter i cyfr; zachowaj go jako wartość tego ustawienia |

Nie wklejaj tych wartości do rozmowy, plików frontendu ani commita. Token dostępu może obejmować więcej niż jeden projekt — przechowuj go tylko w chronionym środowisku i rotuj po zakończeniu konfiguracji, jeśli służył jednorazowo.

## 3. Wdróż bazę i Edge Functions

1. Otwórz [Actions w repozytorium](https://github.com/patrycjap08/kalendarz-oznaczen-/actions).
2. Po lewej wybierz **Kontrolowane wdrożenie Supabase**.
3. Kliknij **Run workflow**, pozostaw gałąź `main` i zatwierdź drugim przyciskiem **Run workflow**.
4. Poczekaj, aż przy tym uruchomieniu pojawi się zielony znacznik. Oznacza on, że przygotowane tabele i funkcje zostały wdrożone.

„Workflow” to przygotowane przeze mnie automatyczne zadanie. Wykona polecenia za Ciebie. Jeśli pojawi się czerwony znacznik, przekaż mi link do tego uruchomienia; nie przesyłaj wartości sekretów.

Migracja `202610120001_schema.sql` zakłada świeży projekt kalendarza. Jeżeli istnieją już użytkownicy Auth, trzeba najpierw przypisać im poprawne, unikalne nazwy i utworzyć profile — trigger obejmuje nowe konta. Nie uruchamiaj tej migracji na innym, używanym projekcie.

Po wdrożeniu nadal trzeba ustawić logowanie i pocztę w panelu Supabase — opisuje to następny punkt.

## 4. Skonfiguruj Auth w panelu Supabase

**Authentication → URL Configuration**:

- Site URL: `https://patrycjap08.github.io/kalendarz-oznaczen-/index.html`
- Redirect URLs: ten sam dokładny adres; dodaj adres lokalny tylko w projekcie developerskim.

Callback prowadzi do istniejącego `index.html`. SDK obsługuje parametry Auth przed wyborem trasy z `#/`. Nie wpisuj samego `/#/auth/callback` jako celu serwerowego redirectu. Potwierdzenie konta wraca do logowania; recovery pozwala ustawić nowe hasło i ponownie się zalogować.

**Authentication → Sign In / Providers**: pozostaw e-mail i hasło, włącz potwierdzenie e-mail, minimum 12 znaków hasła i ochronę zmiany hasła. Nie włączaj providerów społecznościowych. E-mail użytkowniczki jest prawdziwy i prywatny; logowanie nazwą przechodzi przez funkcję `login`.

**Authentication → Email / SMTP Settings**: skonfiguruj własne SMTP i zweryfikowanego nadawcę. Domyślna testowa usługa Supabase nie wystarcza do odbioru. Sprawdź dostarczanie potwierdzeń i recovery na realny adres, także otwieranie linku w Safari/PWA.

**Authentication → Rate Limits / Security**: włącz ograniczenia bezpośrednich endpointów Auth. Własne limity Edge nie zabezpieczają bezpośrednich wywołań Auth API. Sprawdź, że gateway ustawia wiarygodny `x-forwarded-for`, a klient nie może podmienić adresu IP. Funkcje bez tego nagłówka lub bez skonfigurowanego salt odmawiają wykonania.

## 5. GitHub Pages

Repozytorium → **Settings → Pages → Source: GitHub Actions**. Workflow `Testy i GitHub Pages` testuje każdy PR, a po zmianie `main` publikuje statyczny build. Klucz publishable jest publiczny i występuje w buildzie; izolację zapewniają RLS, uprawnienia i RPC.

Sprawdź `/#/calendar`, `/#/labels`, `/#/settings` oraz odświeżenie strony. Na iPhonie: Safari → Udostępnij → Do ekranu początkowego. Safari i PWA mogą mieć oddzielne sesje. Pierwsze pobranie zasobów i historii wymaga internetu.

## 6. Kopie i odbiór

Przed używaniem produkcyjnym skonfiguruj [kopie i odtwarzanie](BACKUP.md), monitoring i procedurę usuniętych kont. Sam eksport JSON nie jest administracyjną kopią kont Auth.

Lista i wyniki sprawdzeń są w [ODBIOR.md](ODBIOR.md). Zielony build nie zastępuje sprawdzenia SMTP, fizycznego iPhone’a ani odtworzenia bazy.

## Koszty

Na etapie przygotowania nie wykupiono żadnej usługi. Publiczne repozytorium może korzystać z GitHub Pages na GitHub Free; limity Actions i Pages nadal obowiązują. Supabase, SMTP i prywatny magazyn backupów są oddzielnymi usługami.

Plan Supabase trzeba wybrać według wymaganego działania projektu i kopii z minimum 30-dniową retencją. Nie zakładamy, że darmowy lub podstawowy płatny plan spełnia te wymagania. Przed uruchomieniem zapisz tu aktualne ceny, walutę, limity, podatki, koszt SMTP i magazynu oraz datę weryfikacji. Brak tej decyzji oznacza nieukończony odbiór operacyjny.

## Dodatek techniczny — dla programisty, możesz go pominąć

Poniższe polecenia służą do rozwijania kodu na komputerze programisty. Nie są potrzebne właścicielce do konfiguracji przez przeglądarkę ani do korzystania z PWA.

### Uruchomienie lokalne

Node 24 lub nowszy. `npm ci`, skopiuj `.env.example` do `.env.local`, następnie `npm run dev`. Konfiguracja w `.env.example` zawiera wyłącznie publiczny URL i publishable key. Po zmianie projektu zmień też `connect-src` w `index.html`. Do rozwoju używaj osobnego projektu Supabase, bez danych produkcyjnych.

Kontrole: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`. Playwright lokalnie korzysta z `/usr/bin/chromium`; jeśli masz inną instalację, zmień `executablePath` lub uruchom z `CI=1` po `npx playwright install chromium`.


### Alternatywne wdrożenie z terminala

Odpowiednik lokalny: zainstaluj CLI Supabase 2.120.0, wykonaj `supabase login`, `supabase link --project-ref pmdkppkgnihscupgthxh`, `supabase db push`. Zapisz sekrety opisane w `supabase/functions/.env.example` i wdróż funkcje. Konfiguracji hostowanego Auth nie należy utożsamiać z samym `db push` — ustaw ją również w panelu.

### Ochrona środowiska wdrożeniowego

W środowisku `supabase-production` włącz wymagane zatwierdzenie wdrożenia, jeśli pozwala na to plan. Ogranicz wdrożenia do `main`. Workflow Supabase jest uruchamiany wyłącznie ręcznie i nie wdraża produkcyjnych migracji z PR.
