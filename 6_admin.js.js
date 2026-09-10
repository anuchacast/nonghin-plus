/* ===================================================================
 *  หนองหินพลัส — Admin Dashboard
 *  ใส่ URL เดียวกับใน app.js
 * =================================================================== */
const GAS_URL = 'https://script.google.com/macros/s/XXXXXXXXXXXX/exec';   // ← แก้จุดที่ 3


/* ---------- HELPERS ---------- */
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

async function callAPI(action, payload = {}) {
  let res;
  try {
    res = await fetch(GAS_URL, {
      method  : 'POST',
      headers : { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body    : JSON.stringify({ action, payload })
    });
  } catch {
    throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
  }
  if (!res.ok) throw new Error('เชื่อมต่อไม่สำเร็จ (HTTP ' + res.status + ')');

  const txt = await res.text();
  let out;
  try { out = JSON.parse(txt); }
  catch { throw new Error('เซิร์ฟเวอร์ตอบผิดรูปแบบ — ตรวจสอบการ Deploy'); }

  if (!out.ok) throw new Error(out.error || 'เกิดข้อผิดพลาด');
  return out.data;
}


/* ---------- STATE ---------- */
let KEY = '', META = null, ROWS = [];

const STAT_CLASS = {
  'รับเรื่องแล้ว':'s1', 'กำลังดำเนินการ':'s2',
  'ดำเนินการเสร็จสิ้น':'s3', 'ไม่สามารถดำเนินการได้':'s4'
};
const BADGE_CLASS = {
  'รับเรื่องแล้ว':'b1', 'กำลังดำเนินการ':'b2',
  'ดำเนินการเสร็จสิ้น':'b3', 'ไม่สามารถดำเนินการได้':'b4'
};


/* ---------- LOGIN ---------- */
function fillSelect(el, arr, firstLabel) {
  el.innerHTML = firstLabel ? '<option value="">' + firstLabel + '</option>' : '';
  arr.forEach(v => el.add(new Option(v, v)));
}

async function doLogin(key, remember) {
  load(true);
  try {
    META = await callAPI('adminLogin', { key });
    KEY  = key;
    if (remember) localStorage.setItem('nh_admin_key', key);

    $('#loginView').hidden = true;
    $('#panelView').hidden = false;

    fillSelect($('#fStatus'), META.statuses,   'ทุกสถานะ');
    fillSelect($('#fCat'),    META.categories, 'ทุกประเภท');
    fillSelect($('#mStatus'), META.statuses);

    await refresh();
  } catch (e) {
    toast(e.message, true);
    localStorage.removeItem('nh_admin_key');
  } finally { load(false); }
}

$('#btnLogin').onclick = () => {
  const k = $('#adminKey').value.trim();
  if (!k) return toast('กรุณากรอกรหัสผ่าน', true);
  doLogin(k, $('#remember').checked);
};
$('#adminKey').onkeydown = e => { if (e.key === 'Enter') $('#btnLogin').click(); };

$('#btnLogout').onclick = () => {
  localStorage.removeItem('nh_admin_key');
  location.reload();
};


/* ---------- LOAD DATA ---------- */
async function refresh() {
  load(true);
  try {
    const [st, rows] = await Promise.all([
      callAPI('stats',     { key: KEY }),
      callAPI('listCases', { key: KEY, limit: 300 })
    ]);
    renderStats(st);
    ROWS = rows;
    render();
  } catch (e) {
    toast(e.message, true);
  } finally { load(false); }
}
$('#btnReload').onclick = refresh;

function renderStats(s) {
  $('#stats').innerHTML =
    '<div class="stat"><b>' + s.total + '</b><span>ทั้งหมด</span></div>' +
    '<div class="stat hot"><b>' + s.today + '</b><span>วันนี้</span></div>' +
    Object.keys(s.byStatus).map(k =>
      '<div class="stat ' + (STAT_CLASS[k] || '') + '">' +
        '<b>' + s.byStatus[k] + '</b><span>' + esc(k) + '</span></div>'
    ).join('');
}

function render() {
  const fs = $('#fStatus').value;
  const fc = $('#fCat').value;
  const q  = $('#fSearch').value.trim().toLowerCase();

  const list = ROWS.filter(r =>
    (!fs || r.status === fs) &&
    (!fc || r.category === fc) &&
    (!q  || (r.caseId + ' ' + r.title).toLowerCase().includes(q))
  );

  if (!list.length) {
    $('#list').innerHTML = '<p class="empty">— ไม่พบรายการที่ตรงเงื่อนไข —</p>';
    return;
  }

  $('#list').innerHTML = list.map(r =>
    '<div class="case">' +
      '<div class="case-top">' +
        '<code>' + esc(r.caseId) + '</code>' +
        '<span class="badge ' + (BADGE_CLASS[r.status] || '') + '">' + esc(r.status) + '</span>' +
      '</div>' +
      '<h4>' + esc(r.title) + '</h4>' +
      (r.detail ? '<p class="hint">' + esc(r.detail) + '</p>' : '') +
      '<div class="row"><span>ประเภท</span><span>' + esc(r.category) + '</span></div>' +
      '<div class="row"><span>สถานที่</span><span>' + (esc(r.address) || '-') + '</span></div>' +
      '<div class="row"><span>ผู้แจ้ง</span><span>' + esc(r.name) + ' · ' + esc(r.phone) + '</span></div>' +
      '<div class="row"><span>วันที่แจ้ง</span><span>' + esc(r.createdAt) + '</span></div>' +
      (r.note ? '<div class="row"><span>หมายเหตุ</span><span>' + esc(r.note) + '</span></div>' : '') +
      (r.photoUrl ? '<a class="link" href="' + esc(r.photoUrl) + '" target="_blank" rel="noopener">📷 ดูรูปภาพ</a>' : '') +
      '<div class="case-act">' +
        '<button class="btn sm primary" data-id="' + esc(r.caseId) + '">อัปเดตสถานะ</button>' +
        '<a class="btn sm ghost" href="tel:' + String(r.phone).replace(/\D/g,'') + '">📞 โทรกลับ</a>' +
      '</div>' +
    '</div>'
  ).join('');

  document.querySelectorAll('.case-act .primary').forEach(b => {
    b.onclick = () => openModal(b.dataset.id);
  });
}

['#fStatus', '#fCat'].forEach(s => { $(s).onchange = render; });
$('#fSearch').oninput = render;


/* ---------- MODAL ---------- */
let curId = null;

function openModal(id) {
  const row = ROWS.find(r => r.caseId === id);
  if (!row) return;
  curId = id;
  $('#mCase').textContent   = 'รหัสเรื่อง: ' + id;
  $('#mStatus').value       = row.status;
  $('#mNote').value         = row.note || '';
  $('#modal').hidden        = false;
}

$('#mCancel').onclick = () => { $('#modal').hidden = true; };
$('#modal').onclick = e => { if (e.target.id === 'modal') $('#modal').hidden = true; };
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') $('#modal').hidden = true;
});

