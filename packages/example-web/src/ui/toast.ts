/**
 * Lightweight toast notification system.
 *
 * Displays non-blocking messages at the bottom-right of the screen.
 * Auto-dismisses after a configurable duration.
 */

import { $ } from '../helpers.js';

/** Show a toast notification. */
export function showToast(
  message: string,
  type: 'error' | 'success' | 'info' = 'info',
  duration?: number,
): void {
  const container = $('#toast-container');
  const effectiveDuration = duration ?? (type === 'error' ? 6000 : 4000);

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  // Click to dismiss early
  toast.addEventListener('click', () => dismissToast(toast));

  container.appendChild(toast);

  // Auto-dismiss
  setTimeout(() => dismissToast(toast), effectiveDuration);
}

function dismissToast(toast: HTMLElement): void {
  if (toast.classList.contains('toast-fade-out')) return;
  toast.classList.add('toast-fade-out');
  toast.addEventListener('animationend', () => toast.remove());
}
