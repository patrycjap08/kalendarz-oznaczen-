# Decyzje implementacji

- React + TypeScript + Vite, hash routing, GitHub Pages; wersje bez zakresów, zależności zamknięte w lockfile.
- Repozytorium IndexedDB przechowuje osobno potwierdzony snapshot i kolejkę per UUID konta. UI nakłada kolejkę na snapshot; nie wykonuje samodzielnych zapisów do tabel.
- Jedna dzierżawa per konto (odnowienie 5 s, wygaśnięcie 15 s), BroadcastChannel i serialny worker. PostgreSQL blokuje calendar_state; idempotencja jest sprawdzana przed revision. Retry używa tego samego operation_id.
- Revision jest stringiem w całym protokole, łącznie z lekkim RPC odczytu. Zastosowano bigint po stronie PostgreSQL i BigInt wyłącznie do porównania w kliencie.
- Odpowiedzi mutacji zawierają zmienione/usunięte obiekty; nie zapisujemy pełnej kopii historii w każdym wierszu applied_operations. Import wymusza nowy snapshot. Rejestr idempotencji pozostaje przez czas życia konta.
- Publiczne tabele umożliwiają tylko odczyt własnych wierszy. Wszystkie zmiany odbywają się przez SECURITY DEFINER z bezpiecznym search_path, właścicielem z auth.uid() i blokadą stanu konta. RPC sprawdza istnienie profilu także dla starych tokenów usuniętego konta.
- Ustawienia przechowywane są jako walidowany obiekt JSONB w preferences.value. Jest to reprezentacja ośmiu pól specyfikacji; API/UI udostępnia pełny typ Preferences.
- update_label może atomowo promować one_off przez opcjonalny promote=true. Oddzielne promote_label także jest obsługiwane. Nie ma democji reusable do one_off.
- Baza dat używa PostgreSQL date; frontend YYYY-MM-DD i lokalnych dat w południe, bez konwersji wpisów na UTC.
- Emoji: jedna wygenerowana lista 3953 sekwencji RGI Unicode 17.0.0, identyczna dla klienta i FK w bazie. Nie jest to licznik UTF-16. Niektóre nowsze emoji mogą wymagać nowszej wersji iOS.
- Renderowanie: jeden DayCell, funkcje geometrii dla kropek/pasów; listy poza komórką zawsze pokazują nazwę. Siatka używa zwykłych przycisków dat, bez deklarowania roli grid.
- Worker PWA przechowuje wyłącznie pliki aplikacji. API i Auth nie mają reguł runtime cache. Nie zakładamy Background Sync na iOS.
- Indeks po dacie powstaje raz po zmianie stanu, a komórki nie filtrują całej historii. Pełny snapshot pobierany jest przy inicjalizacji, zmianie revision lub konflikcie, nie przy otwarciu dnia.

Znane zakresy wymagające odbioru: prawdziwy iPhone/VoiceOver, wszystkie motywy, callbacki z produkcyjnej poczty, monitoring i kopie poza repozytorium. Wyników tych testów nie zastępują testy z atrapą API.

## Zmiana układu potwierdzona przez właścicielkę — 12 października 2026

Miesiąc pokazuje wyłącznie zajmowane tygodnie: 4, 5 albo 6 wierszy, czyli 28, 35 albo 42 pola. Początek tygodnia pozostaje w poniedziałek, a komórki sąsiednich miesięcy uzupełniają tylko pierwszy i ostatni tydzień. Ta decyzja zastępuje wymaganie sześciu stałych wierszy ze specyfikacji 1.0.

Kropki wykorzystują pełną powierzchnię komórki. Pierwsza może znajdować się obok numeru dnia, na tej samej wysokości; kolejne układają się parami niżej. Geometria uwzględnia rzeczywisty rozmiar plakietki numeru, granice pola oraz licznik +N. Nie rezerwuje pustego pasa przez całą szerokość nad oznaczeniami. Wspólny renderer stosuje ten układ również w podglądzie ustawień.
