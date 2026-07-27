/**
 * BFMSS Report Generation Engine
 * Generates reports using jsPDF and JSZip
 */

// Load jsPDF dynamically (Offline Capable)
function loadJsPDF(callback) {
  if (window.jspdf) { callback(); return; }
  const src = '/updated_capstone/assets/js/vendor/jspdf.umd.min.js';
  const s = document.createElement('script');
  s.src = src;
  s.onload = () => { window.jspdf = window.jspdf || {}; callback(); };
  s.onerror = () => { window.jspdf = null; callback(); };
  document.head.appendChild(s);
}
function loadJSZip(callback) {
  if (window.JSZip) { callback(); return; }
  const s = document.createElement('script');
  s.src = '/updated_capstone/assets/js/vendor/jszip.min.js';
  s.onload = callback;
  document.head.appendChild(s);
}

// ─── REPORT TYPES CONFIG (Official COA/DBM-DILG-DOF BFDP/BFR Annexes) ──
const REPORT_TYPES = {
  bfr1_daily_collections: { label: 'BFR-1: Daily Collections & Disbursements', icon: 'bi-calendar-day', color: '#0e7490' },
  bfr2_income_expenditure: { label: 'BFR-2: Actual Income & Expenditure', icon: 'bi-bar-chart-line', color: '#1a3a6b' },
  bfr3_nta_component: { label: 'BFR-3: 20% Component of NTA', icon: 'bi-clipboard2-data', color: '#16a34a' },
  bfr4_procurement_plan: { label: 'BFR-4: Annual Procurement Plan', icon: 'bi-cart3', color: '#f59e0b' },
  bfr5_notice_of_award: { label: 'BFR-5: List of Notices of Award', icon: 'bi-award', color: '#0284c7' },
  bfr6_monthly_collections: { label: 'BFR-6: Itemized Monthly Collections & Disbursements', icon: 'bi-journal-text', color: '#7c3aed' },
  bfr7_statement_receipts: { label: 'BFR-7: Statement of Receipts & Expenditures', icon: 'bi-bank', color: '#dc2626' },
  fund_status: { label: 'Fund Status & Budget Utilization', icon: 'bi-wallet2', color: '#16a34a' },

  // ── Procurement documents (Purchase Request → Payment cycle) ──
  purchase_request: { label: 'Purchase Request', icon: 'bi-cart-plus', color: '#0891b2' },
  canvass: { label: 'Canvass', icon: 'bi-list-check', color: '#ea580c' },
  abstract_quotations: { label: 'Abstract of Quotations', icon: 'bi-clipboard2-check', color: '#f59e0b' },
  purchase_order: { label: 'Purchase Order', icon: 'bi-bag-check', color: '#4338ca' },
  inspection_acceptance: { label: 'Inspection & Acceptance Report', icon: 'bi-clipboard2-pulse', color: '#059669' },
  notice_of_award: { label: 'Notice of Award', icon: 'bi-award', color: '#be185d' },
  disbursement_voucher: { label: 'Disbursement Voucher', icon: 'bi-receipt', color: '#0284c7' },
};

// SK-specific report types (Cashbook / DV / Abstract of Quotations style)
const SK_REPORT_TYPES = {
  sk_cashbook: { label: 'SK Cashbook', icon: 'bi-journal-text', color: '#1a3a6b' },
  sk_disbursement_voucher: { label: 'SK Disbursement Voucher', icon: 'bi-receipt', color: '#0284c7' },
  sk_abstract_quotations: { label: 'SK Abstract of Quotations', icon: 'bi-cart3', color: '#f59e0b' },
  sk_liquidation_report: { label: 'SK Liquidation Report', icon: 'bi-file-earmark-text', color: '#7c3aed' },
  sk_financial_statement: { label: 'SK Financial Statement', icon: 'bi-bank', color: '#dc2626' },
};

