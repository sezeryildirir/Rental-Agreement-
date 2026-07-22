/* =============================================================
   SWISS LIVING LA - RENTAL AGREEMENT ADD-ON
   -------------------------------------------------------------
   Icerik:
     1) iPhone zoom duzeltmesi (alanlara dokununca sayfa buyumesin)
     2) Date Out / Date Due icin takvim (iOS tarih-saat secici)
     3) Iki tarihten kiralama suresinin otomatik hesaplanmasi
     4) Fleet Docs'tan gelen arac bilgilerinin otomatik doldurulmasi

   Kurulum: rental agreement HTML dosyasinda </body> etiketinden
   hemen once TEK satir ekle:

       <script src="/addon.js"></script>

   Bundan sonra guncelleme gerekirse sadece bu dosyayi degistir.
   ============================================================= */

(function () {
  'use strict';

  /* ============ CSS ============ */
  function injectCSS() {
    if (document.getElementById('sl-addon-css')) return;
    var css = [
      /* 1) iOS zoom fix: 16px altindaki alanlar iPhone'da sayfayi buyutur */
      '@media (max-width:1100px){',
      '  .sidebar .field input,.sidebar .field select,.sidebar .field textarea,',
      '  .sidebar input,.sidebar select,.sidebar textarea{font-size:16px !important}',
      '}',
      /* 2) Takvim butonu */
      '.dt-wrap{position:relative;display:block}',
      '.dt-wrap > input{padding-right:40px !important}',
      '.dt-btn{position:absolute;right:8px;top:50%;transform:translateY(-50%);',
      '  font-size:17px;line-height:1;opacity:.6;pointer-events:none;user-select:none}',
      '.dt-native{position:absolute;right:0;top:0;width:44px;height:100%;',
      '  opacity:0;border:none;background:transparent;padding:0;margin:0;cursor:pointer;',
      '  -webkit-appearance:none;appearance:none}',
      /* 3) Otomatik sure */
      '.auto-days-row{display:flex;align-items:center;gap:8px;font-size:12px;',
      '  color:#6b6b6b;margin:-2px 0 8px}',
      '.auto-days-row input{width:auto !important}',
      '.auto-days-note{font-size:10.5px;color:#6b6b6b;margin:-4px 0 10px;line-height:1.45}',
      '.auto-days-note b{color:#1c1c1c}',
      '.auto-days-note.bad{color:#d2342a}'
    ].join('\n');

    var st = document.createElement('style');
    st.id = 'sl-addon-css';
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* ============ ORTAK YARDIMCILAR ============ */

  // Canli onizlemeyi tetikleyen deger atama
  function setVal(el, val) {
    if (!el || val == null || val === '') return;
    var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
              : el.tagName === 'SELECT'   ? HTMLSelectElement.prototype
              :                             HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, val);
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // Metni Date'e cevir
  // Desteklenen: 03/12/2026 2:00 PM | 03/12/2026 14:00 | 03/12/2026
  //              03.12.2026 | 2026-03-12 14:00 | 2026-03-12
  function parseDT(str) {
    if (!str) return null;
    var s = String(str).trim();
    if (!s) return null;

    var y, mo, d, hh = 12, mm = 0;   // saat yoksa gun ortasi

    var iso = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    var us  = s.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})/);

    if (iso)     { y = +iso[1]; mo = +iso[2]; d = +iso[3]; }
    else if (us) { mo = +us[1]; d = +us[2];  y = +us[3];  }
    else return null;

    var t = s.match(/(\d{1,2}):(\d{2})\s*([AaPp][Mm])?/);
    if (t) {
      hh = +t[1]; mm = +t[2];
      var ap = t[3] ? t[3].toLowerCase() : '';
      if (ap === 'pm' && hh < 12) hh += 12;
      if (ap === 'am' && hh === 12) hh = 0;
    }

    var dt = new Date(y, mo - 1, d, hh, mm, 0, 0);
    if (isNaN(dt.getTime())) return null;
    if (dt.getMonth() !== mo - 1) return null;   // 31 Subat gibi gecersiz
    return dt;
  }

  function toDocFormat(dt) {          // 03/12/2026 2:00 PM
    var h = dt.getHours(), ap = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return pad(dt.getMonth() + 1) + '/' + pad(dt.getDate()) + '/' + dt.getFullYear() +
           ' ' + h12 + ':' + pad(dt.getMinutes()) + ' ' + ap;
  }

  function toNativeValue(dt) {        // 2026-03-12T14:00
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) +
           'T' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());
  }

  function fmtDate(dt) {
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /* ============ 4) FLEET DOCS PREFILL ============ */

  function guessClass(model) {
    var m = (model || '').toLowerCase();
    if (/911|m4|amg gt|corvette|cayman|supra/.test(m))                    return 'Sport';
    if (/g-class|g class|urus|bentayga|cullinan/.test(m))                 return 'Exotic';
    if (/range rover|gle|glc|gls|x5|x7|q7|atlas|cross sport|suv/.test(m)) return 'SUV';
    if (/convertible|cabrio|spyder|roadster/.test(m))                     return 'Convertible';
    if (/coupe/.test(m))                                                  return 'Coupe';
    if (/truck|f-150|silverado|tacoma|ram/.test(m))                       return 'Truck';
    if (/van|sprinter|transit|sienna|odyssey/.test(m))                    return 'Van';
    if (/corolla|camry|accord|civic|sedan|ionic|ioniq/.test(m))           return 'Sedan';
    return null;
  }

  function prefill() {
    if (!location.search || location.search.length < 2) return;
    var P = new URLSearchParams(location.search);

    var MAP = {
      unit:   'unit',        // plaka -> Unit #
      vin:    'vin',
      model:  'model',       // Brand & Model
      color:  'color',
      ra:     'raNo',
      renter: 'renterTop'
    };

    Object.keys(MAP).forEach(function (k) {
      var v = P.get(k);
      if (v) setVal(document.getElementById(MAP[k]), v);
    });

    var cls = guessClass(P.get('model'));
    if (cls) {
      var sel = document.getElementById('vclass');
      if (sel && [].some.call(sel.options, function (o) { return o.value === cls; })) {
        setVal(sel, cls);
      }
    }

    if (typeof window.render === 'function') { try { window.render(); } catch (e) {} }
  }

  /* ============ 2) TAKVIM SECICI ============ */

  function attachPicker(el) {
    if (!el || el.dataset.dtReady) return;
    el.dataset.dtReady = '1';

    var wrap = document.createElement('div');
    wrap.className = 'dt-wrap';
    el.parentNode.insertBefore(wrap, el);
    wrap.appendChild(el);

    var btn = document.createElement('span');
    btn.className = 'dt-btn';
    btn.textContent = '\uD83D\uDCC5';
    wrap.appendChild(btn);

    var nat = document.createElement('input');
    nat.type = 'datetime-local';
    nat.className = 'dt-native';
    nat.setAttribute('aria-label', 'Tarih ve saat sec');
    wrap.appendChild(nat);

    // Tarayici desteklemiyorsa simgeyi gizle, metin girisi calismaya devam etsin
    if (nat.type !== 'datetime-local') {
      btn.style.display = 'none';
      nat.style.display = 'none';
      return;
    }

    function syncNative() {
      var dt = parseDT(el.value);
      if (dt) nat.value = toNativeValue(dt);
    }
    syncNative();
    el.addEventListener('change', syncNative);

    nat.addEventListener('change', function () {
      if (!nat.value) return;
      var dt = new Date(nat.value);
      if (isNaN(dt.getTime())) return;
      setVal(el, toDocFormat(dt));
    });
  }

  /* ============ 3) OTOMATIK SURE ============ */

  function calcDays(out, due) {
    var ms = due.getTime() - out.getTime();
    if (ms <= 0) return null;
    return Math.max(1, Math.ceil(ms / 86400000));   // baslamis her gun tam gun
  }

  function initDays(elOut, elDue, elDays) {
    if (document.getElementById('autoDays')) return;

    var field = (elDays.closest && elDays.closest('.field')) || elDays.parentNode;

    var row = document.createElement('label');
    row.className = 'auto-days-row';
    row.innerHTML = '<input type="checkbox" id="autoDays" checked> Tarihlerden otomatik hesapla';

    var note = document.createElement('div');
    note.className = 'auto-days-note';
    note.id = 'autoDaysNote';

    var host = (field.closest && field.closest('.row')) || field;
    host.parentNode.insertBefore(row, host.nextSibling);
    row.parentNode.insertBefore(note, row.nextSibling);

    var chk = document.getElementById('autoDays');

    function update() {
      var out = parseDT(elOut.value);
      var due = parseDT(elDue.value);

      if (!chk.checked) {
        elDays.disabled = false;
        note.className = 'auto-days-note';
        note.textContent = 'Manuel giris acik - gun sayisini kendin yaziyorsun.';
        return;
      }

      elDays.disabled = true;

      if (!out || !due) {
        note.className = 'auto-days-note';
        note.textContent = 'Iki tarihi de sec - sure otomatik hesaplanacak.';
        return;
      }

      var days = calcDays(out, due);
      if (!days) {
        note.className = 'auto-days-note bad';
        note.textContent = 'Donus tarihi, cikis tarihinden sonra olmali.';
        return;
      }

      if (String(elDays.value) !== String(days)) setVal(elDays, days);

      note.className = 'auto-days-note';
      note.innerHTML = fmtDate(out) + ' &rarr; ' + fmtDate(due) + ' = <b>' + days +
                       ' gun</b>' + (days >= 30 ? ' (' + (days / 30).toFixed(1) + ' ay)' : '');
    }

    elOut.addEventListener('input',  update);
    elOut.addEventListener('change', update);
    elDue.addEventListener('input',  update);
    elDue.addEventListener('change', update);
    chk.addEventListener('change', update);

    update();
  }

  /* ============ BASLAT ============ */

  function init() {
    injectCSS();
    prefill();

    var elOut  = document.getElementById('dateOut');
    var elDue  = document.getElementById('dateDue');
    var elDays = document.getElementById('days');

    if (elOut) attachPicker(elOut);
    if (elDue) attachPicker(elDue);
    if (elOut && elDue && elDays) initDays(elOut, elDue, elDays);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 200); });
  } else {
    setTimeout(init, 200);
  }
})();