$('#mSave').onclick = async () => {
  if (!curId) return;
  load(true);
  try {
    await callAPI('updateStatus', {
      key   : KEY,
      caseId: curId,
      status: $('#mStatus').value,
      note  : $('#mNote').value.trim()
    });
    $('#modal').hidden = true;
    toast('✅ อัปเดตเรียบร้อยแล้ว');
    await refresh();
  } catch (e) {
    toast(e.message, true);
  } finally { load(false); }
};


/* ---------- EXPORT CSV ---------- */
$('#btnCsv').onclick = () => {
  if (!ROWS.length) return toast('ไม่มีข้อมูลให้ส่งออก', true);

  const head = ['รหัสเรื่อง','สถานะ','ประเภท','หัวข้อ','สถานที่','ผู้แจ้ง','เบอร์โทร','วันที่แจ้ง','อัปเดตล่าสุด','หมายเหตุ'];
  const body = ROWS.map(r => [
    r.caseId, r.status, r.category, r.title, r.address,
    r.name, r.phone, r.createdAt, r.updatedAt, r.note
  ]);

  const csv = '\uFEFF' + [head, ...body]
    .map(row => row.map(c => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(','))
    .join('\r\n');

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'nonghin_cases_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
};


/* ---------- AUTO LOGIN ---------- */
const savedKey = localStorage.getItem('nh_admin_key');
if (savedKey) doLogin(savedKey, true);