function safeParseFloat(val) {
  const parsed = parseFloat(String(val || '').replace(/,/g, ''));
  return isNaN(parsed) ? 0 : parsed;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function checkPageBreak(doc, currentY, requiredSpace = 10, startY = 20) {
  const pageHeight = doc.internal.pageSize.height || 297;
  if (currentY + requiredSpace > pageHeight - 15) {
    doc.addPage();
    return startY;
  }
  return currentY;
}

function parseReportItems(items) {
  const lines = (items || '').split('\n').filter(line => line.trim());
  let total = 0;
  const parsed = lines.map(line => {
    const parts = parseCSVLine(line);
    const [qty, unit, desc, unitCost] = parts;
    const amt = safeParseFloat(qty) * safeParseFloat(unitCost);
    total += amt;
    return { qty, unit, desc, unitCost, amt };
  });
  return { lines: parsed, total };
}

// ─── PERIOD RANGE HELPERS (Daily → Monthly → Yearly automation) ──
// Given a periodType (daily|monthly|quarterly|yearly|custom) plus a
// reference date / year / quarter / custom range, compute {from, to, label}
// as ISO date strings (inclusive) for filtering financial records.
const PERIOD_TYPES = {
  daily: { label: 'Daily Report' },
  monthly: { label: 'Monthly Report' },
  quarterly: { label: 'Quarterly Report' },
  yearly: { label: 'Yearly / Annual Report' },
  custom: { label: 'Custom Range' },
};

function pad2(n) { return String(n).padStart(2, '0'); }

function formatCurrencyPDF(amount) {
  return 'Php ' + Number(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function drawSeal(doc, cx, cy, r, label) {
  doc.setDrawColor(26, 58, 107);
  doc.setFillColor(255, 255, 255);
  doc.setLineWidth(0.6);
  doc.circle(cx, cy, r, 'FD');
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(0.3);
  doc.circle(cx, cy, r - 1.5, 'S');
  doc.setFont(undefined, 'bold');
  doc.setFontSize(r > 9 ? 7 : 6);
  doc.setTextColor(26, 58, 107);
  const lines = doc.splitTextToSize(label, r * 1.6);
  const lineH = 3;
  let ty = cy - ((lines.length - 1) * lineH) / 2 + 1;
  lines.forEach(line => { doc.text(line, cx, ty, { align: 'center' }); ty += lineH; });
  doc.setTextColor(0);
  doc.setFont(undefined, 'normal');
}

function computePeriodRange(periodType, opts = {}) {
  const now = new Date();
  let from, to, label;

  switch (periodType) {
    case 'daily': {
      const d = opts.date || today();
      from = d; to = d;
      label = formatDate(d);
      break;
    }
    case 'monthly': {
      const month = opts.month || `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`; // YYYY-MM
      const [y, m] = month.split('-').map(Number);
      const last = new Date(y, m, 0).getDate();
      from = `${y}-${pad2(m)}-01`;
      to = `${y}-${pad2(m)}-${pad2(last)}`;
      label = new Date(y, m - 1, 1).toLocaleDateString('en-PH', { year: 'numeric', month: 'long' });
      break;
    }
    case 'quarterly': {
      const year = opts.year || now.getFullYear();
      const q = opts.quarter || Math.floor(now.getMonth() / 3) + 1;
      const startMonth = (q - 1) * 3 + 1;
      const endMonth = startMonth + 2;
      const last = new Date(year, endMonth, 0).getDate();
      from = `${year}-${pad2(startMonth)}-01`;
      to = `${year}-${pad2(endMonth)}-${pad2(last)}`;
      const qNames = { 1: 'January - March', 2: 'April - June', 3: 'July - September', 4: 'October - December' };
      label = `Q${q} ${year} (${qNames[q]})`;
      break;
    }
    case 'yearly': {
      const year = opts.year || now.getFullYear();
      from = `${year}-01-01`;
      to = `${year}-12-31`;
      label = `January 1 - December 31, ${year}`;
      break;
    }
    case 'custom':
    default: {
      from = opts.from || `${now.getFullYear()}-01-01`;
      to = opts.to || today();
      label = `${formatDate(from)} - ${formatDate(to)}`;
      break;
    }
  }
  return { from, to, label, periodType: periodType || 'custom' };
}

// ─── DATA HELPERS (Treasurer vs SK, period-filtered) ─────
// module: 'treasurer' (income/expenses) or 'sk' (sk_income/sk_expenses)
function getModuleTables(module) {
  return module === 'sk'
    ? { incomeKey: 'sk_income', expenseKey: 'sk_expenses' }
    : { incomeKey: 'income', expenseKey: 'expenses' };
}

// Records strictly within [from, to] inclusive, for the given barangay.
async function getPeriodIncome(module, barangayId, from, to) {
  const { incomeKey } = getModuleTables(module);
  const data = await DB.filter(incomeKey, { barangayId });
  return data
    .filter(i => (!from || i.dateReceived >= from) && (!to || i.dateReceived <= to))
    .sort((a, b) => a.dateReceived.localeCompare(b.dateReceived));
}
async function getPeriodExpenses(module, barangayId, from, to, opts = {}) {
  const { expenseKey } = getModuleTables(module);
  const data = await DB.filter(expenseKey, { barangayId });
  return data
    .filter(e => (!from || e.dateSpent >= from) && (!to || e.dateSpent <= to) && (!opts.approvedOnly || e.status === 'approved'))
    .sort((a, b) => a.dateSpent.localeCompare(b.dateSpent));
}
// Beginning balance = all approved income/expenses BEFORE the period start.
async function getBeginningBalance(module, barangayId, from) {
  const { incomeKey, expenseKey } = getModuleTables(module);
  const allInc = await DB.filter(incomeKey, { barangayId });
  const allExp = await DB.filter(expenseKey, { barangayId });
  
  const incBefore = allInc.filter(i => i.status === 'approved' && i.dateReceived < from);
  const expBefore = allExp.filter(e => e.status === 'approved' && e.dateSpent < from);

  const totalIncBefore = incBefore.reduce((sum, i) => sum + i.amount, 0);
  const totalExpBefore = expBefore.reduce((sum, e) => sum + e.amount, 0);
  return totalIncBefore - totalExpBefore;
}

// Render a Fund Status / Budget Utilization view into a container.
// Usage: renderFundStatusReport('treasurer', barangayId, 'my-container-id');
async function renderFundStatusReport(module, barangayId, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const totalIncome = await DB.getTotalIncome(barangayId);
  const totalExpenses = await DB.getTotalExpenses(barangayId);
  const netBalance = await DB.getNetBalance(barangayId);
  const budget = await DB.getCurrentBudget(barangayId) || {
    totalBudget: totalIncome,
    allocatedAmount: 0,
    remainingAmount: Math.max(totalIncome - totalExpenses, 0),
  };
  const utilPct = budget.totalBudget > 0 ? ((totalExpenses / budget.totalBudget) * 100).toFixed(1) : 0;

  container.innerHTML = `
    <div class="stats-grid" style="margin-bottom:1.5rem;">
      <div class="card stat-card"><div class="card-body" style="display:flex;align-items:center;gap:14px;">
        <div class="stat-icon navy"><i class="bi bi-bank2"></i></div>
        <div><div class="stat-label">Total Budget</div><div class="stat-value" id="${containerId}-total-budget">${formatCurrency(budget.totalBudget)}</div></div>
      </div></div>
      <div class="card stat-card"><div class="card-body" style="display:flex;align-items:center;gap:14px;">
        <div class="stat-icon green"><i class="bi bi-arrow-down-circle"></i></div>
        <div><div class="stat-label">Total Income</div><div class="stat-value" id="${containerId}-fund-income">${formatCurrency(totalIncome)}</div></div>
      </div></div>
      <div class="card stat-card"><div class="card-body" style="display:flex;align-items:center;gap:14px;">
        <div class="stat-icon red"><i class="bi bi-arrow-up-circle"></i></div>
        <div><div class="stat-label">Total Expenses</div><div class="stat-value" id="${containerId}-fund-expenses">${formatCurrency(totalExpenses)}</div></div>
      </div></div>
      <div class="card stat-card"><div class="card-body" style="display:flex;align-items:center;gap:14px;">
        <div class="stat-icon amber"><i class="bi bi-wallet2"></i></div>
        <div><div class="stat-label">Net Balance</div><div class="stat-value" id="${containerId}-fund-balance">${formatCurrency(netBalance)}</div></div>
      </div></div>
    </div>

    <div class="card section-gap">
      <div class="card-header"><div class="card-title">Budget Utilization</div></div>
      <div class="card-body">
        <div style="display:flex;justify-content:space-between;margin-bottom:.5rem;">
          <span style="font-size:.85rem;font-weight:600;color:#1e293b;">Expenses vs Budget</span>
          <span id="${containerId}-utilization-pct" style="font-weight:700;color:#1a3a6b;">${utilPct}%</span>
        </div>
        <div class="progress-bar-wrap" style="height:14px;margin-bottom:1rem;">
          <div class="progress-bar-fill" id="${containerId}-budget-bar" style="width:${Math.min(utilPct, 100)}%;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:.8rem;color:#64748b;">
          <span>Used: <strong id="${containerId}-bar-used">${formatCurrency(totalExpenses)}</strong></span>
          <span>Remaining: <strong id="${containerId}-bar-remaining" style="color:#16a34a;">${formatCurrency(budget.totalBudget - totalExpenses)}</strong></span>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;">
      <div class="card"><div class="card-header"><div class="card-title">Monthly Income Trend</div></div>
        <div class="card-body"><canvas id="${containerId}-incomeChart" height="200"></canvas></div></div>
      <div class="card"><div class="card-header"><div class="card-title">Expenses by Category</div></div>
        <div class="card-body"><canvas id="${containerId}-expCatChart" height="200"></canvas></div></div>
    </div>

    <div class="card"><div class="card-header"><div class="card-title">Fund Allocations</div></div>
      <div class="table-wrapper"><table><thead><tr><th>Fund Category</th><th>Allocated Amount</th><th>Utilized Amount</th><th>Remaining</th><th>Utilization %</th><th>Status</th></tr></thead>
      <tbody id="${containerId}-fund-tbody"></tbody></table></div></div>
  `;

  // Populate allocations
  const allocs = [
    { cat: 'Personnel Services (PS)', pct: 0.40 },
    { cat: 'Maintenance & Other Operating Expenses (MOOE)', pct: 0.35 },
    { cat: 'Capital Outlay (CO)', pct: 0.15 },
    { cat: 'Social Services & Development', pct: 0.10 },
  ];
  const allExpenses = await DB.filter('expenses', { barangayId });
  const expenses = allExpenses.filter(e => e.status !== 'rejected');
  const expByCat = {};
  expenses.forEach(e => { expByCat[e.category] = (expByCat[e.category] || 0) + e.amount; });
  const tbody = document.getElementById(`${containerId}-fund-tbody`);
  if (tbody) {
    tbody.innerHTML = allocs.map(a => {
      const allocated = budget.totalBudget * a.pct;
      const catExp = expByCat[a.cat] || 0;
      const remaining = allocated - catExp;
      const pct = allocated > 0 ? ((catExp / allocated) * 100).toFixed(1) : '0.0';
      const status = pct > 90 ? 'Critical' : pct > 70 ? 'Warning' : 'Normal';
      const badgeCls = pct > 90 ? 'badge-danger' : pct > 70 ? 'badge-warning' : 'badge-success';
      return `<tr>
        <td style="font-weight:600;">${a.cat}</td>
        <td>${formatCurrency(allocated)}</td>
        <td style="color:#dc2626;font-weight:600;">${formatCurrency(catExp)}</td>
        <td style="color:#16a34a;font-weight:600;">${formatCurrency(remaining)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="progress-bar-wrap" style="flex:1;height:6px;"><div class="progress-bar-fill" style="width:${pct}%;"></div></div>
            <span style="font-size:.8rem;font-weight:600;width:40px;text-align:right;">${pct}%</span>
          </div>
        </td>
        <td><span class="badge ${badgeCls}">${status}</span></td>
      </tr>`;
    }).join('');
  }

  // Charts
  try {
    const allIncome = await DB.filter('income', { barangayId });
    const incomeRecords = allIncome.filter(i => i.status !== 'rejected');
    const monthlyIncome = [0, 0, 0, 0, 0, 0];
    incomeRecords.forEach(i => { const m = new Date(i.dateReceived).getMonth(); if (m >= 0 && m < 6) monthlyIncome[m] += i.amount; });
    new Chart(document.getElementById(`${containerId}-incomeChart`), { type: 'line', data: { labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], datasets: [{ label: 'Income', data: monthlyIncome, borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,.1)', fill: true, tension: .4 }] }, options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } });

    const catTotals = {};
    expenses.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + e.amount; });
    new Chart(document.getElementById(`${containerId}-expCatChart`), { type: 'bar', data: { labels: Object.keys(catTotals), datasets: [{ data: Object.values(catTotals), backgroundColor: ['#1a3a6b', '#16a34a', '#0284c7', '#f59e0b', '#dc2626'], borderRadius: 6 }] }, options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } });
  } catch (e) { console.warn('Chart render skipped:', e); }
}


// ─── REPORT FORM FIELDS ──────────────────────────────────
const REPORT_FIELDS = {
  // ── TREASURER: BFDP/BFR Official Annexes ──
  bfr1_daily_collections: [
    { id: 'periodType', label: 'Report Frequency', type: 'select', options: PERIOD_TYPES, required: true },
    { id: 'period', label: 'Reporting Period', type: 'text', placeholder: 'Auto-filled based on Report Frequency', required: true, auto: true },
    { id: 'preparedBy', label: 'Prepared By (Barangay Treasurer)', type: 'text', required: true },
    { id: 'approvedBy', label: 'Noted By (Punong Barangay)', type: 'text', required: true },
  ],
  bfr2_income_expenditure: [
    { id: 'fiscalYear', label: 'Fiscal Year (Past Year)', type: 'text', placeholder: 'e.g. 2026', required: true },
    { id: 'beginningBalanceOverride', label: 'Beginning Balance (leave blank to auto-compute)', type: 'number', placeholder: 'Auto-computed if blank', required: false },
    { id: 'preparedBy', label: 'Prepared By (Barangay Treasurer)', type: 'text', required: true },
    { id: 'certifiedBy', label: 'Certified By (City/Municipal Accountant)', type: 'text', required: true },
    { id: 'approvedBy', label: 'Approved By (Punong Barangay)', type: 'text', required: true },
  ],
  bfr3_nta_component: [
    { id: 'fiscalYear', label: 'Fiscal Year', type: 'text', placeholder: 'e.g. 2026', required: true },
    { id: 'totalNTA', label: 'Total NTA for FY (₱)', type: 'number', placeholder: '0.00', required: true },
    { id: 'projects', label: 'Priority Projects (one per line: Description, Project Cost)', type: 'textarea', placeholder: 'Purchase of Dump-Truck, 2731489.60', required: true },
    { id: 'preparedBy', label: 'Prepared By (Barangay Treasurer)', type: 'text', required: true },
    { id: 'approvedBy', label: 'Approved By (Punong Barangay)', type: 'text', required: true },
  ],
  bfr4_procurement_plan: [
    { id: 'fiscalYear', label: 'Fiscal Year', type: 'text', placeholder: 'e.g. 2026', required: true },
    { id: 'programControlNo', label: 'Program Control No.', type: 'text', placeholder: 'e.g. 2026-01-01', required: true },
    { id: 'dateSubmitted', label: 'Date Submitted', type: 'date', required: true },
    { id: 'items', label: 'Items (one per line: Description, Total Cost, Quarter[1-4])', type: 'textarea', placeholder: 'Motorcycle with Sidecar, 130000, 2', required: true },
    { id: 'preparedBy', label: 'Prepared By (Barangay Treasurer)', type: 'text', required: true },
    { id: 'approvedBy', label: 'Approved By (Punong Barangay)', type: 'text', required: true },
  ],
  bfr5_notice_of_award: [
    { id: 'quarter', label: 'Quarter', type: 'select', options: { '1st': { label: '1st Quarter' }, '2nd': { label: '2nd Quarter' }, '3rd': { label: '3rd Quarter' }, '4th': { label: '4th Quarter' } }, required: true },
    { id: 'fiscalYear', label: 'Fiscal Year', type: 'text', placeholder: 'e.g. 2026', required: true },
    { id: 'awards', label: 'Awards (one per line: Date, Project Name, Type[Infrastructure/Goods/Service], Supplier, Amount, Remarks)', type: 'textarea', placeholder: '10/27/25, Rehabilitation of Welcome Arch, Infrastructure, Bhenllabien Builders Corp, 299500, ', required: true },
    { id: 'preparedBy', label: 'Prepared By (Barangay Treasurer)', type: 'text', required: true },
    { id: 'approvedBy', label: 'Approved By (Punong Barangay)', type: 'text', required: true },
  ],
  bfr6_monthly_collections: [
    { id: 'periodType', label: 'Report Frequency', type: 'select', options: PERIOD_TYPES, required: true },
    { id: 'period', label: 'Reporting Period', type: 'text', placeholder: 'Auto-filled based on Report Frequency', required: true, auto: true },
    { id: 'preparedBy', label: 'Prepared By (Barangay Treasurer)', type: 'text', required: true },
    { id: 'approvedBy', label: 'Noted By (Punong Barangay)', type: 'text', required: true },
  ],
  bfr7_statement_receipts: [
    { id: 'cityCode', label: 'City Code', type: 'text', required: false },
    { id: 'barangayCode', label: 'Barangay Code', type: 'text', required: false },
    { id: 'currentFY', label: 'Actual Year (FY)', type: 'text', placeholder: 'e.g. 2025', required: true },
    { id: 'budgetFY', label: 'Budget Year', type: 'text', placeholder: 'e.g. 2026', required: true },
    { id: 'preparedBy', label: 'Prepared By (Barangay Treasurer)', type: 'text', required: true },
    { id: 'approvedBy', label: 'Approved By (Punong Barangay)', type: 'text', required: true },
  ],

  // ── PROCUREMENT DOCUMENTS (Purchase Request → Payment cycle) ──
  purchase_request: [
    { id: 'prNumber', label: 'P.R. No.', type: 'text', placeholder: 'e.g. 2026-01', required: true },
    { id: 'prDate', label: 'Date', type: 'date', required: true },
    { id: 'items', label: 'Items (one per line: Qty, Unit, Description, Unit Cost)', type: 'textarea', placeholder: '1, unit, Printer, 8500', required: true },
    { id: 'purpose', label: 'Purpose', type: 'textarea', placeholder: 'To use for printing', required: true },
    { id: 'requestedBy', label: 'Requested By', type: 'text', required: true },
    { id: 'approvedBy', label: 'Approved By (Chairperson/Punong Barangay)', type: 'text', required: true },
  ],
  canvass: [
    { id: 'canvassNumber', label: 'Canvass No.', type: 'text', placeholder: 'e.g. 2026-01', required: false },
    { id: 'canvassDate', label: 'Date', type: 'date', required: true },
    { id: 'suppliers', label: 'Suppliers Canvassed (one per line)', type: 'textarea', placeholder: 'COLORS\' GIFT SHOP\nZENY\'S MERCHANDISE\nPANDAYAN BOOKSTORE', required: true },
    { id: 'items', label: 'Items (one per line: Qty, Description, Amount Supplier1, Amount Supplier2, Amount Supplier3)', type: 'textarea', placeholder: '1, Printer, 8500, 8700, 8600', required: true },
    { id: 'canvassedBy', label: 'Canvassed By', type: 'text', required: true },
    { id: 'approvedBy', label: 'Noted By (Chairperson/Punong Barangay)', type: 'text', required: true },
  ],
  abstract_quotations: [
    { id: 'implementingOffice', label: 'Implementing Office', type: 'text', placeholder: 'e.g. Barangay Paule 1', required: true },
    { id: 'aqDate', label: 'Date', type: 'date', required: true },
    { id: 'modeOfProcurement', label: 'Mode of Procurement', type: 'text', placeholder: 'e.g. Negotiated Purchase (Small Value Procurement)', required: true },
    { id: 'suppliers', label: 'Suppliers (one per line: Name)', type: 'textarea', placeholder: 'COLORS\' GIFT SHOP\nZENY\'S MERCHANDISE\nPANDAYAN BOOKSTORE', required: true },
    { id: 'items', label: 'Items (one per line: Qty, Description, Amount Supplier1, Amount Supplier2, Amount Supplier3)', type: 'textarea', placeholder: '1, Aircon 1.5HP, 32000, 33500, 32750', required: true },
    { id: 'skCouncilors', label: 'BAC Members (one per line, up to 5 — treasurer/secretariat listed separately below)', type: 'textarea', placeholder: 'Name 1\nName 2\nName 3', required: true },
    { id: 'skTreasurer', label: 'Prepared By (BAC Secretariat)', type: 'text', required: true },
    { id: 'skChairperson', label: 'Approved By (BAC Chairperson)', type: 'text', required: true },
  ],
  purchase_order: [
    { id: 'poNumber', label: 'P.O. No.', type: 'text', placeholder: 'e.g. 2026-01', required: true },
    { id: 'poDate', label: 'Date', type: 'date', required: true },
    { id: 'supplier', label: 'Supplier', type: 'text', required: true },
    { id: 'supplierAddress', label: 'Supplier Address', type: 'text', required: false },
    { id: 'tin', label: 'TIN', type: 'text', required: false },
    { id: 'items', label: 'Items (one per line: Qty, Unit, Description, Unit Cost)', type: 'textarea', placeholder: '1, unit, Aircon 1.5HP, 32000', required: true },
    { id: 'deliveryTerm', label: 'Delivery Term', type: 'text', placeholder: 'e.g. 15 days upon receipt of PO', required: false },
    { id: 'paymentTerm', label: 'Payment Term', type: 'text', placeholder: 'e.g. Upon delivery and inspection', required: false },
    { id: 'preparedBy', label: 'Prepared By (Barangay Treasurer)', type: 'text', required: true },
    { id: 'approvedBy', label: 'Approved By (Punong Barangay)', type: 'text', required: true },
  ],
  inspection_acceptance: [
    { id: 'supplier', label: 'Supplier', type: 'text', required: true },
    { id: 'poNumber', label: 'P.O. No.', type: 'text', required: true },
    { id: 'poDate', label: 'P.O. Date', type: 'date', required: true },
    { id: 'invoiceNumber', label: 'Invoice No.', type: 'text', required: false },
    { id: 'iarDate', label: 'Invoice Date', type: 'date', required: true },
    { id: 'orNumber', label: 'O.R. No.', type: 'text', required: false },
    { id: 'items', label: 'Items (one per line: Quantity, Unit, Description)', type: 'textarea', placeholder: '2, set, Airconditioner Window Type 1HP', required: true },
    { id: 'dateInspected', label: 'Date Inspected / Received', type: 'date', required: true },
    { id: 'acceptanceStatus', label: 'Acceptance Status', type: 'select', options: { complete: { label: 'Complete' }, partial: { label: 'Partial' } }, required: true },
    { id: 'inspectedBy', label: 'Inspected By (Authorized Inspector)', type: 'text', required: true },
    { id: 'receivedBy', label: 'Received By (Barangay Treasurer)', type: 'text', required: true },
  ],
  notice_of_award: [
    { id: 'noaNumber', label: 'NOA No.', type: 'text', placeholder: 'e.g. 2026-01', required: true },
    { id: 'noaDate', label: 'Date', type: 'date', required: true },
    { id: 'supplier', label: 'Awarded Supplier', type: 'text', required: true },
    { id: 'supplierAddress', label: 'Supplier Address', type: 'text', required: false },
    { id: 'projectTitle', label: 'Project / Item Description', type: 'text', required: true },
    { id: 'amount', label: 'Contract Amount (₱)', type: 'number', placeholder: '0.00', required: true },
    { id: 'modeOfProcurement', label: 'Mode of Procurement', type: 'text', placeholder: 'e.g. Negotiated Purchase (Small Value Procurement)', required: true },
    { id: 'preparedBy', label: 'Prepared By (BAC Secretariat)', type: 'text', required: true },
    { id: 'approvedBy', label: 'Approved By (BAC Chairperson/Punong Barangay)', type: 'text', required: true },
  ],
  disbursement_voucher: [
    { id: 'dvNumber', label: 'DV No.', type: 'text', placeholder: 'e.g. 2026-06-01', required: true },
    { id: 'dvDate', label: 'Date', type: 'date', required: true },
    { id: 'payee', label: 'Payee', type: 'text', placeholder: 'Name of payee', required: true },
    { id: 'payeeAddress', label: 'Address', type: 'text', placeholder: 'Address of payee', required: false },
    { id: 'tin', label: 'TIN', type: 'text', placeholder: 'TIN (if applicable)', required: false },
    { id: 'particular', label: 'Particulars', type: 'textarea', placeholder: 'Payment for...', required: true },
    { id: 'amount', label: 'Amount (₱)', type: 'number', placeholder: '0.00', required: true },
    { id: 'nonVat', label: '3% Non-VAT (₱, optional)', type: 'number', placeholder: '0.00', required: false },
    { id: 'withholdingTax', label: '1% Withholding Tax (₱, optional)', type: 'number', placeholder: '0.00', required: false },
    { id: 'checkNo', label: 'Check No.', type: 'text', required: false },
    { id: 'bankName', label: 'Bank Name', type: 'text', placeholder: 'e.g. LAND BANK', required: false },
    { id: 'bankBranch', label: 'Bank Branch', type: 'text', required: false },
    { id: 'budgetOfficer', label: 'Budget Monitoring Officer', type: 'text', required: true },
    { id: 'skTreasurer', label: 'Barangay Treasurer', type: 'text', required: true },
    { id: 'skChairperson', label: 'Punong Barangay', type: 'text', required: true },
  ],

  // ── SK: Cashbook / DV / Abstract of Quotations / Liquidation / Financial Statement ──
  sk_cashbook: [
    { id: 'periodType', label: 'Report Frequency', type: 'select', options: PERIOD_TYPES, required: true },
    { id: 'period', label: 'Reporting Period', type: 'text', placeholder: 'Auto-filled based on Report Frequency', required: true, auto: true },
    { id: 'skTreasurer', label: 'SK Treasurer (Name & Signature)', type: 'text', required: true },
  ],
  sk_disbursement_voucher: [
    { id: 'dvNumber', label: 'DV No.', type: 'text', placeholder: 'e.g. 2026-06-01', required: true },
    { id: 'dvDate', label: 'Date', type: 'date', required: true },
    { id: 'payee', label: 'Payee', type: 'text', placeholder: 'Name of payee', required: true },
    { id: 'payeeAddress', label: 'Address', type: 'text', placeholder: 'Address of payee', required: false },
    { id: 'tin', label: 'TIN', type: 'text', placeholder: 'TIN (if applicable)', required: false },
    { id: 'particular', label: 'Particulars', type: 'textarea', placeholder: 'Payment for...', required: true },
    { id: 'amount', label: 'Amount (₱)', type: 'number', placeholder: '0.00', required: true },
    { id: 'nonVat', label: '3% Non-VAT (₱, optional)', type: 'number', placeholder: '0.00', required: false },
    { id: 'withholdingTax', label: '1% Withholding Tax (₱, optional)', type: 'number', placeholder: '0.00', required: false },
    { id: 'checkNo', label: 'Check No.', type: 'text', required: false },
    { id: 'bankName', label: 'Bank Name', type: 'text', placeholder: 'e.g. LAND BANK', required: false },
    { id: 'bankBranch', label: 'Bank Branch', type: 'text', required: false },
    { id: 'budgetOfficer', label: 'Budget Monitoring Officer', type: 'text', required: true },
    { id: 'skTreasurer', label: 'SK Treasurer', type: 'text', required: true },
    { id: 'skChairperson', label: 'SK Chairperson', type: 'text', required: true },
  ],
  sk_abstract_quotations: [
    { id: 'implementingOffice', label: 'Implementing Office', type: 'text', placeholder: 'e.g. SK Paule 1', required: true },
    { id: 'aqDate', label: 'Date', type: 'date', required: true },
    { id: 'modeOfProcurement', label: 'Mode of Procurement', type: 'text', placeholder: 'e.g. Negotiated Purchase', required: true },
    { id: 'suppliers', label: 'Suppliers (one per line: Name)', type: 'textarea', placeholder: 'COLORS\' GIFT SHOP\nZENY\'S MERCHANDISE\nPANDAYAN BOOKSTORE', required: true },
    { id: 'items', label: 'Items (one per line: Qty, Description, Amount Supplier1, Amount Supplier2, Amount Supplier3)', type: 'textarea', placeholder: '25, UV Umbrella, 5000, 5500, 5250', required: true },
    { id: 'skCouncilors', label: 'SK Councilors (one per line, up to 5 — SK Treasurer listed separately below)', type: 'textarea', placeholder: 'Name 1\nName 2\nName 3', required: true },
    { id: 'skTreasurer', label: 'SK Treasurer', type: 'text', required: true },
    { id: 'skChairperson', label: 'SK Chairperson', type: 'text', required: true },
  ],
  sk_liquidation_report: [
    { id: 'periodType', label: 'Report Frequency', type: 'select', options: PERIOD_TYPES, required: true },
    { id: 'period', label: 'Period Covered', type: 'text', placeholder: 'Auto-filled based on Report Frequency', required: true, auto: true },
    { id: 'fundSource', label: 'Fund Source', type: 'text', placeholder: 'e.g. SK Fund', required: true },
    { id: 'preparedBy', label: 'Prepared By (SK Treasurer)', type: 'text', required: true },
    { id: 'approvedBy', label: 'Approved By (SK Chairperson)', type: 'text', required: true },
    { id: 'notes', label: 'Remarks', type: 'textarea', required: false },
  ],
  sk_financial_statement: [
    { id: 'periodType', label: 'Report Frequency', type: 'select', options: PERIOD_TYPES, required: true },
    { id: 'period', label: 'Period Covered', type: 'text', placeholder: 'Auto-filled based on Report Frequency', required: true, auto: true },
    { id: 'preparedBy', label: 'Prepared By (SK Treasurer)', type: 'text', required: true },
    { id: 'approvedBy', label: 'Approved By (SK Chairperson)', type: 'text', required: true },
  ],
  fund_status: [
    { id: 'preparedBy', label: 'Prepared By (Treasurer)', type: 'text', required: true },
    { id: 'approvedBy', label: 'Approved By (Punong Barangay / SK Chairperson)', type: 'text', required: true },
  ],
};

// ─── GENERATE REPORT PDF ─────────────────────────────────
async function generateReport(reportType, formData, barangayId, module = 'treasurer') {
  return new Promise((resolve, reject) => {
    loadJsPDF(async () => {
      try {
        if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('jsPDF library unavailable');
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const brgy = await DB.getBarangay(barangayId) || { name: 'Unknown', municipality: 'Unknown', province: 'Laguna' };

        // BFMSS tag top-right corner
        doc.setFontSize(7); doc.setTextColor(150); doc.setFont(undefined, 'normal');
        doc.text('Generated via BFMSS', 196, 8, { align: 'right' });
        doc.setTextColor(0, 0, 0);

        // Logo size and position
        const logoSize = 22; // mm
        const logoY = 8;
        const textCenterX = 105;

        const leftCx = 14 + logoSize / 2;
        const rightCx = 196 - 14 - logoSize / 2;
        const sealCy = logoY + logoSize / 2;
        const sealR = logoSize / 2;

        drawSeal(doc, leftCx, sealCy, sealR, 'REPUBLIC OF THE PHILIPPINES');
        if (module === 'sk') {
          drawSeal(doc, rightCx, sealCy, sealR, 'SANGGUNIANG KABATAAN');
        } else {
          drawSeal(doc, rightCx, sealCy, sealR, 'REPUBLIC OF THE PHILIPPINES');
        }

        // Text header — centered between logos
        let hy = 11;
        doc.setFontSize(9.5); doc.setFont(undefined, 'normal');
        doc.text('Republic of the Philippines', textCenterX, hy, { align: 'center' }); hy += 4.5;
        if (brgy.region) { doc.setFontSize(8.5); doc.text(brgy.region, textCenterX, hy, { align: 'center' }); hy += 4.5; doc.setFontSize(9.5); }
        doc.text(`Province of ${brgy.province || ''}`, textCenterX, hy, { align: 'center' }); hy += 4.5;
        doc.text(`Municipality/City of ${brgy.municipality || ''}`, textCenterX, hy, { align: 'center' }); hy += 4.5;
        doc.setFont(undefined, 'bold'); doc.setFontSize(10.5);
        doc.text(`Barangay ${brgy.name || ''}`, textCenterX, hy, { align: 'center' });

        // Push hy past the logo height if text is shorter
        hy = Math.max(hy + 5, logoY + logoSize + 4);

        // Auto-fill signature defaults from barangay officials
        if (brgy.treasurer && !formData.preparedBy && !formData.certifiedBy && !formData.skTreasurer) {
          formData._autoTreasurer = brgy.treasurer;
        }
        if (brgy.punongBarangay && !formData.approvedBy) {
          formData._autoPunong = brgy.punongBarangay;
        }
        if (brgy.skChairperson && !formData.skChairperson) {
          formData._autoSKChair = brgy.skChairperson;
        }

        if (module === 'sk') {
          doc.setFont(undefined, 'bold'); doc.setFontSize(11);
          doc.text('SANGGUNIANG KABATAAN', textCenterX, hy, { align: 'center' });
          hy += 6;
        }

        // Report title
        doc.setFont(undefined, 'bold'); doc.setFontSize(12);
        const allTypes = { ...REPORT_TYPES, ...SK_REPORT_TYPES };
        const titleLabel = allTypes[reportType]?.label?.toUpperCase()
          .replace(/^BFR-\d+:\s*/i, '').replace(/^SK\s+/i, '') || 'FINANCIAL REPORT';
        const titleLines = doc.splitTextToSize(titleLabel, 160);
        titleLines.forEach(line => { doc.text(line, textCenterX, hy, { align: 'center' }); hy += 6; });

        // Divider line
        doc.setFont(undefined, 'normal'); doc.setLineWidth(0.5);
        doc.setDrawColor(26, 58, 107);
        doc.line(14, hy + 1, 196, hy + 1);
        doc.setLineWidth(0.2); doc.line(14, hy + 2.5, 196, hy + 2.5);
        doc.setDrawColor(0);

        let y = hy + 9;

        const reportGenerators = {
          // Treasurer — official BFDP/BFR annexes
          bfr1_daily_collections: () => generateBFR6(doc, formData, brgy, y, module),
          bfr2_income_expenditure: () => generateBFR2(doc, formData, brgy, y),
          bfr3_nta_component: () => generateBFR3(doc, formData, brgy, y),
          bfr4_procurement_plan: () => generateBFR4(doc, formData, brgy, y),
          bfr5_notice_of_award: () => generateBFR5(doc, formData, brgy, y),
          bfr6_monthly_collections: () => generateBFR6(doc, formData, brgy, y, module),
          bfr7_statement_receipts: () => generateBFR7(doc, formData, brgy, y),
          // Procurement documents
          purchase_request: () => generatePurchaseRequest(doc, formData, brgy, y),
          canvass: () => generateCanvass(doc, formData, brgy, y),
          abstract_quotations: () => generateAbstractQuotations(doc, formData, brgy, y, { members: 'BAC Member', treasurer: 'Prepared By', chair: 'Approved By' }),
          purchase_order: () => generatePurchaseOrder(doc, formData, brgy, y),
          inspection_acceptance: () => generateInspectionAcceptance(doc, formData, brgy, y),
          notice_of_award: () => generateNoticeOfAward(doc, formData, brgy, y),
          disbursement_voucher: () => generateDisbursementVoucher(doc, formData, brgy, y, { officer: 'Budget Monitoring Officer', mid: 'Barangay Treasurer', chair: 'Punong Barangay', orgLabel: 'Barangay' }),
          // SK — Cashbook / DV / Abstract of Quotations style
          sk_cashbook: () => generateBFR6(doc, formData, brgy, y, module),
          sk_disbursement_voucher: () => generateDisbursementVoucher(doc, formData, brgy, y, { officer: 'Budget Monitoring Officer', mid: 'SK Treasurer', chair: 'SK Chairperson', orgLabel: 'SK of Barangay' }),
          sk_abstract_quotations: () => generateAbstractQuotations(doc, formData, brgy, y, { members: 'SK Councilor', treasurer: 'SK Treasurer', chair: 'SK Chairperson' }),
          sk_liquidation_report: () => generateLiquidationReport(doc, formData, brgy, y, 'sk'),
          sk_financial_statement: async () => await generateFinancialStatement(doc, formData, brgy, y, 'sk'),
          fund_status: async () => await generateFundStatusPDF(doc, formData, brgy, y, module),
        };

        if (reportGenerators[reportType]) {
          await reportGenerators[reportType]();
        } else {
          doc.text('Report content not available.', 20, y);
        }

        // Footer
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          doc.setFontSize(8);
          doc.setTextColor(100);
          doc.text(`Generated on ${new Date().toLocaleString('en-PH')} | BFMSS`, 105, 290, { align: 'center' });
          doc.text(`Page ${i} of ${pageCount}`, 195, 290, { align: 'right' });
        }

        resolve(doc);
      } catch (err) { reject(err); }
    });
  });
}

// ════════════════════════════════════════════════════════
// OFFICIAL BFDP/BFR ANNEXES (Treasurer) — exact column layout
// based on DBM Budget Operations Manual for Barangays &
// DBM-DILG-DOF Joint Memorandum Circular No. 2018-1 forms
// ════════════════════════════════════════════════════════

function drawTableHeaderRow(doc, y, cols, fillColor = [232, 240, 251], textColor = [0, 0, 0]) {
  doc.setFillColor(...fillColor); doc.rect(14, y, 182, 7, 'F');
  doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.setTextColor(...textColor);
  cols.forEach(c => doc.text(c.label, c.x, y + 5, { align: c.align || 'left' }));
  doc.setTextColor(0);
  return y + 7;
}

// ── Fund Status & Budget Utilization — internal BFMSS summary report ──
async function generateFundStatusPDF(doc, fd, brgy, y, module = 'treasurer') {
  doc.setFontSize(11); doc.setFont(undefined, 'bold');
  doc.text('FUND STATUS & BUDGET UTILIZATION', 105, y, { align: 'center' }); y += 5;
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  doc.text(`As of ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}`, 105, y, { align: 'center' }); y += 9;

  const totalIncome = await DB.getTotalIncome(brgy.id);
  const totalExpenses = await DB.getTotalExpenses(brgy.id);
  const netBalance = await DB.getNetBalance(brgy.id);
  const budget = module === 'treasurer' ? (await DB.getCurrentBudget(brgy.id) || { totalBudget: totalIncome, allocatedAmount: 0, remainingAmount: Math.max(totalIncome - totalExpenses, 0) }) : { totalBudget: totalIncome, allocatedAmount: 0, remainingAmount: Math.max(totalIncome - totalExpenses, 0) };
  const utilPct = budget.totalBudget > 0 ? (totalExpenses / budget.totalBudget) * 100 : 0;

  const summaryRows = [
    ['Total Budget', budget.totalBudget],
    ['Total Income / Receipts', totalIncome],
    ['Total Expenses / Disbursements', totalExpenses],
    ['Net Balance', netBalance],
  ];
  doc.setFillColor(232, 240, 251); doc.rect(14, y, 182, 6, 'F');
  doc.setFont(undefined, 'bold'); doc.setFontSize(9);
  doc.text('Particulars', 16, y + 4); doc.text('Amount', 194, y + 4, { align: 'right' });
  y += 7;
  doc.setFont(undefined, 'normal');
  summaryRows.forEach(([label, amt], i) => {
    if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(14, y, 182, 6, 'F'); }
    doc.text(label, 16, y + 4);
    doc.text(formatCurrencyPDF(amt), 194, y + 4, { align: 'right' });
    y += 6;
  });
  y += 4;

  doc.setFont(undefined, 'bold'); doc.setFontSize(9.5);
  doc.text('Budget Utilization', 14, y); y += 5;
  doc.setFont(undefined, 'normal'); doc.setFontSize(8.5);
  doc.text(`Expenses vs Budget: ${utilPct.toFixed(1)}%`, 14, y); y += 5;
  doc.setDrawColor(200); doc.setFillColor(226, 232, 240); doc.rect(14, y, 182, 5, 'F');
  doc.setFillColor(22, 163, 74); doc.rect(14, y, Math.min(utilPct, 100) * 1.82, 5, 'F');
  doc.setDrawColor(0); y += 10;

  const allocs = [
    { cat: 'Personnel Services (PS)', pct: 0.40 },
    { cat: 'Maintenance & Other Operating Expenses (MOOE)', pct: 0.35 },
    { cat: 'Capital Outlay (CO)', pct: 0.15 },
    { cat: 'Social Services & Development', pct: 0.10 },
  ];
  const { expenseKey } = getModuleTables(module);
  const expenses = DB.filter(expenseKey, e => e.barangayId === brgy.id && e.status !== 'rejected');
  const expByCat = {};
  expenses.forEach(e => { expByCat[e.category] = (expByCat[e.category] || 0) + e.amount; });

  doc.setFont(undefined, 'bold'); doc.setFontSize(9);
  doc.setFillColor(232, 240, 251); doc.rect(14, y, 182, 6, 'F');
  doc.text('Fund Category', 16, y + 4);
  doc.text('Allocated', 130, y + 4, { align: 'right' });
  doc.text('Utilized', 160, y + 4, { align: 'right' });
  doc.text('Remaining', 194, y + 4, { align: 'right' });
  y += 7;
  doc.setFont(undefined, 'normal'); doc.setFontSize(8);
  allocs.forEach((a, i) => {
    const allocated = budget.totalBudget * a.pct;
    const catExp = expByCat[a.cat] || 0;
    const remaining = allocated - catExp;
    if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(14, y, 182, 6, 'F'); }
    doc.text(a.cat, 16, y + 4);
    doc.text(formatCurrencyPDF(allocated), 130, y + 4, { align: 'right' });
    doc.text(formatCurrencyPDF(catExp), 160, y + 4, { align: 'right' });
    doc.text(formatCurrencyPDF(remaining), 194, y + 4, { align: 'right' });
    y += 6;
  });
  y += 10;

  addTwoPartySignature(doc, y, fd.preparedBy || fd._autoTreasurer || '', module === 'sk' ? 'SK Treasurer' : 'Barangay Treasurer', fd.approvedBy || fd._autoPunong || fd._autoSKChair || '', module === 'sk' ? 'SK Chairperson' : 'Punong Barangay');
}

