/**
 * FINANCE MODULE SPEC AUDIT — UNIT / STATIC testy pre finance-core.
 *
 * Spúšťané bez bundlera a bez DB cez built-in Node test runner:
 *   node --test src/lib/finance/finance-core.test.ts
 *
 * Overuje čistú (pure) logiku:
 *   * rozdiel pokladničnej kontroly (evidovaný vs. skutočný),
 *   * klasifikáciu stavu predpisu (PENDING/PARTIAL/PAID; WAIVED len manuálne),
 *   * zostávajúcu sumu a súhrn reportu členských príspevkov,
 *   * validáciu alokácií úhrady (1 platba = 1 transakcia, bez duplicitných
 *     predpisov a bez súčtových nezhôd),
 *   * výpočet očakávaného zostatku uzávierky (prevody oddelene).
 *
 * Tieto testy sú IBA STATICKÉ/UNIT — neskúšajú RLS, DB triggery ani
 * server actions (tie vyžadujú autorizované prostredie — BLOCKED).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeCashCheckDifference,
  classifyDuesStatus,
  remainingDuesMinor,
  buildDuesReport,
  validatePaymentAllocations,
  computeExpectedClosingBalance,
  formatMinor,
  type DuesReportRow,
} from "./finance-core.ts";

// ---------------------------------------------------------------------------
// 6. Manuálna kontrola pokladne — rozdiel
// ---------------------------------------------------------------------------

test("computeCashCheckDifference: skutočný - evidovaný (minor units)", () => {
  assert.equal(computeCashCheckDifference(10000, 10000), 0);
  assert.equal(computeCashCheckDifference(10000, 9500), -500);
  assert.equal(computeCashCheckDifference(10000, 10300), 300);
  assert.equal(computeCashCheckDifference(0, 250), 250);
});

test("computeCashCheckDifference: odmieta ne-celé (floating-point) vstupy", () => {
  assert.throws(() => computeCashCheckDifference(10.5, 10), TypeError);
  assert.throws(() => computeCashCheckDifference(10000, 1000.99), TypeError);
});

// ---------------------------------------------------------------------------
// 10. Členské príspevky — stav predpisu a zostatok
// ---------------------------------------------------------------------------

test("classifyDuesStatus: PENDING / PARTIAL / PAID (vrátane príkladu 20€/10€/10€)", () => {
  assert.equal(classifyDuesStatus(2000, 0), "PENDING");
  // Príklad zo špecifikácie: predpis 20 €, uhradených 10 € → PARTIAL, zostáva 10 €
  assert.equal(classifyDuesStatus(2000, 1000), "PARTIAL");
  assert.equal(remainingDuesMinor(2000, 1000), 1000);
  assert.equal(classifyDuesStatus(2000, 1999), "PARTIAL");
  // Plná úhrada
  assert.equal(classifyDuesStatus(2000, 2000), "PAID");
  assert.equal(remainingDuesMinor(2000, 2000), 0);
});

test("remainingDuesMinor: preplatok nie je záporný dlh", () => {
  assert.equal(remainingDuesMinor(1000, 1500), 0);
});

test("classifyDuesStatus: odmieta záporné sumy", () => {
  assert.throws(() => classifyDuesStatus(-1, 0), TypeError);
  assert.throws(() => classifyDuesStatus(1000, -5), TypeError);
});

// ---------------------------------------------------------------------------
// 11. Report členských príspevkov — súhrn
// ---------------------------------------------------------------------------

test("buildDuesReport: súhrn počtov a súm (PENDING/PARTIAL/PAID/WAIVED)", () => {
  const rows: DuesReportRow[] = [
    { amountDueMinor: 2000, amountPaidMinor: 2000, status: "PAID" },
    { amountDueMinor: 2000, amountPaidMinor: 1000, status: "PARTIAL" },
    { amountDueMinor: 2000, amountPaidMinor: 0, status: "PENDING" },
    { amountDueMinor: 2000, amountPaidMinor: 0, status: "WAIVED" },
  ];
  const s = buildDuesReport(rows);
  assert.equal(s.memberCount, 4);
  assert.equal(s.totalDueMinor, 8000);
  // PAID 2000 + PARTIAL 1000 = 3000 prijatých
  assert.equal(s.totalPaidMinor, 3000);
  // WAIVED sa NEPOČÍTA ako pohľadávka → len PARTIAL (1000) + PENDING (2000)
  assert.equal(s.totalUnpaidMinor, 3000);
  assert.equal(s.paidCount, 1);
  assert.equal(s.partialCount, 1);
  assert.equal(s.pendingCount, 1);
  assert.equal(s.waivedCount, 1);
});

test("buildDuesReport: prázdny vstup → nulové súhrny bez chyby", () => {
  const s = buildDuesReport([]);
  assert.equal(s.memberCount, 0);
  assert.equal(s.totalDueMinor, 0);
  assert.equal(s.totalPaidMinor, 0);
  assert.equal(s.totalUnpaidMinor, 0);
});


// ---------------------------------------------------------------------------
// 10.3. Validácia úhrady — 1 platba = 1 transakcia, korektné alokácie
// ---------------------------------------------------------------------------

test("validatePaymentAllocations: platná alokácia (jeden predpis)", () => {
  assert.equal(
    validatePaymentAllocations([{ duesId: "d1", amountMinor: 1000 }], 1000),
    null,
  );
});

test("validatePaymentAllocations: jedna platba na viac predpisov (súčet sedí)", () => {
  const err = validatePaymentAllocations(
    [
      { duesId: "d1", amountMinor: 1000 },
      { duesId: "d2", amountMinor: 1500 },
    ],
    2500,
  );
  assert.equal(err, null);
});

test("validatePaymentAllocations: súčet alokácií ≠ suma transakcie → chyba", () => {
  const err = validatePaymentAllocations(
    [
      { duesId: "d1", amountMinor: 1000 },
      { duesId: "d2", amountMinor: 1500 },
    ],
    3000,
  );
  assert.ok(err, "Musí vrátiť chybu pri nesúlade súčtu.");
});

test("validatePaymentAllocations: duplicitný predpis → chyba", () => {
  const err = validatePaymentAllocations(
    [
      { duesId: "d1", amountMinor: 500 },
      { duesId: "d1", amountMinor: 500 },
    ],
    1000,
  );
  assert.ok(err, "Musí vrátiť chybu pri duplicite predpisu.");
});

test("validatePaymentAllocations: prázdny vstup / nulová suma → chyba", () => {
  assert.ok(validatePaymentAllocations([], 1000));
  assert.ok(validatePaymentAllocations([{ duesId: "d1", amountMinor: 1000 }], 0));
  assert.ok(validatePaymentAllocations([{ duesId: "d1", amountMinor: 0 }], 0));
});

// ---------------------------------------------------------------------------
// 13. Uzávierka — očakávaný zostatok (prevody oddelene)
// ---------------------------------------------------------------------------

test("computeExpectedClosingBalance: opening + príjmy − výdavky ± prevody", () => {
  assert.equal(
    computeExpectedClosingBalance({
      openingBalanceMinor: 100000,
      incomeMinor: 50000,
      expenseMinor: 30000,
      transferInMinor: 10000,
      transferOutMinor: 5000,
    }),
    125000,
  );
  // Prevod NIE je príjem ani výdavok — je vedený oddelene.
  assert.equal(
    computeExpectedClosingBalance({
      openingBalanceMinor: 0,
      incomeMinor: 0,
      expenseMinor: 0,
      transferInMinor: 5000,
      transferOutMinor: 0,
    }),
    5000,
  );
});

test("computeExpectedClosingBalance: odmieta záporné vstupy", () => {
  assert.throws(
    () =>
      computeExpectedClosingBalance({
        openingBalanceMinor: -1,
        incomeMinor: 0,
        expenseMinor: 0,
        transferInMinor: 0,
        transferOutMinor: 0,
      }),
    TypeError,
  );
});

// ---------------------------------------------------------------------------
// Prezentácia — formát EUR
// ---------------------------------------------------------------------------

test("formatMinor: centy na EUR string", () => {
  assert.equal(formatMinor(1234), "12,34 €");
  assert.equal(formatMinor(0), "0,00 €");
  assert.equal(formatMinor(-250), "-2,50 €");
  assert.equal(formatMinor(5), "0,05 €");
});
