// The Boxity environment this server runs in. Boxity hosting injects these variables into every
// deploy; the prod values are only a fallback when one is missing (docs.bloxity.io "Environments").
// Every Boxity URL on the server comes from here.

export const boxity = {
  env: process.env.BLOXITY_ENV || 'prod',
  apiUrl: process.env.BLOXITY_API_URL || 'https://api.bloxity.io',
  matchmakerUrl: process.env.BLOXITY_MATCHMAKER_URL || 'https://play.bloxity.io',
  portalUrl: process.env.BLOXITY_PORTAL_URL || 'https://bloxity.io',
  staticUrl: process.env.BLOXITY_STATIC_URL || 'https://static.bloxity.io',
};
