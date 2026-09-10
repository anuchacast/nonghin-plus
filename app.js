/* ===================================================================
 *  หนองหินพลัส — MASTER FRONTEND SCRIPT (เชื่อมโยง Fetch API)
 * =================================================================== */
const GAS_URL = 'https://script.google.com/macros/s/AKfycby_QJJaQWq0VQnN6NjFzSHImcEvzsGXPA9liNSKYkGylIFubtK9udZX-PKUIYR-rsei/exec'; // ตรวจสอบ URL ให้ถูกต้อง

var META = null, TOKEN = null, USER = null, FILES = [], OFFICER_FILES = [], CASELIST = [], USERLIST = [];
var MAP = null, HEAT_LAYER = null, MARKER_LAYER = null, PICKER_MAP = null, PICKER_MARKER = null;
var CURRENT_MAP_MODE = 'markers';

var VKEY = (function () {
  var k = null;
  try { k = localStorage.getItem('nh_vkey'); } catch (e) {}
  if (!k) {
    k = 'V' + Date.now() + Math.random().toString(36).substring(2, 8);
    try { localStorage.setItem('nh_vkey', k); } catch (e) {}
  }
  return k;
})();

function el(id) { return document.getElementById(id); }
function app() { return el('app'); }
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function toast(msg, kind) {
  var t = el('toast');
  t.textContent = msg;
  t.style.background = kind === 'err' ? '#EF4444' : (kind === 'ok' ? '#10B981' : '#0F172A');
  t.classList.remove('hide');
  clearTimeout(window.__tt);
  window.__tt = setTimeout(function () { t.classList.add('hide'); }, 3200);
}

function copyText(str) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(str).then(function () { toast('คัดลอก ' + str + ' เรียบร้อยแล้ว 📋', 'ok'); });
  } else {
    var ta = document.createElement('textarea');
    ta.value = str; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    toast('คัดลอก ' + str + ' เรียบร้อยแล้ว 📋', 'ok');
  }
}

function setFontZoom(size) {
  document.body.classList.remove('zoom-sm', 'zoom-md', 'zoom-lg');
  document.body.classList.add('zoom-' + size);
  try { localStorage.setItem('nh_font_zoom', size); } catch (e) {}
}

(function () {
  try {
    var savedZoom = localStorage.getItem('nh_font_zoom') || 'md';
    document.body.classList.add('zoom-' + savedZoom);
  } catch (e) {
    document.body.classList.add('zoom-md');
  }
})();

// สะพานเชื่อมต่อคำสั่งแบบ RPC ไปยัง Google Apps Script
async function run(fn, args, ok, fail) {
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn: fn, args: args || [] })
    });
    const d = await res.json();
    if (d.ok) {
      if (ok) ok(d.data);
    } else {
      if (fail) fail(d.error || 'เกิดข้อผิดพลาด');
      else toast(d.error || 'เกิดข้อผิดพลาด', 'err');
    }
  } catch (e) {
    if (fail) fail(e.message);
    else toast('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'err');
  }
}

function badge(st) {
  var m = { 'รับเรื่อง': 'b-new', 'อยู่ระหว่างตรวจสอบ': 'b-new', 'ส่งต่อหน่วยงาน': 'b-doing', 'กำลังดำเนินการ': 'b-doing', 'ดำเนินการแล้ว': 'b-done', 'ยุติเรื่อง': 'b-done' };
  return '<span class="badge ' + (m[st] || 'b-new') + '">' + esc(st) + '</span>';
}

function slaBadge(dueStr, status) {
  if (status === 'ดำเนินการแล้ว' || status === 'ยุติเรื่อง') return '<span class="badge b-done">ปิดเรื่องแล้ว</span>';
  if (!dueStr || dueStr === '-') return '-';
  var parts = dueStr.split(' ')[0].split('/');
  if (parts.length < 3) return esc(dueStr);
  var dueDate = new Date(parts[2], parts[1] - 1, parts[0]), now = new Date();
  now.setHours(0,0,0,0); dueDate.setHours(0,0,0,0);
  var diffDays = Math.round((dueDate - now) / 86400000);
  if (diffDays < 0) return '<span class="badge b-urgent">⚠️ เกิน ' + Math.abs(diffDays) + ' วัน</span>';
  if (diffDays === 0) return '<span class="badge b-doing">⏰ ครบกำหนดวันนี้</span>';
  return '<span class="badge b-new">⏳ เหลือ ' + diffDays + ' วัน</span>';
}

