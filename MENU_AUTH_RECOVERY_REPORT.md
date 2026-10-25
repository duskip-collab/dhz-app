# DHZ DIGITAL OS — MENU RESTORATION + AUTH RATE LIMIT AUDIT REPORT

## Cieľ
Zistiť a opraviť príčinu zmiznutého menu a zároveň preveriť chybu Supabase `AuthApiError: Request rate limit reached` na DashboardPage.

---

## Fáza 1 — Audit bez zmien

### Overené súbory

| Súbor | Stav |
|-------|------|
| `src/components/layout/AppShell.tsx` | ✅ OK — komponent existuje, správne importy, export |
| `src/components/layout/Sidebar.tsx` | ❌ **PLACEHOLDER** — obsahoval `return <div className="hidden ...">Sidebar with onLogout</div>;` |
| `src/components/layout/TopBar.tsx` | ✅ OK — mobile/desktop top bar |
| `src/components/layout/MobileBottomNav.tsx` | ✅ OK — 4 tabs + full menu button |
| `src/components/navigation/MobileFullMenuDrawer.tsx` | ✅ OK — full menu drawer |
| `src/components/ui/PageHeader.tsx` | ✅ OK — back button, title |
| `src/app/layout.tsx` | ✅ OK — root layout |
| `src/app/(app)/layout.tsx` | ✅ OK — AppShell wrapper s auth context |
| `src/app/(app)/dashboard/page.tsx` | ✅ OK — KPI cards, alerts, calendar |
| `src/lib/auth/server.ts` | ✅ OK — auth context loading |
| `src/config/navigation.ts` | ✅ OK — 9 nav sections s permissions |

### Duplicitné súbory

| Súbor | Stav |
|-------|------|
| `AppShell_orig.tsx` | ❌ **DUPLICITNÝ** — úplná kópia AppShell.tsx, spôsoboval 29 TS chýb |

---

## Fáza 2 — Diagnostika zmiznutého menu

### Potvrdená príčina

**`Sidebar.tsx`** obsahoval placeholder implementáciu:
```tsx
return <div className="hidden border-r border-gray-200 bg-white h-screen">Sidebar with onLogout</div>;
```

Trieda `hidden` skrývala sidebar na všetkých breakpointoch. Pôvodná implementácia s `NAV_SECTIONS`, `filterNavByPermissions`, používateľským info a odhlásením bola **stratená** počas UX/UI recovery fázy.

### Overené body

1. ✅ `Sidebar` sa renderuje v `AppShell` — `Sidebar` komponent je importovaný a použitý
2. ✅ `AppShell` správne obaluje obsah — `children` sú v `<main>` elemente
3. ❌ Menu bolo skryté triedou `hidden` na placeholder elemente
4. ✅ `filterNavByPermissions` správne filtruje položky podľa permissions
5. ✅ Auth chyba nezastavuje renderovanie navigácie (server-side auth je v layoute)
6. ✅ Desktop (`hidden lg:flex`) a mobil (`lg:hidden`) menu sú oddelené

### Navigácia vs. routes

Všetky `href` v `NAV_SECTIONS` zodpovedajú existujúcim route adresám v `src/app/(app)/`.

### Permission kľúče

Všetky `PERMISSIONS.*` kľúče v `NAV_SECTIONS` zodpovedajú definíciám v `src/lib/auth/permissions.ts`. Žiadne nové kľúče neboli vytvorené.

---

## Fáza 3 — Auth rate limit

### Vyšetrovanie

**Príčina:** Supabase Auth API rate limit (`AuthApiError: Request rate limit reached`).

**Mechanizmus:**
- `getAuthContext()` v `src/lib/auth/server.ts` volá `supabase.auth.getUser()` pri každom requeste na `(app)` layout
- Dashboard page volá `requirePermission()` → `getAuthContext()` → ďalší `getUser()`
- Každá stránka v `(app)` skupine volá `getAuthContext()` → duplicitné auth volania

**Zistené vzory:**
- `getUser()` sa volá viackrát počas jedného requestu (layout + page)
- Žiadne `getSession()`, `refreshSession()`, `onAuthStateChange()` v kóde
- Žiadne redirect slučky alebo neobmedzené retry