function generateSKCashbook(doc, fd, brgy, y, module = 'sk') {
  return generateBFR6(doc, fd, brgy, y, module);
}

// ── BFR-3: Priorities for Development Projects (20% Component of NTA) — Annex 3 ──
function generateBFR3(doc, fd, brgy, y) {
  doc.setFontSize(9); doc.setFont(undefined, 'italic');
  doc.text('AIP Form No. 4', 14, y);
  doc.text('Annex 3', 194, y, { align: 'right' });
  doc.setFont(undefined, 'normal'); y += 6;
  doc.setFontSize(11); doc.setFont(undefined, 'bold');
  doc.text('PRIORITIES FOR DEVELOPMENT PROJECTS', 105, y, { align: 'center' }); y += 5;
  doc.text('(20% COMPONENT OF NTA UTILIZATION)', 105, y, { align: 'center' }); y += 5;
  doc.setFontSize(10);
  doc.text(`(FY: ${fd.fiscalYear || new Date().getFullYear()})`, 105, y, { align: 'center' });
  doc.setFont(undefined, 'normal'); y += 10;

  const totalNTA = parseFloat(fd.totalNTA || 0);
  const twentyPct = totalNTA * 0.2;

  doc.setFontSize(9.5);
  doc.text('TOTAL NTA for FY:', 14, y);
  doc.text(`Php ${formatNum(totalNTA)}`, 90, y); y += 6;
  doc.text('X 20% =', 14, y);
  doc.text(`Php ${formatNum(twentyPct)}`, 90, y); y += 10;

  const rawProjects = (fd.projects || '').split('\n').filter(l => l.trim()).map(line => {
    const parts = parseCSVLine(line);
    const [desc, cost] = parts;
    return { desc: desc || '', cost: safeParseFloat(cost) };
  });

  const cols = { desc: 16, rank: 130, cost: 160, cum: 194 };
  doc.setFillColor(232, 240, 251); doc.rect(14, y, 182, 11, 'F');
  doc.setFontSize(8); doc.setFont(undefined, 'bold');
  doc.text('Priority Development Projects Funded by the 20% of NTA', cols.desc, y + 4);
  doc.text('Project Description (1)', cols.desc, y + 8.5);
  doc.text('RANK (2)', cols.rank, y + 8.5, { align: 'center' });
  doc.text('Project Cost (3)', cols.cost, y + 8.5, { align: 'right' });
  doc.text('Cumulative TOTAL (4)', cols.cum, y + 8.5, { align: 'right' });
  y += 12;

  doc.setFont(undefined, 'normal'); doc.setFontSize(8.5);
  let cumulative = 0;
  if (!rawProjects.length) {
    doc.setFont(undefined, 'italic'); doc.text('No priority projects listed.', cols.desc, y + 4); y += 6; doc.setFont(undefined, 'normal');
  }
  rawProjects.forEach((p, i) => {
    cumulative += p.cost;
    y = checkPageBreak(doc, y, 6, 20);
    if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(14, y, 182, 6, 'F'); }
    doc.text(p.desc.substring(0, 55), cols.desc, y + 4);
    doc.text(String(i + 1), cols.rank, y + 4, { align: 'center' });
    doc.text(formatNum(p.cost), cols.cost, y + 4, { align: 'right' });
    doc.text(formatNum(cumulative), cols.cum, y + 4, { align: 'right' });
    y += 6;
  });
  y += 8;

  doc.setFont(undefined, 'bold'); doc.setFontSize(8.5);
  doc.text('Instructions:', 14, y); y += 5;
  doc.setFont(undefined, 'normal'); doc.setFontSize(7.5);
  const instructions = [
    'Describe the project to be implemented like construction of a Day Care Center, acquisition of a computer, etc, in their order of priority.',
    'Indicate in this column the ranking of development projects in their proper order, Rank 1 is the first priority, Rank 2 is the second, etc.',
    'Indicate the total project cost that will complete the project.',
    'Add all project costs from Rank 1 to the last rank equivalent to the 20% of the NTA or higher.',
  ];
  instructions.forEach(t => { const lines = doc.splitTextToSize('- ' + t, 182); doc.text(lines, 14, y); y += lines.length * 3.6; });
  y += 3;
  doc.setTextColor(110);
  doc.text('Reference: Department of Budget and Management. (2006). Budget Operations Manual for Barangays.', 14, y);
  doc.setTextColor(0); y += 8;

  addTwoPartySignature(doc, y, fd.preparedBy || fd._autoTreasurer || '', 'Barangay Treasurer', fd.approvedBy || fd._autoPunong || '', 'Punong Barangay');
}

