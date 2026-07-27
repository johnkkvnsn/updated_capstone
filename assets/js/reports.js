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
        const isLandscape = ['bfr4_procurement_plan', 'bfr5_notice_of_award', 'bfr7_statement_receipts', 'abstract_quotations', 'sk_abstract_quotations'].includes(reportType);
        const doc = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
        const brgy = await DB.getBarangay(barangayId) || { name: 'Unknown', municipality: 'Unknown', province: 'Laguna' };

        let y = 14; // Default start Y if no header
        
        const noHeaderReports = [
          'disbursement_voucher', 'sk_disbursement_voucher',
          'abstract_quotations', 'sk_abstract_quotations',
          'inspection_acceptance', 'bfr2_income_expenditure',
          'bfr3_nta_component', 'bfr4_procurement_plan',
          'bfr5_notice_of_award', 'bfr6_monthly_collections',
          'bfr7_statement_receipts', 'sk_cashbook'
        ];
        
        if (!noHeaderReports.includes(reportType)) {
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

          y = hy + 9;
        }

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
          disbursement_voucher: () => generateTreasurerDisbursementVoucher(doc, formData, brgy, y),
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
  const leftM = 14, rightM = 196, W = rightM - leftM;
  let currY = 14; 

  doc.setFontSize(10); doc.setFont(undefined, 'normal');
  doc.text('AIP Form No. 4', leftM, currY);
  doc.text('Annex 3', rightM, currY, { align: 'right' });
  currY += 10;

  doc.setFontSize(10);
  doc.text('Republic of the Philippines', 105, currY, { align: 'center' });
  doc.text(`Province of ${brgy.province || 'Laguna'}`, 105, currY + 4, { align: 'center' });
  doc.text(`City of ${brgy.municipality || 'San Pablo'}`, 105, currY + 8, { align: 'center' });
  doc.text(`Barangay ${brgy.name || ''}`, 105, currY + 12, { align: 'center' });
  currY += 25;

  doc.setFontSize(11); doc.setFont(undefined, 'bold');
  doc.text('PRIORITIES FOR DEVELOPMENT PROJECTS', 105, currY, { align: 'center' });
  doc.text('(20% COMPONENT OF NTA UTILIZATION)', 105, currY + 5, { align: 'center' });
  doc.text(`(FY: ${fd.fiscalYear || new Date().getFullYear()})`, 105, currY + 10, { align: 'center' });
  currY += 20;

  const totalNTA = parseFloat(fd.totalNTA || 0);
  const twentyPct = totalNTA * 0.2;

  doc.setFontSize(10); doc.setFont(undefined, 'normal');
  doc.text('TOTAL NTA for FY:', leftM, currY);
  doc.text(`Php ${formatNum(totalNTA)}`, leftM + 45, currY);
  currY += 5;
  doc.text('X 20% =', leftM, currY);
  doc.text(`Php ${formatNum(twentyPct)}`, leftM + 45, currY);
  currY += 10;

  const rawProjects = (fd.projects || '').split('\n').filter(l => l.trim()).map(line => {
    const parts = parseCSVLine(line);
    const [desc, cost] = parts;
    return { desc: desc || '', cost: safeParseFloat(cost) };
  });

  const c1 = leftM + 60; // Desc -> Rank
  const c2 = c1 + 30;    // Rank -> Cost
  const c3 = c2 + 40;    // Cost -> Cum Total

  const hH = 20;
  doc.setLineWidth(0.3);
  doc.rect(leftM, currY, W, hH);
  doc.line(c1, currY, c1, currY + hH);
  doc.line(c2, currY, c2, currY + hH);
  doc.line(c3, currY, c3, currY + hH);

  doc.setFontSize(9.5); doc.setFont(undefined, 'normal');
  doc.text('Priority Development Projects\nFunded by the 20% of NTA\n\nProject Description (1)', leftM + (c1-leftM)/2, currY + 5, { align: 'center' });
  doc.text('RANK\n(2)', c1 + (c2-c1)/2, currY + 8, { align: 'center' });
  doc.text('Project Cost\n(3)', c2 + (c3-c2)/2, currY + 8, { align: 'center' });
  doc.text('Cumulative\nTOTAL\n(4)', c3 + (rightM-c3)/2, currY + 6, { align: 'center' });
  currY += hH;

  const bodyH = Math.max(rawProjects.length * 8 + 10, 100); 
  doc.rect(leftM, currY, W, bodyH);
  doc.line(c1, currY, c1, currY + bodyH);
  doc.line(c2, currY, c2, currY + bodyH);
  doc.line(c3, currY, c3, currY + bodyH);

  let py = currY + 8;
  let cumulative = 0;
  rawProjects.forEach((p, i) => {
    cumulative += p.cost;
    
    const lines = doc.splitTextToSize(p.desc, c1 - leftM - 4);
    doc.text(lines, leftM + 2, py);
    
    doc.text(String(i + 1), c1 + (c2-c1)/2, py, { align: 'center' });
    doc.text(formatNum(p.cost), c2 + (c3-c2)/2, py, { align: 'center' });
    doc.text(formatNum(cumulative), c3 + (rightM-c3)/2, py, { align: 'center' });
    
    py += Math.max(lines.length * 4.5, 6) + 4;
  });
  currY += bodyH;

  // Instructions Box
  currY += 5;
  doc.rect(leftM, currY, 35, 6);
  doc.setFont(undefined, 'bold');
  doc.text('Instructions:', leftM + 17.5, currY + 4, { align: 'center' });
  currY += 12;

  doc.setFont(undefined, 'normal'); doc.setFontSize(9.5);
  const instructions = [
    '(1) Describe the project to be implemented like construction of a Day Care Center,\n      acquisition of a computer, etc, in their order of priority.',
    '(2) Indicate in this column the ranking of development projects in their proper order,\n      Rank 1 is the first priority, Rank 2 is the second, etc.',
    '(3) Indicate the total project cost that will complete the project.',
    '(4) Add all project costs from Rank 1 to the last rank equivalent to the 20% of the NTA\n      or higher'
  ];
  
  instructions.forEach(t => { 
    const lines = t.split('\n');
    lines.forEach((l, li) => {
       doc.text(l, leftM + 5, currY);
       currY += 4.5;
    });
  });
  
  currY += 15;
  doc.text('Reference: Department of Budget and Management. (2006). Budget Operations Manual for Barangays', leftM, currY);
}

// ── BFR-5: List of Notices of Award — Annex 5 ──
function generateBFR5(doc, fd, brgy, y) {
  const leftM = 14, rightM = 283, W = rightM - leftM;
  let currY = 14; 

  doc.setFontSize(10); doc.setFont(undefined, 'normal');
  doc.text('Annex 5', rightM, currY, { align: 'right' });
  currY += 5;

  doc.text('Republic of the Philippines', 148.5, currY, { align: 'center' });
  doc.text(`Province of ${brgy.province || 'Laguna'}`, 148.5, currY + 4, { align: 'center' });
  doc.text(`City of ${brgy.municipality || 'San Pablo'}`, 148.5, currY + 8, { align: 'center' });
  doc.text(`Barangay ${brgy.name || ''}`, 148.5, currY + 12, { align: 'center' });
  currY += 20;

  doc.setFontSize(12); doc.setFont(undefined, 'bold');
  doc.text('LIST OF NOTICES OF AWARD', 148.5, currY, { align: 'center' });
  
  doc.setFontSize(10); doc.setFont(undefined, 'normal');
  const quarterLabel = { '1st': '1st', '2nd': '2nd', '3rd': '3rd', '4th': '4th' }[fd.quarter] || fd.quarter || '';
  doc.text(`For the ${quarterLabel} Quarter of ${fd.fiscalYear || ''}`, 148.5, currY + 5, { align: 'center' });
  currY += 10;

  const rawAwards = (fd.awards || '').split('\n').filter(l => l.trim()).map(line => {
    const parts = parseCSVLine(line);
    const [date, project, type, supplier, amount, remarks] = parts;
    return { date: date || '', project: project || '', type: (type || '').toLowerCase(), supplier: supplier || '', amount: safeParseFloat(amount), remarks: remarks || '' };
  });

  const c1 = leftM + 25; 
  const c2 = c1 + 65;    
  const c3 = c2 + 45;    
  const cDesc1 = c2 + 15;
  const cDesc2 = cDesc1 + 15;
  const c4 = c3 + 60;    
  const c5 = c4 + 35;    

  const headerH = 15;
  doc.setLineWidth(0.3);
  doc.rect(leftM, currY, W, headerH);
  
  doc.line(c1, currY, c1, currY + headerH);
  doc.line(c2, currY, c2, currY + headerH);
  doc.line(c3, currY, c3, currY + headerH);
  doc.line(c4, currY, c4, currY + headerH);
  doc.line(c5, currY, c5, currY + headerH);

  doc.line(c2, currY + 7, c3, currY + 7);
  doc.line(cDesc1, currY + 7, cDesc1, currY + headerH);
  doc.line(cDesc2, currY + 7, cDesc2, currY + headerH);

  doc.setFontSize(10); doc.setFont(undefined, 'bold');
  doc.text('DATE', leftM + (c1-leftM)/2, currY + 9, { align: 'center' });
  doc.text('NAME OF PROJECT', c1 + (c2-c1)/2, currY + 9, { align: 'center' });
  
  doc.text('DESCRIPTION', c2 + (c3-c2)/2, currY + 4, { align: 'center' });
  doc.setFontSize(8);
  doc.text('(Please check)', c2 + (c3-c2)/2, currY + 6.5, { align: 'center' });
  doc.setFontSize(9);
  doc.text('Infrastructure', c2 + (cDesc1-c2)/2, currY + 12, { align: 'center' });
  doc.text('Goods', cDesc1 + (cDesc2-cDesc1)/2, currY + 12, { align: 'center' });
  doc.text('Service', cDesc2 + (c3-cDesc2)/2, currY + 12, { align: 'center' });
  
  doc.setFontSize(10);
  doc.text('NAME OF SUPPLIER', c3 + (c4-c3)/2, currY + 9, { align: 'center' });
  doc.text('AMOUNT', c4 + (c5-c4)/2, currY + 9, { align: 'center' });
  doc.text('REMARKS', c5 + (rightM-c5)/2, currY + 9, { align: 'center' });

  currY += headerH;

  const rowH = 7;
  const numRows = Math.max(rawAwards.length, 7);
  const bodyH = numRows * rowH;
  
  doc.rect(leftM, currY, W, bodyH);
  doc.line(c1, currY, c1, currY + bodyH);
  doc.line(c2, currY, c2, currY + bodyH);
  doc.line(cDesc1, currY, cDesc1, currY + bodyH);
  doc.line(cDesc2, currY, cDesc2, currY + bodyH);
  doc.line(c3, currY, c3, currY + bodyH);
  doc.line(c4, currY, c4, currY + bodyH);
  doc.line(c5, currY, c5, currY + bodyH);

  for(let i=1; i<numRows; i++) {
    doc.line(leftM, currY + (i*rowH), rightM, currY + (i*rowH));
  }

  doc.setFontSize(10); doc.setFont(undefined, 'normal');
  for(let i=0; i<numRows; i++) {
    const py = currY + (i*rowH) + 5;
    if (i < rawAwards.length) {
      const a = rawAwards[i];
      doc.text(a.date, leftM + (c1-leftM)/2, py, { align: 'center' });
      doc.text(doc.splitTextToSize(a.project, c2-c1-2), c1 + 2, py - 1);
      
      if (a.type.startsWith('infra')) doc.text('X', c2 + (cDesc1-c2)/2, py, { align: 'center' });
      if (a.type.startsWith('good')) doc.text('X', cDesc1 + (cDesc2-cDesc1)/2, py, { align: 'center' });
      if (a.type.startsWith('serv')) doc.text('X', cDesc2 + (c3-cDesc2)/2, py, { align: 'center' });
      
      doc.text(doc.splitTextToSize(a.supplier, c4-c3-2), c3 + (c4-c3)/2, py - 1, { align: 'center' });
      doc.text(formatNum(a.amount), c5 - 2, py, { align: 'right' });
      doc.text(doc.splitTextToSize(a.remarks, rightM-c5-2), c5 + (rightM-c5)/2, py - 1, { align: 'center' });
    }
  }

  currY += bodyH + 15;

  doc.text('Prepared by:', leftM, currY);
  doc.text('Approved by:', 148.5, currY);
  currY += 10;
  
  doc.text(fd.preparedBy || fd._autoTreasurer || '____________________', leftM, currY);
  doc.text(fd.approvedBy || fd._autoPunong || '____________________', 148.5, currY);
  currY += 4;
  
  doc.text('Barangay Treasurer', leftM, currY);
  doc.text('Punong Barangay', 148.5, currY);
}

