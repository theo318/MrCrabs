import type { Decision } from "./underwrite-prompt";

export type Case = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  buyerName: string;
  buyerId: string;
  createdAt: string;
  reasoning: string;
  decision: Decision;
  specterSnapshot: any;
  ledgerSnapshot: any;
  chSnapshot: any;
  // Human override
  humanVerdict?: "APPROVE" | "DECLINE";
  humanNotes?: string;
  humanDecidedAt?: string;
};

// Use a global to survive Next.js dev hot-reload
declare global {
  // eslint-disable-next-line no-var
  var __flowfi_cases: Map<string, Case> | undefined;
}

const store = (globalThis.__flowfi_cases ??= new Map<string, Case>());

export const cases = {
  list(): Case[] {
    return [...store.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },
  add(c: Case) {
    store.set(c.id, c);
  },
  get(id: string) {
    return store.get(id);
  },
  override(id: string, verdict: "APPROVE" | "DECLINE", notes: string) {
    const c = store.get(id);
    if (!c) return null;
    c.humanVerdict = verdict;
    c.humanNotes = notes;
    c.humanDecidedAt = new Date().toISOString();
    return c;
  },
};
