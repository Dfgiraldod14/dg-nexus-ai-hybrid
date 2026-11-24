import { appCheckMode, isConfigured } from '../firebase';
import type { NanoAvailability } from '../ai/router';

export interface StatusState {
  online: boolean;
  nano: NanoAvailability;
  uid: string | null;
  fromCache: boolean;
  pendingWrites: boolean;
}

const NANO_TEXT: Record<NanoAvailability, [string, string]> = {
  available: ['ok', 'Gemini Nano ready'],
  downloadable: ['warn', 'Gemini Nano: download needed'],
  downloading: ['warn', 'Gemini Nano downloading…'],
  unavailable: ['bad', 'Gemini Nano unavailable'],
  unsupported: ['bad', 'Prompt API not found (Chrome 139+ desktop)'],
};

export function renderChips(el: HTMLElement, s: StatusState): void {
  const [nanoCls, nanoTxt] = NANO_TEXT[s.nano];
  const ac =
    appCheckMode === 'off'
      ? ['bad', 'App Check off']
      : appCheckMode === 'debug'
        ? ['ok', 'App Check: debug token']
        : ['ok', 'App Check: reCAPTCHA Enterprise'];
  const sync = !s.uid
    ? ['warn', 'Memory only (no sign-in)']
    : s.pendingWrites
      ? ['warn', 'Pending sync']
      : s.fromCache && !s.online
        ? ['warn', 'Offline cache']
        : ['ok', 'Firestore synced'];
  const chip = (cls: string, text: string) => `<span class="chip ${cls}"><i></i>${text}</span>`;
  el.innerHTML = [
    chip(s.online ? 'ok' : 'bad', s.online ? 'Online' : 'Offline'),
    chip(nanoCls, nanoTxt),
    chip(ac[0], ac[1]),
    chip(sync[0], sync[1]),
    chip(isConfigured ? 'ok' : 'bad', isConfigured ? 'Firebase connected' : 'Firebase not configured'),
  ].join('');
}