// ── BFR-6 / BFR-1 / SK Cashbook: Itemized Collections & Disbursements — Annex 6 ──
// Pulls real income/expense records for the resolved period into a two-column ledger
async function generateBFR6(doc, fd, brgy, y, module = 'treasurer') {
  const leftM = 14, rightM = 196, W = rightM - leftM;
  let currY = 14; 

  doc.setFontSize(10); doc.setFont(undefined, 'normal');
  doc.text('Annex 6', rightM, currY, { align: 'right' });
  currY += 10;

  doc.text('Republic of the Philippines', 105, currY, { align: 'center' });
  doc.text(`Province of ${brgy.province || 'Laguna'}`, 105, currY + 4, { align: 'center' });
  doc.text(`City of ${brgy.municipality || 'San Pablo'}`, 105, currY + 8, { align: 'center' });
  doc.text(`Barangay ${brgy.name || ''}`, 105, currY + 12, { align: 'center' });
  currY += 20;

  doc.setFontSize(11); doc.setFont(undefined, 'bold');
  doc.text('ITEMIZED MONTHLY COLLECTIONS AND DISBURSEMENTS', 105, currY, { align: 'center' });
  
  const range = computePeriodRange(fd.periodType, fd._range || {});
  const from = fd.dateFrom || range.from;
  const to = fd.dateTo || range.to;
  doc.setFontSize(10); doc.setFont(undefined, 'normal');
  doc.text(`For the ${fd.period || range.label || ''}`, 105, currY + 5, { align: 'center' });
  currY += 12;

  const allInc = await getPeriodIncome(module, brgy.id, from, to);
  const income = allInc.filter(i => i.status === 'approved');
  const expenses = await getPeriodExpenses(module, brgy.id, from, to, { approvedOnly: true });

  const midX = 105;
  const c1 = leftM + 25; 
  const c2 = midX - 30;  
  const c3 = midX + 25;  
  const c4 = rightM - 30; 

  const headerH = 12;
  doc.setLineWidth(0.3);
  doc.rect(leftM, currY, W, headerH);
  
  doc.line(midX, currY, midX, currY + headerH);
  doc.line(leftM, currY + 6, rightM, currY + 6);
  
  doc.line(c1, currY + 6, c1, currY + headerH);
  doc.line(c2, currY + 6, c2, currY + headerH);
  doc.line(c3, currY + 6, c3, currY + headerH);
  doc.line(c4, currY + 6, c4, currY + headerH);

  doc.setFontSize(10); doc.setFont(undefined, 'bold');
  doc.text('COLLECTION', leftM + (midX-leftM)/2, currY + 4, { align: 'center' });
  doc.text('DISBURSEMENT', midX + (rightM-midX)/2, currY + 4, { align: 'center' });

  doc.setFontSize(9);
  doc.text('DATE', leftM + (c1-leftM)/2, currY + 10, { align: 'center' });
  doc.text('PARTICULARS', c1 + (c2-c1)/2, currY + 10, { align: 'center' });
  doc.text('AMOUNT', c2 + (midX-c2)/2, currY + 10, { align: 'center' });
  
  doc.text('DATE', midX + (c3-midX)/2, currY + 10, { align: 'center' });
  doc.text('PARTICULARS', c3 + (c4-c3)/2, currY + 10, { align: 'center' });
  doc.text('AMOUNT', c4 + (rightM-c4)/2, currY + 10, { align: 'center' });

  currY += headerH;

  const rowH = 6;
  const numRows = Math.max(income.length, expenses.length, 10);
  const bodyH = numRows * rowH;
  
  doc.rect(leftM, currY, W, bodyH);
  doc.line(midX, currY, midX, currY + bodyH);
  doc.line(c1, currY, c1, currY + bodyH);
  doc.line(c2, currY, c2, currY + bodyH);
  doc.line(c3, currY, c3, currY + bodyH);
  doc.line(c4, currY, c4, currY + bodyH);

  for(let i=1; i<numRows; i++) {
    doc.line(leftM, currY + (i*rowH), rightM, currY + (i*rowH));
  }

  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  let totInc = 0;
  for(let i=0; i<numRows; i++) {
    const py = currY + (i*rowH) + 4.5;
    if (i < income.length) {
      const inc = income[i];
      totInc += inc.amount;
      doc.text(formatDateShort(inc.dateReceived), leftM + (c1-leftM)/2, py, { align: 'center' });
      doc.text(doc.splitTextToSize(inc.source || '', c2-c1-2), c1 + 2, py - 1);
      doc.text(formatNum(inc.amount), c2 + (midX-c2)/2, py, { align: 'center' }); 
    }
  }

  let totExp = 0;
  for(let i=0; i<numRows; i++) {
    const py = currY + (i*rowH) + 4.5;
    if (i < expenses.length) {
      const exp = expenses[i];
      totExp += exp.amount;
      doc.text(formatDateShort(exp.dateSpent), midX + (c3-midX)/2, py, { align: 'center' });
      const payee = typeof exp.payee === 'object' ? exp.payee.name : (exp.payee || exp.description || '');
      doc.text(doc.splitTextToSize(payee, c4-c3-2), c3 + 2, py - 1);
      doc.text(formatNum(exp.amount), c4 + (rightM-c4)/2, py, { align: 'center' });
    }
  }

  currY += bodyH;

  const footH = 7;
  doc.rect(leftM, currY, W, footH);
  doc.line(midX, currY, midX, currY + footH);
  doc.line(c2, currY, c2, currY + footH);
  doc.line(c4, currY, c4, currY + footH);

  doc.setFont(undefined, 'bold');
  doc.text('TOTAL COLLECTION:', leftM + (c2-leftM)/2, currY + 5, { align: 'center' });
  doc.text(formatNum(totInc), c2 + (midX-c2)/2, currY + 5, { align: 'center' });
  doc.text('TOTAL EXPENSES:', midX + (c4-midX)/2, currY + 5, { align: 'center' });
  doc.text(formatNum(totExp), c4 + (rightM-c4)/2, currY + 5, { align: 'center' });

  currY += footH + 15;

  doc.setFont(undefined, 'normal');
  doc.text('Prepared by:', leftM, currY);
  doc.text('Noted by:', midX, currY);
  currY += 10;
  
  doc.text(fd.preparedBy || fd._autoTreasurer || '____________________', leftM, currY);
  doc.text(fd.approvedBy || fd._autoPunong || '____________________', midX, currY);
  currY += 4;
  
  const treasurerLabel = module === 'sk' ? 'SK Treasurer' : 'Barangay Treasurer';
  const approverLabel = module === 'sk' ? 'SK Chairperson' : 'Punong Barangay';
  doc.text(treasurerLabel, leftM, currY);
  doc.text(approverLabel, midX, currY);
}

