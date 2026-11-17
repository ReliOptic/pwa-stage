// Original local demo interactions — MIT.
let count = 0;
const note = document.querySelector('#note');
try { note.value = localStorage.getItem('field-note') || ''; } catch {}
note.addEventListener('input', () => {
  try { localStorage.setItem('field-note', note.value); document.querySelector('#saved').textContent = 'Saved on this device.'; }
  catch { document.querySelector('#saved').textContent = 'Storage unavailable; this note lasts for this session.'; }
});
document.querySelector('#count').addEventListener('click', () => {
  count++;
  document.querySelector('#count span').textContent = count;
  document.querySelector('#taps').textContent = count;
  document.querySelector('#orb').style.transform = `rotate(${15 + count * 25}deg)`;
});
document.querySelectorAll('[data-color]').forEach(button => button.addEventListener('click', () => {
  document.querySelector('#orb').style.background = `radial-gradient(circle at 30% 25%,#f1eddf,${button.dataset.color} 65%,#183b42)`;
}));
function status() {
  document.querySelector('#size').textContent = `${innerWidth} × ${innerHeight}`;
  document.querySelector('#mode').textContent = matchMedia('(display-mode: standalone)').matches || navigator.standalone ? 'STANDALONE' : 'BROWSER';
  document.querySelector('#network').textContent = navigator.onLine ? 'Online' : 'Offline';
}
addEventListener('resize', status); addEventListener('online', status); addEventListener('offline', status); status();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
