/**
 * BFMSS Enhancements — All 10 improvements
 * 1. Input Validation  2. localStorage monitor  3. Print CSS
 * 4. Live Charts  5. PDF Preview  6. Notifications
 * 7. Search/Filter  8. Excel Export  9. Audit Timeline  10. Health Gauge
 */

// ── 1. VALIDATION ENGINE ─────────────────────────────────
const Validator = {
  rules: {
    required:     v => v !== null && v !== undefined && String(v).trim() !== '',
    minAmount:    v => parseFloat(v) > 0,
    maxAmount:    v => parseFloat(v) <= 999999999,
    noFutureDate: v => v && v <= new Date().toISOString().split('T')[0],
    positive:     v => parseFloat(v) >= 0,
    email:        v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)),
    minLength:    (v, n) => String(v).trim().length >= n,
    maxLength:    (v, n) => String(v).trim().length <= n,
  },
  messages: {
    required: 'This field is required.',
    minAmount: 'Amount must be greater than ₱ 0.00.',
    maxAmount: 'Amount cannot exceed ₱ 999,999,999.',
    noFutureDate: 'Date cannot be in the future.',
    positive: 'Must be a positive number.',
    email: 'Please enter a valid email address.',
    minLength: n => `Must be at least ${n} characters.`,
    maxLength: n => `Cannot exceed ${n} characters.`,
  },
  check(value, rules) {
    for (const rule of rules) {
      const [name, ...args] = Array.isArray(rule) ? rule : [rule];
      const fn = this.rules[name];
      if (fn && !fn(value, ...args)) {
        const msg = this.messages[name];
        return typeof msg === 'function' ? msg(...args) : msg;
      }
    }
    return null;
  },
  validateForm(schema) {
    let valid = true;
    document.querySelectorAll('.field-error').forEach(el => el.remove());
    document.querySelectorAll('.form-control.input-error').forEach(el => el.classList.remove('input-error'));
    for (const [fieldId, rules] of Object.entries(schema)) {
      const el = document.getElementById(fieldId);
      if (!el) continue;
      const error = this.check(el.value, rules);
      if (error) {
        el.classList.add('input-error');
        const msg = document.createElement('div');
        msg.className = 'field-error';
        msg.innerHTML = '<i class="bi bi-exclamation-circle"></i> ' + error;
        el.parentNode.insertBefore(msg, el.nextSibling);
        if (valid) el.focus();
        valid = false;
      }
    }
    return valid;
  },
  clearErrors(el) {
    (el || document).querySelectorAll('.field-error').forEach(e => e.remove());
    (el || document).querySelectorAll('.input-error').forEach(e => e.classList.remove('input-error'));
  },
};
window.Validator = Validator;

// ── 2. LOCALSTORAGE SIZE MONITOR ────────────────────────
const StorageMonitor = {
  MAX: 5 * 1024 * 1024,
  getUsed() { return Object.keys(localStorage).reduce((t, k) => t + (localStorage.getItem(k)||'').length * 2, 0); },
  getPct()  { return this.getUsed() / this.MAX; },
  fmt(b)    { return b < 1048576 ? (b/1024).toFixed(1)+' KB' : (b/1048576).toFixed(2)+' MB'; },
  check() {
    const pct = this.getPct();
    if (pct >= 0.95) this.banner('danger',  `⚠️ Storage ${(pct*100).toFixed(0)}% full (${this.fmt(this.getUsed())} / 5MB) — export your data immediately!`);
    else if (pct >= 0.75) this.banner('warning', `⚠️ Storage ${(pct*100).toFixed(0)}% full (${this.fmt(this.getUsed())} / 5MB) — consider exporting old records.`);
    else this.hide();
  },
  banner(type, msg) {
    let el = document.getElementById('storage-banner');
    if (!el) { el = document.createElement('div'); el.id = 'storage-banner'; document.body.prepend(el); }
    el.className = 'storage-banner storage-banner-' + type;
    el.innerHTML = `<span>${msg}</span><button onclick="this.parentElement.remove()">✕</button>`;
  },
  hide() { document.getElementById('storage-banner')?.remove(); },
  init() { this.check(); setInterval(() => this.check(), 60000); },
};
window.StorageMonitor = StorageMonitor;

