'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { applyToResolutions } from '@/lib/agent/proposals';
import {
  COOKIE,
  DATASET_COOKIE,
  SAMPLE_ID,
  encodeResolutions,
  getDataset,
  getResult,
  parseResolutions,
} from '@/lib/server/state';
import type { Resolutions } from '@/lib/engine/types';

async function update(change: (r: Resolutions) => Resolutions) {
  const jar = await cookies();
  const next = change(parseResolutions(jar.get(COOKIE)?.value));
  jar.set(COOKIE, encodeResolutions(next), { path: '/', sameSite: 'lax', httpOnly: true });
  revalidatePath('/', 'layout');
}

const add = (list: string[], ...items: string[]) => [...new Set([...list, ...items])];

/** Resolve a finding with its own action (use the group rate, keep a row out). */
export async function resolveFinding(findingId: string) {
  await update((r) => ({ ...r, resolved: add(r.resolved, findingId) }));
}

export async function fixSign(factIds: string[]) {
  await update((r) => ({ ...r, signFixes: add(r.signFixes, ...factIds) }));
}

export async function mapAccount(companyId: string, localAccount: string, groupAccount: string) {
  await update((r) => ({
    ...r,
    accountOverrides: {
      ...r.accountOverrides,
      [companyId]: { ...(r.accountOverrides[companyId] ?? {}), [localAccount]: groupAccount },
    },
  }));
}

/**
 * Apply a correction the agent proposed. It is checked again here against the current data, so a
 * stale or invented proposal changes nothing, and it records exactly what the finding's own button does.
 */
export async function applyProposal(
  findingId: string,
  groupAccount?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = { r: await getResult(), mappings: getDataset().mappings };
  try {
    await update((r) => applyToResolutions(ctx, r, findingId, groupAccount));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo aplicar.' };
  }
}

export async function approveMapping(companyId: string) {
  await update((r) => ({ ...r, approved: add(r.approved, companyId) }));
}

/** Back to the raw files, for a fresh run of the demo. */
export async function resetDemo() {
  const jar = await cookies();
  jar.delete(COOKIE);
  revalidatePath('/', 'layout');
}

/** Leave the uploaded files or the example data: the app goes back to empty, with no decisions. */
export async function clearData() {
  const jar = await cookies();
  jar.delete(DATASET_COOKIE);
  jar.delete(COOKIE);
  revalidatePath('/', 'layout');
}

/** Read the bundled example data, a fallback for a demo when an upload is not possible. */
export async function loadSampleData() {
  const jar = await cookies();
  jar.set(DATASET_COOKIE, SAMPLE_ID, { path: '/', sameSite: 'lax', httpOnly: true });
  jar.delete(COOKIE);
  revalidatePath('/', 'layout');
}
