// The only place Boxity URLs come from. Boxity tells the page which environment it runs in (prod,
// stage or local): pages it serves get window.BLOXITY_ENV, embedded pages also get it in the portal
// handshake, and the SDK reads both. Never work it out from the hostname or a build flag; fall back to
// prod only when nothing was told (docs.bloxity.io "Environments").

const PROD = {
  env: 'prod',
  apiUrl: 'https://api.bloxity.io',
  playUrl: 'https://play.bloxity.io',
  portalUrl: 'https://bloxity.io',
  staticUrl: 'https://static.bloxity.io',
};

export function boxityEnv() {
  try {
    const e = window.Legion?.SDK?.environment?.();
    if (e?.apiUrl) return e;
  } catch { /* SDK not ready */ }
  const told = window.BLOXITY_ENV;
  return told && told.apiUrl ? told : PROD;
}