var CATCOLOR = {
  'ถนน/โครงสร้างพื้นฐาน': '#EF4444', 'น้ำ/ประปา': '#0284C7', 'ไฟฟ้า/ไฟส่องสว่าง': '#F59E0B',
  'ขยะ/สิ่งแวดล้อม': '#10B981', 'สวัสดิการสังคม': '#6366F1', 'ความปลอดภัย/ยาเสพติด': '#EA580C',
  'สาธารณสุข': '#EC4899', 'การเกษตร/ปศุสัตว์': '#84CC16', 'เศรษฐกิจ/ท่องเที่ยว': '#06B6D4',
  'ทุจริต/ประพฤติมิชอบ': '#8B5CF6', 'อื่น ๆ': '#64748B'
};
var PALETTE = ['#0284C7','#38BDF8','#10B981','#F59E0B','#EF4444','#6366F1','#EC4899','#84CC16','#06B6D4','#8B5CF6'];

function opts(list, selected) {
  var h = '';
  for (var i = 0; i < list.length; i++) h += '<option' + (list[i] === selected ? ' selected' : '') + '>' + esc(list[i]) + '</option>';
  return h;
}

function kpi(n, label, color) {
  return '<div class="kpi"><div class="n"' + (color ? ' style="color:' + color + '"' : '') + '>' + esc(n) + '</div><div class="l">' + esc(label) + '</div></div>';
}

function closeModal() {
  var m = el('modal');
  if (m) m.parentNode.removeChild(m);
}

