# Mój kalendarz

Prywatny kalendarz oznaczeń po polsku, jako strona i PWA na iPhone’a. React, TypeScript, Vite, Supabase i GitHub Pages.

Implementacja obejmuje miesiąc z 42 polami, wiele oznaczeń w dniu, oznaczenia jednorazowe i wielokrotne, edycję globalną, archiwum, motywy, kropki/pasy, IndexedDB, kolejkę synchronizacji, konflikty, eksport/import JSON i Auth z nazwą użytkownika.

Nie jest jeszcze odebraną produkcyjnie aplikacją: wdrożenie Supabase, SMTP, kopie i testy fizycznego iPhone’a wymagają konfiguracji i weryfikacji.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

- [Instrukcja wdrożenia krok po kroku](docs/WDROZENIE.md)
- [Architektura i decyzje](docs/ARCHITEKTURA.md)
- [Kopie i odtwarzanie](docs/BACKUP.md)
- [Status testów i odbioru](docs/ODBIOR.md)

Repozytorium zawiera kod i migracje. Dane użytkowników, hasła, sesje oraz kopie bazy nie są przechowywane w repozytorium. Publishable key jest publiczną konfiguracją frontendu; administracyjne sekrety należą do chronionych środowisk.
