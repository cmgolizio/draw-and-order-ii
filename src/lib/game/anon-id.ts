/**
 * Anonymous identity (client): a uuid minted on first use and kept in
 * localStorage. Phase 4 uses it to own rounds; Phase 5 adds the detective
 * handle, local history, and the one-time migration into a real account.
 */

const STORAGE_KEY = "dao:anon-id";

export function getOrCreateAnonId(): string {
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  const anonId = crypto.randomUUID();
  window.localStorage.setItem(STORAGE_KEY, anonId);
  return anonId;
}