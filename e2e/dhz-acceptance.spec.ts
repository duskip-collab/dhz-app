// DHZ Digital OS — Acceptance E2E (K13.4.3)
// ============================================================================
// Playwright špecifikácia pre LIVE prostredie (autorizovaná DEV databáza).
// BEZ nej sa celá sada PRESKOČÍ (test.skip) — nikdy nesmie zlyhať len preto,
// že beží offline/bez databázy. Nevydáva statickú kontrolu za runtime PASS.
//
// Spustenie (LIVE):
//   npm i -D @playwright/test && npx playwright install chromium
//   E2E_USER_EMAIL=... E2E_USER_PASSWORD=... \
//   PLAYWRIGHT_BASE_URL=https://dev.example \
//   npx playwright test e2e/dhz-acceptance.spec.ts
//
// Voliteľne (negatívne AND-permission scenáre):
//   E2E_NOFINANCE_USER_EMAIL / E2E_NOFINANCE_USER_PASSWORD
//   — používateľ S reports.view, ale BEZ finance.view.
//
// Žiadne testovacie účty sa nevytvárajú; spec používa existujúce seed účty
// DEV prostredia a nikdy nemodifikuje dáta (žiadne POST/DELETE kroky).
// Aktivačné cesty vychádzajú zo skutočného kódu:
//   login: label "E-mail" + "Heslo", submit "Prihlásiť sa"
//   neprihlásený → /login; neoprávnený → /dashboard?denied=1
//   nadpis katalógu: "Reporty a analýza"

import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

const E2E_USER = process.env.E2E_USER_EMAIL;
const E2E_PASS = process.env.E2E_USER_PASSWORD;
const HAS_CREDS = Boolean(E2E_USER && E2E_PASS);

const NOFIN_USER = process.env.E2E_NOFINANCE_USER_EMAIL;
const NOFIN_PASS = process.env.E2E_NOFINANCE_USER_PASSWORD;
const HAS_NOFIN = Boolean(NOFIN_USER && NOFIN_PASS);

test.use({ baseURL: BASE_URL });

/** Prihlásenie cez skutočný LoginForm (E-mail / Heslo / Prihlásiť sa). */
async function loginAs(
  page: Parameters<Parameters<typeof test>[1]>[0]["page"],
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Heslo").fill(password);
  await page.getByRole("button", { name: /Prihlásiť sa/i }).click();
  await page.waitForURL(/dashboard/);
}

test.describe("DHZ Digital OS — akceptačné scenáre (LIVE)", () => {
  test.skip(!HAS_CREDS, "LIVE scenáre vyžadujú E2E_USER_EMAIL/E2E_USER_PASSWORD + DEV DB");

  test("A1 — prihlásenie dovedie na dashboard", async ({ page }) => {
    await loginAs(page, E2E_USER!, E2E_PASS!);
    await expect(page).toHaveURL(/dashboard/);
  });

  test("A2 — neprihlásený používateľ je presmerovaný z /reports na /login", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/reports");
    await expect(page).toHaveURL(/\/login/);
  });

  test("A3 — katalóg reportov zobrazí nadpis a dostupné karty", async ({ page }) => {
    await loginAs(page, E2E_USER!, E2E_PASS!);
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: /Reporty a analýza/i })).toBeVisible();
  });

  test("A4 — PWA offline: zoznam členov sa načíta z cache + banner offline", async ({
    page,
    context,
  }) => {
    await loginAs(page, E2E_USER!, E2E_PASS!);
    // Najprv online návšteva → SW uloží HTML do dhz-pages-v2.
    await page.goto("/members");
    await expect(page).toHaveURL(/members/);
    // Potom offline: Network-First spadne do cache; UI ukáže banner.
    await context.setOffline(true);
    await page.reload();
    await expect(page).toHaveURL(/members/);
    await expect(page.getByText(/Ste offline/i)).toBeVisible();
    await context.setOffline(false);
  });

  test("A5 — finančný denník: iba POSTED, žiadny export", async ({ page }) => {
    await loginAs(page, E2E_USER!, E2E_PASS!);
    await page.goto("/reports/finance-ledger");
    // Stránka je dostupná a renderuje súčty (finance.view držiteľ).
    await expect(page.getByRole("heading", { name: /Transakčná listina/i })).toBeVisible();
    await expect(page.getByText(/Spolu/i).first()).toBeVisible();
    // Deník nesmie obsahovať DRAFT/VOID riadky ani exportné tlačidlo.
    await expect(page.getByText("DRAFT", { exact: true })).toHaveCount(0);
    await expect(page.getByText("VOID", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /export|csv|xlsx/i })).toHaveCount(0);
  });

  test("A6 — mesačná bilancia: iba POSTED, netto viditeľné", async ({ page }) => {
    await loginAs(page, E2E_USER!, E2E_PASS!);
    await page.goto("/reports/finance-monthly-summary");
    await expect(
      page.getByRole("heading", { name: /Mesačná finančná bilancia/i }),
    ).toBeVisible();
    await expect(page.getByText(/Spolu/i).first()).toBeVisible();
  });
});

test.describe("DHZ Digital OS — AND oprávnenia: reports.view ≠ dáta (LIVE)", () => {
  test.skip(!HAS_NOFIN, "Negatívne scenáre vyžadujú E2E_NOFINANCE_USER_* (reports.view bez finance.view)");

  test("N1 — používateľ BEZ finance.view NEDOSTANE finančné dáta", async ({ page }) => {
    await loginAs(page, NOFIN_USER!, NOFIN_PASS!);
    await page.goto("/reports/finance-ledger");
    // Stránka zobrazí kartu "Report nie je dostupný" namiesto dát.
    await expect(page.getByText(/Report nie je dostupný/i)).toBeVisible();
    await expect(page.getByText(/finance\.view/i).first()).toBeVisible();
  });

  test("N2 — používateľ BEZ finance.view je odmietnutý aj na bilancii", async ({
    page,
  }) => {
    await loginAs(page, NOFIN_USER!, NOFIN_PASS!);
    await page.goto("/reports/finance-monthly-summary");
    await expect(page.getByText(/Report nie je dostupný/i)).toBeVisible();
  });
});

