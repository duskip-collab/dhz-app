// Announcements Module Validation – K15 Oznamy
//
// Validuje vstupné údaje pre tabuľku announcements.

import { z } from "zod";

export const AnnouncementPriority = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export type AnnouncementPriorityValue = (typeof AnnouncementPriority)[number];

export function isAnnouncementPriority(value: string): value is AnnouncementPriorityValue {
  return AnnouncementPriority.includes(value as AnnouncementPriorityValue);
}

export interface AnnouncementInput {
  title: string;
  content: string;
  priority?: string;
  published_at?: string;
  expires_at?: string | null;
  target_roles?: string[] | null;
  is_pinned?: boolean;
  is_active?: boolean;
}

export interface AnnouncementUpdateInput {
  title?: string;
  content?: string;
  priority?: string;
  published_at?: string;
  expires_at?: string | null;
  target_roles?: string[] | null;
  is_pinned?: boolean;
  is_active?: boolean;
}

const baseAnnouncementSchema = z.object({
  title: z.string().min(1, "Názov je povinný").max(200, "Názov je príliš dlhý"),
  content: z.string().min(1, "Obsah je povinný"),
  priority: z.string().optional(),
  published_at: z.string().datetime({ offset: true }).optional(),
  expires_at: z.string().datetime({ offset: true }).nullable().optional(),
  target_roles: z.array(z.string()).nullable().optional(),
  is_pinned: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export function validateAnnouncement(input: unknown) {
  const parsed = baseAnnouncementSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.flatten().fieldErrors,
    };
  }
  return { ok: true, data: parsed.data };
}

export function validateAnnouncementUpdate(input: unknown) {
  const updateSchema = baseAnnouncementSchema.partial();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.flatten().fieldErrors,
    };
  }
  return { ok: true, data: parsed.data };
}
