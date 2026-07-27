/**
 * BFMSS Utility Functions
 */

// ─── FORMAT ──────────────────────────────────────────────
function formatCurrency(amount) {
  return '₱ ' + Number(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 });
}
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}
function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}
function today() {
  return new Date().toISOString().split('T')[0];
}
function nowISO() {
  return new Date().toISOString();
}

// ─── STATUS BADGES ───────────────────────────────────────
function statusBadge(status) {
  const map = {
    approved: '<span class="badge badge-success">Approved</span>',
    pending: '<span class="badge badge-warning">Pending</span>',
    rejected: '<span class="badge badge-danger">Rejected</span>',
    active: '<span class="badge badge-success">Active</span>',
    inactive: '<span class="badge badge-secondary">Inactive</span>',
    submitted: '<span class="badge badge-info">Submitted</span>',
  };
  return map[status] || `<span class="badge badge-secondary">${status}</span>`;
}

// ─── TOAST ────────────────────────────────────────────────
function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(container);
  }
  const icons = { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || '●'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
}

// ─── MODAL ────────────────────────────────────────────────
function showModal(id) {
  const el = document.getElementById(id);
  if (el) { el.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
}
function hideModal(id) {
  const el = document.getElementById(id);
  if (el) { el.style.display = 'none'; document.body.style.overflow = ''; }
}

// ─── AUTH GUARD ──────────────────────────────────────────
function requireAuth(allowedRoles) {
  const user = DB.getCurrentUser();
  if (!user) { window.location.href = getRoot() + 'pages/auth/login.html'; return null; }
  const roleName = DB.getRoleName(user.roleId);
  if (allowedRoles && !allowedRoles.includes(roleName)) {
    redirectByRole(user.roleId);
    return null;
  }
  return user;
}
function getRoot() {
  const depth = window.location.pathname.split('/').filter(p => p).length;
  const fileDepth = window.location.pathname.includes('/pages/') ? 2 : 0;
  return fileDepth === 2 ? '../../' : '';
}
function redirectByRole(roleId) {
  const root = getRoot();
  const map = {
    1: root + 'pages/superadmin/superadmin-dashboard.html',
    2: root + 'pages/admin/admin-dashboard.html',
    3: root + 'pages/treasurer/treasurer-dashboard.html',
    4: root + 'pages/sk/sk-dashboard.html',
  };
  window.location.href = map[roleId] || root + 'pages/auth/login.html';
}
async function logout() {
  const user = DB.getCurrentUser();
  if (user) await DB.log(user.id, 'LOGOUT', 'User logged out', 'Authentication');
  await DB.logout();
  const root = getRoot();
  window.location.href = root + 'pages/auth/login.html';
}

// ─── SEARCH & FILTER ─────────────────────────────────────
function searchTable(inputId, tableId) {
  const q = document.getElementById(inputId).value.toLowerCase();
  const rows = document.querySelectorAll(`#${tableId} tbody tr`);
  rows.forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

// ─── PAGINATION ──────────────────────────────────────────
function paginateTable(data, page, perPage) {
  const start = (page - 1) * perPage;
  return { items: data.slice(start, start + perPage), total: data.length, pages: Math.ceil(data.length / perPage) };
}

// ─── CONFIRM ─────────────────────────────────────────────
function confirmAction(message, onConfirm) {
  if (confirm(message)) onConfirm();
}

// ─── NOTIFICATION BADGE UPDATE ───────────────────────────
async function updateNotifBadge() {
  const user = DB.getCurrentUser();
  if (!user) return;
  const count = await DB.unreadCount(user.id);
  const badge = document.getElementById('notif-badge');
  if (badge) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
  }
}

// ─── RENDER SIDEBAR ACTIVE ───────────────────────────────
function setActiveNav(page) {
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.classList.remove('active');
    if (link.dataset.page === page) link.classList.add('active');
  });
}

// ─── EXPORT CSV ──────────────────────────────────────────
function exportCSV(data, filename) {
  if (!data.length) return showToast('No data to export', 'warning');
  const keys = Object.keys(data[0]);
  const csv = [keys.join(','), ...data.map(row => keys.map(k => `"${String(row[k] || '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename + '.csv'; a.click();
}

// ─── CLOSE MODAL ON BACKDROP ────────────────────────────
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) hideModal(e.target.id);
});
