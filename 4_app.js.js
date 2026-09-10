/* ===================================================================
 *  หนองหินพลัส — Frontend (หน้าประชาชน)
 *  แก้ไขบรรทัดเดียวด้านล่างนี้เท่านั้น
 * =================================================================== */
const GAS_URL = 'https://script.google.com/macros/s/XXXXXXXXXXXX/exec';   // ← แก้จุดที่ 3


/* ---------- CORE ---------- */
async function callAPI(action, payload = {}) {
  let res;
  try {
    res = await fetch(GAS_URL, {
      method  : 'POST',
      // text/plain = simple request → ไม่เกิด preflight (GAS ไม่ตอบ OPTIONS)
      headers : { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body    : JSON.stringify({ action, payload })
    });
  } catch {
    throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบอินเทอร์เน็ต');
  }
  if (!res.ok) throw new Error('เชื่อมต่อไม่สำเร็จ (HTTP ' + res.status + ')');

  const txt = await res.text();
  let out;
  try { out = JSON.parse(txt); }
  catch { throw new Error('เซิร์ฟเวอร์ตอบผิดรูปแบบ — ตรวจสอบสิทธิ์ Deploy ต้องเป็น Anyone'); }

  if (!out.ok) throw new Error(out.error || 'เกิดข้อผิดพลาด');
  return out.data;
}


/* ---------- UI HELPERS ---------- */
const $ = s => document.querySelector(s);
const load = on => { $('#loading').hidden = !on; };
const esc = s => String(s ?? '').replace(/[&<>"]/g,
  c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

function toast(msg, isErr) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.className = 'toast'; }, 3400);
}


/* ---------- TABS ---------- */
document.querySelectorAll('.tab').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.pane').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    $('#' + btn.dataset.tab).classList.add('active');
  };
});


/* ---------- โหลดข้อมูลเริ่มต้น ---------- */
(async () => {
  const sel = document.querySelector('[name=category]');
  try {
    const m = await callAPI('meta');
    sel.innerHTML = '<option value="">— เลือกประเภทเรื่อง —</option>';
    m.categories.forEach(c => sel.add(new Option(c, c)));
  } catch (e) {
    sel.innerHTML = '<option value="">— โหลดไม่สำเร็จ —</option>';
    toast(e.message, true);
  }
})();


/* ---------- GPS ---------- */
let geo = { lat: '', lng: '' };
$('#btnGeo').onclick = () => {
  if (!navigator.geolocation) return toast('อุปกรณ์ไม่รองรับ GPS', true);
  $('#geoTxt').textContent = 'กำลังค้นหาตำแหน่ง…';
  navigator.geolocation.getCurrentPosition(
    p => {
      geo = {
        lat: p.coords.latitude.toFixed(6),
        lng: p.coords.longitude.toFixed(6)
      };
      $('#geoTxt').textContent = '✅ บันทึกตำแหน่งแล้ว (' + geo.lat + ', ' + geo.lng + ')';
    },
    () => { $('#geoTxt').textContent = '❌ ระบุตำแหน่งไม่ได้ — กรุณาอนุญาตสิทธิ์ตำแหน่ง'; },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
};


/* ---------- บีบอัดรูป → base64 ---------- */
function compress(file, max = 1280, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('ไฟล์รูปเสียหายหรือไม่รองรับ'));
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > max || h > max) {
          const r = max / Math.max(w, h);
          w = Math.round(w * r);
          h = Math.round(h * r);
        }
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        const url = cv.toDataURL('image/jpeg', quality);
        resolve({ mimeType:'image/jpeg', base64:url.split(',')[1], dataUrl:url });
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

let photoData = null;
$('#photo').onchange = async e => {
  const f = e.target.files[0];
  if (!f) { photoData = null; $('#preview').hidden = true; return; }
  if (f.size > 12 * 1024 * 1024) {
    e.target.value = '';
    return toast('ไฟล์ใหญ่เกิน 12 MB', true);
  }
  load(true);
  try {
    photoData = await compress(f);
    $('#preview').src = photoData.dataUrl;
    $('#preview').hidden = false;
  } catch (err) {
    photoData = null;
    toast(err.message, true);
  } finally { load(false); }
};


/* ---------- ส่งเรื่อง ---------- */
$('#caseForm').onsubmit = async ev => {
  ev.preventDefault();
  const p = Object.fromEntries(new FormData(ev.target).entries());
  p.lat = geo.lat;
  p.lng = geo.lng;
  if (photoData) p.photo = { mimeType: photoData.mimeType, base64: photoData.base64 };

  if (!p.category)                                   return toast('กรุณาเลือกประเภทเรื่อง', true);
  if ((p.title || '').trim().length < 5)             return toast('หัวข้อสั้นเกินไป (อย่างน้อย 5 ตัวอักษร)', true);
  if ((p.phone || '').replace(/\D/g,'').length < 9)  return toast('เบอร์โทรไม่ถูกต้อง', true);

  $('#btnSubmit').disabled = true;
  load(true);
  try {
    const r = await callAPI('submitCase', p);
    ev.target.hidden = true;
    $('#okBox').hidden = false;
    $('#okBox').innerHTML =
      '<h3>✅ ส่งเรื่องเรียบร้อยแล้ว</h3>' +
      '<p>กรุณาบันทึกรหัสนี้ไว้เพื่อติดตามสถานะ</p>' +
      '<div class="id">' + esc(r.caseId) + '</div>' +
      '<button class="btn ghost" id="btnAgain">แจ้งเรื่องใหม่</button>';
    $('#btnAgain').onclick = () => location.reload();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    toast(e.message, true);
  } finally {
    $('#btnSubmit').disabled = false;
    load(false);
  }
};


/* ---------- ติดตามสถานะ ---------- */
async function doTrack() {
  const id = $('#trackId').value.trim();
  if (!id) return toast('กรุณากรอกรหัสเรื่อง', true);

  load(true);
  $('#trackBox').innerHTML = '';
  try {
    const d = await callAPI('track', { caseId: id });
    $('#trackBox').innerHTML =
      '<div class="card" style="margin-top:16px">' +
        '<span class="badge">' + esc(d.status) + '</span>' +
        '<h3 style="margin:12px 0 8px">' + esc(d.title) + '</h3>' +
        '<div class="row"><span>รหัสเรื่อง</span><span>' + esc(d.caseId) + '</span></div>' +
        '<div class="row"><span>ประเภท</span><span>' + esc(d.category) + '</span></div>' +
        '<div class="row"><span>สถานที่</span><span>' + (esc(d.address) || '-') + '</span></div>' +
        '<div class="row"><span>วันที่แจ้ง</span><span>' + esc(d.createdAt) + '</span></div>' +
        '<div class="row"><span>อัปเดตล่าสุด</span><span>' + esc(d.updatedAt) + '</span></div>' +
        (d.note ? '<div class="row"><span>หมายเหตุ</span><span>' + esc(d.note) + '</span></div>' : '') +
        (d.photoUrl ? '<img class="preview" style="margin-top:12px" src="' + esc(d.photoUrl) + '" alt="รูปประกอบ">' : '') +
      '</div>';
  } catch (e) {
    toast(e.message, true);
  } finally { load(false); }
}

$('#btnTrack').onclick = doTrack;
$('#trackId').onkeydown = e => { if (e.key === 'Enter') doTrack(); };