// ── BFR-5: List of Notices of Award — Annex 5 ──
function generateBFR5(doc, fd, brgy, y) {
  doc.setFontSize(9); doc.setFont(undefined, 'italic');
  doc.text('Annex 5', 194, y, { align: 'right' });
  doc.setFont(undefined, 'normal'); y += 6;
  doc.setFontSize(11); doc.setFont(undefined, 'bold');
  doc.text('LIST OF NOTICES OF AWARD', 105, y, { align: 'center' }); y += 5;
  doc.setFontSize(10); doc.setFont(undefined, 'normal');
  const quarterLabel = { '1st': '1st', '2nd': '2nd', '3rd': '3rd', '4th': '4th' }[fd.quarter] || fd.quarter || '';
  doc.text(`For the ${quarterLabel} Quarter of ${fd.fiscalYear || ''}`, 105, y, { align: 'center' }); y += 9;

  const rawAwards = (fd.awards || '').split('\n').filter(l => l.trim()).map(line => {
    const parts = parseCSVLine(line);
    const [date, project, type, supplier, amount, remarks] = parts;
    return { date: date || '', project: project || '', type: (type || '').toLowerCase(), supplier: supplier || '', amount: safeParseFloat(amount), remarks: remarks || '' };
  });

  const cols = { date: 16, project: 36, infra: 92, goods: 104, service: 116, supplier: 128, amount: 178, remarks: 196 };
  doc.setFillColor(232, 240, 251); doc.rect(14, y, 182, 12, 'F');
  doc.setFontSize(7); doc.setFont(undefined, 'bold');
  doc.text('DATE', cols.date, y + 8);
  doc.text('NAME OF PROJECT', cols.project, y + 8);
  doc.text('DESCRIPTION (Please check)', (cols.infra + cols.service) / 2, y + 4, { align: 'center' });
  doc.text('Infra', cols.infra, y + 9, { align: 'center' });
  doc.text('Goods', cols.goods, y + 9, { align: 'center' });
  doc.text('Svc.', cols.service, y + 9, { align: 'center' });
  doc.text('NAME OF SUPPLIER', cols.supplier, y + 8);
  doc.text('AMOUNT', cols.amount, y + 8, { align: 'right' });
  doc.text('REMARKS', cols.remarks, y + 8, { align: 'right' });
  y += 13;

  doc.setFont(undefined, 'normal'); doc.setFontSize(7.5);
  let total = 0;
  if (!rawAwards.length) {
    doc.setFont(undefined, 'italic'); doc.text('No notices of award recorded for this period.', cols.date, y + 4); y += 6; doc.setFont(undefined, 'normal');
  }
  rawAwards.forEach((a, i) => {
    total += a.amount;
    y = checkPageBreak(doc, y, 6, 20);
    if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(14, y, 182, 6, 'F'); }
    doc.text(a.date, cols.date, y + 4);
    doc.text(a.project.substring(0, 26), cols.project, y + 4);
    doc.text(a.type.startsWith('infra') ? 'X' : '', cols.infra, y + 4, { align: 'center' });
    doc.text(a.type.startsWith('good') ? 'X' : '', cols.goods, y + 4, { align: 'center' });
    doc.text(a.type.startsWith('serv') ? 'X' : '', cols.service, y + 4, { align: 'center' });
    doc.text(a.supplier.substring(0, 22), cols.supplier, y + 4);
    doc.text(formatNum(a.amount), cols.amount, y + 4, { align: 'right' });
    doc.text(a.remarks.substring(0, 12), cols.remarks, y + 4, { align: 'right' });
    y += 6;
  });

  doc.setFont(undefined, 'bold');
  doc.setFillColor(2, 132, 199); doc.setTextColor(255); doc.rect(14, y, 182, 7, 'F');
  doc.text('TOTAL', cols.supplier, y + 5);
  doc.text(formatNum(total), cols.amount, y + 5, { align: 'right' });
  doc.setTextColor(0); y += 14;

  addTwoPartySignature(doc, y, fd.preparedBy || fd._autoTreasurer || '', 'Barangay Treasurer', fd.approvedBy || fd._autoPunong || '', 'Punong Barangay');
}

// ── BFR-6 / BFR-1 / SK Cashbook: Itemized Collections & Disbursements — Annex 6 ──
// Pulls real income/expense records for the resolved period into a two-column ledger
// (Collection | Disbursement), matching the official Annex 6 layout.
async function generateBFR6(doc, fd, brgy, y, module = 'treasurer') {
  doc.setFontSize(9); doc.setFont(undefined, 'italic');
  doc.text('Annex 6', 194, y, { align: 'right' });
  doc.setFont(undefined, 'normal'); y += 6;
  doc.setFontSize(11); doc.setFont(undefined, 'bold');
  doc.text('ITEMIZED MONTHLY COLLECTIONS AND DISBURSEMENTS', 105, y, { align: 'center' }); y += 6;

  const range = computePeriodRange(fd.periodType, fd._range || {});
  const from = fd.dateFrom || range.from;
  const to = fd.dateTo || range.to;
  doc.setFontSize(9.5); doc.setFont(undefined, 'normal');
  doc.text(`For the ${(PERIOD_TYPES[fd.periodType]?.label || 'period')}: ${fd.period || range.label || ''}`, 105, y, { align: 'center' }); y += 9;

  const allInc = await getPeriodIncome(module, brgy.id, from, to);
  const income = allInc.filter(i => i.status === 'approved');
  const expenses = await getPeriodExpenses(module, brgy.id, from, to, { approvedOnly: true });

  const leftX = 14, midX = 105, rightX = 196, half = (rightX - leftX) / 2;
  const cCols = { date: leftX + 2, part: leftX + 22, amt: midX - 3 };
  const dCols = { date: midX + 2, part: midX + 22, amt: rightX - 2 };

  doc.setFillColor(26, 58, 107); doc.setTextColor(255); doc.setFont(undefined, 'bold'); doc.setFontSize(9);
  doc.rect(leftX, y, half, 6, 'F'); doc.rect(midX, y, half, 6, 'F');
  doc.text('COLLECTION', leftX + half / 2, y + 4.3, { align: 'center' });
  doc.text('DISBURSEMENT', midX + half / 2, y + 4.3, { align: 'center' });
  y += 6;
  doc.setFillColor(232, 240, 251); doc.setTextColor(0); doc.setFontSize(7.5);
  doc.rect(leftX, y, half, 6, 'F'); doc.rect(midX, y, half, 6, 'F');
  doc.text('DATE', cCols.date, y + 4); doc.text('PARTICULARS', cCols.part, y + 4); doc.text('AMOUNT', cCols.amt, y + 4, { align: 'right' });
  doc.text('DATE', dCols.date, y + 4); doc.text('PARTICULARS', dCols.part, y + 4); doc.text('AMOUNT', dCols.amt, y + 4, { align: 'right' });
  y += 7;

  const rowCount = Math.max(income.length, expenses.length, 1);
  doc.setFont(undefined, 'normal'); doc.setFontSize(7.5);
  for (let i = 0; i < rowCount; i++) {
    y = checkPageBreak(doc, y, 5.5, 20);
    if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(leftX, y, half * 2, 5.5, 'F'); }
    const inc = income[i], exp = expenses[i];
    if (inc) {
      doc.text(formatDateShort(inc.dateReceived), cCols.date, y + 4);
      doc.text((inc.source || inc.category || '').substring(0, 30), cCols.part, y + 4);
      doc.text(formatNum(inc.amount), cCols.amt, y + 4, { align: 'right' });
    }
    if (exp) {
      doc.text(formatDateShort(exp.dateSpent), dCols.date, y + 4);
      doc.text((exp.description || exp.category || '').substring(0, 30), dCols.part, y + 4);
      doc.text(formatNum(exp.amount), dCols.amt, y + 4, { align: 'right' });
    }
    y += 5.5;
  }
  doc.line(midX, y - rowCount * 5.5 - 13, midX, y);

  const totalCollection = income.reduce((s, i) => s + i.amount, 0);
  const totalDisbursement = expenses.reduce((s, e) => s + e.amount, 0);
  doc.setFont(undefined, 'bold'); doc.setFontSize(8);
  doc.setFillColor(22, 163, 74); doc.setTextColor(255); doc.rect(leftX, y, half, 7, 'F');
  doc.text('TOTAL COLLECTION:', leftX + 2, y + 5);
  doc.text(formatNum(totalCollection), cCols.amt, y + 5, { align: 'right' });
  doc.setFillColor(220, 38, 38); doc.rect(midX, y, half, 7, 'F');
  doc.text('TOTAL EXPENSES:', midX + 2, y + 5);
  doc.text(formatNum(totalDisbursement), dCols.amt, y + 5, { align: 'right' });
  doc.setTextColor(0); y += 15;

  const treasurerLabel = module === 'sk' ? 'SK Treasurer' : 'Barangay Treasurer';
  const approverLabel = module === 'sk' ? 'SK Chairperson' : 'Punong Barangay';
  addTwoPartySignature(doc, y, fd.preparedBy || fd._autoTreasurer || '', treasurerLabel, fd.approvedBy || fd._autoPunong || fd._autoSKChair || '', approverLabel);
}

async function generateBFR2(doc, fd, brgy, y) {
  doc.setFontSize(9); doc.setFont(undefined, 'italic');
  doc.text('Barangay Budget Preparation Form No. 2', 14, y);
  doc.text('Annex 2', 194, y, { align: 'right' });
  doc.setFont(undefined, 'normal'); y += 6;
  doc.setFontSize(11); doc.setFont(undefined, 'bold');
  doc.text('ACTUAL INCOME AND EXPENDITURE FOR PAST YEAR', 105, y, { align: 'center' }); y += 5;
  doc.setFontSize(10);
  doc.text(`( FY: ${fd.fiscalYear || new Date().getFullYear()} )`, 105, y, { align: 'center' });
  doc.setFont(undefined, 'normal'); y += 10;

  const module = 'treasurer';
  const yearStart = `${fd.fiscalYear}-01-01`, yearEnd = `${fd.fiscalYear}-12-31`;
  const allInc = await getPeriodIncome(module, brgy.id, yearStart, yearEnd);
  const income = allInc.filter(i => i.status === 'approved');
  const expenses = await getPeriodExpenses(module, brgy.id, yearStart, yearEnd, { approvedOnly: true });
  const beginningBalance = fd.beginningBalanceOverride ? parseFloat(fd.beginningBalanceOverride) : await getBeginningBalance(module, brgy.id, yearStart);

  // ── Part A: Actual Income (standard BFDP particulars) ──
  const sumInc = (re) => income.filter(i => re.test(i.category || i.source || '')).reduce((s, i) => s + i.amount, 0);
  const irAllotment = sumInc(/internal revenue|\bira\b/i);
  const rpt = sumInc(/real property tax/i);
  const communityTax = sumInc(/community tax/i);
  const clearanceFees = sumInc(/clearance|certification/i);
  const subsidy = sumInc(/subsidy/i);
  const matchedIncome = irAllotment + rpt + communityTax + clearanceFees + subsidy;
  const totalRecordedIncome = income.reduce((s, i) => s + i.amount, 0);
  const otherIncome = totalRecordedIncome - matchedIncome;
  const totalIncome = matchedIncome + otherIncome;
  const totalAvailable = beginningBalance + totalIncome;

  doc.setFontSize(10); doc.setFont(undefined, 'italic');
  doc.text('Part A. Actual Income', 14, y); y += 6;
  doc.setFont(undefined, 'normal');
  y = drawTableHeaderRow(doc, y, [{ label: 'Particulars', x: 16 }, { label: 'TOTAL', x: 194, align: 'right' }]);

  const incomeRows = [
    ['Beginning Balance', beginningBalance],
    ['Share on Internal Revenue Collections', irAllotment],
    ['Share on Real Property Tax', rpt],
    ['Community Tax', communityTax],
    ['Clearance and Certification Fees', clearanceFees],
    ['Subsidy from Other LGUs', subsidy],
  ];
  if (otherIncome) incomeRows.push(['Other Income', otherIncome]);

  doc.setFontSize(9);
  incomeRows.forEach(([label, amt], i) => {
    if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(14, y, 182, 6, 'F'); }
    doc.text(label, 16, y + 4);
    doc.text(formatCurrencyPDF(amt), 194, y + 4, { align: 'right' });
    y += 6;
  });
  doc.setFont(undefined, 'bold');
  doc.setFillColor(22, 163, 74); doc.setTextColor(255); doc.rect(14, y, 182, 7, 'F');
  doc.text('Total Available Resources', 16, y + 5);
  doc.text(formatCurrencyPDF(totalAvailable), 194, y + 5, { align: 'right' });
  doc.setTextColor(0); y += 13;

  // ── Part B: Actual Expenditures — fixed Program/Project/Activity rows ──
  doc.setFont(undefined, 'italic'); doc.setFontSize(10);
  doc.text('Part B. Actual Expenditures', 14, y); y += 6;
  doc.setFont(undefined, 'normal');
  y = drawTableHeaderRow(doc, y, [
    { label: 'Programs / Projects / Activity', x: 16 },
    { label: 'Personal Services', x: 100, align: 'right' },
    { label: 'MOOE', x: 140, align: 'right' },
    { label: 'Capital Outlay', x: 170, align: 'right' },
    { label: 'TOTAL', x: 194, align: 'right' },
  ]);

  // Matches the exact row order in the official Annex 2 form.
  const buckets = [
    { label: 'Personal Services', re: /personal services|salaries|wages|honorari/i, col: 'ps' },
    { label: 'MOOE', re: /^mooe$|maintenance and other operating/i, col: 'mooe' },
    { label: 'Capital Outlay', re: /capital outlay|equipment|construction/i, col: 'co' },
    { label: 'Day Care Services', re: /day\s*care/i, col: 'mooe' },
    { label: 'Health and Nutrition Services', re: /health|nutrition|medicine/i, col: 'mooe' },
    { label: 'Peace and Order Services', re: /peace and order|tanod|police/i, col: 'mooe' },
    { label: 'Administrative and Legislative Services', re: /administrative|legislative|office supplies/i, col: 'mooe' },
    { label: 'Implementation of Development Projects (20% of IRA)', re: /20%\s*(of\s*)?ira|development project/i, col: 'mooe' },
    { label: 'Implementation of SK Projects (10% SK Funds)', re: /\bsk\b.*(fund|project)|10%\s*sk/i, col: 'mooe' },
    { label: 'Implementation of Projects/Activities for Unforeseen Events (5% Calamity Fund)', re: /calamity|unforeseen|disaster/i, col: 'mooe' },
    { label: 'Implementation of GAD Projects', re: /\bgad\b|gender and development/i, col: 'mooe' },
    { label: 'Implementation of SC PPAs', re: /senior citizen|\bsc\s*ppa/i, col: 'mooe' },
    { label: 'Implementation of BCPC PPAs', re: /bcpc/i, col: 'mooe' },
  ];
  const bucketTotals = buckets.map(() => 0);
  let claimedTotal = 0;
  expenses.forEach(e => {
    const text = e.category || e.description || '';
    const idx = buckets.findIndex(b => b.re.test(text));
    if (idx >= 0) { bucketTotals[idx] += e.amount; claimedTotal += e.amount; }
  });
  const totalRecordedExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const unclassifiedTotal = totalRecordedExpenses - claimedTotal;

  doc.setFontSize(9);
  let totPS = 0, totMOOE = 0, totCO = 0;
  buckets.forEach((b, i) => {
    const amt = bucketTotals[i];
    if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(14, y, 182, 6, 'F'); }
    doc.text(b.label.substring(0, 55), 16, y + 4);
    const ps = b.col === 'ps' ? amt : 0, mooe = b.col === 'mooe' ? amt : 0, co = b.col === 'co' ? amt : 0;
    doc.text(ps ? formatCurrencyPDF(ps) : '—', 100, y + 4, { align: 'right' });
    doc.text(mooe ? formatCurrencyPDF(mooe) : '—', 140, y + 4, { align: 'right' });
    doc.text(co ? formatCurrencyPDF(co) : '—', 170, y + 4, { align: 'right' });
    doc.text(formatCurrencyPDF(amt), 194, y + 4, { align: 'right' });
    totPS += ps; totMOOE += mooe; totCO += co;
    y += 6;
  });
  if (unclassifiedTotal) {
    doc.setFillColor(248, 250, 252); doc.rect(14, y, 182, 6, 'F');
    doc.text('Other Programs/Activities', 16, y + 4);
    doc.text('—', 100, y + 4, { align: 'right' });
    doc.text(formatCurrencyPDF(unclassifiedTotal), 140, y + 4, { align: 'right' });
    doc.text('—', 170, y + 4, { align: 'right' });
    doc.text(formatCurrencyPDF(unclassifiedTotal), 194, y + 4, { align: 'right' });
    totMOOE += unclassifiedTotal;
    y += 6;
  }

  const totalExpenditures = totPS + totMOOE + totCO;
  doc.setFont(undefined, 'bold');
  doc.setFillColor(220, 38, 38); doc.setTextColor(255); doc.rect(14, y, 182, 7, 'F');
  doc.text('Total Expenditures', 16, y + 5);
  doc.text(formatCurrencyPDF(totPS), 100, y + 5, { align: 'right' });
  doc.text(formatCurrencyPDF(totMOOE), 140, y + 5, { align: 'right' });
  doc.text(formatCurrencyPDF(totCO), 170, y + 5, { align: 'right' });
  doc.text(formatCurrencyPDF(totalExpenditures), 194, y + 5, { align: 'right' });
  doc.setTextColor(0); y += 11;

  const balance = totalAvailable - totalExpenditures;
  const balColor = balance >= 0 ? [22, 163, 74] : [220, 38, 38];
  doc.setFillColor(...balColor); doc.setTextColor(255); doc.rect(14, y, 182, 8, 'F');
  doc.setFontSize(10);
  doc.text('BALANCE / DEFICIT', 16, y + 5.5);
  doc.text(formatCurrencyPDF(balance), 194, y + 5.5, { align: 'right' });
  doc.setTextColor(0); y += 14;

  doc.setFont(undefined, 'normal'); doc.setFontSize(7.5);
  const instrA = 'A. Indicate the Actual Income for the Past Year from all sources.';
  const instrB = 'B. Indicate the Actual Expenditure for the Past Year by Major Final Output or Program/Project/Activity and by expenditure class (Personal Services, Maintenance and Other Operating Expenses and Capital Outlay).';
  [instrA, instrB].forEach(t => { const lines = doc.splitTextToSize(t, 182); doc.text(lines, 14, y); y += lines.length * 3.6; });
  y += 3;
  doc.setTextColor(110);
  doc.text('Reference: Department of Budget and Management. (2006). Budget Operations Manual for Barangays.', 14, y);
  doc.setTextColor(0); y += 8;

  addThreePartySignature(doc, y,
    fd.preparedBy || fd._autoTreasurer || '', 'Barangay Treasurer',
    fd.certifiedBy || '', 'City/Municipal Accountant',
    fd.approvedBy || fd._autoPunong || '', 'Punong Barangay'
  );
}

