/* INOURAR PWA layer: تسجيل SW، تحديث تلقائي، انقطاع الاتصال، إشعارات Push */
(function () {
  'use strict';
  var C = window.INOURAR_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'onclick') e.onclick = attrs[k]; else e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }
  var I = function () { return window.INOURAR; };

  /* ---------- شريط علوي للحالة (انقطاع الاتصال / نسخة جديدة) ---------- */
  var bar = h('div', { id: 'pwaBar', class: 'pwa-bar', role: 'status', hidden: '' });
  var barMsg = h('span', {});
  var barBtn = h('button', { type: 'button', class: 'pwa-bar-btn', hidden: '', text: 'تحديث الآن', onclick: function () { location.reload(); } });
  bar.appendChild(barMsg); bar.appendChild(barBtn);
  var st = h('style', {}); st.textContent =
    '.pwa-bar{position:fixed;z-index:9999;top:0;inset-inline:0;display:flex;gap:10px;align-items:center;justify-content:center;padding:8px 12px;font:600 13px/1.4 inherit;background:#2A1519;color:#fff;text-align:center}' +
    '.pwa-bar[hidden]{display:none}.pwa-bar.off{background:#8A5A00}.pwa-bar.upd{background:#17A085}' +
    '.pwa-bar-btn{border:0;border-radius:8px;padding:5px 12px;font:inherit;font-weight:700;background:#fff;color:#21171A;cursor:pointer}.pwa-bar-btn[hidden]{display:none}' +
    '#pushBtn{position:relative}#pushBtn.on{opacity:.55}';
  document.head.appendChild(st);
  document.body.appendChild(bar);
  var updated = false;
  function paintBar() {
    if (updated) { bar.className = 'pwa-bar upd'; barMsg.textContent = 'تتوفر نسخة جديدة من التطبيق'; barBtn.hidden = false; bar.hidden = false; return; }
    if (navigator.onLine === false) { bar.className = 'pwa-bar off'; barMsg.textContent = 'أنت غير متصل بالإنترنت. ما تدخله يُحفظ في هاتفك ويُرسل تلقائيًا عند عودة الاتصال'; barBtn.hidden = true; bar.hidden = false; return; }
    bar.hidden = true;
  }
  window.addEventListener('online', paintBar); window.addEventListener('offline', paintBar); paintBar();

  /* ---------- Service Worker ---------- */
  var swReg = null;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (e) {
      var d = e.data || {};
      if (d.type === 'update') { updated = true; paintBar(); }
      if (d.type === 'open') goTo(d.module);
      if (d.type === 'push') { try { I().toast(d.body || d.title || 'إشعار جديد', 'big', 6000); if (I().notif) I().notif.refresh(); } catch (x) {} }
    });
    var hadCtl = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (hadCtl) { updated = true; paintBar(); } });
    function askCheck() { try { if (navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: 'check' }); } catch (x) {} }
    setTimeout(askCheck, 1500); setTimeout(askCheck, 5000);
    navigator.serviceWorker.register('sw.js?v=' + (C.BUILD || '')).then(function (r) { swReg = r; }).catch(function () {});
  }

  /* ---------- فتح شاشة عند الضغط على إشعار ---------- */
  function goTo(mod) { try { if (I() && I().user() && I().openModule) I().openModule(mod || 'caisses'); } catch (e) {} }
  var pendingGo = null;
  try { var q = new URLSearchParams(location.search).get('go'); if (q) { pendingGo = q; history.replaceState(null, '', location.pathname); } } catch (e) {}

  /* ---------- الإشعارات ---------- */
  var FB = C.FB || {}, VAPID = C.VAPID || '';
  var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var canPush = !!(FB.apiKey && VAPID && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window);
  var iosNeedsInstall = ios && !standalone;       // iOS: الإشعارات تعمل فقط للتطبيق المضاف إلى الشاشة الرئيسية
  var btn = null, sdk = null;

  function loadSdk() {
    if (sdk) return sdk;
    function load(s) { return new Promise(function (res, rej) { var e = document.createElement('script'); e.src = s; e.onload = res; e.onerror = rej; document.head.appendChild(e); }); }
    sdk = load('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js')
      .then(function () { return load('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js'); })
      .then(function () { if (!firebase.apps.length) firebase.initializeApp(FB); return firebase.messaging(); });
    sdk.catch(function () { sdk = null; });
    return sdk;
  }
  function uid() { try { var u = I().user(); return u ? u.id : ''; } catch (e) { return ''; } }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function enable(userGesture) {
    return loadSdk().then(function (m) {
      return navigator.serviceWorker.ready.then(function (reg) {
        return m.getToken({ vapidKey: VAPID, serviceWorkerRegistration: reg });
      });
    }).then(function (tk) {
      if (!tk) throw new Error('no token');
      var rec = lsGet('inourar_push') || {};
      var fresh = rec.token === tk && rec.uid === uid() && (Date.now() - (rec.t || 0)) < 7 * 864e5;
      if (fresh) return tk;
      return I().rpc('push.register', { token: tk }, { mode: 'silent' }).then(function () { lsSet('inourar_push', { token: tk, uid: uid(), t: Date.now() }); return tk; });
    });
  }
  function paintBtn() {
    if (!btn) return;
    var perm = ('Notification' in window) ? Notification.permission : 'denied';
    btn.hidden = false;
    btn.classList.toggle('on', perm === 'granted');
    btn.title = perm === 'granted' ? 'الإشعارات مفعّلة' : 'تفعيل الإشعارات';
    btn.setAttribute('aria-label', btn.title);
  }
  function onBtn() {
    var T = I().toast;
    if (iosNeedsInstall) { T('على آيفون: اضغط زر المشاركة في Safari ثم «إضافة إلى الشاشة الرئيسية»، وافتح التطبيق من الأيقونة ثم فعّل الإشعارات', 'big', 9000); return; }
    if (!('Notification' in window)) { T('هذا المتصفح لا يدعم الإشعارات', 'error'); return; }
    if (Notification.permission === 'granted') { T('الإشعارات مفعّلة على هذا الجهاز ✔', 'ok'); enable(true).catch(function () {}); return; }
    if (Notification.permission === 'denied') { T('الإشعارات محجوبة. فعّلها من إعدادات الموقع في المتصفح ثم أعد المحاولة', 'error', 7000); return; }
    Notification.requestPermission().then(function (p) {
      paintBtn();
      if (p !== 'granted') { T('لم يُسمح بالإشعارات', 'error'); return; }
      enable(true).then(function () { T('تم تفعيل الإشعارات على هذا الجهاز ✔', 'ok'); }).catch(function () { T('تعذّر تفعيل الإشعارات الآن. تأكد من الاتصال وأعد المحاولة', 'error'); });
    });
  }
  function mountBtn() {
    var top = document.querySelector('.topbar');
    if (!top || btn || !canPush) return;
    btn = h('button', { id: 'pushBtn', class: 'btn btn-ghost', type: 'button', onclick: onBtn });
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
    var before = $('themeBtn');
    top.insertBefore(btn, before || null);
    paintBtn();
  }

  /* ---------- عند فتح التطبيق بعد الدخول ---------- */
  var wasShown = false;
  function onShown() {
    mountBtn();
    if (pendingGo) { var g = pendingGo; pendingGo = null; setTimeout(function () { goTo(g); }, 400); }
    if (canPush && !iosNeedsInstall && 'Notification' in window && Notification.permission === 'granted') enable(false).catch(function () {});
  }
  var av = $('appView');
  if (av) {
    var mo = new MutationObserver(function () {
      var shown = !av.hidden;
      if (shown && !wasShown) onShown();
      wasShown = shown;
    });
    mo.observe(av, { attributes: true, attributeFilter: ['hidden'] });
    wasShown = !av.hidden;
  }
  /* عند الخروج: نحذف رمز هذا الجهاز من حساب المستخدم (محاولة صامتة) */
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest && e.target.closest('#logoutBtn');
    if (!t) return;
    var rec = lsGet('inourar_push');
    if (rec && rec.token) { try { I().rpc('push.unregister', { token: rec.token }, { mode: 'silent' }).catch(function () {}); } catch (x) {} lsSet('inourar_push', null); }
  }, true);
})();
