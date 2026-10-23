// The loading screen lives in index.html (#boot) so it shows while the game downloads. The game
// reports its loading steps here and fades the screen out once everything is ready.

const el = () => document.getElementById('boot');

// how far loading has got (0..1), kept on the element for anyone checking (tests, the console)
export function bootProgress(value, step) {
  const b = el();
  if (!b) return;
  b.dataset.progress = String(Math.round(value * 100));
  if (step) b.dataset.step = step;
}

// the game could not start: say so on the loading screen instead of loading forever
export function bootError(message = 'Could not start the game. Please reload the page.') {
  const b = el();
  if (!b) return;
  const sub = b.querySelector('.boot-sub');
  if (sub) { sub.textContent = message; sub.style.color = '#ff8a8a'; }
  b.querySelector('.boot-dots')?.remove();
}

// fade out, then remove it so it never blocks taps
export function hideBoot() {
  const b = el();
  if (!b || b.classList.contains('out')) return;
  bootProgress(1, 'ready');
  b.classList.add('out');
  setTimeout(() => b.remove(), 700);
}