// ── BFR-4: Annual Procurement Plan (Annex 4) — with quarterly distribution matrix ──
function generateBFR4(doc, fd, brgy, y) {
  doc.setFontSize(9); doc.setFont(undefined, 'italic');
  doc.text('Annex 4', 194, y, { align: 'right' });
  doc.setFont(undefined, 'normal');
  doc.setFontSize(11); doc.setFont(undefined, 'bold');
  doc.text('ANNUAL PROCUREMENT PLAN', 105, y, { align: 'center' }); y += 5;
  doc.setFontSize(10);
  doc.text(`(FY: ${fd.fiscalYear || ''})`, 105, y, { align: 'center' });
  doc.setFont(undefined, 'normal'); y += 8;

  doc.setFontSize(9);
  doc.text(`Name of Barangay: ${brgy.name}`, 14, y);
  doc.text(`Program Control No.: ${fd.programControlNo || ''}`, 120, y); y += 5;
  doc.text(`Department/Office: Barangay ${brgy.name}`, 14, y);
  doc.text(`Date Submitted: ${formatDateShort(fd.dateSubmitted) || ''}`, 120, y); y += 8;

  const rawItems = (fd.items || '').split('\n').filter(l => l.trim()).map((line, i) => {
    const parts = parseCSVLine(line);
    const [desc, cost, quarter] = parts;
    return { no: i + 1, desc: desc || '', cost: safeParseFloat(cost), quarter: parseInt(quarter || '1', 10) };
  });
  const total = rawItems.reduce((s, it) => s + it.cost, 0);
  const qTotals = [0, 0, 0, 0];
  rawItems.forEach(it => { if (it.quarter >= 1 && it.quarter <= 4) qTotals[it.quarter - 1] += it.cost; });

  doc.setFillColor(232, 240, 251); doc.rect(14, y, 182, 6, 'F');
  doc.setFontSize(8); doc.setFont(undefined, 'bold');
  doc.text('PLANNED AMOUNT', 105, y + 4, { align: 'center' }); y += 6;
  doc.setFillColor(248, 250, 252); doc.rect(14, y, 182, 6, 'F');
  doc.setFontSize(7.5); doc.setFont(undefined, 'normal');
  doc.text(`Total: ${formatCurrencyPDF(total)}`, 105, y + 4, { align: 'center' });
  y += 9;

  const cols = { no: 16, desc: 24, total: 130, q1: 152, q2: 165, q3: 178, q4: 191 };
  doc.setFillColor(232, 240, 251); doc.rect(14, y, 182, 12, 'F');
  doc.setFontSize(7.5); doc.setFont(undefined, 'bold');
  doc.text('Item No.', cols.no, y + 5);
  doc.text('Description', cols.desc, y + 5);
  doc.text('Total Cost', cols.total, y + 5, { align: 'right' });
  doc.text('Distribution by Quarter', (cols.q1 + cols.q4) / 2, y + 4, { align: 'center' });
  doc.text('Q1', cols.q1, y + 9, { align: 'right' });
  doc.text('Q2', cols.q2, y + 9, { align: 'right' });
  doc.text('Q3', cols.q3, y + 9, { align: 'right' });
  doc.text('Q4', cols.q4, y + 9, { align: 'right' });
  y += 13;

  doc.setFont(undefined, 'normal'); doc.setFontSize(7.5);
  rawItems.forEach((it, i) => {
    y = checkPageBreak(doc, y, 6, 20);
    if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(14, y, 182, 6, 'F'); }
    doc.text(String(it.no), cols.no, y + 4);
    doc.text(it.desc.substring(0, 40), cols.desc, y + 4);
    doc.text(formatCurrencyPDF(it.cost), cols.total, y + 4, { align: 'right' });
    [1, 2, 3, 4].forEach((q, qi) => {
      const x = [cols.q1, cols.q2, cols.q3, cols.q4][qi];
      doc.text(it.quarter === q ? formatNum(it.cost) : '—', x, y + 4, { align: 'right' });
    });
    y += 6;
  });
  if (!rawItems.length) { doc.setFont(undefined, 'italic'); doc.text('No procurement items listed.', cols.desc, y + 4); y += 6; doc.setFont(undefined, 'normal'); }

  doc.setFont(undefined, 'bold');
  doc.setFillColor(245, 158, 11); doc.setTextColor(255); doc.rect(14, y, 182, 7, 'F');
  doc.text('TOTAL', cols.desc, y + 5);
  doc.text(formatCurrencyPDF(total), cols.total, y + 5, { align: 'right' });
  [0, 1, 2, 3].forEach((qi, idx) => {
    const x = [cols.q1, cols.q2, cols.q3, cols.q4][idx];
    doc.text(formatNum(qTotals[qi]), x, y + 5, { align: 'right' });
  });
  doc.setTextColor(0); y += 14;

  addTwoPartySignature(doc, y, fd.preparedBy, 'Barangay Treasurer', fd.approvedBy, 'Punong Barangay');
}

// ── BFR-7: Statement of Receipts and Expenditures (Annex B, JMC 2018-1) ──
// Full A/B/C revenue hierarchy + I/II expenditure hierarchy, split into
// First Semester / Second Semester / Total for the Actual (current) year.
async function generateBFR7(doc, fd, brgy, y) {
  doc.setFontSize(12); doc.setFont(undefined, 'bold');
  doc.text('STATEMENT OF RECEIPTS AND EXPENDITURES', 105, y, { align: 'center' });
  doc.setFont(undefined, 'normal'); y += 9;

  doc.setFontSize(9);
  doc.text(`City Code: ${fd.cityCode || ''}`, 14, y);
  doc.text(`City Name: ${brgy.municipality || ''}`, 80, y);
  doc.text(`Barangay Code: ${fd.barangayCode || ''}`, 145, y); y += 5;
  doc.text(`Barangay Name: ${brgy.name || ''}`, 14, y);
  doc.text(`Year: FY ${fd.currentFY || ''}`, 145, y); y += 8;

  const module = 'treasurer';
  const yr = fd.currentFY;
  const h1From = `${yr}-01-01`, h1To = `${yr}-06-30`;
  const h2From = `${yr}-07-01`, h2To = `${yr}-12-31`;
  const allInc = await getPeriodIncome(module, brgy.id, h1From, h2To);
  const income = allInc.filter(i => i.status === 'approved');
  const expenses = await getPeriodExpenses(module, brgy.id, h1From, h2To, { approvedOnly: true });

  const incIn = (re, from, to) => income.filter(i => re.test(i.category || i.source || '') && i.dateReceived >= from && i.dateReceived <= to).reduce((s, i) => s + i.amount, 0);
  const expIn = (re, from, to) => expenses.filter(e => re.test(e.category || e.description || '') && e.dateSpent >= from && e.dateSpent <= to).reduce((s, e) => s + e.amount, 0);

  function figs(re, isExp) {
    const fn = isExp ? expIn : incIn;
    const h1 = fn(re, h1From, h1To), h2 = fn(re, h2From, h2To);
    return { h1, h2, total: h1 + h2 };
  }
  const add = (...items) => items.reduce((acc, it) => ({ h1: acc.h1 + it.h1, h2: acc.h2 + it.h2, total: acc.total + it.total }), { h1: 0, h2: 0, total: 0 });

  const rpt = figs(/real property tax/i);
  const bizTax = figs(/business tax|tax on business/i);
  const taxRevenue = add(rpt, bizTax);
  const feesCharges = figs(/fees and charges|clearance|certification/i);
  const econEnterprise = figs(/economic enterprise/i);
  const otherReceipts = figs(/other receipts|other general income/i);
  const nonTaxRevenue = add(feesCharges, econEnterprise, otherReceipts);
  const localSources = add(taxRevenue, nonTaxRevenue);

  const ira = figs(/internal revenue|\bira\b/i);
  const natWealth = figs(/national wealth/i);
  const grants = figs(/grant|donation/i);
  const subsidy = figs(/subsidy/i);
  const externalSources = add(ira, natWealth, grants, subsidy);

  const capitalReceipts = figs(/sale of property|sale of.*equipment/i);
  const borrowings = figs(/borrowing|loan/i);
  const nonIncomeReceipts = add(capitalReceipts, borrowings);

  const totalRevenueKnown = add(localSources, externalSources, nonIncomeReceipts);
  const allIncome = { h1: incIn(/.*/, h1From, h1To), h2: incIn(/.*/, h2From, h2To) };
  allIncome.total = allIncome.h1 + allIncome.h2;
  const otherIncomeUnclassified = { h1: allIncome.h1 - totalRevenueKnown.h1, h2: allIncome.h2 - totalRevenueKnown.h2 };
  otherIncomeUnclassified.total = otherIncomeUnclassified.h1 + otherIncomeUnclassified.h2;
  const totalRevenue = add(totalRevenueKnown, otherIncomeUnclassified);

  const genServices = figs(/administrative|legislative|general service/i, true);
  const econServices = figs(/economic service/i, true);
  const socServices = figs(/social service|day\s*care|health/i, true);
  const debtServices = figs(/debt service/i, true);
  const generalFund = add(genServices, econServices, socServices, debtServices);
  const trustFund = figs(/trust fund|national government transfer/i, true);
  const totalExpKnown = add(generalFund, trustFund);
  const allExp = { h1: expIn(/.*/, h1From, h1To), h2: expIn(/.*/, h2From, h2To) };
  allExp.total = allExp.h1 + allExp.h2;
  const otherExpUnclassified = { h1: allExp.h1 - totalExpKnown.h1, h2: allExp.h2 - totalExpKnown.h2 };
  otherExpUnclassified.total = otherExpUnclassified.h1 + otherExpUnclassified.h2;
  const totalExpenditures = add(totalExpKnown, otherExpUnclassified);

  // ── Header row ──
  doc.setFillColor(232, 240, 251); doc.rect(14, y, 182, 12, 'F');
  doc.setFontSize(7.5); doc.setFont(undefined, 'bold');
  doc.text('Particulars', 16, y + 7);
  doc.text('1st Sem', 138, y + 5, { align: 'right' });
  doc.text('2nd Sem', 162, y + 5, { align: 'right' });
  doc.text('Total', 194, y + 5, { align: 'right' });
  doc.setFontSize(6.5); doc.setFont(undefined, 'normal');
  doc.text(String(yr), 138, y + 9.5, { align: 'right' });
  doc.text(String(yr), 162, y + 9.5, { align: 'right' });
  doc.text(String(yr), 194, y + 9.5, { align: 'right' });
  y += 13;

  function row(label, f, opts = {}) {
    y = checkPageBreak(doc, y, 6, 20);
    if (opts.bold) { doc.setFillColor(232, 240, 251); doc.rect(14, y, 182, 6, 'F'); doc.setFont(undefined, 'bold'); }
    else { doc.setFont(undefined, 'normal'); }
    doc.setFontSize(7.5);
    doc.text(label, 16 + (opts.indent || 0) * 4, y + 4);
    if (f) {
      doc.text(formatNum(f.h1), 138, y + 4, { align: 'right' });
      doc.text(formatNum(f.h2), 162, y + 4, { align: 'right' });
      doc.text(formatNum(f.total), 194, y + 4, { align: 'right' });
    }
    y += 6;
  }

  row('TOTAL REVENUE', totalRevenue, { bold: true });
  row('A. Local Sources', localSources, { indent: 0 });
  row('1. Tax Revenue', taxRevenue, { indent: 1 });
  row('a. Real Property Tax', rpt, { indent: 2 });
  row('b. Tax on Business', bizTax, { indent: 2 });
  row('2. Non-Tax Revenue', nonTaxRevenue, { indent: 1 });
  row('a. Fees and Charges', feesCharges, { indent: 2 });
  row('b. Receipts from Economic Enterprise', econEnterprise, { indent: 2 });
  row('c. Other Receipts (Other General Income)', otherReceipts, { indent: 2 });
  row('B. External Sources', externalSources, { indent: 0 });
  row('1. Internal Revenue Allotment', ira, { indent: 1 });
  row('2. Share from National Wealth', natWealth, { indent: 1 });
  row('3. Grants and Donations in Cash', grants, { indent: 1 });
  row('4. Subsidy', subsidy, { indent: 1 });
  row('C. Non-Income Receipts', nonIncomeReceipts, { indent: 0 });
  row('1. Capital Investment Receipts', capitalReceipts, { indent: 1 });
  row('a. Proceeds from Sale of Property, Plant and Equipment', capitalReceipts, { indent: 2 });
  row('2. Receipts from Loans and Borrowings', borrowings, { indent: 1 });
  row('a. Borrowings', borrowings, { indent: 2 });
  if (otherIncomeUnclassified.total) row('Other Income (Unclassified)', otherIncomeUnclassified, { indent: 0 });

  y += 2;
  row('EXPENDITURES', totalExpenditures, { bold: true });
  row('I. General Fund', generalFund, { indent: 0 });
  row('a. General Services', genServices, { indent: 1 });
  row('b. Economic Services', econServices, { indent: 1 });
  row('c. Social Services', socServices, { indent: 1 });
  row('d. Debt Services', debtServices, { indent: 1 });
  row('II. Trust Fund from National Government Transfers', trustFund, { indent: 0 });
  if (otherExpUnclassified.total) row('Other Expenditures (Unclassified)', otherExpUnclassified, { indent: 0 });
  row('Total Expenditures', totalExpenditures, { bold: true });

  const netResult = totalRevenue.total - totalExpenditures.total;
  const netColor = netResult >= 0 ? [22, 163, 74] : [220, 38, 38];
  doc.setFont(undefined, 'bold'); doc.setFontSize(9);
  doc.setFillColor(...netColor); doc.setTextColor(255); doc.rect(14, y, 182, 8, 'F');
  doc.text('NET RESULT (Revenue less Expenditures)', 16, y + 5.5);
  doc.text(formatCurrencyPDF(netResult), 194, y + 5.5, { align: 'right' });
  doc.setTextColor(0); y += 15;

  doc.setFont(undefined, 'normal'); doc.setFontSize(7); doc.setTextColor(110);
  doc.text('Annex 7 (Annex B of DBM-DILG-DOF Joint Memorandum Circular No. 2018-1 dated July 12, 2018)', 14, y);
  doc.setTextColor(0); y += 9;

  addTwoPartySignature(doc, y, fd.preparedBy, 'Barangay Treasurer', fd.approvedBy, 'Punong Barangay');
}