**Riziko:** Pri rýchlych navigáciách medzi stránkami môže Supabase rate limit zablokovať auth requesty, čo vedie k chybe na DashboardPage.

**Odporúčanie:** Implementovať caching auth contextu medzi layoutom a stránkou (napr. React `cache()` alebo Next.js `unstable_cache`). Toto je však rozsiahly refaktor — zastavujem sa a opisujem.
## Fáza 4 — Cielená oprava

### Upravené súbory

| Súbor | Zmena |
|-------|-------|
| `src/components/layout/Sidebar.tsx` | **Obnovený z git HEAD** — plná implementácia s NAV_SECTIONS, filterNavByPermissions, Avatar, odhlásenie |
| `src/components/layout/AppShell_orig.tsx` | **Odstránený** — duplicitný súbor spôsobujúci 29 TS chýb |

### Zachované funkcie

- ✅ Desktop sidebar (`hidden lg:flex`) s plnou navigáciou
- ✅ Mobilná spodná navigácia (`MobileBottomNav`) s 4 tabmi
- ✅ Menu „Všetky moduly" (`MobileFullMenuDrawer`)
- ✅ Filtrovanie podľa permissions (`filterNavByPermissions`)
- ✅ Safe-area padding (`env(safe-area-inset-bottom)`)
- ✅ Serverové ochrany rout (layout-level auth)
- ✅ Responzívne rozloženie

---

## Fáza 5 — Validácia

### TypeScript (`npx tsc --noEmit`)

| Metrika | Pred opravou | Po oprave |
|---------|-------------|-----------|
| Celkový počet chýb | 34 | 5 |
| Zdrojové súbory (bez .next cache) | 32 | 3 |

**Zostávajúce pre-existing chyby:**
- `AdminMemberManager.tsx` — `useFormState` nie je exportovaný z react
- `admin.service.ts` — `ROLE_LABELS`, `VISIBILITY_PERMISSIONS` nie sú definované
- `.next` cache validator (nie zdrojový kód)

### Lint (`npm run lint`)

| Metrika | Výsledok |
|---------|----------|
| Chyby | 44 |
| Warnings | 95 |

**Poznámka:** Lint chyby sú pre-existing a nesúvisia s menu/auth. Hlavné kategórie: `any` type usage, unused variables, impure function calls. Dotknuté súbory (AppShell, Sidebar, TopBar, MobileBottomNav, MobileFullMenuDrawer, PageHeader) nemajú lint chyby.

### Build (`npm run build`)

**Stav:** BLOCKED — pre-existing TypeScript chyby (AdminMemberManager.tsx, admin.service.ts) bránia úspešnému buildu.

### Desktop navigácia

| Test | Stav |
|------|------|
| Sidebar sa renderuje na lg+ breakpointoch | ✅ OVERENÉ (kód) |
| Všetky NAV_SECTIONS položky sú zobrazené | ✅ OVERENÉ (kód) |
| Permission filtering funguje | ✅ OVERENÉ (kód) |
| Active state highlighting funguje | ✅ OVERENÉ (kód) |
| User info + logout button zobrazené | ✅ OVERENÉ (kód) |

### Mobilná navigácia

| Test | Stav |
|------|------|
| Bottom nav s 4 tabmi | ✅ OVERENÉ (kód) |
| Full menu drawer (Všetky moduly) | ✅ OVERENÉ (kód) |
| Safe-area padding | ✅ OVERENÉ (kód) |
| Permission filtering | ✅ OVERENÉ (kód) |

### Runtime test

**Stav:** BLOCKED — nie je dostupné runtime prostredie ani prihlásený testovací účet.

---

## Otvorené riziká

1. **Auth rate limit** — Supabase Auth API rate limit môže blokovať auth requesty pri rýchlych navigáciách. Odporúča sa implementovať caching auth contextu, ale to je rozsiahly refaktor.
2. **Pre-existing chyby** — `AdminMemberManager.tsx` a `admin.service.ts` majú typové chyby, ktoré bránia úspešnému buildu.
3. **Lint chyby** — 44 errors a 95 warnings v kóbase (pre-existing, nesúvisiace s touto úlohou).

---

**STOP — Čaká sa ďalšia fáza.**