// ── 3. PRINT CSS ─────────────────────────────────────────
function injectPrintStyles() {
  if (document.getElementById('bfmss-print-css')) return;
  const s = document.createElement('style');
  s.id = 'bfmss-print-css';
  s.textContent = `@media print {
    .sidebar,.topbar,.sidebar-overlay,.page-header-actions,.btn,.toolbar,
    #pagination-btns,#bfmss-chatbot-root,.storage-banner,.modal-overlay,
    #toast-container { display:none!important; }
    .app-wrapper { display:block!important; }
    .main-content { margin-left:0!important; padding:0!important; }
    .page-body { padding:10px!important; }
    .card { box-shadow:none!important; border:1px solid #ccc!important; break-inside:avoid; margin-bottom:10px!important; }
    table { width:100%!important; border-collapse:collapse!important; font-size:9pt!important; }
    th,td { border:1px solid #bbb!important; padding:3px 5px!important; }
    thead { background:#e8e8e8!important; -webkit-print-color-adjust:exact; }
    .stats-grid { display:grid!important; grid-template-columns:repeat(3,1fr)!important; gap:6px!important; }
    .badge { border:1px solid #999!important; background:transparent!important; color:#000!important; }
    .page-body::before { content:'BARANGAY FINANCIAL MANAGEMENT STREAMLINING SYSTEM (BFMSS)';
      display:block; text-align:center; font-size:8pt; color:#555;
      border-bottom:1px solid #ccc; padding-bottom:5px; margin-bottom:10px; }
  }`;
  document.head.appendChild(s);
}

// ── 4. LIVE DASHBOARD CHARTS ─────────────────────────────
const DashboardCharts = {
  _instances: {},
  _destroy(id) { if (this._instances[id]) { this._instances[id].destroy(); delete this._instances[id]; } },

  monthly(canvasId, barangayId, module) {
    if (!window.Chart || !document.getElementById(canvasId)) return;
    const ik = module === 'sk' ? 'sk_income' : 'income';
    const ek = module === 'sk' ? 'sk_expenses' : 'expenses';
    const yr = new Date().getFullYear();
    const inc = Array(12).fill(0), exp = Array(12).fill(0);
    const allInc = await DB.filter(ik, { barangayId });
    allInc.filter(i => i.status==='approved' && i.dateReceived?.startsWith(String(yr)))
      .forEach(i => { const m = +i.dateReceived.split('-')[1]-1; inc[m] += parseFloat(i.amount || 0); });
    const allExp = await DB.filter(ek, { barangayId });
    allExp.filter(e => e.status==='approved' && e.dateSpent?.startsWith(String(yr)))
      .forEach(e => { const m = +e.dateSpent.split('-')[1]-1; exp[m] += parseFloat(e.amount || 0); });
    this._destroy(canvasId);
    this._instances[canvasId] = new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: { labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
        datasets: [
          { label:'Income',   data:inc, backgroundColor:'rgba(22,163,74,.7)',  borderColor:'#15803d', borderWidth:1 },
          { label:'Expenses', data:exp, backgroundColor:'rgba(220,38,38,.6)',  borderColor:'#b91c1c', borderWidth:1 },
        ]},
      options: { responsive:true, maintainAspectRatio:false,
        plugins:{ tooltip:{ callbacks:{ label: c => ' ₱ '+c.raw.toLocaleString('en-PH',{minimumFractionDigits:2}) }}},
        scales:{ y:{ ticks:{ callback: v => '₱'+(v/1000).toFixed(0)+'K' }}}},
    });
  },

  async donut(canvasId, barangayId, module, type) {
    if (!window.Chart || !document.getElementById(canvasId)) return;
    const key = type==='income' ? (module==='sk'?'sk_income':'income') : (module==='sk'?'sk_expenses':'expenses');
    const allRec = await DB.filter(key, { barangayId });
    const records = allRec.filter(r => r.status==='approved');
    const bycat = {};
    records.forEach(r => { bycat[r.category] = (bycat[r.category]||0) + r.amount; });
    const labels = Object.keys(bycat), data = Object.values(bycat);
    const colors = ['#1a3a6b','#16a34a','#dc2626','#f59e0b','#0284c7','#7c3aed','#db2777','#0891b2','#65a30d'];
    this._destroy(canvasId);
    this._instances[canvasId] = new Chart(document.getElementById(canvasId), {
      type: 'doughnut',
      data: { labels, datasets:[{ data, backgroundColor:colors.slice(0,labels.length), hoverOffset:5 }] },
      options: { responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ position:'right', labels:{ font:{size:10} }},
          tooltip:{ callbacks:{ label: c => ` ${c.label}: ₱ ${c.raw.toLocaleString('en-PH',{minimumFractionDigits:2})}` }}}},
    });
  },

  async trend(canvasId, barangayId, module) {
    if (!window.Chart || !document.getElementById(canvasId)) return;
    const ik = module==='sk'?'sk_income':'income', ek = module==='sk'?'sk_expenses':'expenses';
    const allIk = await DB.filter(ik, { barangayId });
    const allEk = await DB.filter(ek, { barangayId });
    const evts = [
      ...allIk.filter(i=>i.status==='approved').map(i=>({date:i.dateReceived, amt:parseFloat(i.amount||0)})),
      ...allEk.filter(e=>e.status==='approved').map(e=>({date:e.dateSpent, amt:-parseFloat(e.amount||0)})),
    ].sort((a,b)=>a.date.localeCompare(b.date));
    let running=0;
    const labels=[], values=[];
    evts.forEach(e => { running+=e.amt; labels.push(e.date); values.push(running); });
    this._destroy(canvasId);
    this._instances[canvasId] = new Chart(document.getElementById(canvasId), {
      type:'line',
      data:{ labels, datasets:[{ label:'Fund Balance', data:values, borderColor:'#1a3a6b',
        backgroundColor:'rgba(26,58,107,.08)', fill:true, tension:.3, pointRadius:2 }]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label: c=>' ₱ '+c.raw.toLocaleString('en-PH',{minimumFractionDigits:2})}}},
        scales:{ x:{ticks:{maxTicksLimit:8,maxRotation:30}}, y:{ticks:{callback: v=>'₱'+(v/1000).toFixed(0)+'K'}}}},
    });
  },
};
window.DashboardCharts = DashboardCharts;