// ════════════════════════════════════════════════════════
// PROCUREMENT DOCUMENTS — Purchase Request → Canvass →
// Abstract of Quotations → Purchase Order → Inspection &
// Acceptance → Notice of Award → Disbursement Voucher
// ════════════════════════════════════════════════════════

function generatePurchaseRequest(doc, fd, brgy, y) {
  doc.setFontSize(10);
  doc.text('Barangay:', 14, y); doc.setFont(undefined, 'bold'); doc.text(brgy.name, 38, y);
  doc.setFont(undefined, 'normal'); doc.text('P.R No.:', 130, y); doc.setFont(undefined, 'bold'); doc.text(fd.prNumber || '', 150, y);
  y += 6;
  doc.setFont(undefined, 'normal'); doc.text('City/Municipality:', 14, y); doc.text(brgy.municipality, 52, y);
  doc.text('Date:', 130, y); doc.text(formatDate(fd.prDate), 145, y);
  y += 10;

  doc.setFillColor(26, 58, 107); doc.rect(14, y, 182, 7, 'F');
  doc.setTextColor(255); doc.setFont(undefined, 'bold'); doc.text('PURCHASE REQUEST', 105, y + 5, { align: 'center' });
  doc.setTextColor(0); y += 9;

  // Items
  doc.setFillColor(232, 240, 251); doc.rect(14, y, 182, 6, 'F');
  doc.setFontSize(9); doc.setFont(undefined, 'bold');
  doc.text('No.', 16, y + 4); doc.text('Qty', 26, y + 4); doc.text('Unit', 38, y + 4);
  doc.text('Description', 58, y + 4);
  doc.text('Unit Cost', 165, y + 4, { align: 'right' });
  doc.text('Amount', 196, y + 4, { align: 'right' });
  y += 7;

  doc.setFont(undefined, 'normal');
  let total = 0;
  const rawItems = (fd.items || '').split('\n').filter(l => l.trim());
  rawItems.forEach((line, i) => {
    const parts = parseCSVLine(line);
    const [qty, unit, desc, unitCost] = parts;
    const amt = safeParseFloat(qty) * safeParseFloat(unitCost);
    total += amt;
    y = checkPageBreak(doc, y, 6, 20);
    if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(14, y, 182, 6, 'F'); }
    doc.text(String(i + 1), 16, y + 4);
    doc.text(qty || '', 26, y + 4);
    doc.text(unit || '', 38, y + 4);
    doc.text((desc || '').substring(0, 26), 58, y + 4);
    doc.text(formatCurrencyPDF(unitCost), 165, y + 4, { align: 'right' });
    doc.text(formatCurrencyPDF(amt), 196, y + 4, { align: 'right' });
    y += 6;
  });
  if (!rawItems.length) { doc.setFont(undefined, 'italic'); doc.text('No items listed.', 58, y + 4); y += 6; doc.setFont(undefined, 'normal'); }

  doc.setFont(undefined, 'bold');
  doc.setFillColor(22, 163, 74); doc.setTextColor(255); doc.rect(14, y, 182, 7, 'F');
  doc.text('TOTAL ESTIMATED AMOUNT', 90, y + 5);
  doc.text(formatCurrencyPDF(total), 196, y + 5, { align: 'right' });
  doc.setTextColor(0); y += 10;

  doc.setFont(undefined, 'normal'); doc.setFontSize(10);
  doc.text('Purpose: ' + (fd.purpose || ''), 14, y); y += 12;

  // Signature
  doc.text('Requested:', 30, y + 5); doc.text('Approved:', 140, y + 5); y += 10;
  doc.line(14, y + 15, 90, y + 15); doc.line(110, y + 15, 196, y + 15);
  doc.setFont(undefined, 'bold');
  doc.text(fd.requestedBy || '__________________', 52, y + 20, { align: 'center' });
  doc.text(fd.approvedBy || '__________________', 153, y + 20, { align: 'center' });
  doc.setFont(undefined, 'normal'); doc.setFontSize(8);
  doc.text('Requesting Official', 52, y + 25, { align: 'center' });
  doc.text('Chairperson/Punong Barangay', 153, y + 25, { align: 'center' });
}

// ── Canvass — comparative price canvass among suppliers ──
function generateCanvass(doc, fd, brgy, y) {
  doc.setFontSize(11); doc.setFont(undefined, 'bold');
  doc.text('CANVASS OF PRICES', 105, y, { align: 'center' }); y += 8;
  doc.setFont(undefined, 'normal'); doc.setFontSize(9);
  doc.text(`Barangay: ${brgy.name}`, 14, y);
  doc.text(`Canvass No.: ${fd.canvassNumber || ''}`, 105, y); y += 5;
  doc.text(`Date: ${formatDateShort(fd.canvassDate) || ''}`, 14, y); y += 9;

  const suppliers = (fd.suppliers || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 3);
  const rawItems = (fd.items || '').split('\n').filter(l => l.trim());

  const descW = 70, supW = (182 - 10 - descW) / Math.max(suppliers.length, 1);
  doc.setFillColor(232, 240, 251); doc.rect(14, y, 182, 6, 'F');
  doc.setFont(undefined, 'bold'); doc.setFontSize(7.5);
  doc.text('No.', 16, y + 4); doc.text('Description', 34, y + 4);
  suppliers.forEach((s, i) => doc.text(s.substring(0, 22), 14 + 10 + descW + i * supW + 2, y + 4));
  y += 7;

  doc.setFont(undefined, 'normal'); doc.setFontSize(8);
  const totals = suppliers.map(() => 0);
  rawItems.forEach((line, idx) => {
    const parts = parseCSVLine(line);
    const [desc, ...amounts] = parts;
    y = checkPageBreak(doc, y, 6, 20);
    if (idx % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(14, y, 182, 6, 'F'); }
    doc.text(String(idx + 1), 16, y + 4);
    doc.text((desc || '').substring(0, 30), 34, y + 4);
    suppliers.forEach((s, i) => {
      const amt = safeParseFloat(amounts[i]);
      totals[i] += amt;
      doc.text(amt ? formatNum(amt) : '', 14 + 10 + descW + i * supW + supW - 2, y + 4, { align: 'right' });
    });
    y += 6;
  });
  if (!rawItems.length) { doc.setFont(undefined, 'italic'); doc.text('No items listed.', 34, y + 4); y += 6; doc.setFont(undefined, 'normal'); }

  doc.setFont(undefined, 'bold');
  doc.setFillColor(232, 240, 251); doc.rect(14, y, 182, 6, 'F');
  doc.text('TOTAL', 34, y + 4);
  suppliers.forEach((s, i) => doc.text(formatNum(totals[i]), 14 + 10 + descW + i * supW + supW - 2, y + 4, { align: 'right' }));
  y += 16;

  addTwoPartySignature(doc, y, fd.canvassedBy, 'Canvassed By', fd.approvedBy, 'Noted By');
}

// ── SK Disbursement Voucher — exact match to SK Paule 1 template ──
// Generalized: roleLabels = { officer, mid, chair } lets Treasurer &
// SK versions reuse the exact same layout with different signatory titles.
function generateDisbursementVoucher(doc, fd, brgy, y, roleLabels = {}) {
  const officerRole = roleLabels.officer || 'Budget Monitoring Officer';
  const midRole = roleLabels.mid || 'SK Treasurer';
  const chairRole = roleLabels.chair || 'SK Chairperson';
  const orgLabel = roleLabels.orgLabel || 'Barangay';

  const pageW = 210, leftM = 14, rightM = 196, midX = (leftM + rightM) / 2;
  const dvDate = fd.dvDate ? new Date(fd.dvDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

  // ── Header row: Barangay info (left) | DV No + Date (right) ──
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  doc.text(`${orgLabel}: ${brgy.name || ''}`, leftM, y);
  doc.text(`DV No.:  ${fd.dvNumber || ''}`, 130, y); y += 5;
  doc.text(`City/Municipality: ${brgy.municipality || ''}`, leftM, y);
  doc.text(`Date :  ${dvDate}`, 130, y); y += 5;
  doc.text(`Province: ${brgy.province || ''}`, leftM, y); y += 5;

  // ── Payee info ──
  doc.setLineWidth(0.3); doc.line(leftM, y, rightM, y); y += 5;
  doc.text(`Payee: ${fd.payee || ''}`, leftM, y); y += 5;
  doc.text(`Address: ${fd.payeeAddress || ''}`, leftM, y); y += 5;
  doc.text(`TIN: ${fd.tin || ''}`, leftM, y); y += 5;
  doc.line(leftM, y, rightM, y); y += 6;

  // ── Particulars + Amount header ──
  doc.setFont(undefined, 'bold');
  doc.text('Particulars', leftM, y);
  doc.text('Amount', rightM, y, { align: 'right' });
  doc.setFont(undefined, 'normal'); y += 6;

  // ── Particulars body with amount ──
  const amount = parseFloat(fd.amount || 0);
  const amtStr = `Php ${formatNum(amount)}`;
  // Full particulars paragraph with dotted amount trailer (matching template style)
  const fullParticulars = (fd.particular || '') + ' in the amount of .....';
  const particularLines = doc.splitTextToSize(fullParticulars, 148);
  particularLines.forEach((line, i) => {
    doc.text(line, leftM, y);
    y += 5;
  });
  // Amount on its own line, right-aligned
  doc.setFont(undefined, 'bold');
  doc.text(amtStr, rightM, y, { align: 'right' });
  doc.setFont(undefined, 'normal'); y += 8;

  // ── Deductions (if any) ──
  const nonVat = parseFloat(fd.nonVat || 0);
  const wtax = parseFloat(fd.withholdingTax || 0);
  let netAmount = amount;
  if (nonVat || wtax) {
    doc.text('Less', leftM, y); y += 5;
    if (nonVat) {
      netAmount -= nonVat;
      doc.text('3% Non Vat', leftM + 8, y);
      doc.text(formatNum(nonVat), rightM, y, { align: 'right' }); y += 5;
    }
    if (wtax) {
      netAmount -= wtax;
      doc.text('1% Withholding Tax', leftM + 8, y);
      doc.text(formatNum(wtax), rightM, y, { align: 'right' }); y += 5;
    }
    doc.setFont(undefined, 'bold');
    doc.text(`Php  ${formatNum(netAmount)}`, rightM, y, { align: 'right' });
    doc.setFont(undefined, 'normal'); y += 8;
  }

  doc.line(leftM, y, rightM, y); y += 6;

  // ── Three certification boxes A / B / C ──
  const colW = (rightM - leftM) / 3;
  const boxTitles = [
    'A. Certified as to availability of the budget or funds received for specific purpose',
    'B. Certified as to availability of cash, and completeness and propriety of supporting documents',
    'C. Certified as to necessity, validity, propriety, and legality of claim; and Approved for payment:',
  ];
  const boxNames = [fd.budgetOfficer || '', fd.skTreasurer || '', fd.skChairperson || ''];
  const boxRoles = [officerRole, midRole, chairRole];

  // Cert titles
  doc.setFontSize(7);
  boxTitles.forEach((title, i) => {
    const bx = leftM + i * colW;
    const lines = doc.splitTextToSize(title, colW - 4);
    doc.text(lines, bx, y);
  });
  y += 18;

  // Signature lines
  boxNames.forEach((name, i) => {
    const bx = leftM + i * colW;
    doc.line(bx, y, bx + colW - 4, y);
  });
  y += 4;

  // Names (bold)
  doc.setFontSize(8); doc.setFont(undefined, 'bold');
  boxNames.forEach((name, i) => {
    const bx = leftM + i * colW;
    doc.text(name || '_____________________', bx + (colW - 4) / 2, y, { align: 'center' });
  });
  y += 4;

  // "(Signature Over Printed Name)"
  doc.setFont(undefined, 'normal'); doc.setFontSize(6.5);
  boxRoles.forEach((_, i) => {
    const bx = leftM + i * colW;
    doc.text('(Signature Over Printed Name)', bx + (colW - 4) / 2, y, { align: 'center' });
  });
  y += 4;

  // Roles
  doc.setFontSize(7.5); doc.setFont(undefined, 'bold');
  boxRoles.forEach((role, i) => {
    const bx = leftM + i * colW;
    doc.text(role, bx + (colW - 4) / 2, y, { align: 'center' });
  });
  y += 4;

  // Date fields under each box
  doc.setFont(undefined, 'normal'); doc.setFontSize(7.5);
  boxRoles.forEach((_, i) => {
    const bx = leftM + i * colW;
    doc.text(`Date : ${dvDate}`, bx, y);
  });
  y += 8;

  doc.line(leftM, y, rightM, y); y += 6;

  // ── Section D: Received Payment (left) | Check / Bank info (right) ──
  doc.setFontSize(8);
  doc.text('D. Received Payment:', leftM, y);
  doc.text(`Check No.:`, midX, y);
  doc.text(fd.checkNo || '', midX + 28, y); y += 5;

  // Left: Payee signature line
  doc.text(`Date: ${dvDate}`, midX, y);
  y += 5;

  doc.line(leftM, y, midX - 6, y);
  doc.text(`Bank Name:`, midX, y);
  doc.text(fd.bankName || '', midX + 28, y); y += 4;

  doc.text(fd.payee || '', leftM, y);
  doc.text(`Bank Branch:`, midX, y);
  doc.text(fd.bankBranch || '', midX + 28, y); y += 4;

  doc.setFontSize(6.5);
  doc.text('Signature Over Printed Name of Payee/', leftM, y);
  doc.text('OR No.:', midX, y); y += 4;

  doc.text('Authorized Representative', leftM, y);
  doc.text('Date:', midX, y); y += 6;

  doc.line(leftM, y, midX - 6, y);
  y += 4;
  doc.setFontSize(7.5);
  doc.text('Date', leftM, y);
}
// Back-compat alias (in case anything still references the old name)
function generateSKDisbursementVoucher(doc, fd, brgy, y) {
  return generateDisbursementVoucher(doc, fd, brgy, y, { officer: 'Budget Monitoring Officer', mid: 'SK Treasurer', chair: 'SK Chairperson', orgLabel: 'SK of Barangay' });
}

// ── Abstract of Quotations — generalized for Treasurer (BAC) & SK ──
function generateAbstractQuotations(doc, fd, brgy, y, roleLabels = {}) {
  const memberRole = roleLabels.members || 'SK Councilor';
  const treasurerRole = roleLabels.treasurer || 'SK Treasurer';
  const chairRole = roleLabels.chair || 'SK Chairperson';

  doc.setFontSize(11); doc.setFont(undefined, 'bold');
  doc.text('ABSTRACT OF QUOTATION OF PRICES', 105, y, { align: 'center' }); y += 8;
  doc.setFont(undefined, 'normal'); doc.setFontSize(9);
  doc.text(`Implementing Office: ${fd.implementingOffice || ''}`, 14, y);
  doc.text(`Date: ${formatDateShort(fd.aqDate)}`, 150, y); y += 5;
  doc.text(`Mode of Procurement: ${fd.modeOfProcurement || ''}`, 14, y); y += 9;

  const suppliers = (fd.suppliers || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 3);
  const rawItems = (fd.items || '').split('\n').filter(l => l.trim());

  const descW = 70, supW = (182 - 10 - descW) / Math.max(suppliers.length, 1);
  doc.setFillColor(232, 240, 251); doc.rect(14, y, 182, 6, 'F');
  doc.setFont(undefined, 'bold'); doc.setFontSize(7.5);
  doc.text('Item', 16, y + 4); doc.text('Qty', 24, y + 4); doc.text('Description', 34, y + 4);
  suppliers.forEach((s, i) => doc.text(s.substring(0, 22), 14 + 10 + descW + i * supW + 2, y + 4));
  y += 7;

  doc.setFont(undefined, 'normal'); doc.setFontSize(8);
  const totals = suppliers.map(() => 0);
  rawItems.forEach((line, idx) => {
    const parts = parseCSVLine(line);
    const [qty, desc, ...amounts] = parts;
    y = checkPageBreak(doc, y, 6, 20);
    if (idx % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(14, y, 182, 6, 'F'); }
    doc.text(String(idx + 1), 16, y + 4);
    doc.text(qty || '', 24, y + 4);
    doc.text((desc || '').substring(0, 28), 34, y + 4);
    suppliers.forEach((s, i) => {
      const amt = parseFloat(amounts[i] || 0);
      totals[i] += amt;
      doc.text(amt ? formatNum(amt) : '', 14 + 10 + descW + i * supW + supW - 2, y + 4, { align: 'right' });
    });
    y += 6;
  });
  if (!rawItems.length) { doc.setFont(undefined, 'italic'); doc.text('No items listed.', 34, y + 4); y += 6; doc.setFont(undefined, 'normal'); }

  doc.setFont(undefined, 'bold');
  doc.setFillColor(232, 240, 251); doc.rect(14, y, 182, 6, 'F');
  doc.text('TOTAL', 34, y + 4);
  suppliers.forEach((s, i) => doc.text(formatNum(totals[i]), 14 + 10 + descW + i * supW + supW - 2, y + 4, { align: 'right' }));
  y += 12;

  const lowestIdx = totals.indexOf(Math.min(...totals.filter(t => t > 0).length ? totals.filter(t => t > 0) : [0]));
  const lowestSupplier = suppliers[lowestIdx] || suppliers[0] || '';
  doc.setFont(undefined, 'normal'); doc.setFontSize(8.5);
  const certText = `WE HEREBY CERTIFY as to the correctness of the foregoing Abstract of Quotations, and hereby recommend ${lowestSupplier} has the lowest calculated quotation.`;
  const certLines = doc.splitTextToSize(certText, 182);
  doc.text(certLines, 14, y); y += certLines.length * 4.5 + 10;

  // Matches the real template's grid: row 1 is 3 members; row 2 is member,
  // treasurer, member; the chairperson sits centered alone below that.
  const members = (fd.skCouncilors || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 5);
  const colW3 = 182 / 3;
  const gridEntries = [
    { name: members[0] || '', role: memberRole },
    { name: members[1] || '', role: memberRole },
    { name: members[2] || '', role: memberRole },
    { name: members[3] || '', role: memberRole },
    { name: fd.skTreasurer || '', role: treasurerRole },
    { name: members[4] || '', role: memberRole },
  ];
  gridEntries.forEach((entry, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const bx = 14 + col * colW3;
    const by = y + row * 14;
    doc.line(bx, by + 8, bx + colW3 - 6, by + 8);
    doc.setFont(undefined, 'bold'); doc.setFontSize(7.5);
    doc.text(entry.name || '_________________', bx + (colW3 - 6) / 2, by + 12, { align: 'center' });
    doc.setFont(undefined, 'normal'); doc.setFontSize(6.5);
    doc.text(entry.role, bx + (colW3 - 6) / 2, by + 16, { align: 'center' });
  });
  y += 2 * 14 + 8;

  // Chairperson, centered alone
  doc.line(80, y, 130, y); y += 4;
  doc.setFont(undefined, 'bold'); doc.setFontSize(8);
  doc.text(fd.skChairperson || '_________________', 105, y, { align: 'center' }); y += 4;
  doc.setFont(undefined, 'normal'); doc.setFontSize(7);
  doc.text(chairRole, 105, y, { align: 'center' });
}
// Back-compat alias
function generateSKAbstractQuotations(doc, fd, brgy, y) {
  return generateAbstractQuotations(doc, fd, brgy, y, { members: 'SK Councilor', treasurer: 'SK Treasurer', chair: 'SK Chairperson' });
}

// ── Purchase Order ──
function generatePurchaseOrder(doc, fd, brgy, y) {
  doc.setFontSize(11); doc.setFont(undefined, 'bold');
  doc.text('PURCHASE ORDER', 105, y, { align: 'center' }); y += 8;
  doc.setFont(undefined, 'normal'); doc.setFontSize(9);
  doc.text(`Barangay: ${brgy.name}`, 14, y);
  doc.text(`P.O. No.: ${fd.poNumber || ''}`, 130, y); y += 5;
  doc.text(`City/Municipality: ${brgy.municipality}`, 14, y);
  doc.text(`Date: ${formatDateShort(fd.poDate) || ''}`, 130, y); y += 6;
  doc.line(14, y, 196, y); y += 5;
  doc.text(`Supplier: ${fd.supplier || ''}`, 14, y); y += 5;
  doc.text(`Address: ${fd.supplierAddress || ''}`, 14, y); y += 5;
  doc.text(`TIN: ${fd.tin || ''}`, 14, y); y += 6;
  doc.line(14, y, 196, y); y += 6;

  doc.setFillColor(67, 56, 202); doc.setTextColor(255); doc.rect(14, y, 182, 6, 'F');
  doc.setFontSize(9); doc.setFont(undefined, 'bold');
  doc.text('No.', 16, y + 4); doc.text('Qty', 26, y + 4); doc.text('Unit', 38, y + 4);
  doc.text('Description', 58, y + 4);
  doc.text('Unit Cost', 165, y + 4, { align: 'right' });
  doc.text('Amount', 196, y + 4, { align: 'right' });
  doc.setTextColor(0); y += 7;

  doc.setFont(undefined, 'normal');
  let total = 0;
  const rawItems = (fd.items || '').split('\n').filter(l => l.trim());
  rawItems.forEach((line, i) => {
    const parts = parseCSVLine(line);
    const [qty, unit, desc, unitCost] = parts;
    const amt = safeParseFloat(qty) * safeParseFloat(unitCost);
    total += amt;
    y = checkPageBreak(doc, y, 6, 20);
    if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(14, y, 182, 6, 'F'); }
    doc.text(String(i + 1), 16, y + 4);
    doc.text(qty || '', 26, y + 4);
    doc.text(unit || '', 38, y + 4);
    doc.text((desc || '').substring(0, 26), 58, y + 4);
    doc.text(formatCurrencyPDF(unitCost), 165, y + 4, { align: 'right' });
    doc.text(formatCurrencyPDF(amt), 196, y + 4, { align: 'right' });
    y += 6;
  });
  if (!rawItems.length) { doc.setFont(undefined, 'italic'); doc.text('No items listed.', 58, y + 4); y += 6; doc.setFont(undefined, 'normal'); }

  doc.setFont(undefined, 'bold');
  doc.setFillColor(67, 56, 202); doc.setTextColor(255); doc.rect(14, y, 182, 7, 'F');
  doc.text('TOTAL AMOUNT', 90, y + 5);
  doc.text(formatCurrencyPDF(total), 196, y + 5, { align: 'right' });
  doc.setTextColor(0); y += 10;

  doc.setFont(undefined, 'normal'); doc.setFontSize(9);
  doc.text(`Delivery Term: ${fd.deliveryTerm || ''}`, 14, y); y += 5;
  doc.text(`Payment Term: ${fd.paymentTerm || ''}`, 14, y); y += 12;

  addTwoPartySignature(doc, y, fd.preparedBy, 'Barangay Treasurer', fd.approvedBy, 'Punong Barangay');
}

