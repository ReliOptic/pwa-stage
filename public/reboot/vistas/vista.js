/* 견본 Vista가 앱과 주고받는 말. 제품에서는 기존 SDK(campsite-vista.js)가 이 일을 하고, 링크 보고만 새로 더해진다.
   Vista → 앱: ready(길이, 링크의 자리).  앱 → Vista: play, pause, restart.
   피드 안에서 Vista는 손가락을 받지 않는다. 앱이 링크의 자리를 알고 있다가 눌린 곳을 직접 맞춰 본다. */
(function () {
  const root = document.documentElement; const me = document.currentScript;
  const links = () => Array.from(document.querySelectorAll('[data-link]')).map((el) => { const r = el.getBoundingClientRect(); return { url: el.dataset.link, kind: el.dataset.kind || 'web', label: el.dataset.label || '', x: r.left, y: r.top, w: r.width, h: r.height }; });
  const ready = () => parent.postMessage({ type: 'campsite:ready', durationMs: Number(me.dataset.duration) || 12000, links: links() }, '*');
  addEventListener('message', (e) => {
    const t = e.data && e.data.type;
    if (t === 'campsite:play') { root.classList.add('run'); root.style.setProperty('--ps', 'running'); }
    else if (t === 'campsite:pause') root.style.setProperty('--ps', 'paused');
    else if (t === 'campsite:restart') { root.classList.remove('run'); void root.offsetWidth; root.classList.add('run'); root.style.setProperty('--ps', 'running'); }
  });
  addEventListener('load', ready); addEventListener('resize', ready);
})();