// ── 5. PDF PREVIEW MODAL ─────────────────────────────────
async function previewPDFInModal(reportType, formData, barangayId, module) {
  let overlay = document.getElementById('pdf-preview-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'pdf-preview-overlay';
    overlay.innerHTML = `
      <div id="pdf-preview-box">
        <div id="pdf-preview-hdr">
          <span><i class="bi bi-file-earmark-pdf"></i> Report Preview</span>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-sm btn-primary" id="pprev-pdf"><i class="bi bi-download"></i> Download PDF</button>
            <button class="btn btn-sm btn-primary" id="pprev-zip"><i class="bi bi-file-zip"></i> Download ZIP</button>
            <button class="btn btn-sm btn-light" onclick="closePDFPreview()"><i class="bi bi-x-lg"></i> Close</button>
          </div>
        </div>
        <div id="pdf-preview-loading"><i class="bi bi-hourglass-split" style="animation:spin 1s linear infinite;font-size:1.5rem;"></i>&nbsp; Generating preview...</div>
        <iframe id="pdf-preview-frame" style="display:none;width:100%;flex:1;border:none;"></iframe>
      </div>`;
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
  document.getElementById('pdf-preview-loading').style.display = 'flex';
  document.getElementById('pdf-preview-frame').style.display = 'none';
  try {
    const doc = await generateReport(reportType, formData, barangayId, module || 'treasurer');
    const url = URL.createObjectURL(doc.output('blob'));
    const frame = document.getElementById('pdf-preview-frame');
    frame.onload = () => {
      document.getElementById('pdf-preview-loading').style.display = 'none';
      frame.style.display = 'block';
    };
    frame.src = url;
    document.getElementById('pprev-pdf').onclick = () => downloadReport(reportType, formData, barangayId, module || 'treasurer');
    document.getElementById('pprev-zip').onclick = () => downloadReportAsZip(reportType, formData, barangayId, module || 'treasurer');
  } catch(err) {
    document.getElementById('pdf-preview-loading').innerHTML = `<span style="color:#dc2626;"><i class="bi bi-x-circle"></i> Error: ${err.message}</span>`;
  }
}
function closePDFPreview() {
  const o = document.getElementById('pdf-preview-overlay');
  if (o) o.style.display = 'none';
  const f = document.getElementById('pdf-preview-frame');
  if (f && f.src) { URL.revokeObjectURL(f.src); f.src = ''; }
}
window.previewPDFInModal = previewPDFInModal;
window.closePDFPreview = closePDFPreview;

// ── 6. LIVE NOTIFICATION SYSTEM ──────────────────────────
const NotifSystem = {
  _poll: null,
  start() { this.refresh(); this._poll = setInterval(() => this.refresh(), 15000); },
  stop()  { clearInterval(this._poll); },
  refresh() {
    updateNotifBadge();
    const user = DB.getCurrentUser();
    const list = document.getElementById('notif-list');
    if (user && list) this.renderList(user.id, list);
  },
  async renderList(userId, container) {
    const notifs = (await DB.get('notifications')||[]).filter(n=>n.userId===userId)
      .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,20);
    if (!notifs.length) {
      container.innerHTML = '<div style="padding:2rem;text-align:center;color:#94a3b8;"><i class="bi bi-bell-slash" style="font-size:2rem;display:block;margin-bottom:.5rem;"></i>No notifications yet</div>';
      return;
    }
    const icons = { success:'bi-check-circle', warning:'bi-exclamation-triangle', error:'bi-x-circle', info:'bi-info-circle' };
    container.innerHTML = notifs.map(n => `
      <div class="notif-item ${n.read?'':'notif-unread'}" onclick="markNotifRead(${n.id})">
        <div class="notif-icon notif-icon-${n.type||'info'}"><i class="bi ${icons[n.type||'info']}"></i></div>
        <div class="notif-content">
          <div class="notif-title">${escHtml(n.title||'')}</div>
          <div class="notif-msg">${escHtml(n.message)}</div>
          <div class="notif-time">${formatDateTime(n.createdAt)}</div>
        </div>
        ${!n.read ? '<div class="notif-dot"></div>' : ''}
      </div>`).join('');
  },
};
window.NotifSystem = NotifSystem;
async function markNotifRead(id) {
  await DB.update('notifications', id, { read: true });
  updateNotifBadge();
  const user = DB.getCurrentUser();
  const list = document.getElementById('notif-list');
  if (user && list) NotifSystem.renderList(user.id, list);
}
async function markAllNotifRead() {
  const user = DB.getCurrentUser();
  if (!user) return;
  const notifs = (await DB.get('notifications')||[]).filter(n=>n.userId===user.id&&!n.read);
  for (const n of notifs) {
    await DB.update('notifications', n.id, { read: true });
  }
  updateNotifBadge();
  const list = document.getElementById('notif-list');
  if (user && list) NotifSystem.renderList(user.id, list);
}
window.markNotifRead = markNotifRead;
window.markAllNotifRead = markAllNotifRead;