// ── Inspection & Acceptance Report ──
function generateInspectionAcceptance(doc, fd, brgy, y) {
  doc.setFontSize(11); doc.setFont(undefined, 'bold');
  doc.text('INSPECTION AND ACCEPTANCE REPORT', 105, y, { align: 'center' }); y += 9;
  doc.setFont(undefined, 'normal'); doc.setFontSize(9);

  doc.text(`SUPPLIER: ${fd.supplier || ''}`, 14, y);
  doc.text(`O.R. No.: ${fd.orNumber || ''}`, 150, y); y += 6;
  doc.text(`P.O. No.: ${fd.poNumber || ''}`, 14, y);
  doc.text(`Date: ${formatDateShort(fd.poDate) || ''}`, 60, y);
  doc.text(`Invoice No.: ${fd.invoiceNumber || ''}`, 100, y);
  doc.text(`Date: ${formatDateShort(fd.iarDate) || ''}`, 150, y); y += 6;
  doc.text(`REQUISITIONING OFFICE/DEPT.: Barangay ${brgy.name || ''}`, 14, y); y += 9;

  const cols = { no: 16, unit: 30, desc: 48, qty: 194 };
  doc.setFillColor(5, 150, 105); doc.setTextColor(255); doc.rect(14, y, 182, 6, 'F');
  doc.setFontSize(9); doc.setFont(undefined, 'bold');
  doc.text('ITEM NO.', cols.no, y + 4);
  doc.text('UNIT', cols.unit, y + 4);
  doc.text('DESCRIPTION', cols.desc, y + 4);
  doc.text('QUANTITY', cols.qty, y + 4, { align: 'right' });
  doc.setTextColor(0); y += 7;

  doc.setFont(undefined, 'normal');
  const rawItems = (fd.items || '').split('\n').filter(l => l.trim());
  rawItems.forEach((line, i) => {
    const parts = parseCSVLine(line);
    const [qty, unit, desc] = parts;
    y = checkPageBreak(doc, y, 6, 20);
    if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(14, y, 182, 6, 'F'); }
    doc.text(String(i + 1), cols.no, y + 4);
    doc.text(unit || '', cols.unit, y + 4);
    doc.text((desc || '').substring(0, 55), cols.desc, y + 4);
    doc.text(qty || '', cols.qty, y + 4, { align: 'right' });
    y += 6;
  });
  if (!rawItems.length) { doc.setFont(undefined, 'italic'); doc.text('No items listed.', cols.desc, y + 4); y += 6; doc.setFont(undefined, 'normal'); }
  y += 8;

  // ── Inspection | Acceptance two-column checkbox section ──
  doc.setFont(undefined, 'bold'); doc.setFontSize(9.5);
  doc.text('INSPECTION', 14, y);
  doc.text('ACCEPTANCE', 105, y); y += 6;
  doc.setFont(undefined, 'normal'); doc.setFontSize(8);

  const dateInspected = formatDateShort(fd.dateInspected) || '';
  const dateReceived = formatDateShort(fd.dateInspected) || '';
  doc.text(`DATE INSPECTED     ${dateInspected}`, 14, y);
  doc.text(`DATE RECEIVED:     ${dateReceived}`, 105, y); y += 6;

  const complete = (fd.acceptanceStatus || 'complete') === 'complete';
  doc.text('( x )  Inspected, verified and found ok as', 14, y);
  doc.text(`(  ${complete ? 'x' : ' '}  )       Complete`, 105, y); y += 4.5;
  doc.text('(    )   the quantity and specifications', 14, y);
  doc.text(`(  ${!complete ? 'x' : ' '}  )       Partial`, 105, y); y += 10;

  doc.line(14, y, 90, y);
  doc.line(105, y, 181, y); y += 5;
  doc.setFont(undefined, 'bold'); doc.setFontSize(8.5);
  doc.text(fd.inspectedBy || '_________________', 52, y, { align: 'center' });
  doc.text(fd.receivedBy || '_________________', 143, y, { align: 'center' });
  y += 4;
  doc.setFont(undefined, 'normal'); doc.setFontSize(7.5);
  doc.text('Authorized Inspector', 52, y, { align: 'center' });
  doc.text('Brgy. Treasurer', 143, y, { align: 'center' });
}

// ── Notice of Award (individual) ──
function generateNoticeOfAward(doc, fd, brgy, y) {
  doc.setFontSize(11); doc.setFont(undefined, 'bold');
  doc.text('NOTICE OF AWARD', 105, y, { align: 'center' }); y += 8;
  doc.setFont(undefined, 'normal'); doc.setFontSize(9);
  doc.text(`Barangay: ${brgy.name}`, 14, y);
  doc.text(`NOA No.: ${fd.noaNumber || ''}`, 130, y); y += 5;
  doc.text(`Date: ${formatDateShort(fd.noaDate) || ''}`, 14, y); y += 8;

  doc.line(14, y, 196, y); y += 6;
  const salutation = `To: ${fd.supplier || ''}`;
  doc.text(salutation, 14, y); y += 5;
  if (fd.supplierAddress) { doc.text(fd.supplierAddress, 14, y); y += 5; }
  y += 3;

  const bodyText = `We are pleased to inform you that your quotation for "${fd.projectTitle || ''}" in the amount of Php ${formatNum(fd.amount)}, procured through ${fd.modeOfProcurement || 'Small Value Procurement'}, has been accepted. You are requested to enter into contract and comply with all requirements within the period prescribed by applicable procurement rules and regulations.`;
  const lines = doc.splitTextToSize(bodyText, 182);
  doc.text(lines, 14, y); y += lines.length * 5 + 10;

  doc.setFillColor(190, 24, 93); doc.setTextColor(255); doc.rect(14, y, 182, 7, 'F');
  doc.setFont(undefined, 'bold');
  doc.text('CONTRACT AMOUNT', 16, y + 5);
  doc.text(`Php ${formatNum(fd.amount)}`, 194, y + 5, { align: 'right' });
  doc.setTextColor(0); doc.setFont(undefined, 'normal'); y += 16;

  addTwoPartySignature(doc, y, fd.preparedBy, 'BAC Secretariat', fd.approvedBy, 'BAC Chairperson / Punong Barangay');
}

function formatNum(n) {
  return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function addThreePartySignature(doc, y, name1, role1, name2, role2, name3, role3) {
  y = Math.max(y, 250);
  if (y > 270) { /* keep on page; jsPDF auto handles overflow visually */ }
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  doc.line(14, y, 70, y);
  doc.line(80, y, 136, y);
  doc.line(146, y, 196, y);
  y += 4;
  doc.setFont(undefined, 'bold');
  doc.text(name1 || '_________________', 42, y, { align: 'center' });
  doc.text(name2 || '_________________', 108, y, { align: 'center' });
  doc.text(name3 || '_________________', 171, y, { align: 'center' });
  y += 4;
  doc.setFont(undefined, 'normal'); doc.setFontSize(7.5);
  doc.text(role1, 42, y, { align: 'center' });
  doc.text(role2, 108, y, { align: 'center' });
  doc.text(role3, 171, y, { align: 'center' });
}

function addTwoPartySignature(doc, y, name1, role1, name2, role2) {
  y = Math.max(y, 250);
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  doc.line(14, y, 90, y);
  doc.line(120, y, 196, y);
  y += 4;
  doc.setFont(undefined, 'bold');
  doc.text(name1 || '_________________', 52, y, { align: 'center' });
  doc.text(name2 || '_________________', 158, y, { align: 'center' });
  y += 4;
  doc.setFont(undefined, 'normal'); doc.setFontSize(7.5);
  doc.text(role1, 52, y, { align: 'center' });
  doc.text(role2, 158, y, { align: 'center' });
}

async function generateLiquidationReport(doc, fd, brgy, y, module = 'treasurer') {
  const range = computePeriodRange(fd.periodType, fd._range || {});
  const from = fd.dateFrom || range.from;
  const to = fd.dateTo || range.to;
  const expenses = await getPeriodExpenses(module, brgy.id, from, to, { approvedOnly: true });

  doc.setFontSize(10); doc.setFont(undefined, 'bold');
  doc.text(`Period Covered: ${fd.period || range.label || ''}`, 14, y);
  doc.text(`Fund Source: ${fd.fundSource || ''}`, 14, y + 6);
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  doc.text(`Frequency: ${PERIOD_TYPES[fd.periodType]?.label || 'Custom Range'}  |  Coverage: ${formatDateShort(from)} – ${formatDateShort(to)}`, 14, y + 12);
  y += 18;

  doc.setFillColor(26, 58, 107); doc.rect(14, y, 182, 7, 'F');
  doc.setTextColor(255); doc.setFont(undefined, 'bold'); doc.setFontSize(10);
  doc.text('LIQUIDATION DETAILS', 105, y + 5, { align: 'center' });
  doc.setTextColor(0); y += 9;

  doc.setFillColor(232, 240, 251); doc.rect(14, y, 182, 6, 'F');
  doc.setFontSize(9); doc.setFont(undefined, 'bold');
  doc.text('#', 16, y + 4); doc.text('Description', 24, y + 4);
  doc.text('Category', 100, y + 4); doc.text('Date', 138, y + 4);
  doc.text('Amount', 170, y + 4, { align: 'right' });
  y += 7;

  let total = 0;
  doc.setFont(undefined, 'normal');
  if (!expenses.length) {
    doc.setFont(undefined, 'italic'); doc.text('No approved expenses recorded for this period.', 16, y + 4); y += 6; doc.setFont(undefined, 'normal');
  }
  expenses.forEach((item, i) => {
    y = checkPageBreak(doc, y, 6, 20);
    if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(14, y, 182, 6, 'F'); }
    doc.text(String(i + 1), 16, y + 4);
    doc.text(item.description.substring(0, 30), 24, y + 4);
    doc.text(item.category.substring(0, 20), 100, y + 4);
    doc.text(formatDateShort(item.dateSpent), 138, y + 4);
    doc.text(formatCurrencyPDF(item.amount), 196, y + 4, { align: 'right' });
    total += item.amount; y += 6;
  });

  doc.setFont(undefined, 'bold');
  doc.setFillColor(26, 58, 107); doc.setTextColor(255); doc.rect(14, y, 182, 7, 'F');
  doc.text('TOTAL LIQUIDATED', 90, y + 5);
  doc.text(formatCurrencyPDF(total), 196, y + 5, { align: 'right' });
  doc.setTextColor(0); y += 12;

  if (fd.notes) { doc.setFont(undefined, 'italic'); doc.text('Remarks: ' + fd.notes, 14, y); y += 8; }

  addSignatureBlock(doc, y + 5, fd.preparedBy, fd.certifiedBy, fd.approvedBy);
}

