// K17.5 – Typy pre pozývacie kódy a zdieľanie.
//
// BEZPEČNOSTNÉ ZÁSADY:
//  - `InvitationCode` (raw kód) existuje IBA v pamäti klienta a v odpovedi
//    server action. Nikdy sa neukladá do DB, localStorage, URL ani logov.
//  - `Invitation` (záznam z DB) NIKDY neobsahuje `code_hash` v UI vrstve.

import type { AppRole } from "@/lib/auth/roles";

// =============================================================================
// STAVY A TYPY POZVÁNOK
// =============================================================================

export type InvitationStatus = "active" | "consumed" | "revoked" | "expired";

export const INVITATION_STATUS_LABELS: Record<InvitationStatus, string> = {
  active: "Aktívna",
  consumed: "Použitá",
  revoked: "Zrušená",
  expired: "Expirovaná",
};

export const INVITATION_MAX_USES_LIMIT = 100;
export const INVITATION_DEFAULT_MAX_USES = 1;
export const INVITATION_DEFAULT_VALIDITY_DAYS = 14;

/**
 * Záznam pozvánky bez citlivých údajov – bezpečné na zobrazenie.
 * `code_hash` je zámerne ABSENTNÝ.
 */
export interface Invitation {
  id: string;
  role: AppRole;
  status: InvitationStatus;
  use_count: number;
  max_uses: number;
  expires_at: string;
  target_email: string | null;
  member_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

/**
 * Výsledok overenia kódu (bez spotrebovania).
 */
export interface InvitationVerification {
  invitation_id: string;
  role: AppRole;
  status: InvitationStatus;
  is_valid: boolean;
  expires_at: string;
  use_count: number;
  max_uses: number;
}

/**
 * Výsledok atomického uplatnenia kódu.
 */
export interface InvitationClaimResult {
  success: boolean;
  invitation_id?: string;
  role?: AppRole;
  error?: InvitationClaimError;
}

export type InvitationClaimError =
  | "invalid_code"
  | "code_unusable"
  | "unknown";

/**
 * Výsledok vytvorenia pozvánky.
 *
 * `code` je RAW pozývací kód – vracia sa IBA raz, priamo v odpovedi server
 * action. Caller je povinný ho ihneď zobraziť (a po zatvorení dialógu
 * odstrániť zo stavu).
 */
export interface CreatedInvitation {
  invitation: Invitation;
  code: string;
  codeHash: string;
}

// =============================================================================
// PREDPOSLANIA
// =============================================================================

export interface CreateInvitationParams {
  role: AppRole;
  /** Dĺžka platnosti v dňoch. */
  validDays?: number;
  /** Voliteľný e-mail, pre ktorý je pozvánka určená. */
  targetEmail?: string | null;
  /** Voliteľné viazanie na člena. */
  memberId?: string | null;
  /** Max počet uplatnení (1 = jednorazový kód). */
  maxUses?: number;
  /** Voliteľná poznámka administrátora. */
  notes?: string | null;
}

// =============================================================================
// ZDIELANIE
// =============================================================================

export type ShareChannel = "clipboard" | "whatsapp" | "messenger" | "system";

export interface ShareMessageParams {
  /** Raw pozývací kód (zobrazuje sa v texte). */
  code: string;
  /** Kód roly (pre label). */
  role: AppRole;
  /** Dátum vypršania platnosti (ISO string). */
  expiresAt: string;
  /** Registračná URL; ak undefined, odkaz sa do textu nepridá. */
  registrationUrl?: string | null;
  /** Názov organizácie v texte. */
  organizationName?: string;
}

export interface ShareLinks {
  whatsapp: string;
  messenger: string | null;
}

/**
 * Výsledok zdieľacej operácie. `confirmed` je VŽDY false – otvorenie
 * WhatsApp/Messenger/Share sheetu NIE JE potvrdením odoslania.
 */
export interface ShareOutcome {
  channel: ShareChannel;
  /** Otvorenie kanála prebehlo – neznamená, že správa bola odoslaná. */
  opened: boolean;
  /** Text bol skopírovaný do schránky. */
  copied: boolean;
  /** Užívateľ musí správu potvrdiť sám – UI musí to výslovne oznámiť. */
  requiresUserConfirmation: boolean;
}

export const SHARE_CHANNELS: readonly ShareChannel[] = [
  "clipboard",
  "whatsapp",
  "messenger",
  "system",
];
