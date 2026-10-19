/* INOURAR service worker — 0.17.3 */
const V = 'inourar-0.17.3';
const SHELL = ["./", "index.html", "fonts.css?v=0.17.3", "config.js?v=0.17.3", "pwa.js?v=0.17.3", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
/* الإشعارات: نعالج حدث push بأنفسنا دون مكتبة Firebase داخل الـSW (فلا يتعطل التثبيت إن حُجب gstatic).
   رسالة FCM بيانات فقط: {data:{title,body,tag}}. إن كان التطبيق ظاهرًا نمرّرها للصفحة، وإلا نعرض إشعار النظام. */
self.addEventListener('push', e => {
  let j = {}; try { j = e.data ? e.data.json() : {}; } catch (x) {}
  const d = j.data || j.notification || j || {};
  e.waitUntil((async () => {
    const cl = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const vis = cl.filter(c => c.visibilityState === 'visible');
    if (vis.length) { vis.forEach(c => c.postMessage({ type: 'push', title: d.title || '', body: d.body || '' })); return; }
    await self.registration.showNotification(d.title || 'INOURAR', { body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag || undefined, lang: 'ar', dir: 'rtl', data: d });
  })());
});
let updFlag = false;
self.addEventListener('message', e => { if (e.data && e.data.type === 'check' && updFlag && e.source) e.source.postMessage({ type: 'update' }); });
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' }))))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('inourar-') && k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
/* الملفات الثابتة: من الكاش فورًا، ثم تحديث صامت. إن تغيّر index.html نُخبر الصفحة بنسخة جديدة. */
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;     // طلبات الخادم (script.google.com) لا تُخزَّن أبدًا
  const key = r.mode === 'navigate' ? 'index.html' : r;
  e.respondWith((async () => {
    const c = await caches.open(V);
    const hit = await c.match(key, { ignoreSearch: true });
    const old = hit && r.mode === 'navigate' ? hit.clone() : null;   // نسخة للمقارنة (الأصل يُسلَّم للصفحة فيُستهلك)
    const net = fetch(r.mode === 'navigate' ? 'index.html' : r).then(async res => {
      if (res && res.ok) {
        if (old) {
          const [a, b] = await Promise.all([old.text(), res.clone().text()]);
          if (a !== b) { updFlag = true; const cl = await self.clients.matchAll({ includeUncontrolled: true }); cl.forEach(x => x.postMessage({ type: 'update' })); }
        }
        c.put(key, res.clone());
      }
      return res;
    }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || (await c.match('index.html')) || new Response('offline', { status: 503 });
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => {
    if (l.length) { l[0].postMessage({ type: 'open', module: 'caisses' }); return l[0].focus(); }
    return self.clients.openWindow('./?go=caisses');
  }));
});