async function generateFinancialStatement(doc, fd, brgy, y, module = 'treasurer') {
  const range = computePeriodRange(fd.periodType, fd._range || {});
  const from = fd.dateFrom || range.from;
  const to = fd.dateTo || range.to;

  const allInc = await getPeriodIncome(module, brgy.id, from, to);
  const income = allInc.filter(i => i.status === 'approved');
  const expenses = await getPeriodExpenses(module, brgy.id, from, to, { approvedOnly: true });
  const beginningBalance = await getBeginningBalance(module, brgy.id, from);
  const totalIncome = income.reduce((s, i) => s + i.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const endingBalance = beginningBalance + totalIncome - totalExpenses;

  const budget = module === 'treasurer' ? (await DB.getCurrentBudget(brgy.id) || { totalBudget: 0 }) : { totalBudget: 0 };

  doc.setFontSize(11); doc.setFont(undefined, 'bold');
  doc.text('STATEMENT OF FINANCIAL POSITION', 105, y, { align: 'center' }); y += 5;
  doc.setFontSize(10); doc.setFont(undefined, 'normal');
  doc.text(`Period: ${fd.period || range.label || ''}`, 105, y, { align: 'center' }); y += 5;
  doc.setFontSize(8);
  doc.text(`Frequency: ${PERIOD_TYPES[fd.periodType]?.label || 'Custom Range'}  |  Coverage: ${formatDateShort(from)} – ${formatDateShort(to)}`, 105, y, { align: 'center' }); y += 8;

  const items = [
    { section: 'CASH FLOW', label: 'Beginning Cash Balance', amount: beginningBalance },
    { section: '', label: 'Add: Total Income / Receipts', amount: totalIncome },
    { section: '', label: 'Less: Total Disbursements', amount: totalExpenses },
    { section: '', label: 'Ending Cash Balance', amount: endingBalance, bold: true, highlight: true },
  ];
  if (module === 'treasurer') {
    items.push(
      { section: 'BUDGET', label: 'Approved Budget (Current FY)', amount: budget.totalBudget },
      { section: '', label: 'Budget Utilization Rate', amount: (totalExpenses / (budget.totalBudget || 1) * 100).toFixed(2) + '%', isText: true },
    );
  }

  items.forEach(item => {
    if (item.section) {
      doc.setFillColor(26, 58, 107); doc.rect(14, y, 182, 6, 'F');
      doc.setTextColor(255); doc.setFont(undefined, 'bold'); doc.text(item.section, 16, y + 4);
      doc.setTextColor(0); y += 7;
    }
    if (item.highlight) { doc.setFillColor(22, 163, 74); doc.setTextColor(255); doc.rect(14, y, 182, 7, 'F'); }
    else if (item.bold) { doc.setFillColor(232, 240, 251); doc.rect(14, y, 182, 6, 'F'); }
    doc.setFont(undefined, item.bold ? 'bold' : 'normal');
    doc.text(item.label, 20, y + (item.highlight ? 5 : 4));
    if (!item.isText) doc.text(formatCurrencyPDF(item.amount), 196, y + (item.highlight ? 5 : 4), { align: 'right' });
    else doc.text(String(item.amount), 196, y + 4, { align: 'right' });
    if (item.highlight) doc.setTextColor(0);
    y += item.highlight ? 9 : 7;
  });

  y += 10;
  addSignatureBlock(doc, y, fd.preparedBy, fd.certifiedBy, fd.approvedBy);
}

function addSignatureBlock(doc, y, preparedLabel, preparedBy, approvedBy, certLabel, approvedLabel) {
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  y = Math.max(y, 230);

  doc.line(14, y + 15, 80, y + 15);
  doc.line(89, y + 15, 155, y + 15);
  doc.line(164, y + 15, 196, y + 15);

  doc.setFont(undefined, 'bold');
  doc.text(preparedBy || 'Prepared By', 47, y + 19, { align: 'center' });
  doc.text(preparedLabel || 'Prepared By', 122, y + 19, { align: 'center' });
  doc.text(approvedBy || 'Approved By', 180, y + 19, { align: 'center' });

  doc.setFont(undefined, 'normal');
  doc.text(certLabel || 'BARANGAY TREASURER', 47, y + 23, { align: 'center' });
  doc.text('CERTIFIED CORRECT', 122, y + 23, { align: 'center' });
  doc.text(approvedLabel || 'PUNONG BARANGAY', 180, y + 23, { align: 'center' });
}

// ─── GET REPORT BLOB (For Upload) ────────────────────────
async function getReportBlob(reportType, formData, barangayId, module = 'treasurer') {
  const doc = await generateReport(reportType, formData, barangayId, module);
  if (typeof doc.output !== 'function') throw new Error('PDF output not supported');
  return doc.output('blob');
}

// ─── DOWNLOAD REPORT ─────────────────────────────────────
async function downloadReport(reportType, formData, barangayId, module = 'treasurer') {
  try {
    showToast('Generating report...', 'info');
    const doc = await generateReport(reportType, formData, barangayId, module);
    const allTypes = { ...REPORT_TYPES, ...SK_REPORT_TYPES };
    const prefix = module === 'sk' ? 'BFMSS_SK' : 'BFMSS';
    const filename = `${prefix}_${(allTypes[reportType]?.label || reportType).replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;

    if (typeof doc.output !== 'function') {
      throw new Error('PDF output not supported by this environment');
    }

    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    return { success: true, filename };
  } catch (err) {
    showToast('Error generating report: ' + err.message, 'error');
    return { success: false };
  }
}

// ─── DOWNLOAD AS ZIP ─────────────────────────────────────
async function downloadReportAsZip(reportType, formData, barangayId, module = 'treasurer') {
  return new Promise((resolve) => {
    loadJSZip(async () => {
      try {
        showToast('Packaging report as ZIP...', 'info');
        const doc = await generateReport(reportType, formData, barangayId, module);
        const allTypes = { ...REPORT_TYPES, ...SK_REPORT_TYPES };
        const prefix = module === 'sk' ? 'BFMSS_SK' : 'BFMSS';
        const pdfFilename = `${prefix}_${(allTypes[reportType]?.label || reportType).replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;

        const zip = new JSZip();
        const folder = zip.folder(prefix + '_Reports');
        folder.file(pdfFilename, doc.output('blob'));

        // Add summary CSV — scoped to the report's period if applicable
        const range = computePeriodRange(formData.periodType, formData._range || {});
        const from = formData.dateFrom || range.from;
        const to = formData.dateTo || range.to;
        let income = [], expenses = [];
        if (formData.periodType) {
          income = await getPeriodIncome(module, barangayId, from, to);
          expenses = await getPeriodExpenses(module, barangayId, from, to);
        } else {
          income = await DB.filter(getModuleTables(module).incomeKey, { barangayId });
          expenses = await DB.filter(getModuleTables(module).expenseKey, { barangayId });
        }
        const csvLines = ['Type,Description,Amount,Date,Status'];
        income.forEach(i => csvLines.push(`Income,${i.source},${i.amount},${i.dateReceived},${i.status}`));
        expenses.forEach(e => csvLines.push(`Expense,${e.description},${e.amount},${e.dateSpent},${e.status}`));
        folder.file('financial_data.csv', csvLines.join('\n'));

        // README
        folder.file('README.txt', `${prefix} Report Package\nGenerated: ${new Date().toLocaleString('en-PH')}\nReport Type: ${allTypes[reportType]?.label}\nFrequency: ${PERIOD_TYPES[formData.periodType]?.label || 'N/A'}\nPeriod: ${formData.period || range.label}\nBarangay ID: ${barangayId}\n\nFiles:\n- ${pdfFilename} (PDF Report)\n- financial_data.csv (Raw Data)\n`);

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipFilename = `${prefix}_${(allTypes[reportType]?.label || reportType).replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.zip`;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(zipBlob);
        a.download = zipFilename;
        a.click();
        showToast('ZIP downloaded successfully!', 'success');
        resolve({ success: true });
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
        resolve({ success: false });
      }
    });
  });
}

// ─── SHARED REPORT FORM RENDERING (Daily → Monthly → Yearly UI) ──
// Renders form fields for a report type into `containerEl`. Handles the
// special 'periodType' (select) + 'period' (auto-filled, read-only-ish)
// fields so the Daily/Monthly/Quarterly/Yearly/Custom logic is automatic
// across all reports/pages (Treasurer & SK).
async function renderReportFormFields(containerEl, reportType, defaults = {}) {
  // Auto-fill officials from barangay DB if not already provided
  const user = DB.getCurrentUser && DB.getCurrentUser();
  if (user && user.barangayId) {
    const brgy = await DB.getBarangay(user.barangayId);
    if (brgy) {
      if (!defaults.preparedBy && !defaults.userFullName) defaults.preparedBy = brgy.treasurer || '';
      if (!defaults.certifiedBy) defaults.certifiedBy = '';
      if (!defaults.approvedBy) defaults.approvedBy = brgy.punongBarangay || '';
      if (!defaults.skTreasurer) defaults.skTreasurer = brgy.treasurer || '';
      if (!defaults.skChairperson) defaults.skChairperson = brgy.skChairperson || '';
      if (!defaults.cityCode) defaults.cityCode = brgy.cityCode || '';
      if (!defaults.barangayCode) defaults.barangayCode = brgy.barangayCode || '';
    }
  }

  const fields = REPORT_FIELDS[reportType] || [];
  containerEl.innerHTML = fields.map(f => {
    const req = f.required ? ' <span style="color:#dc2626">*</span>' : '';

    // All select fields
    if (f.type === 'select') {
      const opts = Object.entries(f.options || {})
        .map(([val, cfg]) => `<option value="${val}" ${val === (defaults[f.id] || (f.id === 'periodType' ? 'monthly' : '')) ? 'selected' : ''}>${cfg.label}</option>`)
        .join('');
      const onChange = f.id === 'periodType' ? ' onchange="onPeriodTypeChange()"' : '';
      return `<div class="form-group"><label>${f.label}${req}</label><select id="rf-${f.id}" class="form-control"${onChange}>${opts}</select></div>`;
    }

    if (f.id === 'period') {
      return `<div class="form-group"><label>${f.label}${req}</label><input type="text" id="rf-${f.id}" class="form-control" placeholder="${f.placeholder || ''}" value="${defaults.period || ''}">
        <div id="period-extra-controls" style="margin-top:6px;"></div></div>`;
    }

    if (f.type === 'textarea') {
      return `<div class="form-group"><label>${f.label}${req}</label><textarea id="rf-${f.id}" class="form-control" rows="4" placeholder="${f.placeholder || ''}">${defaults[f.id] || ''}</textarea></div>`;
    }

    // Default value resolution
    let val = defaults[f.id] !== undefined ? defaults[f.id] : '';
    if (!val) {
      if (f.type === 'date') val = today();
      else if (f.id === 'preparedBy' || f.id === 'certifiedBy' || f.id === 'skTreasurer') val = defaults.userFullName || '';
      else if (f.id === 'fiscalYear' || f.id === 'currentFY') val = new Date().getFullYear();
      else if (f.id === 'budgetFY') val = new Date().getFullYear() + 1;
    }
    return `<div class="form-group"><label>${f.label}${req}</label><input type="${f.type}" id="rf-${f.id}" class="form-control" placeholder="${f.placeholder || ''}" value="${val}"></div>`;
  }).join('');

  // Initialize the period auto-fill + extra controls if this report type uses periodType
  if (fields.some(f => f.id === 'periodType')) {
    onPeriodTypeChange();
  }
}

// Called when the "Report Frequency" select changes. Shows the right
// extra inputs (date / month / quarter+year / year / from-to) and
// auto-computes the "period" label + date range.
function onPeriodTypeChange() {
  const sel = document.getElementById('rf-periodType');
  const periodInput = document.getElementById('rf-period');
  const extra = document.getElementById('period-extra-controls');
  if (!sel || !periodInput || !extra) return;
  const type = sel.value;
  const now = new Date();

  let extraHTML = '';
  if (type === 'daily') {
    extraHTML = `<input type="date" id="period-opt-date" class="form-control" value="${today()}" onchange="recomputePeriod()">`;
  } else if (type === 'monthly') {
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    extraHTML = `<input type="month" id="period-opt-month" class="form-control" value="${ym}" onchange="recomputePeriod()">`;
  } else if (type === 'quarterly') {
    const q = Math.floor(now.getMonth() / 3) + 1;
    extraHTML = `<div style="display:flex;gap:8px;">
      <select id="period-opt-quarter" class="form-control" onchange="recomputePeriod()">
        ${[1, 2, 3, 4].map(n => `<option value="${n}" ${n === q ? 'selected' : ''}>Q${n}</option>`).join('')}
      </select>
      <input type="number" id="period-opt-year" class="form-control" value="${now.getFullYear()}" onchange="recomputePeriod()">
    </div>`;
  } else if (type === 'yearly') {
    extraHTML = `<input type="number" id="period-opt-year" class="form-control" value="${now.getFullYear()}" onchange="recomputePeriod()">`;
  } else if (type === 'custom') {
    extraHTML = `<div style="display:flex;gap:8px;">
      <input type="date" id="period-opt-from" class="form-control" value="${now.getFullYear()}-01-01" onchange="recomputePeriod()">
      <input type="date" id="period-opt-to" class="form-control" value="${today()}" onchange="recomputePeriod()">
    </div>`;
  }
  extra.innerHTML = extraHTML;
  recomputePeriod();
}

// Recomputes the read-only "period" label text based on current selectors.
function recomputePeriod() {
  const sel = document.getElementById('rf-periodType');
  const periodInput = document.getElementById('rf-period');
  if (!sel || !periodInput) return;
  const type = sel.value;
  const opts = {};
  if (type === 'daily') opts.date = document.getElementById('period-opt-date')?.value;
  if (type === 'monthly') opts.month = document.getElementById('period-opt-month')?.value;
  if (type === 'quarterly') {
    opts.quarter = parseInt(document.getElementById('period-opt-quarter')?.value || '1', 10);
    opts.year = parseInt(document.getElementById('period-opt-year')?.value || new Date().getFullYear(), 10);
  }
  if (type === 'yearly') opts.year = parseInt(document.getElementById('period-opt-year')?.value || new Date().getFullYear(), 10);
  if (type === 'custom') {
    opts.from = document.getElementById('period-opt-from')?.value;
    opts.to = document.getElementById('period-opt-to')?.value;
  }
  const range = computePeriodRange(type, opts);
  periodInput.value = range.label;
  periodInput.dataset.from = range.from;
  periodInput.dataset.to = range.to;
}

// Reads all rf-* fields plus the computed date range into a flat formData object.
function collectReportFormData(reportType) {
  const fields = REPORT_FIELDS[reportType] || [];
  const data = {};
  fields.forEach(f => {
    const el = document.getElementById('rf-' + f.id);
    if (el) data[f.id] = el.value;
  });
  const periodInput = document.getElementById('rf-period');
  if (periodInput && periodInput.dataset.from) {
    data.dateFrom = periodInput.dataset.from;
    data.dateTo = periodInput.dataset.to;
  }
  return data;
}