// ── 7. LIVE SEARCH HELPER ────────────────────────────────
function liveSearch(inputId, tbodyId) {
  const input = typeof inputId==='string' ? document.getElementById(inputId) : inputId;
  if (!input || !document.getElementById(tbodyId)) return;
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    const rows = document.querySelectorAll('#'+tbodyId+' tr');
    let visible = 0;
    rows.forEach(row => {
      const show = !q || row.textContent.toLowerCase().includes(q);
      row.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    let noRes = document.getElementById(tbodyId+'-nores');
    if (!visible && q) {
      if (!noRes) {
        noRes = document.createElement('tr');
        noRes.id = tbodyId+'-nores';
        noRes.innerHTML = `<td colspan="20" class="table-empty"><i class="bi bi-search"></i> No results for "<strong>${escHtml(q)}</strong>"</td>`;
        document.getElementById(tbodyId).appendChild(noRes);
      }
    } else { noRes?.remove(); }
  });
}
function escHtml(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
window.liveSearch = liveSearch;

// ── 8. EXCEL EXPORT ──────────────────────────────────────
function loadSheetJS(cb) {
  if (window.XLSX) { cb(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  s.onload = cb; s.onerror = () => showToast('Could not load Excel library.','error');
  document.head.appendChild(s);
}
function exportExcel(data, filename, sheetName) {
  if (!data||!data.length) { showToast('No data to export.','warning'); return; }
  loadSheetJS(() => {
    const ws = XLSX.utils.json_to_sheet(data);
    const cols = Object.keys(data[0]).map(k => ({ wch: Math.max(k.length, ...data.map(r=>String(r[k]||'').length))+2 }));
    ws['!cols'] = cols;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName||'Sheet1');
    XLSX.writeFile(wb, filename+'.xlsx');
    showToast('Excel file downloaded!','success');
  });
}
async function exportIncomeExcel(barangayId, module) {
  const key = module==='sk'?'sk_income':'income';
  const data = await DB.filter(key, { barangayId });
  exportExcel(
    data.map(i=>({
      'Source':i.source,'Category':i.category,'Amount (₱)':i.amount,
      'Date Received':i.dateReceived,'Description':i.description||'','Status':i.status
    })),
    `BFMSS_${module==='sk'?'SK_':''}Income_${new Date().toISOString().split('T')[0]}`,
    'Income'
  );
}
async function exportExpensesExcel(barangayId, module) {
  const key = module==='sk'?'sk_expenses':'expenses';
  const data = await DB.filter(key, { barangayId });
  exportExcel(
    data.map(e=>({
      'Description':e.description,'Category':e.category,'Amount (₱)':e.amount,
      'Date Spent':e.dateSpent,'Status':e.status
    })),
    `BFMSS_${module==='sk'?'SK_':''}Expenses_${new Date().toISOString().split('T')[0]}`,
    'Expenses'
  );
}
window.exportExcel = exportExcel;
window.exportIncomeExcel = exportIncomeExcel;
window.exportExpensesExcel = exportExpensesExcel;

// ── 9. AUDIT TRAIL TIMELINE ──────────────────────────────
async function renderAuditTimeline(containerId, limit) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const logs = (await DB.get('audit_logs')||[])
    .sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).slice(0, limit||50);
  if (!logs.length) {
    container.innerHTML = '<div style="text-align:center;padding:2rem;color:#94a3b8;"><i class="bi bi-journal-x" style="font-size:2rem;display:block;margin-bottom:.5rem;"></i>No audit logs yet</div>';
    return;
  }
  const colors = { LOGIN:'#16a34a',LOGOUT:'#64748b',ADD_INCOME:'#0284c7',ADD_EXPENSE:'#dc2626',
    UPDATE_INCOME:'#f59e0b',UPDATE_EXPENSE:'#f59e0b',DELETE_INCOME:'#dc2626',DELETE_EXPENSE:'#dc2626',
    SUBMIT_REPORT:'#7c3aed',UPDATE_BARANGAY:'#1a3a6b',UPDATE_CONFIG:'#1a3a6b',ADD_USER:'#0891b2' };
  const icons  = { LOGIN:'bi-box-arrow-in-right',LOGOUT:'bi-box-arrow-right',ADD_INCOME:'bi-cash-stack',
    ADD_EXPENSE:'bi-receipt',UPDATE_INCOME:'bi-pencil',UPDATE_EXPENSE:'bi-pencil',
    DELETE_INCOME:'bi-trash',DELETE_EXPENSE:'bi-trash',SUBMIT_REPORT:'bi-file-earmark-check',
    UPDATE_CONFIG:'bi-gear',UPDATE_BARANGAY:'bi-house-gear',ADD_USER:'bi-person-plus' };
  
  let html = '<div class="audit-timeline">';
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const usr = await DB.find('users', { id: log.userId });
    const col = colors[log.action]||'#1a3a6b', ico = icons[log.action]||'bi-activity';
    html += `<div class="audit-entry">
      <div class="audit-dot" style="background:${col};"><i class="bi ${ico}"></i></div>
      ${i<logs.length-1?'<div class="audit-line"></div>':''}
      <div class="audit-body">
        <div class="audit-action" style="color:${col};">${(log.action||'').replace(/_/g,' ')}</div>
        <div class="audit-detail">${log.details||''}</div>
        <div class="audit-meta">
          <span><i class="bi bi-person"></i> ${usr?.fullName||'Unknown'}</span>
          <span><i class="bi bi-clock"></i> ${formatDateTime(log.timestamp)}</span>
          ${log.module?`<span><i class="bi bi-folder"></i> ${log.module}</span>`:''}
        </div>
      </div>
    </div>`;
  }
  html += '</div>';
  container.innerHTML = html;
}
window.renderAuditTimeline = renderAuditTimeline;

