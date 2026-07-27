# BFMSS — Updated Barangay Capstone

## Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | superadmin@bfmss.gov.ph | Admin@1234 |
| Admin | admin@bfmss.gov.ph | Admin@1234 |
| Barangay Treasurer | treasurer@paule1.gov.ph | Treasurer@1 |
| SK Treasurer | sk@paule1.gov.ph | SKTreasurer@1 |

## Folder Structure
```
updated_capstone/
├── index.html                        ← Landing page
├── assets/
│   ├── css/
│   │   ├── main.css                  ← Main dashboard styles (BFMSS)
│   │   ├── style.css                 ← Landing page styles (Capstone)
│   │   ├── auth/                     ← Login/Register styles
│   │   └── superadmin/               ← Superadmin CSS (Capstone)
│   └── js/
│       ├── db.js                     ← Database layer (localStorage)
│       ├── utils.js                  ← Auth guard, formatters, toasts
│       ├── sidebar.js                ← Sidebar & topbar renderer
│       ├── reports.js                ← Reports generator
│       ├── script.js                 ← Landing page scripts
│       └── auth/
│           ├── login.js              ← Real login with DB auth
│           ├── register.js
│           └── forgot_password.js
└── pages/
    ├── auth/
    │   ├── login.html                ← Updated with real auth
    │   ├── register.html
    │   └── forgot_password.html
    ├── superadmin/
    │   ├── superadmin-dashboard.html
    │   ├── approvals.html
    │   ├── consolidate.html
    │   └── audit-logs.html
    ├── admin/
    │   ├── admin-dashboard.html
    │   ├── users.html
    │   ├── system-config.html
    │   └── access-logs.html
    ├── treasurer/
    │   ├── treasurer-dashboard.html
    │   ├── income.html
    │   ├── expenses.html
    │   ├── reports.html
    │   ├── fund-status.html
    │   └── profile.html
    └── sk/
        ├── sk-dashboard.html
        ├── income.html
        ├── expenses.html
        ├── reports.html
        ├── fund-status.html
        └── profile.html
```

