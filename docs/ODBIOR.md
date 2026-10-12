# Status odbioru

Wersja 0.1.0, 12 października 2026. Jest to pierwsza implementacja, nie zakończony odbiór produkcyjny.

## Sprawdzone lokalnie

- TypeScript, ESLint i produkcyjny build PWA.
- 19 testów Vitest: daty, Unicode, emoji, operacje, archiwizacja, historia, kopie, geometria i IndexedDB.
- Wbudowany PostgreSQL/PGlite: atomowe tworzenie profilu, unikalna nazwa konta, RLS dwóch kont, odmowa anonimowego dostępu i bezpośrednich zapisów, idempotencja, konflikty revision, rollback, archiwizacja, kaskada usuwania i odmowa starego tokena po usunięciu konta.
- Testy Playwright na Chromium z atrapą API: miesiące z 4–6 tygodniami, kropki obok daty i overflow, formularz jednorazowy/usunięcie, roboczy wygląd/pasy, offline/ponowne otwarcie i brak prywatnego API w Cache Storage. Test 320 px ujawnił ograniczenie miejsca na sześć emoji przy wysokości komórki 64 px; minimalną wysokość zwiększono do 72 px, z dopuszczonym przewijaniem na małych ekranach.
- Audyt zależności produkcyjnych: brak zgłoszonych podatności.

Workflow CI uruchamia powyższe kontrole i dodatkowo test na PostgreSQL 17 z równoległymi żądaniami. Wynik GitHub Actions trzeba sprawdzić po pierwszym wysłaniu kodu.

## Do weryfikacji przed produkcją

- A01–A04: prawdziwe Edge Functions, potwierdzenie e-mail i recovery z produkcyjnego Pages/SMTP.
- Limity IP, Retry-After i ochrona bezpośredniego Supabase Auth na hostowanej platformie.
- Pełne scenariusze S02–S07: utrata odpowiedzi po commicie, dwa urządzenia/karty, dzierżawa, odnowienie sesji, zależne konflikty i wylogowanie.
- Wszystkie 5×4×2 kombinacje wyglądu, oba kierunki/pozycje pasów, duży tekst, klawiatura, kontrast i VoiceOver.
- Wydajność na realnym iPhonie przy 300 definicjach i 20 000 przypisaniach.
- Import/eksport na realnej bazie, atomowy rollback uszkodzonej kopii i kolejność po mapowaniu UUID.
- B03: uruchomienie dziennych kopii poza repozytorium, minimum 30 dni retencji, monitoring, zewnętrzny rejestr usunięć i próba odtworzenia kont Auth.
- P01/P02/D02: instalacja i aktualizacja PWA oraz offline/wznowienie na fizycznym iPhonie, na bieżącym stabilnym iOS i poprzedniej głównej wersji. Chromium ani emulacja nie zastępują tego testu.
- Decyzja o planach, kosztach i monitoringu oraz przekazanie dostępu właścicielce.

Nie deklarujemy zaliczenia testów wymagających niewdrożonych usług lub niedostępnego fizycznego urządzenia.

Aktualizacja układu: liczba wierszy jest zgodna z liczbą tygodni zajmowanych przez miesiąc (potwierdzona zmiana specyfikacji). Dodano testy lutego rozpoczynającego się w poniedziałek, miesiąca pięciotygodniowego, sześciotygodniowego i rozmieszczenia kropek na wysokości daty.

## Odbiór rozszerzenia: wiele kalendarzy

Dodano testy migracji istniejącej historii i starej idempotencji, aktualizacji IndexedDB bez utraty kolejki, rozdzielenia oznaczeń i dat między kalendarzami, RLS między kontami oraz importu z mapowaniem kalendarzy. Testy przeglądarkowe obejmują tworzenie, przełączanie, zmianę nazwy, własne listy oznaczeń, eksport pełnego konta i ponowne otwarcie nowego kalendarza offline.
