/**
 * BFMSS - Barangay Financial Management Streamlining System
 * Database Layer using PHP/MySQL REST API
 */
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const BASE_URL = IS_LOCAL ? '/updated_capstone' : '';
const API_BASE = `${BASE_URL}/api`;

const DB = {
  // ─── CRUD ────────────────────────────────────────────────
  async get(table, params = {}) {
    const q = new URLSearchParams({ table, ...params }).toString();
    const res = await fetch(`${API_BASE}/crud.php?${q}`, { credentials: 'include' });
    if (res.status === 401 || res.status === 403) { sessionStorage.removeItem('bfmss_current_user'); window.location.href = `${BASE_URL}/pages/auth/login.html`; return []; }
    const json = await res.json();
    if (json.status === 'error') console.error('DB GET Error:', json.message);
    return json.data || [];
  },
  
  async insert(table, record) {
    const res = await fetch(`${API_BASE}/crud.php?table=${table}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(record)
    });
    if (res.status === 401 || res.status === 403) { sessionStorage.removeItem('bfmss_current_user'); window.location.href = `${BASE_URL}/pages/auth/login.html`; return null; }
    const json = await res.json();
    if (json.status === 'error') console.error('DB POST Error:', json.message);
    return json.data;
  },
  
  async update(table, id, updates) {
    const res = await fetch(`${API_BASE}/crud.php?table=${table}&id=${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updates)
    });
    if (res.status === 401 || res.status === 403) { sessionStorage.removeItem('bfmss_current_user'); window.location.href = `${BASE_URL}/pages/auth/login.html`; return null; }
    const json = await res.json();
    return json.data;
  },
  
  async delete(table, id) {
    const res = await fetch(`${API_BASE}/crud.php?table=${table}&id=${id}`, { method: 'DELETE', credentials: 'include' });
    if (res.status === 401 || res.status === 403) { sessionStorage.removeItem('bfmss_current_user'); window.location.href = `${BASE_URL}/pages/auth/login.html`; return; }
  },

  async filter(table, queryObj = {}) {
    return await this.get(table, queryObj);
  },

  async find(table, queryObj = {}) {
    const data = await this.get(table, queryObj);
    return data.length > 0 ? data[0] : null;
  },

  // ─── AUTH HELPERS ─────────────────────────────────────────
  async validateLogin(email, password) {
    const res = await fetch(`${API_BASE}/auth.php?action=login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    const json = await res.json();
    if (json.status === 'success') {
      this.setCurrentUser(json.user);
    }
    return json;
  },

  getCurrentUser() {
    const data = sessionStorage.getItem('bfmss_current_user');
    return data ? JSON.parse(data) : null;
  },
  
  setCurrentUser(user) {
    sessionStorage.setItem('bfmss_current_user', JSON.stringify(user));
  },
  
  async logout() {
    await fetch(`${API_BASE}/auth.php?action=logout`, { method: 'POST', credentials: 'include' });
    sessionStorage.removeItem('bfmss_current_user');
  },

  // ─── LOG HELPER ───────────────────────────────────────────
  async log(userId, action, description, module) {
    await this.insert('audit_logs', { userId, action, description, module });
  },

  // ─── NOTIFICATION HELPER ──────────────────────────────────
  async notify(userId, title, message, type = 'info') {
    await this.insert('notifications', { userId, title, message, type, is_read: 0 });
  },
  
  async unreadCount(userId) {
    const data = await this.filter('notifications', { userId, is_read: 0 });
    return data.length;
  },

  // ─── FINANCIAL SUMMARIES ──────────────────────────────────
  async getTotalIncome(barangayId) {
    const data = await this.filter('income', { barangayId });
    return data.filter(i => i.status !== 'rejected').reduce((s, i) => s + Number(i.amount || 0), 0);
  },
  
  async getTotalExpenses(barangayId) {
    const data = await this.filter('expenses', { barangayId });
    return data.filter(e => e.status !== 'rejected').reduce((s, e) => s + Number(e.amount || 0), 0);
  },
  
  async getNetBalance(barangayId) {
    const inc = await this.getTotalIncome(barangayId);
    const exp = await this.getTotalExpenses(barangayId);
    return inc - exp;
  },
  
  async getCurrentBudget(barangayId) {
    const year = new Date().getFullYear();
    const data = await this.filter('budgets', { barangayId, fiscalYear: year });
    return data.length > 0 ? data[0] : null;
  },

  // ─── ROLE HELPERS ─────────────────────────────────────────
  getRoleName(roleId) {
    const roles = { 1: 'super_admin', 2: 'admin', 3: 'treasurer', 4: 'sk_treasurer' };
    return roles[roleId] || 'unknown';
  },
  
  getRoleLabel(roleId) {
    const roles = { 1: 'Super Admin', 2: 'Admin', 3: 'Barangay Treasurer', 4: 'SK Treasurer' };
    return roles[roleId] || 'Unknown';
  },
  
  async getBarangay(id) {
    return await this.find('barangays', { id });
  },
  
  async getAllBarangays() {
    return await this.get('barangays');
  }
};
