/**
 * Shared application state — holds the NurApi instance.
 *
 * This module provides typed access to the NurApi instance without
 * passing it through deeply nested function calls.
 */

import type { NurApi } from '@nordicid/nurapi';

let api: NurApi | null = null;
let connectionUri: string | null = null;

/** Store the NurApi instance (called once from main.ts). */
export function setApi(instance: NurApi): void {
  api = instance;
}

/** Get the shared NurApi instance. Throws if not initialized. */
export function getApi(): NurApi {
  if (!api) throw new Error('App not initialized — call setApi() first');
  return api;
}

export function setConnectionUri(uri: string | null): void {
  connectionUri = uri;
}

export function getConnectionUri(): string | null {
  return connectionUri;
}
