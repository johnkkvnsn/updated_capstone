/**
 * BFMSS Shared Sidebar + Topbar Renderer
 */

const SIDEBARS = {
  super_admin: {
    title: 'Super Admin',
    sections: [
      {
        label: 'Main Menu',
        links: [
          { page: 'dashboard', icon: 'bi-speedometer2', label: 'Dashboard', href: '../superadmin/superadmin-dashboard.html' },
          { page: 'approvals', icon: 'bi-check2-square', label: 'Approvals', href: '../superadmin/approvals.html', badge: 'pending_reports' },
          { page: 'consolidate', icon: 'bi-file-earmark-bar-graph', label: 'Consolidated Reports', href: '../superadmin/consolidate.html' },
          { page: 'audit', icon: 'bi-shield-check', label: 'Audit Logs', href: '../superadmin/audit-logs.html' },
        ]
      }
    ]
  },
  admin: {
    title: 'Admin',
    sections: [
      {
        label: 'Main Menu',
        links: [
          { page: 'dashboard', icon: 'bi-speedometer2', label: 'Dashboard', href: '../admin/admin-dashboard.html' },
          { page: 'users', icon: 'bi-people', label: 'Manage Users', href: '../admin/users.html' },
          { page: 'config', icon: 'bi-gear', label: 'System Config', href: '../admin/system-config.html' },
          { page: 'logs', icon: 'bi-journal-text', label: 'Access Logs', href: '../admin/access-logs.html' },
        ]
      }
    ]
  },
  treasurer: {
    title: 'Treasurer',
    sections: [
      {
        label: 'Main Menu',
        links: [
          { page: 'dashboard', icon: 'bi-speedometer2', label: 'Dashboard', href: '../treasurer/treasurer-dashboard.html' },
        ]
      },
      {
        label: 'Transactions',
        links: [
          { page: 'income', icon: 'bi-arrow-down-circle', label: 'Record Income', href: '../treasurer/income.html' },
          { page: 'expenses', icon: 'bi-arrow-up-circle', label: 'Record Expenses', href: '../treasurer/expenses.html' },
        ]
      },
      {
        label: 'Reports',
        links: [
          { page: 'reports', icon: 'bi-file-earmark-text', label: 'Generate Reports', href: '../treasurer/reports.html' },
          { page: 'fund-status', icon: 'bi-wallet2', label: 'Fund Status', href: '../treasurer/fund-status.html' },
        ]
      },
      {
        label: 'Account',
        links: [
          { page: 'profile', icon: 'bi-person-circle', label: 'My Profile', href: '../treasurer/profile.html' },
        ]
      }
    ]
  },
  sk_treasurer: {
    title: 'SK Treasurer',
    sections: [
      {
        label: 'Main Menu',
        links: [
          { page: 'dashboard', icon: 'bi-speedometer2', label: 'Dashboard', href: '../sk/sk-dashboard.html' },
        ]
      },
      {
        label: 'SK Transactions',
        links: [
          { page: 'income', icon: 'bi-arrow-down-circle', label: 'SK Income', href: '../sk/income.html' },
          { page: 'expenses', icon: 'bi-arrow-up-circle', label: 'SK Expenses', href: '../sk/expenses.html' },
        ]
      },
      {
        label: 'Reports',
        links: [
          { page: 'reports', icon: 'bi-file-earmark-text', label: 'Generate Reports', href: '../sk/reports.html' },
          { page: 'fund-status', icon: 'bi-wallet2', label: 'SK Fund Status', href: '../sk/fund-status.html' },
        ]
      },
      {
        label: 'Account',
        links: [
          { page: 'profile', icon: 'bi-person-circle', label: 'My Profile', href: '../sk/profile.html' },
        ]
      }
    ]
  }
};