// ── 10. FINANCIAL HEALTH GAUGE ───────────────────────────
async function renderFinancialHealthGauge(containerId, barangayId, module) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const ik = module==='sk'?'sk_income':'income', ek = module==='sk'?'sk_expenses':'expenses';
  const allIk = await DB.filter(ik, { barangayId });
  const allEk = await DB.filter(ek, { barangayId });
  const income   = allIk.filter(i=>i.status==='approved');
  const expenses = allEk.filter(e=>e.status==='approved');
  const totalInc = income.reduce((s,i)=>s+parseFloat(i.amount||0),0);
  const totalExp = expenses.reduce((s,e)=>s+parseFloat(e.amount||0),0);
  const balance  = totalInc - totalExp;
  const pendInc  = allIk.filter(i=>i.status==='pending').reduce((s,i)=>s+parseFloat(i.amount||0),0);
  const pendExp  = allEk.filter(e=>e.status==='pending').reduce((s,e)=>s+parseFloat(e.amount||0),0);

  let util = 0;
  if (module !== 'sk') {
    const bud = DB.getCurrentBudget && await DB.getCurrentBudget(barangayId);
    if (bud?.totalBudget > 0) util = Math.min(totalExp/bud.totalBudget*100, 100);
  } else {
    util = totalInc > 0 ? Math.min(totalExp/totalInc*100, 100) : 0;
  }

  let color = '#16a34a', label = 'Healthy';
  if (util >= 90) { color='#dc2626'; label='Critical'; }
  else if (util >= 75) { color='#f59e0b'; label='Warning'; }
  else if (util >= 50) { color='#0284c7'; label='Moderate'; }

  container.innerHTML = `
    <div class="health-gauge">
      <div class="health-gauge-ring" style="--pct:${util.toFixed(0)};--color:${color};">
        <div class="health-gauge-inner">
          <div class="health-gauge-pct" style="color:${color};">${util.toFixed(0)}%</div>
          <div class="health-gauge-lbl">${label}</div>
        </div>
      </div>
      <div class="health-stats">
        <div class="health-stat">
          <span class="health-stat-label">Fund Balance</span>
          <span class="health-stat-val" style="color:${balance>=0?'#16a34a':'#dc2626'};">${balance>=0?'+':''}${formatCurrency(balance)}</span>
        </div>
        <div class="health-stat">
          <span class="health-stat-label">Utilization</span>
          <span class="health-stat-val" style="color:${color};">${util.toFixed(1)}%</span>
        </div>
        <div class="health-stat">
          <span class="health-stat-label">Pending Income</span>
          <span class="health-stat-val" style="color:#f59e0b;">${formatCurrency(pendInc)}</span>
        </div>
        <div class="health-stat">
          <span class="health-stat-label">Pending Expenses</span>
          <span class="health-stat-val" style="color:#f59e0b;">${formatCurrency(pendExp)}</span>
        </div>
      </div>
    </div>`;
}
window.renderFinancialHealthGauge = renderFinancialHealthGauge;

// ── AUTO-INIT ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  injectPrintStyles();
  StorageMonitor.init();
  const user = DB.getCurrentUser && DB.getCurrentUser();
  if (user) {
    NotifSystem.start();
    liveSearch('search-income',  'income-tbody');
    liveSearch('search-expense', 'expense-tbody');
    liveSearch('search-reports', 'reports-list-tbody');
    liveSearch('search-users',   'users-tbody');
    liveSearch('search-logs',    'logs-tbody');
  }
});