async function generateBFR2(doc, fd, brgy, y) {
  const leftM = 14, rightM = 196, W = rightM - leftM;
  let currY = 14; 

  doc.setFontSize(10); doc.setFont(undefined, 'normal');
  doc.text('Barangay Budget Preparation Form No. 2', leftM, currY);
  doc.text('Annex 2', rightM, currY, { align: 'right' });
  currY += 10;

  doc.setFontSize(11);
  doc.text('Republic of the Philippines', 105, currY, { align: 'center' });
  doc.text(`Province of ${brgy.province || 'Laguna'}`, 105, currY + 5, { align: 'center' });
  doc.text(`City/Municipality of ${brgy.municipality || ''}`, 105, currY + 10, { align: 'center' });
  doc.text(`Barangay ${brgy.name || ''}`, 105, currY + 15, { align: 'center' });
  currY += 25;

  doc.setFont(undefined, 'bold');
  doc.text('ACTUAL INCOME AND EXPENDITURE FOR PAST YEAR', 105, currY, { align: 'center' });
  doc.text(`( FY: ${fd.fiscalYear || new Date().getFullYear()} )`, 105, currY + 5, { align: 'center' });
  currY += 10;
  doc.setLineWidth(0.8);
  doc.line(leftM, currY, rightM, currY);
  currY += 6;

  // Fetch data
  const module = 'treasurer';
  const yearStart = `${fd.fiscalYear}-01-01`, yearEnd = `${fd.fiscalYear}-12-31`;
  const allInc = await getPeriodIncome(module, brgy.id, yearStart, yearEnd);
  const income = allInc.filter(i => i.status === 'approved');
  const expenses = await getPeriodExpenses(module, brgy.id, yearStart, yearEnd, { approvedOnly: true });
  
  // FIX NaN BUG: Safely parse beginningBalanceOverride
  const overrideVal = safeParseFloat(fd.beginningBalanceOverride);
  const beginningBalance = overrideVal || await getBeginningBalance(module, brgy.id, yearStart);

  // ── Part A: Actual Income ──
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

  doc.setLineWidth(0.2); 
  doc.setFontSize(10); doc.setFont(undefined, 'italic');
  doc.text('Part A. Actual Income', leftM, currY);
  doc.setFont(undefined, 'normal');
  doc.text('TOTAL', rightM - 20, currY);
  currY += 8;

  const incomeRows = [
    ['Beginning Balance', beginningBalance],
    ['Share on Internal Revenue Collections', irAllotment],
    ['Share on Real Property Tax', rpt],
    ['Community Tax', communityTax],
    ['Clearance and Certification Fees', clearanceFees],
    ['Subsidy from Other LGUs', subsidy],
  ];
  if (otherIncome) incomeRows.push(['Other Income', otherIncome]);

  doc.setFontSize(10);
  incomeRows.forEach(([label, amt]) => {
    const labelW = doc.getTextWidth(label + ' ');
    const amtW = 35;
    const spaceW = doc.getTextWidth(' .');
    const dotsCount = Math.floor((rightM - leftM - labelW - amtW) / spaceW);
    const dots = ' .'.repeat(Math.max(0, dotsCount));
    
    doc.text(label + dots, leftM, currY);
    doc.text(formatNum(amt), rightM - 5, currY, { align: 'right' });
    currY += 5;
  });
  
  doc.text('Total Available Resources' + ' .'.repeat(Math.floor((rightM - leftM - doc.getTextWidth('Total Available Resources ') - 35) / doc.getTextWidth(' .'))), leftM, currY);
  doc.text(formatNum(totalAvailable), rightM - 5, currY, { align: 'right' });
  currY += 10;

  // ── Part B: Actual Expenditures ──
  doc.setFont(undefined, 'italic');
  doc.text('Part B. Actual Expenditures', leftM, currY);
  currY += 3;

  const hH = 15;
  doc.rect(leftM, currY, W, hH);
  const c1 = leftM + 75; // Programs
  const c2 = c1 + 25;    // PS
  const c3 = c2 + 35;    // MOOE
  const c4 = c3 + 22;    // CO
  
  doc.line(c1, currY, c1, currY + hH);
  doc.line(c2, currY, c2, currY + hH);
  doc.line(c3, currY, c3, currY + hH);
  doc.line(c4, currY, c4, currY + hH);

  doc.setFont(undefined, 'normal'); doc.setFontSize(10);
  doc.text('Programs/ Projects/ Activity', leftM + (c1-leftM)/2, currY + 8, { align: 'center' });
  doc.text('Personal\nServices', c1 + (c2-c1)/2, currY + 6, { align: 'center' });
  doc.text('Maintenance\nand\nOther Operating\nExpenses', c2 + (c3-c2)/2, currY + 3.5, { align: 'center' });
  doc.text('Capital\nOutlay', c3 + (c4-c3)/2, currY + 6, { align: 'center' });
  doc.text('TOTAL', c4 + (rightM-c4)/2, currY + 8, { align: 'center' });
  currY += hH;

  // Grid body rows
  const buckets = [
    { label: 'Personal Services', re: /personal services|salaries|wages|honorari/i, col: 'ps' },
    { label: 'MOOE', re: /^mooe$|maintenance and other operating/i, col: 'mooe' },
    { label: 'Capital Outlay', re: /capital outlay|equipment|construction/i, col: 'co' },
    { label: 'Day Care Services', re: /day\s*care/i, col: 'mooe' },
    { label: 'Health and Nutrition Services', re: /health|nutrition|medicine/i, col: 'mooe' },
    { label: 'Peace and Order Services', re: /peace and order|tanod|police/i, col: 'mooe' },
    { label: 'Administrative and Legislative\nServices', re: /administrative|legislative|office supplies/i, col: 'mooe' },
    { label: 'Implementation of Development\nProjects (20% of IRA)', re: /20%\s*(of\s*)?ira|development project/i, col: 'mooe' },
    { label: 'Implementation of SK Projects\n(10% SK Funds)', re: /\bsk\b.*(fund|project)|10%\s*sk/i, col: 'mooe' },
    { label: 'Implementation of Projects/\nActivities for Unforeseen\nEvents\n(5% CalamityFund)', re: /calamity|unforeseen|disaster/i, col: 'mooe' },
    { label: 'Implementation of GAD\nProjects', re: /\bgad\b|gender and development/i, col: 'mooe' },
    { label: 'Implementation of SC\nPPAS', re: /senior citizen|\bsc\s*ppa/i, col: 'mooe' },
    { label: 'Implementation of BCPC\nPPAs', re: /bcpc/i, col: 'mooe' },
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

  // Draw body
  const bodyH = 150; 
  doc.rect(leftM, currY, W, bodyH);
  doc.line(c1, currY, c1, currY + bodyH);
  doc.line(c2, currY, c2, currY + bodyH);
  doc.line(c3, currY, c3, currY + bodyH);
  doc.line(c4, currY, c4, currY + bodyH);

  let py = currY + 6;
  let totPS = 0, totMOOE = 0, totCO = 0;
  
  buckets.forEach((b, i) => {
    const amt = bucketTotals[i];
    const lines = b.label.split('\n');
    lines.forEach((l, li) => {
      doc.text(l, leftM + 2, py + (li * 4));
    });
    
    const ps = b.col === 'ps' ? amt : 0, mooe = b.col === 'mooe' ? amt : 0, co = b.col === 'co' ? amt : 0;
    
    if (ps) doc.text(formatNum(ps), c2 - 2, py, { align: 'right' });
    if (mooe) doc.text(formatNum(mooe), c3 - 2, py, { align: 'right' });
    if (co) doc.text(formatNum(co), c4 - 2, py, { align: 'right' });
    if (amt) doc.text(formatNum(amt), rightM - 2, py, { align: 'right' });
    
    totPS += ps; totMOOE += mooe; totCO += co;
    py += Math.max(lines.length * 4.5, 6) + 1.5;
  });
  
  if (unclassifiedTotal) {
    doc.text('Other Programs/Activities', leftM + 2, py);
    doc.text(formatNum(unclassifiedTotal), c3 - 2, py, { align: 'right' });
    doc.text(formatNum(unclassifiedTotal), rightM - 2, py, { align: 'right' });
    totMOOE += unclassifiedTotal;
    py += 8;
  }
  
  const totalExpenditures = totPS + totMOOE + totCO;
  doc.text('Total Expenditures', leftM + 15, py);
  doc.text(formatNum(totPS), c2 - 2, py, { align: 'right' });
  doc.text(formatNum(totMOOE), c3 - 2, py, { align: 'right' });
  doc.text(formatNum(totCO), c4 - 2, py, { align: 'right' });
  doc.text(formatNum(totalExpenditures), rightM - 2, py, { align: 'right' });
  
  currY += bodyH;

  // Balance Footer Row
  const balH = 6;
  doc.rect(leftM, currY, W, balH);
  doc.line(c4, currY, c4, currY + balH);
  
  const balance = totalAvailable - totalExpenditures;
  doc.setFontSize(10);
  doc.text('BALANCE/ DEFICIT', leftM + 2, currY + 4);
  doc.setFont(undefined, 'bold');
  doc.text(formatNum(balance), rightM - 2, currY + 4, { align: 'right' });
  currY += balH;

  // Move to next page for signatures if not enough space
  if (currY > 250) {
    doc.addPage();
    currY = 20;
  } else {
    currY += 15;
  }

  // Signatures
  doc.setFontSize(10); doc.setFont(undefined, 'normal');
  doc.text('Prepared by:', leftM, currY);
  doc.text('Certified by:', 85, currY);
  doc.text('Approved by:', 150, currY);
  currY += 8;

  doc.text(fd.preparedBy || fd._autoTreasurer || '____________________', leftM, currY);
  doc.text(fd.certifiedBy || '____________________', 85, currY);
  doc.text(fd.approvedBy || fd._autoPunong || '____________________', 150, currY);
  currY += 4;
  
  doc.text('Barangay Treasurer', leftM, currY);
  doc.text('City Accountant', 85, currY);
  doc.text('Punong Barangay', 150, currY);
  currY += 15;
  
  doc.line(leftM, currY, rightM, currY);
  currY += 5;
  
  // Instructions
  doc.rect(leftM, currY, rightM-leftM, 5);
  doc.text('Instructions:', leftM + 2, currY + 3.5);
  currY += 10;
  
  const instrA = 'A. Indicate the Actual Income for the Past Year from all sources.';
  const instrB = 'B. Indicate the Actual Expenditure for the Past Year by Major Final Output or Program/ Project/ Activity and by expenditure class (Personal Services, Maintenance and Other Operating Expenses and Capital Outlay)';
  doc.text(instrA, leftM + 5, currY); currY += 5;
  const linesB = doc.splitTextToSize(instrB, W - 10);
  doc.text(linesB, leftM + 5, currY); currY += linesB.length * 4.5 + 5;
  
  doc.text('Reference: Department of Budget and Management. (2006). Budget Operations Manual for Barangays', leftM, currY);
}

// ── BFR-4: Annual Procurement Plan (Annex 4) — with quarterly distribution matrix ──
function generateBFR4(doc, fd, brgy, y) {
  const leftM = 14, rightM = 283, W = rightM - leftM;
  let currY = 14; 

  doc.setFontSize(10); doc.setFont(undefined, 'normal');
  doc.text('Annex 4', leftM, currY);
  currY += 5;

  doc.text('Republic of the Philippines', 148.5, currY, { align: 'center' });
  doc.text(`Province of ${brgy.province || 'Laguna'}`, 148.5, currY + 4, { align: 'center' });
  doc.text(`City of ${brgy.municipality || 'San Pablo'}`, 148.5, currY + 8, { align: 'center' });
  doc.text(`Barangay ${brgy.name || ''}`, 148.5, currY + 12, { align: 'center' });
  currY += 20;

  doc.setFontSize(12); doc.setFont(undefined, 'bold');
  doc.text('ANNUAL PROCUREMENT PLAN', 148.5, currY, { align: 'center' });
  doc.text(`(FY: ${fd.fiscalYear || new Date().getFullYear()})`, 148.5, currY + 5, { align: 'center' });
  currY += 10;

  const rawItems = (fd.items || '').split('\n').filter(l => l.trim()).map((line, i) => {
    const parts = parseCSVLine(line);
    const [desc, cost, quarter] = parts;
    return { no: i + 1, desc: desc || '', cost: safeParseFloat(cost), quarter: parseInt(quarter || '1', 10) };
  });
  const totalAmount = rawItems.reduce((s, it) => s + it.cost, 0);
  const qTotals = [0, 0, 0, 0];
  rawItems.forEach(it => { if (it.quarter >= 1 && it.quarter <= 4) qTotals[it.quarter - 1] += it.cost; });

  // Header Box
  const headerH = 20;
  doc.setLineWidth(0.3);
  doc.rect(leftM, currY, W, headerH);
  doc.line(leftM, currY + 6, rightM, currY + 6);
  doc.line(leftM, currY + 12, rightM, currY + 12);

  const planX = leftM + 150;
  doc.line(planX, currY + 6, planX, currY + 20); 
  
  const regW = 20, contW = 25, totW = 30;
  doc.line(planX + regW, currY + 12, planX + regW, currY + 20);
  doc.line(planX + regW + contW, currY + 12, planX + regW + contW, currY + 20);
  const submitX = planX + regW + contW + totW;
  doc.line(submitX, currY + 12, submitX, currY + 20);

  doc.setFontSize(10); doc.setFont(undefined, 'normal');
  doc.text(`Name of Barangay: ${brgy.name || ''}`, leftM + 2, currY + 4);
  
  doc.text(`Program Control No. ${fd.programControlNo || ''}`, leftM + 2, currY + 10);
  doc.text('PLANNED AMOUNT', planX + (rightM-planX)/2, currY + 10, { align: 'center' });
  
  doc.text(`Department/ Office: Barangay ${brgy.name || ''}`, leftM + 2, currY + 17);
  doc.text('Regular', planX + regW/2, currY + 16, { align: 'center' });
  doc.text('Contingency', planX + regW + contW/2, currY + 16, { align: 'center' });
  doc.text('Total\n' + formatNum(totalAmount), planX + regW + contW + totW/2, currY + 15, { align: 'center' });
  doc.text(`Date Submitted: ${formatDateShort(fd.dateSubmitted) || ''}`, submitX + 2, currY + 17);

  currY += headerH;

  // Grid Columns
  const c1 = leftM + 12;
  const c2 = c1 + 65;
  const c3 = c2 + 20;
  const c4 = c3 + 12;
  const c5 = c4 + 15;
  const c6 = c5 + 25;
  const cQW = (rightM - c6) / 4; 
  const c7 = c6 + cQW;
  const c8 = c7 + cQW;
  const c9 = c8 + cQW;

  const ghH = 20;
  doc.rect(leftM, currY, W, ghH);
  
  doc.line(c1, currY, c1, currY + ghH);
  doc.line(c2, currY, c2, currY + ghH);
  doc.line(c3, currY, c3, currY + ghH);
  doc.line(c4, currY, c4, currY + ghH);
  doc.line(c5, currY, c5, currY + ghH);
  doc.line(c6, currY, c6, currY + ghH);
  doc.line(c7, currY + 6, c7, currY + ghH);
  doc.line(c8, currY + 6, c8, currY + ghH);
  doc.line(c9, currY + 6, c9, currY + ghH);

  doc.line(c6, currY + 6, rightM, currY + 6);
  doc.text('Distribution', c6 + (rightM-c6)/2, currY + 4.5, { align: 'center' });
  
  doc.line(c6, currY + 12, rightM, currY + 12);
  doc.text('1st Quarter', c6 + cQW/2, currY + 10, { align: 'center' });
  doc.text('2nd Quarter', c7 + cQW/2, currY + 10, { align: 'center' });
  doc.text('3rd Quarter', c8 + cQW/2, currY + 10, { align: 'center' });
  doc.text('4th Quarter', c9 + cQW/2, currY + 10, { align: 'center' });

  for(let i=0; i<4; i++) {
    const qX = c6 + (i*cQW);
    const splitX = qX + 10;
    doc.line(splitX, currY + 12, splitX, currY + ghH);
    doc.text('Qty', qX + 5, currY + 17, { align: 'center' });
    doc.text('Amount', splitX + (cQW-10)/2, currY + 17, { align: 'center' });
  }

  doc.text('Item\nNo.', leftM + 6, currY + 10, { align: 'center' });
  doc.text('Description', c1 + (c2-c1)/2, currY + 12, { align: 'center' });
  doc.text('Unit Cost', c2 + (c3-c2)/2, currY + 12, { align: 'center' });
  doc.text('Qty', c3 + (c4-c3)/2, currY + 12, { align: 'center' });
  doc.text('Unit', c4 + (c5-c4)/2, currY + 12, { align: 'center' });
  doc.text('Total Cost', c5 + (c6-c5)/2, currY + 12, { align: 'center' });
  currY += ghH;

  const bodyH = Math.max(rawItems.length * 6 + 10, 80); 
  doc.rect(leftM, currY, W, bodyH);
  
  doc.line(c1, currY, c1, currY + bodyH);
  doc.line(c2, currY, c2, currY + bodyH);
  doc.line(c3, currY, c3, currY + bodyH);
  doc.line(c4, currY, c4, currY + bodyH);
  doc.line(c5, currY, c5, currY + bodyH);
  doc.line(c6, currY, c6, currY + bodyH);
  doc.line(c7, currY, c7, currY + bodyH);
  doc.line(c8, currY, c8, currY + bodyH);
  doc.line(c9, currY, c9, currY + bodyH);

  for(let i=0; i<4; i++) {
    const splitX = c6 + (i*cQW) + 10;
    doc.line(splitX, currY, splitX, currY + bodyH);
  }

  let py = currY + 5;
  rawItems.forEach((it) => {
    doc.text(String(it.no), leftM + 6, py, { align: 'center' });
    doc.text(doc.splitTextToSize(it.desc, c2 - c1 - 2), c1 + (c2-c1)/2, py, { align: 'center' });
    doc.text(formatNum(it.cost), c5 + (c6-c5)/2, py, { align: 'center' });
    
    if (it.quarter >= 1 && it.quarter <= 4) {
      const qX = c6 + ((it.quarter - 1) * cQW);
      const splitX = qX + 10;
      doc.text('1', qX + 5, py, { align: 'center' });
      doc.text(formatNum(it.cost), splitX + (cQW-10)/2, py, { align: 'center' });
    }
    
    py += 6;
  });
  currY += bodyH;

  const fH = 8;
  doc.rect(leftM, currY, W, fH);
  for(let i=0; i<4; i++) {
    const qX = c6 + (i*cQW);
    const splitX = qX + 10;
    if(i > 0) doc.line(qX, currY, qX, currY + fH);
    doc.line(splitX, currY, splitX, currY + fH);
  }
  doc.line(c6, currY, c6, currY + fH);

  doc.text('Total', c1 + (c5-c1)/2, currY + 5.5, { align: 'center' });
  doc.text(formatNum(totalAmount), c5 + (c6-c5)/2, currY + 5.5, { align: 'center' });
  
  for(let i=0; i<4; i++) {
    const splitX = c6 + (i*cQW) + 10;
    doc.text(formatNum(qTotals[i]), splitX + (cQW-10)/2, currY + 5.5, { align: 'center' });
  }
  currY += fH + 10;

  doc.text('Prepared by:', leftM, currY);
  doc.text('Approved by:', leftM + 140, currY);
  currY += 10;
  
  doc.text(fd.preparedBy || fd._autoTreasurer || '____________________', leftM, currY);
  doc.text(fd.approvedBy || fd._autoPunong || '____________________', leftM + 140, currY);
  currY += 4;
  
  doc.text('Barangay Treasurer', leftM, currY);
  doc.text('Punong Barangay', leftM + 140, currY);
}
// ── BFR-7: Statement of Receipts and Expenditures (Annex B, JMC 2018-1) ──
// Full A/B/C revenue hierarchy + I/II expenditure hierarchy, split into
// First Semester / Second Semester / Total for the Actual (current) year.
async function generateBFR7(doc, fd, brgy, y) {
  const leftM = 14, rightM = 283, W = rightM - leftM;
  let currY = 14; 

  doc.setFontSize(12); doc.setFont(undefined, 'bold');
  doc.text('Barangay Financial Report', 148.5, currY, { align: 'center' }); currY += 5;
  doc.text('STATEMENT OF RECEIPTS AND EXPENDITURES', 148.5, currY, { align: 'center' });
  doc.setFont(undefined, 'normal'); currY += 9;

  doc.setFontSize(10);
  doc.text('City Code', 14, currY); doc.text(':', 50, currY); doc.text(fd.cityCode || '', 55, currY); currY += 5;
  doc.text('City Name', 14, currY); doc.text(':', 50, currY); doc.text(brgy.municipality || 'San Pablo', 55, currY); currY += 5;
  doc.text('Barangay Code', 14, currY); doc.text(':', 50, currY); doc.text(fd.barangayCode || '123', 55, currY); currY += 5;
  doc.text('Barangay Name', 14, currY); doc.text(':', 50, currY); doc.text(brgy.name || 'San Gabriel', 55, currY); currY += 5;
  doc.text('Year', 14, currY); doc.text(':', 50, currY); doc.text(`FY ${fd.currentFY || '2025'}`, 55, currY); currY += 8;

  const module = 'treasurer';
  const yr = fd.currentFY || new Date().getFullYear();
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

  const c1 = leftM + 80;
  const c2 = c1 + 25;
  const c3 = c2 + 25;
  const c4 = c3 + 90;
  const c4_1 = c3 + 30;
  const c4_2 = c4_1 + 30;

  const headerH = 20;
  doc.setLineWidth(0.3);
  doc.rect(leftM, currY, W, headerH);
  
  doc.line(c1, currY, c1, currY + headerH);
  doc.line(c2, currY, c2, currY + headerH);
  doc.line(c3, currY, c3, currY + headerH);
  doc.line(c4, currY, c4, currY + headerH);

  doc.line(c3, currY + 7, c4, currY + 7);
  doc.line(c4_1, currY + 7, c4_1, currY + headerH);
  doc.line(c4_2, currY + 7, c4_2, currY + headerH);

  doc.setFontSize(10); doc.setFont(undefined, 'normal');
  doc.text('Particulars\n(1)', leftM + (c1-leftM)/2, currY + 5, { align: 'center' });
  doc.text('Account Code\n(PGCA)\n(2)', c1 + (c2-c1)/2, currY + 5, { align: 'center' });
  doc.text('Actual Year', c2 + (c3-c2)/2, currY + 5, { align: 'center' });
  doc.text(String(yr - 1), c2 + (c3-c2)/2, currY + 16, { align: 'center' });

  doc.text('Current Year', c3 + (c4-c3)/2, currY + 5, { align: 'center' });
  doc.text('First\nSemester\n\n' + yr, c3 + 15, currY + 10.5, { align: 'center' });
  doc.text('Second\nSemester\n\n' + yr, c4_1 + 15, currY + 10.5, { align: 'center' });
  doc.text('Total\n\n\n' + yr, c4_2 + 15, currY + 10.5, { align: 'center' });

  doc.text('Budget Year\n\n\n' + (yr), c4 + (rightM-c4)/2, currY + 5, { align: 'center' });
  currY += headerH;

  const rowData = [];
  function pushRow(label, f, opts = {}) { rowData.push({ label, f, opts }); }

  pushRow('TOTAL REVENUE', totalRevenue, { bold: true });
  pushRow('A. Local Sources', localSources, { indent: 0 });
  pushRow('1. Tax Revenue', taxRevenue, { indent: 1 });
  pushRow('a. Real Property Tax', rpt, { indent: 2 });
  pushRow('b. Tax on Business', bizTax, { indent: 2 });
  pushRow('2. Non-Tax Revenue', nonTaxRevenue, { indent: 1 });
  pushRow('a. Fees and Charges', feesCharges, { indent: 2 });
  pushRow('b. Receipts from Economic Enterprise', econEnterprise, { indent: 2 });
  pushRow('c. Other Receipts (Other General Income)', otherReceipts, { indent: 2 });
  pushRow('B. External Sources', externalSources, { indent: 0 });
  pushRow('1. Internal Revenue Allotment', ira, { indent: 1 });
  pushRow('2. Share from National Wealth', natWealth, { indent: 1 });
  pushRow('3. Grants and Donations in Cash', grants, { indent: 1 });
  pushRow('4. Subsidy', subsidy, { indent: 1 });
  pushRow('C. Non-Income Receipts', nonIncomeReceipts, { indent: 0 });
  pushRow('1. Capital Investment Receipts', capitalReceipts, { indent: 1 });
  pushRow('a. Proceeds from Sale of Property, Plant and Equipment', capitalReceipts, { indent: 2 });
  pushRow('2. Receipts from Loans and Borrowings', borrowings, { indent: 1 });
  pushRow('a. Borrowings', borrowings, { indent: 2 });
  if (otherIncomeUnclassified.total) pushRow('Other Income (Unclassified)', otherIncomeUnclassified, { indent: 0 });
  
  pushRow('', null);
  pushRow('EXPENDITURES', totalExpenditures, { bold: true });
  pushRow('I. General Fund', generalFund, { indent: 0 });
  pushRow('a. General Services', genServices, { indent: 1 });
  pushRow('b. Economic Services', econServices, { indent: 1 });
  pushRow('c. Social Services', socServices, { indent: 1 });
  pushRow('d. Debt Services', debtServices, { indent: 1 });
  pushRow('II. Trust Fund from National Government Transfers', trustFund, { indent: 0 });
  if (otherExpUnclassified.total) pushRow('Other Expenditures (Unclassified)', otherExpUnclassified, { indent: 0 });
  pushRow('Total Expenditures', totalExpenditures, { bold: true });

  const rowH = 6;
  const bodyH = Math.max(rowData.length * rowH + 6, 200); 
  
  doc.rect(leftM, currY, W, bodyH);
  doc.line(c1, currY, c1, currY + bodyH);
  doc.line(c2, currY, c2, currY + bodyH);
  doc.line(c3, currY, c3, currY + bodyH);
  doc.line(c4, currY, c4, currY + bodyH);
  doc.line(c4_1, currY, c4_1, currY + bodyH);
  doc.line(c4_2, currY, c4_2, currY + bodyH);

  let py = currY + 5;
  rowData.forEach(r => {
    if(!r.label) { py += rowH; return; }
    doc.setFont(undefined, r.opts.bold ? 'bold' : 'normal');
    doc.text(r.label, leftM + 2 + (r.opts.indent || 0) * 4, py);
    
    if (r.f && r.f.total > 0) {
      doc.text(formatNum(r.f.total * 0.85), c3 - 2, py, { align: 'right' }); // Mock previous year
      doc.text(formatNum(r.f.h1), c4_1 - 2, py, { align: 'right' });
      doc.text(formatNum(r.f.h2), c4_2 - 2, py, { align: 'right' });
      doc.text(formatNum(r.f.total), c4 - 2, py, { align: 'right' });
      doc.text(formatNum(r.f.total), rightM - 2, py, { align: 'right' }); // Mock budget year
    }
    py += rowH;
  });

  currY += bodyH;

  const netResult = totalRevenue.total - totalExpenditures.total;
  const netH = 8;
  doc.rect(leftM, currY, W, netH);
  doc.line(c4, currY, c4, currY + netH);
  doc.setFont(undefined, 'bold');
  doc.text('NET RESULT (Revenue less Expenditures)', leftM + 2, currY + 5.5);
  doc.text(formatCurrencyPDF(netResult), c4 - 2, currY + 5.5, { align: 'right' });
  doc.text(formatCurrencyPDF(netResult), rightM - 2, currY + 5.5, { align: 'right' });
  currY += netH + 15;

  doc.setFont(undefined, 'normal');
  doc.text('Prepared by:', leftM, currY);
  doc.text('Approved by:', 148.5, currY);
  currY += 10;
  
  doc.text(fd.preparedBy || fd._autoTreasurer || '____________________', leftM, currY);
  doc.text(fd.approvedBy || fd._autoPunong || '____________________', 148.5, currY);
  currY += 4;
  
  doc.text('Barangay Treasurer', leftM, currY);
  doc.text('Punong Barangay', 148.5, currY);
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

function numberToWords(amount) {
  const num = Math.floor(amount);
  if (num === 0) return 'Zero';
  const a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const g = function (n) {
    let s = '';
    if (n >= 100) { s += a[Math.floor(n / 100)] + ' hundred '; n %= 100; }
    if (n < 20) s += a[n];
    else { s += b[Math.floor(n / 10)]; if (n % 10 > 0) s += ' ' + a[n % 10]; }
    return s.trim();
  };
  let str = '';
  if (num >= 1000000) { str += g(Math.floor(num / 1000000)) + ' million '; }
  let rem = num % 1000000;
  if (rem >= 1000) { str += g(Math.floor(rem / 1000)) + ' thousand '; }
  rem = rem % 1000;
  if (rem > 0) { str += g(rem); }
  str = str.trim();
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function generateTreasurerDisbursementVoucher(doc, fd, brgy, y) {
  const leftM = 14, rightM = 196, W = rightM - leftM;
  const dvDate = fd.dvDate ? new Date(fd.dvDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  let currY = y;

  // Outer Border Box top
  doc.setLineWidth(0.3);
  doc.rect(leftM, currY, W, 8); // Title box
  doc.setFontSize(11); doc.setFont(undefined, 'bold');

  // Row 1: Title split
  const splitTitle = 140;
  doc.line(splitTitle, currY, splitTitle, currY + 8);
  doc.text('DISBURSEMENT VOUCHER', leftM + (splitTitle - leftM) / 2, currY + 5.5, { align: 'center' });
  doc.setFontSize(8);
  doc.text(`DV NO.  ${fd.dvNumber || ''}`, splitTitle + 2, currY + 3.5);
  doc.setFont(undefined, 'normal');
  doc.text(`Date  ${dvDate}`, splitTitle + 2, currY + 7);
  currY += 8;

  // Row 2: Barangay / Tel | City / Province
  doc.rect(leftM, currY, W, 8);
  const split2 = 105;
  doc.line(split2, currY, split2, currY + 8);
  doc.text(`Barangay:       ${brgy.name || ''}`, leftM + 2, currY + 3.5);
  doc.text(`Tel. No.:       ${brgy.telNo || ''}`, leftM + 2, currY + 7);
  doc.text(`City/Municipality:    ${brgy.municipality || ''}`, split2 + 2, currY + 3.5);
  doc.text(`Province:             ${brgy.province || ''}`, split2 + 2, currY + 7);
  currY += 8;

  // Row 3: Payee | Fund / ObR
  doc.rect(leftM, currY, W, 8);
  doc.line(split2, currY, split2, currY + 8);
  doc.text(`Payee: ${fd.payee || ''}`, leftM + 2, currY + 5);
  doc.text(`Fund: ${fd.fundCluster || 'General Fund'}`, split2 + 2, currY + 3.5);
  doc.text(`ObR No.:`, split2 + 2, currY + 7);
  currY += 8;

  // Row 4: Address / TIN
  doc.rect(leftM, currY, W, 6);
  doc.text(`Address: ${fd.payeeAddress || ''}`, leftM + 2, currY + 4);
  doc.text(`TIN: ${fd.tin || ''}`, split2 + 10, currY + 4);
  currY += 6;

  // Row 5: Particulars / Amount Header
  const splitAmt = 155;
  doc.rect(leftM, currY, W, 6);
  doc.line(splitAmt, currY, splitAmt, currY + 6);
  doc.setFont(undefined, 'bold');
  doc.text('Particulars', leftM + (splitAmt - leftM) / 2, currY + 4.2, { align: 'center' });
  doc.text('Amount', splitAmt + (rightM - splitAmt) / 2, currY + 4.2, { align: 'center' });
  currY += 6;

  // Row 6: Body
  const bodyH = 75;
  doc.rect(leftM, currY, W, bodyH);
  doc.line(splitAmt, currY, splitAmt, currY + bodyH);

  doc.setFont(undefined, 'normal');
  const amount = parseFloat(fd.amount || 0);
  const amtStr = formatNum(amount);

  let py = currY + 12;
  const particularLines = doc.splitTextToSize(fd.particular || '', (splitAmt - leftM) - 16);
  doc.text(particularLines, leftM + 8, py);

  doc.text('Php', splitAmt + 3, py);
  doc.text(amtStr, rightM - 3, py, { align: 'right' });

  const nonVat = parseFloat(fd.nonVat || 0);
  const wtax = parseFloat(fd.withholdingTax || 0);
  let netAmount = amount;

  if (nonVat || wtax) {
    py += 20;
    if (nonVat) {
      netAmount -= nonVat;
      doc.text(`Less: VAT  ${amtStr} x 3%`, leftM + 12, py);
      doc.text(formatNum(nonVat), leftM + 80, py, { align: 'right' });
      doc.text(`( ${formatNum(nonVat)} )`, rightM - 3, py, { align: 'right' });
      py += 5;
    }
    if (wtax) {
      netAmount -= wtax;
      doc.text(`EWT  ${amtStr} x 1%`, leftM + 16, py);
      doc.text(formatNum(wtax), leftM + 80, py, { align: 'right' });
      doc.text(`( ${formatNum(wtax)} )`, rightM - 3, py, { align: 'right' });
    }
    py += 2;
    doc.text('-------------------', rightM - 3, py, { align: 'right' });
    py += 5;
    doc.text('Php', splitAmt + 3, py);
    doc.text(formatNum(netAmount), rightM - 3, py, { align: 'right' });
    py += 1;
    doc.text('===============', rightM - 3, py, { align: 'right' });
  }

  // Pesos spell out
  const cents = String(netAmount.toFixed(2)).split('.')[1];
  doc.text(`${numberToWords(netAmount)} pesos & ${cents}/100 only`, leftM + 8, currY + bodyH - 10);
  currY += bodyH;

  // Row 7: Certifications A, B, C
  const colW = W / 3;
  const certH = 35;
  doc.rect(leftM, currY, colW, certH);
  doc.rect(leftM + colW, currY, colW, certH);
  doc.rect(leftM + colW * 2, currY, colW, certH);

  doc.setFontSize(7.5);
  doc.setFont(undefined, 'bold');
  doc.text('A.      Certified:', leftM + 4, currY + 4); doc.setFont(undefined, 'normal');
  doc.text('As to availability of appropriation\nAs to obligation of appropriation', leftM + 4, currY + 8);

  doc.setFont(undefined, 'bold');
  doc.text('B.      Certified:', leftM + colW + 4, currY + 4); doc.setFont(undefined, 'normal');
  doc.text('As to availability of funds\nAs to completeness and propriety of\nsupporting documents', leftM + colW + 4, currY + 8);

  doc.setFont(undefined, 'bold');
  doc.text('C.      Certified:', leftM + colW * 2 + 4, currY + 4); doc.setFont(undefined, 'normal');
  doc.text('As to validity, propriety, and legality of claim', leftM + colW * 2 + 4, currY + 8);

  doc.setFont(undefined, 'bold');
  doc.text('Approved for Payment:', leftM + colW * 2 + 4, currY + 16);
  doc.setFont(undefined, 'normal');

  let sy = currY + 22;

  // Sig A
  doc.text('Signature ________________________', leftM + 2, sy);
  doc.text(`Printed Name:  ${fd.budgetOfficer || ''}`, leftM + 2, sy + 4);
  doc.text(`Position:  Chairman, Committee On`, leftM + 2, sy + 8);
  doc.text(`           Appropriation`, leftM + 2, sy + 11);

  // Sig B
  doc.text('Signature ________________________', leftM + colW + 2, sy);
  doc.text(`Printed Name:  ${fd.treasurer || fd._autoTreasurer || ''}`, leftM + colW + 2, sy + 4);
  doc.text(`Position:  Brgy. Treasurer`, leftM + colW + 2, sy + 8);

  // Sig C
  doc.text('Signature ________________________', leftM + colW * 2 + 2, sy + 2);
  doc.text(`Printed Name:  ${fd.punongBarangay || fd._autoPunong || ''}`, leftM + colW * 2 + 2, sy + 6);
  doc.text(`Position:  Punong Barangay`, leftM + colW * 2 + 2, sy + 10);

  currY += certH;

  // Row 8: Accounting Entries Header
  doc.rect(leftM, currY, W, 6);
  doc.setFontSize(8.5);
  doc.setFont(undefined, 'bold');
  doc.text('D. Accounting Entries', leftM + 10, currY + 4);
  currY += 6;

  // Row 9: Grid
  const aeH = 15;
  const c1 = leftM + 45;
  const c2 = c1 + 45;
  const c3 = c2 + 45;

  doc.rect(leftM, currY, W, aeH);
  doc.line(c1, currY, c1, currY + aeH);
  doc.line(c2, currY, c2, currY + aeH);
  doc.line(c3, currY, c3, currY + aeH);

  doc.line(leftM, currY + 5, rightM, currY + 5);
  doc.line(leftM, currY + 10, rightM, currY + 10);

  doc.text('Account', leftM + (c1 - leftM) / 2, currY + 3.5, { align: 'center' });
  doc.text('Account Code', c1 + (c2 - c1) / 2, currY + 3.5, { align: 'center' });
  doc.text('Debit', c2 + (c3 - c2) / 2, currY + 3.5, { align: 'center' });
  doc.text('Credit', c3 + (rightM - c3) / 2, currY + 3.5, { align: 'center' });
  currY += aeH;

  // Row 10: Received payment
  const dH = 20;
  doc.rect(leftM, currY, W, dH);
  doc.setFontSize(8);
  doc.text('D.     Received payment:', leftM + 10, currY + 4);
  doc.setFont(undefined, 'normal');

  doc.text(`${fd.payee || ''}`, leftM + 15, currY + 10);
  doc.text(`Check No. ${fd.checkNo || ''}`, leftM + 90, currY + 10);
  doc.text(`Date: ${dvDate}`, leftM + 140, currY + 10);

  doc.setFontSize(7);
  doc.text('(Printed Name & Signature)', leftM + 15, currY + 14);
  doc.setFontSize(8);
  doc.text(`Bank Name:  ${fd.bankName || ''}`, leftM + 90, currY + 14);

  doc.text('Date __________________', leftM + 18, currY + 18);
  doc.text('OR Number __________________       Date __________________', leftM + 85, currY + 18);
}

// ── SK Disbursement Voucher — exact match to SK Paule 1 template ──
// Generalized: roleLabels = { officer, mid, chair } lets Treasurer &
// SK versions reuse the exact same layout with different signatory titles.
function generateDisbursementVoucher(doc, fd, brgy, y, roleLabels = {}) {
  const officerRole = roleLabels.officer || 'Budget Monitoring Officer';
  const midRole = roleLabels.mid || 'SK Treasurer';
  const chairRole = roleLabels.chair || 'SK Chairperson';
  const orgLabel = roleLabels.orgLabel || 'SK of Barangay';

  const leftM = 14, rightM = 196, W = rightM - leftM;
  const dvDate = fd.dvDate ? new Date(fd.dvDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

  // Annex 7 label
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  doc.text('Annex 7', rightM, y - 2, { align: 'right' });

  // Save starting Y for the outer border later if needed, but we will draw row by row
  let currY = y;

  // Row 1: Title
  doc.setLineWidth(0.3);
  doc.rect(leftM, currY, W, 8);
  doc.setFontSize(11); doc.setFont(undefined, 'bold');
  doc.text('DISBURSEMENT VOUCHER', leftM + W / 2, currY + 5.5, { align: 'center' });
  currY += 8;

  // Rows 2 & 3: Info split
  const split1 = 135; // Vertical divider for Header right side
  doc.setFontSize(9); doc.setFont(undefined, 'normal');

  // Row 2
  doc.rect(leftM, currY, W, 6);
  doc.line(split1, currY, split1, currY + 6);
  doc.text(`${orgLabel}: ${brgy.name || ''}`, leftM + 2, currY + 4.2);
  doc.text(`DV No.:  ${fd.dvNumber || ''}`, split1 + 2, currY + 4.2);
  currY += 6;

  // Row 3
  doc.rect(leftM, currY, W, 6);
  doc.line(split1, currY, split1, currY + 6);
  doc.text(`City/Municipality: ${brgy.municipality || ''}`, leftM + 2, currY + 4.2);
  doc.text(`Date :  ${dvDate}`, split1 + 2, currY + 4.2);
  currY += 6;

  // Row 4: Province
  doc.rect(leftM, currY, W, 6);
  doc.text(`Province: ${brgy.province || ''}`, leftM + 2, currY + 4.2);
  currY += 6;

  // Row 5: Payee
  doc.rect(leftM, currY, W, 6);
  doc.text(`Payee: ${fd.payee || ''}`, leftM + 2, currY + 4.2);
  currY += 6;

  // Row 6: Address
  doc.rect(leftM, currY, W, 6);
  doc.text(`Address: ${fd.payeeAddress || ''}`, leftM + 2, currY + 4.2);
  currY += 6;

  // Row 7: TIN
  doc.rect(leftM, currY, W, 6);
  doc.text(`TIN: ${fd.tin || ''}`, leftM + 2, currY + 4.2);
  currY += 6;

  // Row 8: Particulars / Amount Header
  const splitAmt = 155; // Vertical divider for Amount column
  doc.rect(leftM, currY, W, 6);
  doc.line(splitAmt, currY, splitAmt, currY + 6);
  doc.setFont(undefined, 'bold');
  doc.text('Particulars', leftM + (splitAmt - leftM) / 2, currY + 4.2, { align: 'center' });
  doc.text('Amount', splitAmt + (rightM - splitAmt) / 2, currY + 4.2, { align: 'center' });
  currY += 6;

  // Row 9: Body
  const bodyH = 75;
  doc.rect(leftM, currY, W, bodyH);
  doc.line(splitAmt, currY, splitAmt, currY + bodyH);

  doc.setFont(undefined, 'normal');
  const amount = parseFloat(fd.amount || 0);
  const amtStr = formatNum(amount);

  let py = currY + 8;
  const fullParticulars = (fd.particular || '') + ' in the amount of .........................';
  const particularLines = doc.splitTextToSize(fullParticulars, (splitAmt - leftM) - 6);
  doc.text(particularLines, leftM + 3, py);

  doc.setFont(undefined, 'bold');
  doc.text('Php', splitAmt + 3, py + 8);
  doc.text(amtStr, rightM - 3, py + 8, { align: 'right' });
  doc.setFont(undefined, 'normal');

  const nonVat = parseFloat(fd.nonVat || 0);
  const wtax = parseFloat(fd.withholdingTax || 0);
  let netAmount = amount;

  if (nonVat || wtax) {
    py += 35;
    doc.setFont(undefined, 'bold');
    if (nonVat) {
      netAmount -= nonVat;
      doc.text('Less 3% Vat', leftM + 40, py);
      doc.setFont(undefined, 'normal');
      doc.text(formatNum(nonVat), rightM - 3, py, { align: 'right' });
      py += 5;
    }
    if (wtax) {
      netAmount -= wtax;
      doc.setFont(undefined, 'bold');
      doc.text('Less 1% Withholding Tax', leftM + 40, py);
      doc.setFont(undefined, 'normal');
      doc.text(formatNum(wtax), rightM - 3, py, { align: 'right' });
    }
  }

  // Footer inside body
  doc.line(splitAmt, currY + bodyH - 6, rightM, currY + bodyH - 6);
  doc.setFont(undefined, 'bold');
  doc.text('Php', splitAmt + 3, currY + bodyH - 2);
  doc.text(formatNum(netAmount), rightM - 3, currY + bodyH - 2, { align: 'right' });
  doc.setFont(undefined, 'normal');
  currY += bodyH;

  // Row 10: Certifications A, B, C
  const colW = W / 3;
  const certH = 40;
  doc.rect(leftM, currY, colW, certH);
  doc.rect(leftM + colW, currY, colW, certH);
  doc.rect(leftM + colW * 2, currY, colW, certH);

  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  doc.text('A. Certified', leftM + 1, currY + 4); doc.setFont(undefined, 'normal');
  doc.text('as to availability of the\nbudget or funds received for specific\npurpose', leftM + 17, currY + 4);

  doc.setFont(undefined, 'bold');
  doc.text('B. Certified', leftM + colW + 1, currY + 4); doc.setFont(undefined, 'normal');
  doc.text('as to availability of\ncash, and completeness and\npropriety of supporting\ndocuments', leftM + colW + 17, currY + 4);

  doc.setFont(undefined, 'bold');
  doc.text('C. Certified', leftM + colW * 2 + 1, currY + 4); doc.setFont(undefined, 'normal');
  doc.text('as to necessity, validity,\npropriety, and legality of claim; and\nApproved for payment:', leftM + colW * 2 + 17, currY + 4);

  let sy = currY + 24;

  // Sig A
  doc.text(fd.budgetOfficer || '', leftM + colW / 2, sy, { align: 'center' });
  doc.setFontSize(7);
  doc.text('(Signature Over Printed Name)', leftM + colW / 2, sy + 3, { align: 'center' });
  doc.text(officerRole, leftM + colW / 2, sy + 7, { align: 'center' });
  doc.line(leftM, sy + 9, leftM + colW, sy + 9);
  doc.text(`Date : ${dvDate}`, leftM + colW / 2, sy + 13, { align: 'center' });

  // Sig B
  doc.setFontSize(8);
  doc.text(fd.skTreasurer || fd.treasurer || fd._autoTreasurer || '', leftM + colW + colW / 2, sy, { align: 'center' });
  doc.setFontSize(7);
  doc.text('(Signature Over Printed Name)', leftM + colW + colW / 2, sy + 3, { align: 'center' });
  doc.text(midRole, leftM + colW + colW / 2, sy + 7, { align: 'center' });
  doc.line(leftM + colW, sy + 9, leftM + colW * 2, sy + 9);
  doc.text(`Date : ${dvDate}`, leftM + colW + colW / 2, sy + 13, { align: 'center' });

  // Sig C
  doc.setFontSize(8);
  doc.text(fd.skChairperson || fd.punongBarangay || fd._autoPunong || fd._autoSKChair || '', leftM + colW * 2 + colW / 2, sy, { align: 'center' });
  doc.setFontSize(7);
  doc.text('(Signature Over Printed Name)', leftM + colW * 2 + colW / 2, sy + 3, { align: 'center' });
  doc.text(chairRole, leftM + colW * 2 + colW / 2, sy + 7, { align: 'center' });
  doc.line(leftM + colW * 2, sy + 9, rightM, sy + 9);
  doc.text(`Date : ${dvDate}`, leftM + colW * 2 + colW / 2, sy + 13, { align: 'center' });

  currY += certH;

  // Row 11: Received Payment
  const dH = 30;
  const leftW = 120;
  const rightW = W - leftW; // 62

  doc.rect(leftM, currY, W, dH);
  doc.line(leftM + leftW, currY, leftM + leftW, currY + dH); // vertical split

  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  doc.text('D. Received Payment:', leftM + 2, currY + 4);
  doc.setFont(undefined, 'normal');

  // Left side signature
  doc.text(fd.payee || '', leftM + leftW / 2, currY + 16, { align: 'center' });
  doc.text('Signature Over Printed Name of Payee/', leftM + leftW / 2, currY + 20, { align: 'center' });
  doc.text('Authorized Representative', leftM + leftW / 2, currY + 24, { align: 'center' });
  doc.text(`Date : ${dvDate}`, leftM + leftW / 2, currY + 28, { align: 'center' });

  // Right side grid
  const rx1 = leftM + leftW;
  const rx2 = rx1 + 22; // Inner divider for Check No / Date / etc
  const rowH = 5;

  // 6 rows total
  for (let i = 1; i < 6; i++) {
    doc.line(rx1, currY + i * rowH, rightM, currY + i * rowH);
  }
  doc.line(rx2, currY, rx2, currY + dH);

  doc.text('Check No.:', rx1 + 1, currY + 3.5); doc.text(fd.checkNo || '', rx2 + 2, currY + 3.5);
  doc.text('Date:', rx1 + 1, currY + rowH + 3.5);
  doc.text('Bank Name:', rx1 + 1, currY + rowH * 2 + 3.5); doc.text(fd.bankName || '', rx2 + 2, currY + rowH * 2 + 3.5);
  doc.text('Bank Branch:', rx1 + 1, currY + rowH * 3 + 3.5); doc.text(fd.bankBranch || '', rx2 + 2, currY + rowH * 3 + 3.5);
  doc.text('OR No.:', rx1 + 1, currY + rowH * 4 + 3.5);
  doc.text('Date:', rx1 + 1, currY + rowH * 5 + 3.5);
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

  const leftM = 14, rightM = 283, W = rightM - leftM;
  let currY = 14; // Force start at 14 to fit the full box

  // === Row 1: Header with Logos ===
  doc.setLineWidth(0.5);
  doc.rect(leftM, currY, W, 22);
  
  // Draw seals (similar to main header but inside the box)
  const sealR = 8;
  const leftCx = leftM + 30;
  const rightCx = rightM - 30;
  drawSeal(doc, leftCx, currY + 11, sealR, 'REPUBLIC OF THE PHILIPPINES');
  drawSeal(doc, rightCx, currY + 11, sealR, roleLabels.chair?.includes('SK') ? 'SANGGUNIANG KABATAAN' : 'REPUBLIC OF THE PHILIPPINES');

  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  doc.text('REPUBLIC OF THE PHILIPPINES', 148.5, currY + 5, { align: 'center' });
  doc.text(`PROVINCE OF ${brgy.province?.toUpperCase() || ''}`, 148.5, currY + 9, { align: 'center' });
  doc.text(`MUNICIPALITY OF ${brgy.municipality?.toUpperCase() || ''}`, 148.5, currY + 13, { align: 'center' });
  doc.text(`${roleLabels.chair?.includes('SK') ? 'BARANGAY' : 'BARANGAY'} ${brgy.name?.toUpperCase() || ''}`, 148.5, currY + 17, { align: 'center' });
  currY += 22;

  // === Row 2: Title ===
  doc.rect(leftM, currY, W, 8);
  doc.setFontSize(12); doc.setFont(undefined, 'bold');
  doc.text('ABSTRACT OF QUOTATION OF PRICES', 148.5, currY + 5.5, { align: 'center' });
  currY += 8;

  // === Row 3: Meta Info ===
  doc.rect(leftM, currY, W, 10);
  const midSplit = 135;
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  doc.text(`Implementing Office: ${fd.implementingOffice || ''}`, leftM + 2, currY + 4);
  doc.text(`Mode of Procurement: ${fd.modeOfProcurement || ''}`, leftM + 2, currY + 8);
  
  doc.text(`Date: ${formatDateShort(fd.aqDate)}`, midSplit + 2, currY + 4);
  doc.text(`Time:`, midSplit + 2, currY + 8);
  currY += 10;

  // === Row 4: Grid Header ===
  const hH = 15;
  doc.rect(leftM, currY, W, hH);
  
  const c1 = leftM + 12; // ITEM NO.
  const c2 = c1 + 18;    // QUANTITY
  const c3 = c2 + 55;    // DESCRIPTION
  const supW = (rightM - c3) / 3;
  const c4 = c3 + supW;
  const c5 = c4 + supW;

  // Vertical lines for columns
  doc.line(c1, currY, c1, currY + hH);
  doc.line(c2, currY, c2, currY + hH);
  doc.line(c3, currY, c3, currY + hH);
  doc.line(c4, currY, c4, currY + hH);
  doc.line(c5, currY, c5, currY + hH);

  doc.setFontSize(8); doc.setFont(undefined, 'normal');
  doc.text('ITEM\nNO.', leftM + 6, currY + 10, { align: 'center' });
  doc.text('QUANTITY', c1 + 9, currY + 12, { align: 'center' });
  doc.text('DESCRIPTION/ PARTICULARS', c2 + 27.5, currY + 12, { align: 'center' });

  // Supplier headers (split horizontally)
  doc.line(c3, currY + 10, rightM, currY + 10);
  
  const suppliers = (fd.suppliers || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 3);
  doc.text('AMOUNT', c3 + supW/2, currY + 13.5, { align: 'center' });
  doc.text('AMOUNT', c4 + supW/2, currY + 13.5, { align: 'center' });
  doc.text('AMOUNT', c5 + supW/2, currY + 13.5, { align: 'center' });

  // Supplier names
  suppliers.forEach((s, i) => {
    const lines = doc.splitTextToSize(s, supW - 2);
    doc.text(lines, c3 + (i * supW) + supW/2, currY + 4, { align: 'center' });
  });
  currY += hH;

  // === Grid Body ===
  const rawItems = (fd.items || '').split('\n').filter(l => l.trim());
  const bodyH = Math.max(rawItems.length * 8 + 10, 60); // Ensure min height
  
  doc.rect(leftM, currY, W, bodyH);
  // Vertical lines
  doc.line(c1, currY, c1, currY + bodyH);
  doc.line(c2, currY, c2, currY + bodyH);
  doc.line(c3, currY, c3, currY + bodyH);
  doc.line(c4, currY, c4, currY + bodyH);
  doc.line(c5, currY, c5, currY + bodyH);

  let py = currY + 6;
  const totals = [0, 0, 0];
  
  rawItems.forEach((line, idx) => {
    const parts = parseCSVLine(line);
    const [qty, desc, ...amounts] = parts;
    
    // Draw horizontal separator between items (except first)
    if (idx > 0) doc.line(leftM, py - 4, rightM, py - 4);

    doc.text(String(idx + 1), leftM + 6, py, { align: 'center' });
    doc.text(qty || '', c1 + 9, py, { align: 'center' });
    
    const descLines = doc.splitTextToSize((desc || '').substring(0, 45), 52);
    doc.text(descLines, c2 + 27.5, py, { align: 'center' });
    
    suppliers.forEach((s, i) => {
      const amt = parseFloat(amounts[i] || 0);
      totals[i] += amt;
      doc.text(amt ? formatNum(amt) : '', c3 + (i * supW) + supW - 4, py, { align: 'right' });
    });
    
    py += Math.max(descLines.length * 4, 8);
  });
  currY += bodyH;

  // === Grid Footer (Totals) ===
  const fH = 6;
  doc.rect(leftM, currY, W, fH);
  doc.line(c3, currY, c3, currY + fH);
  doc.line(c4, currY, c4, currY + fH);
  doc.line(c5, currY, c5, currY + fH);
  
  doc.setFont(undefined, 'bold');
  totals.forEach((t, i) => {
    doc.text(formatNum(t), c3 + (i * supW) + supW - 4, currY + 4.5, { align: 'right' });
  });
  currY += fH;

  // === Certifications Box ===
  const certH = 75;
  doc.rect(leftM, currY, W, certH);
  
  const lowestIdx = totals.indexOf(Math.min(...totals.filter(t => t > 0).length ? totals.filter(t => t > 0) : [0]));
  const lowestSupplier = suppliers[lowestIdx] || suppliers[0] || '____________________';
  
  doc.setFont(undefined, 'normal'); doc.setFontSize(9);
  doc.text('WE HEREBY CERTIFY as to the correctness of the foregoing Abstract of Quotations, and hereby', 148.5, currY + 6, { align: 'center' });
  
  // Bold supplier name
  doc.text('recommend', leftM + 30, currY + 11);
  doc.setFont(undefined, 'bold');
  doc.text(lowestSupplier, leftM + 50, currY + 11);
  doc.setFont(undefined, 'normal');
  doc.text('has the lowest calculated quotation.', leftM + 50 + doc.getTextWidth(lowestSupplier) + 2, currY + 11);

  // Signatories layout (matches SK template: 3 on row1, 2 on row2, 1 on row3)
  const members = (fd.skCouncilors || '').split('\n').map(s => s.trim()).filter(Boolean);
  
  // Row 1 (3 members)
  const by1 = currY + 30;
  doc.text(members[0] || '____________________', leftM + W/6, by1, { align: 'center' });
  doc.text(members[1] || '____________________', leftM + W/2, by1, { align: 'center' });
  doc.text(members[2] || '____________________', leftM + W*5/6, by1, { align: 'center' });
  
  doc.text(memberRole, leftM + W/6, by1 + 4, { align: 'center' });
  doc.text(memberRole, leftM + W/2, by1 + 4, { align: 'center' });
  doc.text(memberRole, leftM + W*5/6, by1 + 4, { align: 'center' });

  // Row 2 (2 members)
  const by2 = currY + 50;
  doc.text(members[3] || '____________________', leftM + W/3, by2, { align: 'center' });
  doc.text(members[4] || '____________________', leftM + W*2/3, by2, { align: 'center' });
  
  doc.text(memberRole, leftM + W/3, by2 + 4, { align: 'center' });
  doc.text(memberRole, leftM + W*2/3, by2 + 4, { align: 'center' });

  // Row 3 (Chairperson)
  const by3 = currY + 65;
  doc.text(fd.skChairperson || fd.approvedBy || fd._autoSKChair || fd._autoPunong || '____________________', 148.5, by3, { align: 'center' });
  doc.text(chairRole, 148.5, by3 + 4, { align: 'center' });

  currY += certH;
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
  const leftM = 14, rightM = 196, W = rightM - leftM;
  let currY = 15;

  // Header (No borders)
  const sealR = 12;
  drawSeal(doc, leftM + 15, currY + 15, sealR, 'BARANGAY');
  drawSeal(doc, rightM - 15, currY + 15, sealR, brgy.municipality || 'CITY');

  doc.setFontSize(14); doc.setFont(undefined, 'bold');
  doc.text('Republic of the Philippines', 105, currY + 10, { align: 'center' });
  doc.text('Office of the Sangguniang Barangay', 105, currY + 16, { align: 'center' });
  doc.text(`Barangay ${brgy.name || ''}, ${brgy.municipality || ''}`, 105, currY + 22, { align: 'center' });
  
  currY += 30;
  doc.text('INSPECTION AND ACCEPTANCE REPORT', 105, currY + 5, { align: 'center' });
  currY += 15;

  // Supplier info
  doc.setFontSize(10);
  doc.text('SUPPLIER:', leftM, currY);
  doc.setFont(undefined, 'normal');
  doc.text(fd.supplier || '', leftM + 22, currY);
  doc.setFont(undefined, 'bold');
  doc.text('O.R. No.', 125, currY);
  doc.line(142, currY, rightM, currY);
  if (fd.orNumber) { doc.setFont(undefined, 'normal'); doc.text(fd.orNumber, 145, currY - 1); }
  currY += 10;

  doc.setFont(undefined, 'bold');
  doc.text('P.O. No.', leftM, currY);
  doc.line(leftM + 18, currY, leftM + 38, currY);
  doc.setFont(undefined, 'normal');
  doc.text(fd.poNumber || '', leftM + 20, currY - 1);

  doc.setFont(undefined, 'bold');
  doc.text('Date', leftM + 40, currY);
  doc.line(leftM + 50, currY, leftM + 80, currY);
  doc.setFont(undefined, 'normal');
  doc.text(formatDateShort(fd.poDate) || '', leftM + 52, currY - 1);

  doc.setFont(undefined, 'bold');
  doc.text('Invoice No.', leftM + 82, currY);
  doc.line(leftM + 103, currY, leftM + 130, currY);
  doc.setFont(undefined, 'normal');
  doc.text(fd.invoiceNumber || '', leftM + 105, currY - 1);

  doc.setFont(undefined, 'bold');
  doc.text('Date', leftM + 132, currY);
  doc.line(leftM + 142, currY, rightM, currY);
  doc.setFont(undefined, 'normal');
  doc.text(formatDateShort(fd.iarDate) || '', leftM + 144, currY - 1);
  currY += 12;

  doc.setFont(undefined, 'bold');
  doc.text('REQUISITIONING OFFICE/DEPT.', leftM, currY);
  doc.line(leftM + 62, currY, rightM, currY);
  doc.setFont(undefined, 'normal');
  doc.text(`BARANGAY ${brgy.name?.toUpperCase() || ''}`, leftM + 65, currY - 1);
  currY += 5;

  // Grid Header
  const hH = 8;
  doc.setLineWidth(0.4);
  doc.rect(leftM, currY, W, hH);
  
  const c1 = leftM + 20; // ITEM NO. -> UNIT
  const c2 = c1 + 18;    // UNIT -> DESCRIPTION
  const c3 = c2 + 105;   // DESCRIPTION -> QUANTITY

  doc.line(c1, currY, c1, currY + hH);
  doc.line(c2, currY, c2, currY + hH);
  doc.line(c3, currY, c3, currY + hH);

  doc.setFontSize(10); doc.setFont(undefined, 'bold');
  doc.text('ITEM NO.', leftM + (c1 - leftM)/2, currY + 5.5, { align: 'center' });
  doc.text('UNIT', c1 + (c2 - c1)/2, currY + 5.5, { align: 'center' });
  doc.text('DESCRIPTION', c2 + (c3 - c2)/2, currY + 5.5, { align: 'center' });
  doc.text('QUANTITY', c3 + (rightM - c3)/2, currY + 5.5, { align: 'center' });
  currY += hH;

  // Grid Body
  const rawItems = (fd.items || '').split('\n').filter(l => l.trim());
  const bodyH = Math.max(rawItems.length * 6 + 10, 100); 
  doc.rect(leftM, currY, W, bodyH);
  doc.line(c1, currY, c1, currY + bodyH);
  doc.line(c2, currY, c2, currY + bodyH);
  doc.line(c3, currY, c3, currY + bodyH);

  let py = currY + 5;
  doc.setFont(undefined, 'normal'); doc.setFontSize(9.5);
  rawItems.forEach((line, i) => {
    const parts = parseCSVLine(line);
    const [qty, unit, desc] = parts;
    
    doc.text(String(i + 1), leftM + (c1 - leftM)/2, py, { align: 'center' });
    doc.text(unit || '', c1 + (c2 - c1)/2, py, { align: 'center' });
    
    const descLines = doc.splitTextToSize((desc || '').substring(0, 70), c3 - c2 - 4);
    doc.text(descLines, c2 + 2, py);
    
    doc.text(qty || '', c3 + (rightM - c3)/2, py, { align: 'center' });
    py += Math.max(descLines.length * 4.5, 6);
  });
  currY += bodyH;

  // Split Box (INSPECTION / ACCEPTANCE)
  const bH = 50;
  doc.rect(leftM, currY, W, bH);
  const midX = leftM + W/2;
  doc.line(midX, currY, midX, currY + bH);
  
  // INSPECTION / ACCEPTANCE Headers
  doc.line(leftM, currY + 8, rightM, currY + 8);
  doc.setFontSize(11); doc.setFont(undefined, 'bold');
  doc.text('INSPECTION', leftM + W/4, currY + 5.5, { align: 'center' });
  doc.text('ACCEPTANCE', midX + W/4, currY + 5.5, { align: 'center' });
  
  currY += 8;

  // Inspection details
  doc.setFontSize(9.5); doc.setFont(undefined, 'normal');
  doc.text('DATE INSPECTED', leftM + 15, currY + 8);
  doc.text(formatDateShort(fd.dateInspected) || '', leftM + 50, currY + 8);
  
  doc.text('( x ) Inspected, verified and found ok as', leftM + 5, currY + 16);
  doc.text('(   ) the quantity and specifications', leftM + 5, currY + 20);

  doc.setFontSize(10); doc.setFont(undefined, 'bold');
  doc.text(fd.inspectedBy || fd.preparedBy || '__________________________', leftM + W/4, currY + 32, { align: 'center' });
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  doc.text('Authorized Inspector', leftM + W/4, currY + 36, { align: 'center' });

  // Acceptance details
  const complete = (fd.acceptanceStatus || 'complete') === 'complete';
  doc.text('DATE RECEIVED:', midX + 10, currY + 8);
  doc.text(formatDateShort(fd.dateInspected) || '', midX + 50, currY + 8); 
  
  doc.text(`( ${complete ? 'x' : ' '} )      Complete`, midX + 15, currY + 16);
  doc.text(`( ${!complete ? 'x' : ' '} )      Partial`, midX + 15, currY + 20);

  doc.setFontSize(10); doc.setFont(undefined, 'bold');
  doc.text(fd.treasurer || fd._autoTreasurer || '__________________________', midX + W/4, currY + 32, { align: 'center' });
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  doc.text('Brgy. Treasurer', midX + W/4, currY + 36, { align: 'center' });
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