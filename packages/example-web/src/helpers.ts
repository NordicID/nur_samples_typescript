/**
 * DOM utilities, hex formatting, and shared helpers.
 */

/** Query an element by selector. Throws if not found. */
export function $(selector: string, parent: ParentNode = document): HTMLElement {
  const el = parent.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  return el;
}

/** Create a DOM element with optional className and textContent. */
export function el(
  tag: string,
  className?: string,
  text?: string,
): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

/** Create a button element. */
export function btn(
  text: string,
  className = '',
  onClick?: () => void,
): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  if (className) b.className = className;
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

/** Convert a Uint8Array to uppercase hex string (no separator). */
export function formatHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/** Convert a hex string to Uint8Array. Strips whitespace. */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s/g, '');
  if (clean.length % 2 !== 0) throw new Error('Hex string must have even length');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

/** Validate a hex input string (even length, only 0-9 A-F). */
export function isValidHex(hex: string): boolean {
  const clean = hex.replace(/\s/g, '');
  return clean.length > 0 && clean.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(clean);
}

/** Format hex data for display (word-aligned, 8 words per line). */
export function formatHexBlock(bytes: Uint8Array): string {
  const hex = formatHex(bytes);
  const words: string[] = [];
  for (let i = 0; i < hex.length; i += 4) {
    words.push(hex.substring(i, i + 4));
  }
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += 8) {
    const addr = (i * 2).toString(16).padStart(4, '0').toUpperCase();
    lines.push(`${addr}: ${words.slice(i, i + 8).join(' ')}`);
  }
  return lines.join('\n');
}

/** Memory bank name from numeric ID. */
export function bankName(bank: number): string {
  switch (bank) {
    case 0: return 'RESERVED';
    case 1: return 'EPC';
    case 2: return 'TID';
    case 3: return 'USER';
    default: return `Bank ${bank}`;
  }
}

/** Format a timestamp as HH:MM:SS.mmm. */
export function formatTime(date = new Date()): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  const s = date.getSeconds().toString().padStart(2, '0');
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

/** Disable or enable an array of buttons. */
export function setButtonsDisabled(
  buttons: HTMLButtonElement[],
  disabled: boolean,
): void {
  for (const b of buttons) b.disabled = disabled;
}

/** Simple "time ago" from timestamp. */
export function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 1000) return 'now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}
