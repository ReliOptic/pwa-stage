document.querySelector('form').addEventListener('submit', event => {
  event.preventDefault();
  const input = document.querySelector('input');
  const raw = input.value.trim();
  const value = /^https?:\/\//i.test(raw) ? raw : /^(localhost|127\.0\.0\.1)(:|\/|$)/i.test(raw) ? `http://${raw}` : `https://${raw}`;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    location.assign(url.href);
  } catch { input.setCustomValidity('Enter an HTTP or HTTPS URL.'); input.reportValidity(); }
});
document.querySelector('input').addEventListener('input', event => event.target.setCustomValidity(''));