async function renderSidebar(currentPage) {
  const user = DB.getCurrentUser();
  if (!user) return;
  const roleName = DB.getRoleName(user.roleId);
  const cfg = SIDEBARS[roleName];
  if (!cfg) return;

  const brgy = user.barangayId ? await DB.getBarangay(user.barangayId) : null;
  const initials = user.fullName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  // Compute pending reports badge
  const pendingCount = await DB.filter('reports', { status: 'pending' }).length;

  let sectionsHTML = cfg.sections.map(section => {
    const linksHTML = section.links.map(link => {
      const isActive = link.page === currentPage;
      let badgeHTML = '';
      if (link.badge === 'pending_reports' && pendingCount > 0) {
        badgeHTML = `<span class="nav-badge">${pendingCount}</span>`;
      }
      return `<a href="${link.href}" class="sidebar-link ${isActive ? 'active' : ''}" data-page="${link.page}">
        <i class="bi ${link.icon} nav-icon"></i>
        <span>${link.label}</span>
        ${badgeHTML}
      </a>`;
    }).join('');
    return `<div class="nav-section-label">${section.label}</div>${linksHTML}`;
  }).join('');

  const html = `
    <div class="sidebar-header">
      <div class="sidebar-logo"><i class="bi bi-bank2"></i></div>
      <div class="sidebar-brand">BF<span>MSS</span></div>
    </div>
    <nav class="sidebar-nav">${sectionsHTML}</nav>
    <div class="sidebar-footer">
      <div class="sidebar-user" onclick="toggleDropdown('user-dd')">
        <div class="user-avatar">${initials}</div>
        <div class="user-info">
          <div class="user-name">${user.fullName.length > 20 ? user.fullName.substring(0,18)+'…' : user.fullName}</div>
          <div class="user-role">${DB.getRoleLabel(user.roleId)}</div>
        </div>
        <i class="bi bi-chevron-up" style="color:rgba(255,255,255,.5);margin-left:auto;font-size:.75rem;"></i>
      </div>
      <div id="user-dd" class="dropdown-menu-custom" style="bottom:100%;top:auto;left:0;right:0;min-width:unset;">
        <div class="dropdown-item-custom" onclick="window.location.href='../auth/login.html'"><i class="bi bi-person"></i> Profile</div>
        <div class="dropdown-divider"></div>
        <div class="dropdown-item-custom danger" onclick="logout()"><i class="bi bi-box-arrow-left"></i> Logout</div>
      </div>
    </div>`;

  document.getElementById('sidebar').innerHTML = html;
}

async function renderTopbar(pageTitle, pageSubtitle) {
  const user = DB.getCurrentUser();
  if (!user) return;
  const initials = user.fullName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const notifCount = await DB.unreadCount(user.id);

  const el = document.getElementById('topbar');
  if (!el) return;
  el.innerHTML = `
    <div class="topbar-left">
      <button class="sidebar-toggle" onclick="toggleSidebar()"><i class="bi bi-list" style="font-size:1.2rem;"></i></button>
      <div>
        <div class="page-title">${pageTitle}</div>
        ${pageSubtitle ? `<div class="page-subtitle">${pageSubtitle}</div>` : ''}
      </div>
    </div>
    <div class="topbar-right">
      <div style="position:relative;">
        <button class="notif-btn" onclick="toggleDropdown('notif-panel'); renderNotifs();" title="Notifications">
          <i class="bi bi-bell"></i>
          <span id="notif-badge" style="display:${notifCount > 0 ? 'inline-flex' : 'none'};" class="notif-badge-count">${notifCount > 0 ? (notifCount > 99 ? '99+' : notifCount) : ''}</span>
        </button>
        <div id="notif-panel" class="notif-panel">
          <div class="notif-panel-header">
            <span class="notif-panel-title"><i class="bi bi-bell-fill" style="margin-right:6px;color:#1a3a6b;"></i>Notifications</span>
            <button onclick="markAllRead()" style="font-size:.75rem;color:#1a3a6b;background:none;border:none;cursor:pointer;font-weight:600;padding:0;">Mark all read</button>
          </div>
          <div class="notif-list" id="notif-list"></div>
        </div>
      </div>
      <div class="dropdown" style="position:relative;">
        <div class="topbar-profile" onclick="toggleDropdown('profile-dd')">
          <div class="topbar-avatar">${initials}</div>
          <span class="topbar-name">${user.fullName.split(' ')[0]}</span>
          <i class="bi bi-chevron-down" style="font-size:.75rem;color:#64748b;"></i>
        </div>
        <div id="profile-dd" class="dropdown-menu-custom">
          <div style="padding:.5rem .75rem;border-bottom:1px solid #e2e8f0;margin-bottom:.35rem;">
            <div style="font-size:.85rem;font-weight:700;color:#1e293b;">${user.fullName}</div>
            <div style="font-size:.75rem;color:#64748b;">${user.email}</div>
            <div style="margin-top:3px;">${statusBadge('active')}</div>
          </div>
          <div class="dropdown-item-custom danger" onclick="logout()"><i class="bi bi-box-arrow-right"></i> Logout</div>
        </div>
      </div>
    </div>`;

  // Load notifications
  renderNotifs();
}

