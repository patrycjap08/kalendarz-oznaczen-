# Kopie i odtwarzanie

Status: procedura i skrypt przygotowane. Magazyn, harmonogram, alerty, archiwum usuniętych kont i próba odtworzenia nie zostały skonfigurowane w usługach właścicielki. Wymaganie B03 pozostaje otwarte.

## Wariant własnych kopii

Wymagane: PostgreSQL client zgodny z wersją serwera, `age`, AWS CLI i prywatny bucket S3 lub kompatybilny. Minimalne uprawnienia zadania: odczyt bazy, zapis wyłącznie do prefiksu backupów. Publiczny dostęp do bucketu musi być zablokowany; włącz wersjonowanie i lifecycle z retencją co najmniej 30 dni. Ustaw retencję także dla poprzednich wersji obiektów. Klucz prywatny age przechowuj osobno, w menedżerze sekretów właścicielki; zadanie posiada tylko publicznego odbiorcę.

Skrypt `scripts/backup.sh` robi pełny `pg_dump` bazy, z `auth.users`, `auth.identities`, hashami haseł, tabelami domenowymi, uprawnieniami, politykami i rejestrem usunięć. Nie wyklucza schematu Auth. Nie składa obietnicy, że każdy plan Supabase pozwoli odczytać wszystkie zarządzane schematy — sprawdź uprawnienia, wynik pg_dump i dokumentację wybranego planu przed uruchomieniem.

Zadanie uruchamiaj raz dziennie, np. 03:00 UTC, na zaufanym runnerze. Zapewnij w chronionym środowisku standardowe zmienne PostgreSQL `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGSSLMODE=verify-full`, `PGSSLROOTCERT` i dane dostępu magazynu oraz `BACKUP_AGE_RECIPIENT`, `BACKUP_S3_PREFIX`. Certyfikat dostawcy bazy musi być zaufany. Nie loguj pełnej konfiguracji ani sekretów.

Każdy brak kopii, niezerowy kod zadania, nieudany upload lub wiek najnowszej kopii ponad 26 godzin wymaga alertu do właścicielki. Cel RPO ≤24 h, RTO ≤24 h. Monitoring wieku kopii powinien działać niezależnie od runnera backupu.

## Rejestr usuniętych kont

Trigger zapisuje UUID usuniętych kont w `private.deleted_accounts`, poza kaskadą użytkownika. Jest to jedynie rejestr w bieżącej bazie. Przed produkcją zapewnij jego niezależne archiwizowanie do prywatnego zasobu i procedurę zachowującą również usunięcia po ostatniej kopii. Sam codzienny dump nie spełnia tej części wymagania: przy odtworzeniu starszej bazy nowsze wpisy tombstone muszą być dostępne osobno. Nie udostępniaj rejestru w publicznym repozytorium.

Po awarii, przed udostępnieniem odtworzonej aplikacji, usuń odtworzone konta znajdujące się w aktualnym zewnętrznym rejestrze; usuń je przez administracyjne Auth API, aby zachować kaskady. Zweryfikuj, że ich stare tokeny nie mają dostępu do RPC. Retencja kopii może zachowywać usunięte dane do końca okresu przechowywania.

## Test odtwarzania

1. Przygotuj odizolowany projekt/testową bazę i konfigurację Auth zgodną z platformą; nigdy nie testuj przywracania na produkcji.
2. Pobierz zaszyfrowaną kopię, odszyfruj `age --decrypt` prywatnym kluczem i sprawdź listę obiektów `pg_restore --list`.
3. Odtwórz dump zachowując granty i polityki; uzgodnij zarządzane schematy/role z procedurą dostawcy. Nie stosuj bezrefleksyjnie `--clean` do hostowanego Supabase.
4. Odtwórz również konfigurację Auth/SMTP/sekretów z osobnego bezpiecznego rejestru konfiguracji. Dump bazy nie obejmuje ustawień platformy ani zewnętrznych sekretów.
5. Zastosuj najnowszy rejestr usuniętych kont. Sprawdź działające logowanie, recovery, kalendarze, izolację dwóch kont, revision i idempotencję.
6. Zapisz datę, rozmiar kopii, czas odtworzenia, zakres danych i wynik. Usuń środowisko i odszyfrowane pliki po sprawdzeniu.

Wykonaj przed odbiorem i co najmniej kwartalnie. Kopia jest użyteczna dopiero po pomyślnym teście odtwarzania.