function compressImage(file, maxWidth, maxHeight, quality, callback) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas'), w = img.width, h = img.height;
      if (w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
      if (h > maxHeight) { h = Math.round((h * maxHeight) / h); h = maxHeight; }
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      var dataUrl = canvas.toDataURL('image/jpeg', quality);
      callback(dataUrl.split(',')[1], 'image/jpeg');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/* ---------- Views Routing ---------- */
var VIEWS = { home: vHome, report: vReport, track: vTrack, idea: vIdea, contact: vContact, map: vMap, open: vOpen, staff: vStaff };

function initNav() {
  var bs = document.querySelectorAll('#nav button');
  for (var i = 0; i < bs.length; i++) {
    bs[i].onclick = function () {
      var all = document.querySelectorAll('#nav button');
      for (var j = 0; j < all.length; j++) all[j].classList.remove('active');
      this.classList.add('active');
      go(this.getAttribute('data-v'));
    };
  }
}

function go(v) {
  app().innerHTML = '<div class="loading">กำลังเปิดหน้าข้อมูล…</div>';
  (VIEWS[v] || vHome)();
}

/* 1) หน้าแรก */
function vHome() {
  run('api_public', [], function (d) {
    var h = [];
    h.push('<div class="card hero"><h2>หนองหินพลัส — พลัง พัฒนา พึ่งได้</h2><p style="margin:6px 0 10px;opacity:0.95">ระบบบริหารจัดการเสียงประชาชนเพื่อการพัฒนาอำเภอหนองหิน จังหวัดเลย</p>');
    h.push('<div style="background:rgba(255,255,255,0.15);padding:12px 16px;border-radius:10px;line-height:1.8;font-size:13.5px">✨ <b>P</b>articipate • <b>L</b>isten • <b>U</b>nderstand • <b>S</b>olve<br>“รับฟัง – เข้าใจ – แก้ไข – พัฒนา เพื่อชาวอำเภอหนองหิน”</div></div>');

    h.push('<div class="grid g4">');
    h.push(kpi(d.total, 'เรื่องทั้งหมด'));
    h.push(kpi(d.done, 'ดำเนินการแล้ว'));
    h.push(kpi(d.doing, 'กำลังดำเนินการ'));
    h.push(kpi(d.closeRate + '%', 'อัตราปิดเรื่องสำเร็จ'));
    h.push('</div>');

    h.push('<div class="card"><h2>🔥 ปัญหาสำคัญที่มีผู้สนับสนุนร่วม</h2>');
    if (d.top && d.top.length) {
      for (var i = 0; i < d.top.length; i++) {
        var t = d.top[i];
        h.push('<div class="row"><b>' + esc(t.title) + '</b> ' + badge(t.status) + '<br><span class="muted">' + esc(t.category) + ' • ' + esc(t.tambon) + ' • 👍 <b>' + t.support + ' เสียงสนับสนุน</b></span></div>');
      }
    } else {
      h.push('<p class="muted">ยังไม่มีข้อมูลเรื่องที่แจ้ง</p>');
    }
    h.push('</div>');

    h.push('<div class="card"><h2>🧠 วิเคราะห์ข้อมูลเชิงยุทธศาสตร์เพื่อการพัฒนาพื้นที่</h2>');
    for (var k = 0; k < d.insight.length; k++) {
      h.push('<div class="alert info">' + esc(d.insight[k]) + '</div>');
    }
    h.push('</div>');
    app().innerHTML = h.join('');
  });
}

/* 2) เสียงหนองหิน */
function vReport() {
  FILES = [];
  var h = [];
  h.push('<div class="card"><h2>📣 เสียงหนองหิน — ส่งเรื่องถึงส่วนราชการ</h2>');
  h.push('<label>ประเภทเรื่อง</label><div class="chips" id="typeChips">');
  for (var i = 0; i < META.types.length; i++) h.push('<div class="chip' + (i === 0 ? ' on' : '') + '" data-v="' + esc(META.types[i]) + '">' + esc(META.types[i]) + '</div>');
  h.push('</div>');

  h.push('<label>หัวข้อเรื่อง *</label><input id="f_title" placeholder="เช่น ไฟถนนดับ ซอย 5">');
  h.push('<label>รายละเอียด *</label><textarea id="f_detail" placeholder="ระบุรายละเอียดให้ชัดเจน..."></textarea>');

  h.push('<div class="grid g2">');
  h.push('<div><label>ตำบล *</label><select id="f_tambon" onchange="onTambonChange()">' + opts(META.tambons) + '</select></div>');
  h.push('<div><label>หมู่ที่ *</label><select id="f_moo"></select></div>');
  h.push('</div>');

  h.push('<div class="grid g2">');
  h.push('<div><label>หมวดหมู่</label><select id="f_cat"><option value="">🤖 ให้ระบบ AI วิเคราะห์อัตโนมัติ</option>' + opts(META.categories) + '</select></div>');
  h.push('<div><label>ส่งถึงหน่วยงาน (ไม่บังคับ)</label><select id="f_agency"><option value="">-- ไม่ระบุ --</option>' + opts(META.agencies) + '</select></div>');
  h.push('</div>');

  h.push('<label>พิกัด GPS</label>');
  h.push('<div style="display:flex;gap:6px;flex-wrap:wrap"><input id="f_loc" readonly placeholder="ยังไม่ระบุพิกัด" style="flex:1"><button class="btn sec" type="button" onclick="getLoc()">📍 ดึงพิกัดปัจจุบัน</button></div>');

  h.push('<label style="margin-top:14px">รูปถ่ายประกอบ (บีบอัดอัตโนมัติ สูงสุด 5 รูป)</label>');
  h.push('<input type="file" id="f_files" multiple accept="image/*" onchange="readFiles(this)"><div id="fileList" class="muted" style="margin-top:6px"></div>');

  h.push('<label style="margin-top:16px"><input type="checkbox" id="f_anon" style="width:auto" onchange="toggleAnon()"> 🕶️ แจ้งแบบไม่เปิดเผยชื่อ (คุ้มครองตามระเบียบ PDPA)</label>');
  h.push('<div id="idBox" class="grid g2"><div><label>ชื่อ-นามสกุล</label><input id="f_name"></div><div><label>เบอร์โทรศัพท์ (ขึ้นต้นด้วย 0)</label><input id="f_phone" type="tel"></div></div>');
  h.push('<button class="btn" style="margin-top:20px" onclick="checkBeforeSubmit()">🚀 ส่งเรื่องร้องเรียน</button></div>');

  app().innerHTML = h.join('');
  initChips('typeChips');
  onTambonChange();
}

function onTambonChange() {
  var t = el('f_tambon').value;
  var maxMoo = (META.tambonData && META.tambonData[t]) ? META.tambonData[t] : 15;
  var h = '<option value="">-- เลือกหมู่ที่ --</option>';
  for (var i = 1; i <= maxMoo; i++) h += '<option value="' + i + '">หมู่ที่ ' + i + '</option>';
  el('f_moo').innerHTML = h;
}

function initChips(id) {
  var cs = document.querySelectorAll('#' + id + ' .chip');
  for (var i = 0; i < cs.length; i++) {
    cs[i].onclick = function () {
      var all = document.querySelectorAll('#' + id + ' .chip');
      for (var j = 0; j < all.length; j++) all[j].classList.remove('on');
      this.classList.add('on');
    };
  }
}

function chipVal(id) {
  var e = document.querySelector('#' + id + ' .chip.on');
  return e ? e.getAttribute('data-v') : '';
}

function toggleAnon() {
  el('idBox').classList.toggle('hide', el('f_anon').checked);
}

function getLoc() {
  if (!navigator.geolocation) return toast('อุปกรณ์ไม่รองรับ GPS', 'err');
  toast('กำลังค้นหาพิกัด GPS…');
  navigator.geolocation.getCurrentPosition(function (p) {
    el('f_loc').value = p.coords.latitude.toFixed(6) + ',' + p.coords.longitude.toFixed(6);
    toast('ดึงพิกัดสำเร็จ 📍', 'ok');
  }, function () { toast('ไม่สามารถระบุตำแหน่งได้', 'err'); });
}

function readFiles(inp) {
  FILES = [];
  var fs = inp.files, max = Math.min(fs.length, 5), processed = 0;
  el('fileList').innerHTML = '⏳ กำลังบีบอัดรูปภาพ…';
  for (var i = 0; i < max; i++) {
    (function (f) {
      compressImage(f, 1280, 1280, 0.75, function (base64Data, mime) {
        FILES.push({ name: f.name, mime: mime, data: base64Data });
        processed++;
        if (processed === max) el('fileList').innerHTML = '✅ เตรียมรูปภาพเรียบร้อยแล้ว ' + processed + ' รูป';
      });
    })(fs[i]);
  }
}

function checkBeforeSubmit() {
  var title = el('f_title').value.trim(), detail = el('f_detail').value.trim();
  if (!title || !detail) return toast('กรุณากรอกหัวข้อและรายละเอียด', 'err');
  if (!el('f_tambon').value || !el('f_moo').value) return toast('กรุณาเลือกตำบลและหมู่ที่', 'err');

  var loc = (el('f_loc').value || '').split(',');
  var payload = {
    type: chipVal('typeChips'), title: title, detail: detail,
    category: el('f_cat').value, agency: el('f_agency').value,
    tambon: el('f_tambon').value, moo: el('f_moo').value,
    lat: loc[0] || '', lng: loc[1] || '', anonymous: el('f_anon').checked,
    name: el('f_name').value.trim(), phone: el('f_phone').value.trim(), files: FILES
  };

  run('api_submitCase', [payload], function (r) {
    if (!r.ok) return toast(r.msg, 'err');
    showSuccessModal(r);
  });
}

function showSuccessModal(r) {
  var trackUrl = window.location.origin + window.location.pathname + '?track=' + r.caseId;
  var h = [];
  h.push('<div class="box" style="text-align:center"><h2>🎉 ส่งเรื่องสำเร็จแล้ว!</h2>');
  h.push('<div style="background:#F0F9FF;border:2px dashed #0284C7;border-radius:14px;padding:16px;margin:14px 0">');
  h.push('<div style="font-size:25px;font-weight:800;color:#0284C7">' + esc(r.caseId) + '</div>');
  h.push('<button class="btn sm" onclick="copyText(\'' + esc(r.caseId) + '\')">📋 คัดลอกเลขเคส</button></div>');
  h.push('<p class="muted">กรุณาบันทึกรหัสไว้เพื่อติดตามความคืบหน้า</p>');
  h.push('<button class="btn" style="margin-top:14px" onclick="trackDirectly(\'' + esc(r.caseId) + '\')">🔎 ติดตามเรื่องนี้ทันที</button></div>');

  var m = document.createElement('div'); m.className = 'modal'; m.id = 'modal';
  m.innerHTML = h.join(''); document.body.appendChild(m);
}

function trackDirectly(id) {
  closeModal();
  var bs = document.querySelectorAll('#nav button');
  for (var j = 0; j < bs.length; j++) {
    bs[j].classList.toggle('active', bs[j].getAttribute('data-v') === 'track');
  }
  vTrack();
  setTimeout(function () { if (el('t_id')) { el('t_id').value = id; doTrack(); } }, 150);
}

/* 3) ติดตามเรื่อง (ค้นหาด้วยเลขเคส หรือ เบอร์โทร) */
function vTrack() {
  var h = [];
  h.push('<div class="card"><h2>🔎 ติดตามสถานะเรื่องร้องเรียน</h2>');
  h.push('<div class="chips" id="trackModeChips">');
  h.push('<div class="chip on" data-m="id" onclick="setTrackMode(\'id\')">🆔 ค้นหาด้วยเลขที่เรื่อง</div>');
  h.push('<div class="chip" data-m="phone" onclick="setTrackMode(\'phone\')">📱 ค้นหาด้วยเบอร์โทรศัพท์</div>');
  h.push('</div>');

  h.push('<div id="trackBox_id" style="margin-top:10px"><label>เลขที่เรื่อง</label><div style="display:flex;gap:8px">');
  h.push('<input id="t_id" placeholder="NH-..." onkeydown="if(event.key===\'Enter\')doTrack()"><button class="btn" onclick="doTrack()">ตรวจสอบ</button></div></div>');

  h.push('<div id="trackBox_phone" class="hide" style="margin-top:10px"><label>เบอร์โทรศัพท์ที่เคยแจ้ง</label><div style="display:flex;gap:8px">');
  h.push('<input id="t_phone" placeholder="เช่น 0812345678" type="tel" onkeydown="if(event.key===\'Enter\')doTrackPhone()"><button class="btn" onclick="doTrackPhone()">ค้นหา</button></div></div>');

  h.push('<div id="t_out"></div></div>');
  app().innerHTML = h.join('');

  var urlParams = new URLSearchParams(window.location.search);
  var trackParam = urlParams.get('track');
  if (trackParam) { el('t_id').value = trackParam; doTrack(); }
}

function setTrackMode(m) {
  var cs = document.querySelectorAll('#trackModeChips .chip');
  for (var i = 0; i < cs.length; i++) cs[i].classList.toggle('on', cs[i].getAttribute('data-m') === m);
  el('trackBox_id').classList.toggle('hide', m !== 'id');
  el('trackBox_phone').classList.toggle('hide', m !== 'phone');
  el('t_out').innerHTML = '';
}

function doTrackPhone() {
  var p = el('t_phone').value.trim();
  if (!p) return toast('กรุณากรอกเบอร์โทรศัพท์', 'err');
  el('t_out').innerHTML = '<div class="loading">กำลังค้นหาประวัติ…</div>';

  run('api_trackByPhone', [p], function (r) {
    if (!r.ok) { el('t_out').innerHTML = '<div class="alert err">' + esc(r.msg) + '</div>'; return; }
    var h = ['<h3 style="margin-top:20px">รายการเรื่องที่พบ</h3><table><thead><tr><th>รหัส</th><th>หัวข้อ</th><th>สถานะ</th></tr></thead><tbody>'];
    for (var i = 0; i < r.list.length; i++) {
      h.push('<tr onclick="trackDirectly(\'' + esc(r.list[i].caseId) + '\')"><td><b>' + esc(r.list[i].caseId) + '</b></td><td>' + esc(r.list[i].title) + '</td><td>' + badge(r.list[i].status) + '</td></tr>');
    }
    h.push('</tbody></table>');
    el('t_out').innerHTML = h.join('');
  });
}

function doTrack() {
  var id = el('t_id').value.trim();
  if (!id) return toast('กรุณากรอกเลขที่เรื่อง', 'err');
  el('t_out').innerHTML = '<div class="loading">กำลังค้นหาข้อมูล…</div>';

  run('api_track', [id], function (r) {
    if (!r.ok) { el('t_out').innerHTML = '<div class="alert err">' + esc(r.msg) + '</div>'; return; }
    var d = r.data, h = [];
    h.push('<div style="margin-top:20px"><h3>' + esc(d.title) + ' ' + badge(d.status) + '</h3>');
    h.push('<p style="line-height:2;font-size:13.5px">🆔 <b>รหัส:</b> ' + esc(d.caseId) + ' | 📅 ' + esc(d.ts) + '<br>🏢 <b>หน่วยงาน:</b> ' + esc(d.agency) + '<br>🗓️ <b>กำหนดเสร็จ:</b> ' + esc(d.dueDate) + ' (' + slaBadge(d.dueDate, d.status) + ')</p>');
    h.push('<button class="btn sec sm" onclick="support(\'' + esc(d.caseId) + '\')">👍 ฉันเจอปัญหานี้ด้วย (' + d.supportCount + ' เสียง)</button>');

    h.push('<h4 style="margin-top:16px">ประวัติการดำเนินงาน (Timeline)</h4><div class="tl">');
    for (var i = 0; i < r.timeline.length; i++) {
      var t = r.timeline[i];
      h.push('<div class="item"><b>' + esc(t.action) + '</b> ' + badge(t.status) + '<br><span class="muted">' + esc(t.ts) + ' โดย ' + esc(t.actor) + '</span><br>' + esc(t.note) + '</div>');
    }
    h.push('</div>');

    if ((d.status === 'ดำเนินการแล้ว' || d.status === 'ยุติเรื่อง') && !d.rated) {
      h.push(rateForm(d.caseId));
    }
    h.push('</div>');
    el('t_out').innerHTML = h.join('');
  });
}

function rateForm(id) {
  var items = [['speed', 'ความรวดเร็วในการแก้ไข'], ['service', 'การให้บริการของเจ้าหน้าที่'], ['solve', 'ผลการแก้ไขปัญหา'], ['comm', 'การติดต่อสื่อสารชี้แจง']];
  var h = ['<div class="card" style="background:#F0F9FF;margin-top:20px"><h3>⭐ ประเมินความพึงพอใจการบริการ</h3>'];
  for (var i = 0; i < items.length; i++) {
    h.push('<label>' + items[i][1] + '</label><select id="r_' + items[i][0] + '">');
    for (var n = 5; n >= 1; n--) h.push('<option value="' + n + '">⭐ ' + n + ' คะแนน</option>');
    h.push('</select>');
  }
  h.push('<button class="btn green" style="margin-top:12px" onclick="sendRate(\'' + esc(id) + '\')">ส่งแบบประเมิน</button></div>');
  return h.join('');
}

function sendRate(id) {
  var r = { speed: el('r_speed').value, service: el('r_service').value, solve: el('r_solve').value, comm: el('r_comm').value };
  run('api_rate', [id, r], function (res) { toast(res.ok ? 'ขอบคุณสำหรับการประเมินครับ' : res.msg, res.ok ? 'ok' : 'err'); doTrack(); });
}

function support(id) {
  run('api_support', [id, VKEY], function (r) { toast(r.ok ? 'บันทึกเสียงสนับสนุนแล้ว' : r.msg, r.ok ? 'ok' : 'err'); doTrack(); });
}

/* 4) หนองหินไอเดีย */
function vIdea() {
  run('api_listIdeas', [], function (list) {
    var h = ['<div class="card"><h2>💡 เสนอแนะไอเดียพัฒนาพื้นที่</h2>'];
    h.push('<label>หัวข้อไอเดีย *</label><input id="i_title">');
    h.push('<button class="btn" style="margin-top:12px" onclick="addIdea()">💡 ส่งข้อเสนอ</button></div>');
    h.push('<div class="card"><h2>🗳️ ไอเดียยอดนิยม</h2>');
    for (var i = 0; i < list.length; i++) {
      h.push('<div class="row"><b>#' + (i + 1) + ' ' + esc(list[i].title) + '</b> <button class="btn sec sm" onclick="voteIdea(\'' + esc(list[i].ideaId) + '\')">👍 โหวต (' + list[i].votes + ')</button></div>');
    }
        h.push('</div>');
    app().innerHTML = h.join('');
  });
}
function addIdea() {
  var t = el('i_title').value.trim(); if (!t) return toast('กรุณากรอกหัวข้อ', 'err');
  run('api_addIdea', [{ title: t, tambon: 'ตำบลหนองหิน', category: 'ทั่วไป' }, VKEY], function () { toast('ขอบคุณสำหรับไอเดียครับ', 'ok'); vIdea(); });
}
function voteIdea(id) {
  run('api_voteIdea', [id, VKEY], function (r) { toast(r.ok ? 'โหวตสำเร็จ' : r.msg, r.ok ? 'ok' : 'err'); if (r.ok) vIdea(); });
}

/* 5) ติดต่อส่วนราชการ */
function vContact() {
  var contacts = (META && META.contacts) ? META.contacts : [];
  var h = ['<div class="card"><h2>📞 ช่องทางการติดต่อส่วนราชการ</h2>'];
  for (var i = 0; i < contacts.length; i++) {
    var c = contacts[i];
    h.push('<div class="contact-card"><div><b>' + esc(c.name) + '</b><br><span class="muted">' + esc(c.phone) + '</span></div><a href="tel:' + esc(c.phone) + '" class="btn green sm">📞 โทร</a></div>');
  }
  h.push('</div>');
  app().innerHTML = h.join('');
}

/* 6) แผนที่ปัญหา (Marker & Heatmap) */
function vMap() {
  app().innerHTML = '<div class="card"><h2>🗺️ แผนที่พิกัดปัญหาและ Heatmap</h2><div id="mapbox"></div></div>';
  run('api_public', [], function (d) {
    if (MAP) { try { MAP.remove(); } catch(e){} }
    MAP = L.map('mapbox').setView(META.center, 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(MAP);
    for (var i = 0; i < (d.map || []).length; i++) {
      var m = d.map[i];
      L.circleMarker([m.lat, m.lng], { radius: 7, color: '#fff', weight: 2, fillColor: CATCOLOR[m.category] || '#64748B', fillOpacity: 0.9 })
        .addTo(MAP).bindPopup('<b>' + esc(m.title) + '</b><br>' + esc(m.category) + '<br>' + esc(m.status));
    }
  });
}

/* 7) ข้อมูลเปิดภาครัฐ */
function vOpen() {
  run('api_public', [], function (d) {
    var h = ['<div class="card"><h2>📊 สถิติข้อมูลเปิดภาครัฐ</h2></div>'];
    h.push('<div class="grid g3">' + kpi(d.total, 'เรื่องทั้งหมด') + kpi(d.done, 'ดำเนินการแล้ว') + kpi(d.doing, 'กำลังดำเนินการ') + '</div>');
    h.push('<div class="grid g2"><div class="card"><h3>หมวดหมู่ปัญหา</h3><canvas id="c1"></canvas></div><div class="card"><h3>แยกตามตำบล</h3><canvas id="c2"></canvas></div></div>');
    app().innerHTML = h.join('');
    drawChart('c1', 'bar', d.byCategory);
    drawChart('c2', 'doughnut', d.byTambon);
  });
}
function drawChart(id, type, obj) {
  var labels = Object.keys(obj || {}), vals = labels.map(function(k){ return obj[k]; });
  new Chart(el(id), { type: type, data: { labels: labels, datasets: [{ data: vals, backgroundColor: PALETTE }] }, options: { responsive: true } });
}

/* 8) ระบบเจ้าหน้าที่ (Staff & Admin) */
function vStaff() {
  if (!TOKEN) {
    app().innerHTML = '<div class="card" style="max-width:400px;margin:40px auto"><h2>🔐 เข้าสู่ระบบเจ้าหน้าที่</h2><label>Username</label><input id="l_u"><label>Password</label><input id="l_p" type="password"><button class="btn" style="margin-top:14px;width:100%" onclick="doLogin()">เข้าสู่ระบบ</button></div>';
    return;
  }
  var h = ['<div class="card" style="display:flex;justify-content:space-between;align-items:center"><div><b>' + esc(USER.name) + '</b> (' + esc(USER.role) + ')</div><button class="btn sec sm" onclick="logout()">ออกจากระบบ</button></div>'];
  h.push('<div id="staffCasesList"></div>');
  app().innerHTML = h.join('');
  loadStaffCases();
}

function doLogin() {
  run('api_login', [el('l_u').value.trim(), el('l_p').value.trim()], function (r) {
    if (!r.ok) return toast(r.msg, 'err');
    TOKEN = r.token; USER = r.user; toast('ยินดีต้อนรับ ' + USER.name, 'ok'); vStaff();
  });
}
function logout() { TOKEN = null; USER = null; vStaff(); }

function loadStaffCases() {
  el('staffCasesList').innerHTML = '<div class="loading">กำลังโหลดข้อมูล...</div>';
  run('api_cases', [TOKEN, {}], function (cs) {
    CASELIST = cs;
    var h = ['<div class="card"><h3>รายการเรื่องร้องเรียน (' + cs.length + ')</h3><table><thead><tr><th>รหัส</th><th>หัวข้อ</th><th>สถานะ</th><th>การจัดการ</th></tr></thead><tbody>'];
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      h.push('<tr><td>' + esc(c.caseId) + '</td><td>' + esc(c.title) + '</td><td>' + badge(c.status) + '</td><td><button class="btn sm" onclick="openCase(' + i + ')">จัดการ</button></td></tr>');
    }
    h.push('</tbody></table></div>');
    el('staffCasesList').innerHTML = h.join('');
  });
}

function openCase(i) {
  var c = CASELIST[i];
  var h = ['<div class="box"><h2>' + esc(c.title) + '</h2><p>🆔 ' + esc(c.caseId) + '<br>👤 ผู้แจ้ง: ' + esc(c.name) + ' (' + esc(c.phone) + ')</p>'];
  h.push('<div class="alert info">' + esc(c.detail) + '</div>');
  h.push('<label>สถานะ</label><select id="m_st">' + opts(META.statuses, c.status) + '</select>');
  if (USER.role === 'admin' || USER.username === 'VVIP001') {
    h.push('<label style="color:#0284C7">📱 แก้ไขเบอร์ผู้แจ้ง (Admin Only)</label><input id="m_phone" value="' + esc(c.phone) + '">');
  }
  h.push('<label>บันทึกการปฏิบัติงาน</label><textarea id="m_note"></textarea>');
  h.push('<div style="margin-top:14px;display:flex;gap:8px"><button class="btn green" onclick="saveCase(\'' + esc(c.caseId) + '\')">💾 บันทึก</button><button class="btn sec" onclick="printWorkOrder(' + i + ')">🖨️ พิมพ์ใบงาน</button><button class="btn sec" onclick="closeModal()">ปิด</button></div></div>');
  var m = document.createElement('div'); m.className = 'modal'; m.id = 'modal'; m.innerHTML = h.join(''); document.body.appendChild(m);
}

function printWorkOrder(i) {
  var c = CASELIST[i], w = window.open('', '_blank');
  var h = ['<!DOCTYPE html><html><head><title>ใบงาน - ' + esc(c.caseId) + '</title><style>body{font-family:"Prompt",sans-serif;padding:40px;position:relative}.watermark-grid{position:fixed;top:0;left:0;width:100%;height:100%;z-index:1;pointer-events:none;display:flex;flex-wrap:wrap;justify-content:space-around;align-content:space-around;opacity:0.06}.watermark-item{font-size:26px;font-weight:700;color:#0284C7;transform:rotate(-30deg);margin:40px}table{width:100%;border-collapse:collapse;margin-top:20px;position:relative;z-index:2}td{padding:8px;border:1px solid #ccc}</style></head><body>'];
  h.push('<div class="watermark-grid">');
  for (var k = 0; k < 12; k++) h.push('<div class="watermark-item">หนองหินพลัส</div>');
  h.push('</div>');
  h.push('<div style="position:relative;z-index:2"><h2>แบบรายงานการรับแจ้งเรื่องและคำสั่งปฏิบัติงาน</h2><p>หนองหินพลัส — ศูนย์ดำรงธรรมอำเภอหนองหิน</p><table><tr><td><b>เลขที่เรื่อง:</b> ' + esc(c.caseId) + '</td><td><b>วันที่:</b> ' + esc(c.ts) + '</td></tr><tr><td><b>ผู้แจ้ง:</b> ' + esc(c.name) + '</td><td><b>เบอร์โทร:</b> ' + esc(c.phone) + '</td></tr><tr><td colspan="2"><b>หัวข้อ:</b> ' + esc(c.title) + '<br><br><b>รายละเอียด:</b><br>' + esc(c.detail) + '</td></tr></table><div style="margin-top:40px">ลงชื่อ.................................................. เจ้าหน้าที่ผู้รับผิดชอบ</div></div><script>window.print();<\/script></body></html>');
  w.document.write(h.join('')); w.document.close();
}

function saveCase(id) {
  var patch = { status: el('m_st').value, note: el('m_note').value };
  if (el('m_phone')) patch.phone = el('m_phone').value.trim();
  run('api_updateCase', [TOKEN, id, patch], function () { closeModal(); toast('บันทึกเรียบร้อย', 'ok'); loadStaffCases(); });
}

/* 10) น้องหิน AI Bot */
function initBot() {
  el('botBtn').onclick = function () { el('botBox').classList.toggle('hide'); };
  el('botClose').onclick = function () { el('botBox').classList.add('hide'); };
  el('botSend').onclick = function () {
    var q = el('botInput').value.trim(); if (!q) return;
    el('botMsgs').innerHTML += '<div class="msg u">' + esc(q) + '</div>';
    el('botInput').value = '';
    run('api_ask', [q], function (a) { el('botMsgs').innerHTML += '<div class="msg b">' + esc(a) + '</div>'; });
  };
}

function boot() {
  initNav(); initBot();
  run('api_meta', [], function (m) { META = m; go('home'); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