async function renderNotifs() {
  const user = DB.getCurrentUser();
  if (!user) return;
  const list = document.getElementById('notif-list');
  if (!list) return;

  // Use enhanced renderer if available
  if (window.NotifSystem) {
    NotifSystem.renderList(user.id, list);
    return;
  }

  // Fallback basic renderer
  const notifs = await DB.filter('notifications', { userId: user.id })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 20);
  if (!notifs.length) {
    list.innerHTML = '<div style="padding:2rem;text-align:center;color:#94a3b8;"><i class="bi bi-bell-slash" style="font-size:1.5rem;display:block;margin-bottom:.5rem;"></i>No notifications yet</div>';
    return;
  }
  const iconMap = { success: 'bi-check-circle', warning: 'bi-exclamation-triangle', error: 'bi-x-circle', info: 'bi-info-circle' };
  list.innerHTML = notifs.map(n => `
    <div class="notif-item ${!n.read ? 'notif-unread' : ''}" onclick="markRead(${n.id})" style="cursor:pointer;">
      <div class="notif-icon notif-icon-${n.type || 'info'}">
        <i class="bi ${iconMap[n.type || 'info']}"></i>
      </div>
      <div class="notif-content">
        <div class="notif-title">${escHtml(n.title || '')}</div>
        <div class="notif-msg">${escHtml(n.message || '')}</div>
        <div class="notif-time">${formatDateTime(n.createdAt)}</div>
      </div>
      ${!n.read ? '<div class="notif-dot"></div>' : ''}
    </div>`).join('');
}

async function markRead(id) {
  await DB.update('notifications', id, { read: true });
  updateNotifBadge();
  // Use enhanced renderer if available, fallback to basic
  const list = document.getElementById('notif-list');
  const user = DB.getCurrentUser();
  if (list && user) {
    if (window.NotifSystem) NotifSystem.renderList(user.id, list);
    else renderNotifs();
  }
}
async function markAllRead() {
  const user = DB.getCurrentUser();
  if (!user) return;
  const notifs = await DB.filter('notifications', { userId: user.id });
  for (const n of notifs) {
    if (!n.read) await DB.update('notifications', n.id, { read: true });
  }
  updateNotifBadge();
  const list = document.getElementById('notif-list');
  if (list) {
    if (window.NotifSystem) NotifSystem.renderList(user.id, list);
    else renderNotifs();
  }
}

function toggleDropdown(id) {
  document.querySelectorAll('.dropdown-menu-custom, .notif-panel').forEach(el => {
    if (el.id !== id) el.classList.remove('open');
  });
  const el = document.getElementById(id);
  if (el) el.classList.toggle('open');
}

function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sb) sb.classList.toggle('open');
  if (overlay) overlay.classList.toggle('show');
}

document.addEventListener('click', e => {
  if (!e.target.closest('.dropdown') && !e.target.closest('.notif-btn') && !e.target.closest('.notif-panel') && !e.target.closest('.sidebar-user')) {
    document.querySelectorAll('.dropdown-menu-custom, .notif-panel').forEach(el => el.classList.remove('open'));
  }
  if (!e.target.closest('.sidebar') && !e.target.closest('.sidebar-toggle')) {
    const sb = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (window.innerWidth <= 768) {
      if (sb) sb.classList.remove('open');
      if (overlay) overlay.classList.remove('show');
    }
  }
});
