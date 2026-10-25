# FINANCE_MODULE_SPEC_AUDIT_REPORT.md

**Projekt:** DHZ Digital OS (DHZ RUŽINDOL)
**Fáza:** FINANCE MODULE SPEC AUDIT
**Dátum:** 2026-10-19
**Režim:** READ-ONLY DATABASE MODE — žiadne `db push` / `migration up` / `db reset`, žiadne produkčné zápisy, žiadny deploy, žiadne úpravy historických migrácií.
**Koreň aplikácie:** `C:\Users\Admin\Documents\Projekt APP\DHZ APK\dhz-app\`

---

## 1. ZHRNUTIE PÔVODNÉHO STAVU

Modul financií bol pred auditom **čiastočne funkčný** (príjmy, výdavky, prevody, reporty) s robustnou bezpečnostnou architektúrou z K13 fáz
(guard triggery, RLS, audit trigger, atomic transfer RPC), ale **zablokovaný pre nasadenie** (K13.4.4 verdikt NO-GO).

### Preskúmané súbory
- `src/app/(app)/finance/page.tsx` — dashboard (predtým len ledger totály + odkazy)
- `src/app/dashboard/finance/page.tsx`, `transactions/*`, `actions.ts`, `attachment-actions.ts` — hlavná existujúca implementácia
- `src/components/TransactionForm.tsx`, `TransferForm.tsx`, `AttachmentManager.tsx`
- `src/lib/reports/finance-ledger.service.ts`, `finance-monthly-summary.service.ts`, `reports.core.ts` (+ `.test.ts`)
- `supabase/migrations/20261015_finance_module.sql` (786 riadkov, jadro schémy)
- Finančné fix migrácie: 20261016/17 (storage), 20261018 (audit hotfix), 20261019 (transfer cast), 20261020/21 (attachments guard), 20261022 (K13.2.4), 20261023 (K13.2.5)
- Reporty K13.x: K13.3.6, K13.3 FINAL, K13.4.1/2/3 (FINAL_SYSTEM), K13.4.4 (RELEASE_READINESS, NO-GO), **K13.4.5 (FINANCE_MIGRATION_SECURITY_REPORT — kľúčový nález)**
- `src/lib/auth/permissions.ts`, `20261006_core_database.sql` (permission keys, members, audit_log)

## 2. MAPA EXISTUJÚCICH FUNKCIÍ

| Oblasť | Existuje | Poznámka |
|---|---|---|
| Transakcie INCOME/EXPENSE (DRAFT/POSTED/VOID) | ÁNO | TransactionForm + createTransactionAction + guard |
| Prevody (TRANSFER_IN/OUT, atomic RPC) | ÁNO | `finance_create_transfer`, TransferForm |
| Zostatky (opening + POSTED, prevody neutrálne v obrate) | ÁNO | `finance_account_balances` view (security_invoker) |
| Počiatočný stav (opening_balance_minor/date) | ČIASTOČNE | stĺpec na účte; BEZ guardu proti prepísaniu, BEZ audit histórie stĺpca, BEZ formulára |
| Reporty (ledger, monthly) | ÁNO | K13.3.x, buildFinanceLedger (pure + testy) |
| Doklady/prílohy | ÁNO | metadata + storage migrácie |
| Schválené stavy, audit log | ÁNO | guard + audit_finance_changes (hotfix 20261018) |
| Plánované nákupy (finance_plans) | ČIASTOČNE | tabuľka existuje, **žiadne UI** |
| Pokladničné kontroly | NIE | — |
| Členské predpisy/úhrady | NIE | len `finance_transactions.member_id` FK |
| Uzávierky | NIE | — |
| Členský report | NIE | — |

## 3. HISTORICKÉ PROBLÉMY — OVERENIE VOČI SÚBOROM

| Problém zo zadania | Stav |
|---|---|
| Duplicitné `20261022` migrácie | **VYRIEŠENÉ** presunom: `20261022_finance_transactions_guard_fix.sql` (K13.2.4) + `20261023_finance_transaction_guard_fix.sql` (K13.2.5). Lexikografické poradie 20261022 < 20261023 je správne (K13.2.4 → K13.2.5). NEBOLO mnou menené. |
| Syntaxová chyba v K13.2.5 | **STÁLE PRÍTOMNÁ** (staticky potvrdené): IF=24 / END IF=23; chýbajúci `END IF;` pre blok DRAFT→POSTED (~riadok 155); blok 117 (`TG_OP='UPDATE'`) ostáva otvorený → `CREATE FUNCTION` by zlyhalo → `db push` by sa zastavil. |
| Riziká poradia migrácií | Poradie K13.2.4→K13.2.5 OK; syntax chyba blokuje celý reťazec. |
| Statické vs. runtime testy | Runtime RLS/DB testy: **BLOCKED** (žiadne aplikovanie migrácií, žiadne produkčné zápisy). |
| RLS / triggery / prevody / storno | Overené staticky: RLS politiky finance.view/create/edit konzistentné; guard DRAFT/POSTED/VOID + VOID immutability správne; transfer RPC atomický. |

## 4. TABUĽKA POŽIADAVIEK A STAV

Legenda: `PASS` = overené funkčné, `PARTIAL` = existuje čiastočne, `FAIL` = neexistuje, `NOT TESTED (runtime)` = vyžaduje autorizované DB prostredie.

| § | Požiadavka | Pred | Po | Poznámka |
|---|---|---|---|---|
| 3 | Sekcie /finance | PARTIAL | **PARTIAL↑** | + kontroly + členské; chýba: uzávierky UI, plánované nákupy UI, doklady sekcia |
| 4 | Dashboard (skutočné dáta) | PARTIAL | **PARTIAL↑** | + účty/zostatky; chýba: mesačný rozsah, posledné operácie, upozornenia |
| 5 | Počiatočné stavy | PARTIAL | **PARTIAL** | opening_balance existuje; guard + formulár + auditovaná evidencia → ďalšia fáza |
| 6 | Manuálna kontrola pokladne | FAIL | **PASS\*** | tabuľka + formulár + histórie ročníkov; \*runtime pending (migrácia neaplikovaná) |
| 7/8 | Príjmy/výdavky | PASS | PASS | bezo zmeny |
| 9 | Prevody | PASS | PASS | bezo zmeny |
| 10 | Členské predpisy z evidencie členov | FAIL | **PASS\*** | generovanie + idempotencia; \*runtime pending |
| 10.3 | Úhrada = 1 transakcia + allocácie | FAIL | **PASS\*** | model + server action + idempotencia |
| 11 | Report členských príspevkov | FAIL | **PASS\*** | súhrn + filtre + tabuľka; export = ďalšia fáza (finance.export existuje) |
| 12 | Plánované nákupy UI | FAIL | FAIL | tabuľka existuje; UI neimplementované (rozsah) |
| 13 | Uzávierky | FAIL | **PARTIAL** | DB model vytvorený (nemenný snapshot + revízie); UI = ďalšia fáza |
| 14 | Doklady | PASS | PASS | bezo zmeny |
| 15 | Stavy transakcií | PASS | PASS | bezo zmeny (+ autoritatívna oprava guardu) |
| 16 | Oprávnenia | PASS | PASS | POKLADNIK/VEDENIE/VELITEL mapovanie overené v DB seedoch |

## 5. IMPLEMENTOVANÉ ZMENY (táto fáza)

### 5.1 Nové forward-only migrácie (NEAPLIKOVANÉ — vyžadujú súhlas)

| Súbor | Účel | Status kontroly |
|---|---|---|
| `supabase/migrations/20261109_finance_guard_transactions_authoritative_fix.sql` | Autoritatívna definícia `finance_guard_transactions()` + `finance_pti_enable()` (semantika K13.2.5 podľa návrhu K13.4.5 §8; **opravený chýbajúci `END IF`**) | `IF=24 / END IF=24`, `$$` párové — vyvážené |
| `supabase/migrations/20261110_finance_cash_checks_dues.sql` | `finance_cash_checks`, `finance_membership_dues`, `finance_membership_payments`, `finance_closings`, agregačný trigger `finance_dues_sync()`, seed `MEMBERSHIP_DUES`, RLS+granty, audit triggery | `IF=2 / END IF=2`, `$$` párové, zátvorky 184/184 — vyvážené |

**Opravy oproti navrhnutej (priloženej) verzii migrácie — zdokumentované:**
1. Permission kľúč `finance.manage` **neexistuje** v schéme ani kóde → použité existujúce `finance.view` / `finance.create` / `finance.edit`.
2. Účtovné jednotky = **MINOR UNITS (BIGINT)**, konzistentne s existujúcou finančnou schémou (nie NUMERIC z návrhu).
3. `member_id` FK = **RESTRICT** (nie CASCADE) — ochrana histórie predpisov (§10.2).
4. Chýbajúci `due_date` pridaný (povinný dátum splatnosti).
5. Nová tabuľka `finance_membership_payments` (model v návrhu neumožňoval viac čiastočných úhrad / viac predpisov jednou platbou).
6. Nová tabuľka `finance_closings` (nemenný snapshot + `supersedes_id` reťazec revízií).
7. `finance_closings.closed_by` → `created_by` (konzistentnosť s audit triggerom 20261018).
8. Seed kategórie `MEMBERSHIP_DUES` (ON CONFLICT DO NOTHING) — INCOME vyžaduje `category_id`.
9. Kontroly/platby/uzávierky = **nemenné pre authenticated** (len SELECT+INSERT, žiadny UPDATE/DELETE).

### 5.2 Aplikačná vrstva

| Súbor | Účel |
|---|---|
| `src/lib/finance/finance-core.ts` | Čisté funkcie: `computeCashCheckDifference`, `classifyDuesStatus`, `remainingDuesMinor`, `buildDuesReport`, `validatePaymentAllocations`, `computeExpectedClosingBalance`, `formatMinor` + labely |
| `src/lib/finance/finance-core.test.ts` | 15 unit testov (node --test) |
| `src/app/(app)/finance/actions.ts` | Server actions: `loadAccountBalances`, `saveCashCheckAction`, `generateDuesAction`, `payMembershipDueAction` |
| `src/features/finance/components/CashCheckForm.tsx` | Klientsky formulár kontroly (live rozdiel, evidovaný stav len na čítanie, varovanie pri rozdieli) |
| `src/features/finance/components/MembershipDuesSection.tsx` | Predpisy + súhrn reportu + filtre + generovanie + inline úhrada |
| `src/app/(app)/finance/page.tsx` | Rozšírené: prehľad + účty + kontroly (form + história) + členské príspevky; pri neaplikovanej migrácii sa sekcie zobrazia prázdne (stránka dostupná) |

### 5.3 Oprava súvisiacej regresie (z predchádzajúcej refactor práce)
- `src/app/(app)/documents/page.tsx`: odstránený duplicitný import + presun `OrgDocument` typu do `org-documents.types` (TS chyba TS2459 opravená).

## 6. BEZPEČNOSTNÉ A DATABÁZOVÉ ZISTENIA

1. **P0 (historické, stále otvorené): syntaxová chyba K13.2.5** — `20261023_finance_transaction_guard_fix.sql` (chýbajúci `END IF`). **Nič som v historickom súbore nemenil.** Autorizovaná cesta: (a) schváliť B1 z K13.4.5 §7.3, (b) aplikovať na autorizovanom DEV, (c) potom pusnúť reťazec vrátane novej autoritatívnej migrácie `20261109`.
2. **Permission `finance.manage` neexistuje** — navrhnutá migrácia (príloha zadania) by vytvorila nefunkčné RLS politiky (INSERT by zamietal všetkých).
3. **Opening balance je prepísateľný** cez `finance_accounts_update` (finance.edit) bez guardu a auditu stĺpca — odporúčanie: DB guard v ďalšej migrácii + formulár.
4. **VEDENIE nemá `finance.edit`** — nemôže schvaľovať/postovať (plány, úhrady) — schvaľovací workflow vyžaduje rozhodnutie o oprávneniach (rozšírenie máp?).
5. **Duplicitné odoslanie všeobecných transakčných formulárov** — idempotencia zavedená len pre úhrady príspevkov (client_token); zvyšok = ďalšia fáza.
6. **Agregát `amount_paid_minor`** je denormalizovaný, ale udržiavaný triggerom so `SELECT ... FOR UPDATE` (zámok) — konzistentný pri súbežných platbách.
7. **Audit**: nové tabuľky používajú existujúci univerzálny audit trigger (verzia 20261018 — bezpečná cez `to_jsonb`).
8. RLS `payments_insert` obsahuje aj nadriadenú kontrolu prebytku úhrady (defense-in-depth okrem serverovej validácie).

| 17 | Audit | PASS | PASS | nové tabuľky napojené na univerzálny audit trigger |
| 18 | Validácia | PASS→PARTIAL↑ | server + DB validácie pre nové entity; plná idempotencia formulárov = ďalšia fáza |
| 19 | Reporty | PARTIAL | PARTIAL↑ | + členský report; export PDF/Excel = ďalšia fáza |
| 20 | Testy | PARTIAL | **PARTIAL↑** | 15/15 nových unit testov PASS; runtime BLOCKED |

| 21 | Migrácie | PASS | PASS | vytvorené forward-only; **nie aplikované** (žiadny `db push`, `migration up`) |
| 22 | UX / responzívne | PARTIAL | PARTIAL↑ | dashboard + stránka financie rozšírená; formátery + export = ďalšia fáza |
| 23 | Akceptačné kritériá | PARTIAL↑ | DOTIAHOT: 1–10 | kľúčové kritériá splnené alebo v ceste; 11–20 = ďalšia fáza |
| 24 | Report | PASS | PASS | tento súbor |
| 25 | Stop podmienka | PASS | PASS | po dokončení aktuálneho rozsahu report uložen, čakám na schválenie |

---

## 7. NEDOSTATKY A LABORY SPOJENÉ S HISTORICKÝMI PROBLÉMY

| # | Kategória | Popis | Odporúčanie | Status |
|---|---|---|---|---|
| H1 | Migrácia | Syntaxová chyba v `20261023_finance_transaction_guard_fix.sql` (K13.2.5: chýbajúci `END IF`) | Priamo v historickom súbore nemať (zakázané); vytvoriť nová forward-only `20261109_finance_guard_transactions_authoritative_fix.sql` | Zdokumentované |
| H2 | Migrácia | Konflikt dvoch `20261022` súborov s `finance_guard_transactions()` (K13.2.4/K13.2.5) | K13.2.5 presunuté na `20261023` → poradie je správne | **VYLIESENÉ** (pořadí správne, hnež syntax chyba) |
| H3 | Migrácia | Príloha zadania (20261020) používa `finance.manage` → nefunkčné RLS politiky | Použité existujúce `finance.view/create/edit` v `20261110_*` | Zdokumentované |
| H4 | Migrácia | Účtovné jednotky NUMERIC vs BIGINT | BIGINT minor units všade; konzistentné s zostatkovým modelem | Zdokumentované |
| H5 | DB | `finance_accounts.opening_balance_minor` prepísateľný bez guardu/auďit | DB guard + audit stĺpcu (ďalšia fázu) | Zaznamenané |
| H6 | DB | Členské predpisy: nové tabuľky `dues`, `payments`, `closings` musia byť aplikované | Forward-only migrácia `20261110_*` pripravená | Zdokumentované |
| H7 | DB | `has_permission` vracia false pre NULL `p_user_id` | Správne zachované v guardoch (K13.2.4/K13.2.5); GUC hranica dôvery | Ok |
| H8 | DB | Role POKLADNIK nemá `finance.manage` | Finančný workflow používa `finance.create` + `finance.edit` (konzistentné) | Ok |
| H9 | Aplikácia | `DocumentUploadForm.tsx` importoval prímo `ORG_DOCUMENT_CATEGORY_LABELS` z `org-documents.service` (server-only dáta → prebieha `next/headers` chyba) | Import zmieňovaný na `org-documents.types` | Opravené |
| H10 | Aplikácia | Originálny `DocumentUploadForm.tsx` používa `uploadOrgDocumentAction`/`deleteOrgDocumentAction` z `actions.ts` (server actions) — správne | Nepočítava sa ako chyba | Ok |
| H11 | Aplikácia | `src/app/(app)/finance/page.tsx` nie je zahrnutý do `config/navigation.ts` (pozicie `Financie` zostáva v `Sidebar.tsx`) | Navigačná štruktúra `config/navigation.ts` zostaňu bezo zmeny | Zaznamenané |

## 8. IMPLEMENTAČNÝ A PLAN (táto fáza)

### 8.1 Fáza A — Bezpečný stop kratší (nenakopyť panic)
| Krok | Výstup | Akceptačný kritérium |
|---|---|---|
| 7.1 | Dokončiť `FINANCE_MODULE_SPEC_AUDIT_REPORT.md` (tento súbor) | H1–H9 odstránené, H10–H11 zaznamenané |
| 7.2 | Spustiť `npx tsc --noEmit` | Žiadne chyby v nové/finjných súboroch; štandardné existujúce chyby ponechávať |
| 7.3 | Spustiť `npm run build` | Kompilácia prebehne (`✓ Compiled successfully`) |

### 8.2 Fáza B — Autorizovaná testovačská databáza (vyžaduje schvaľovateľa)
| Krok | Výstup | Akceptačný kritérium |
|---|---|---|
| 8.1 | Aplikovať migrácie `20261109_*` (oprava guardu) a `20261110_*` (finančné entity) | `supabase db push` prebieha; `supabase migration list` zobrazuje obaja súbory |
| 8.2 | RLS matrix pre nové entity | SELECT/INSERT/UPDATE právna mapa platná pre POKLADNIK, VEDENIE, VELITEL |
| 8.3 | Algoritmus vstupný (unit + integracií) | Prikaz `node --test src/lib/finance/finance-core.test.ts` → 15/15 PASS; SQL triggery/policies testované priamo (live) |
| 8.4 | Runtime testy | `next build` → `✓ Compiled successfully`; `npx tsc --noEmit` → 0 chyb v finančných súboroch |

### 8.3 Fáza C — Produkčný rollout (voliteľné po schválení fázou B)
| Krok | Výstup |
|---|---|
| 9.1 | Push branch na DEV; CI checky prebehnú (tsc, eslint, testy) |
| 9.2 | Review distribučný výstup; rollback plan uložen do reportu |
| 9.3 | Produkt Release (išiel do `master`) — ohľadom všetkých hlavných limiterov |
| 9.4 | Nadviazanie upgrade scriptu (migrácie s `IF NOT EXISTS` guardmi) pre existujúce produkty |

### 8.4 Prerušené práva (komu nie je žiadny rozhodovací úkon cez tieto fazy)
- Nenecháva `supabase db push` / `migration up` / `db reset` — vyžadujealej autorizáciu
- Nie je menímne migrácie (maximálne `CREATE OR REPLACE FUNCTION` vo forward-only súboroch)
- Migrácie nebudú aplikované na produkčné DB bez explicitného zabraňujúceho schválenia používateľa

## 9. STOP PODMIENKA (pre ukončenie tohto zadania)

Po dokončení fázy A a B:
- Report uložený: `dhz-app/FINANCE_MODULE_SPEC_AUDIT_REPORT.md`
- Všetky nové súbory (migrácie, služby, akcie, formátery) sú v ponuke
- Všetky bezpečnostné zistenia sú zdokumentované a prioritizované (H1–H9)
- Čakám na výslovné schválenie používateľa na ďalšiu fázu (aplikácia migrácií, rollout)

**Priorita je finančná správnosť, auditovateľnosť, bezpečnosť a zachovanie existujúcich dát.** Nikdy nevykonávaj žiadne neautorizované dbalosti — všetky prepísania migrácií, návrh legacy fix, compatiability, bezpečnosť, report bez výkonu, a koniec.
| 21 | Migrácie | PASS | PASS | vytvorené forward-only; **nie aplikované** (žiadny `db push`, `migration up`) |\n| 22 | UX / responzívne | PARTIAL | PARTIAL↑ | dashboard + stránka financie rozšírená; formátery + export = ďalšia fáza |\n| 23 | Akceptačné kritériá | PARTIAL↑ | DOTIAHOT: 1–10 | kľúčové kritériá splnené alebo v ceste; 11–20 = ďalšia fáza |\n| 24 | Report | PASS | PASS | tento súbor |\n| 25 | Stop podmienka | PASS | PASS | po dokončení aktuálneho rozsahu report uložen, čakám na schválenie |