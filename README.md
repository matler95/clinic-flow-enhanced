# Clinic Flow

na podstawie poniższego mvp i zawartości repozytorium z github ( https://github.com/matler95/forge-ahead-complete ), dokończ projekt. Chcę żeby był na jak najwyższym możliwym na teraz stopniu zaawansowania.

jak rozwiążemy kwestię kilku lekarzy pracujących w jednym gabinecie? Jak rozwiążemy kontrolę nad plikami? Jak rozwiążemy kwestię share'owania plików między dentystami (np ktoś chce przekazać pantomogram albo rtg czy wywiad osobie, która będzie go zastępować)

Wdrażaj iteracyjnie według załączonego skorygowanego planu wdrożenia (v2):
1. M0 (rozszerzone): kolumna `is_active` w `memberships`, aktualizacja pomocników `is_member` i `has_org_role` z zachowaniem oryginalnych nazw parametrów (`_org`, `_uid`, `_role`), naprawa funkcji `shares_org` wykluczającej byłych pracowników, ograniczenie uprawnień `UPDATE` na `items` do kolumn `read_at`, `important`, `archived_at` (ochrona przed manipulacją `expires_at` i `scan_status`), RPC `deactivate_member` z weryfikacją ostatniego administratora oraz automatyczną repatriacją plików do skrzynki gabinetu (`recipient_user_id = null`, `direction = 'to_clinic'`) i audytem.
2. Utwardzenie uploadu i storage: weryfikacja istnienia obiektu i nagłówków (magic bytes) w `dropComplete`, restrykcyjna biała lista MIME (odrzucenie exe/zip/txt), nagłówek `Cache-Control: no-store`, atomowa inkrementacja `uses` w `drop_links`, kolejność czyszczenia w `purge-expired` (najpierw usunięcie ze Storage, potem z bazy).
3. M1 (dyspozytornia i transfer): RPC `assign_item` dla recepcji/admina przypisujący nieprzypisane pliki ze skrzynki placówki do wybranego aktywnego lekarza, RPC `transfer_item` dla lekarza przekazującego swój plik koledze z gabinetu z notatką, audyt `item.assign` / `item.transfer`, powiadomienia push w `notifications_outbox`, interfejs triage w widoku inboxa gabinetu z filtrem i przypisywaniem.
4. M4a (przeglądarka RTG/obrazów): widok podglądu z obsługą gestów pinch-to-zoom, dwupalcowym przesuwaniem (pan), obrotem (rotate) i inwersją kolorów (negatyw dla oceny RTG), obsługa podpisanych URL z cichym odświeżaniem sesji, audyt otwarcia.
5. Przygotowanie do pilotażu POC na plikach testowych zgodnie z guardrails (G2, G3, G4).

Poproszę o zrzut ekranu po zakończeniu prac.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/41640f46-8f4e-400e-ba7a-96ee37d7d8f1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
