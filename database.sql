-- BFMSS Database Schema and Seed Data
-- Database: bfmss_db

CREATE DATABASE IF NOT EXISTS bfmss_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE bfmss_db;

-- 1. Roles Table
CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    label VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO roles (id, name, label) VALUES
(1, 'super_admin', 'Super Admin'),
(2, 'admin', 'Admin'),
(3, 'treasurer', 'Barangay Treasurer'),
(4, 'sk_treasurer', 'SK Treasurer');

-- 2. Barangays Table
CREATE TABLE IF NOT EXISTS barangays (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    municipality VARCHAR(100) NOT NULL,
    province VARCHAR(100) NOT NULL,
    cityCode VARCHAR(20),
    barangayCode VARCHAR(20),
    region VARCHAR(100),
    punongBarangay VARCHAR(100) DEFAULT '',
    treasurer VARCHAR(100) DEFAULT '',
    skChairperson VARCHAR(100) DEFAULT '',
    contactNo VARCHAR(50) DEFAULT '',
    email VARCHAR(100) DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO barangays (id, name, municipality, province, cityCode, barangayCode, region) VALUES
(1, 'Paule 1', 'Rizal', 'Laguna', '0435', '043519010', 'CALABARZON (Region IV-A)'),
(2, 'Paule 2', 'Rizal', 'Laguna', '0435', '043519011', 'CALABARZON (Region IV-A)'),
(3, 'San Isidro', 'Nagcarlan', 'Laguna', '0425', '042514016', 'CALABARZON (Region IV-A)'),
(4, 'Buboy', 'Nagcarlan', 'Laguna', '0425', '042514003', 'CALABARZON (Region IV-A)'),
(5, 'Pansol', 'Calamba', 'Laguna', '0410', '041002027', 'CALABARZON (Region IV-A)');

-- 3. Users Table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fullName VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    roleId INT NOT NULL,
    barangayId INT NULL,
    municipality VARCHAR(100) NULL,
    status ENUM('active', 'inactive') DEFAULT 'active',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    lastLogin DATETIME NULL,
    FOREIGN KEY (roleId) REFERENCES roles(id),
    FOREIGN KEY (barangayId) REFERENCES barangays(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO users (id, fullName, email, password, roleId, barangayId, municipality, status, createdAt) VALUES
(1, 'Super Administrator', 'superadmin@bfmss.gov.ph', '$2y$10$wO7q0.2f0XOpBvxuy37bXu6.4GnB76N56tuyOpgB8pivAINHYWKP.', 1, NULL, 'Rizal', 'active', '2026-07-18 10:00:00'),
(2, 'Admin User', 'admin@bfmss.gov.ph', '$2y$10$wO7q0.2f0XOpBvxuy37bXu6.4GnB76N56tuyOpgB8pivAINHYWKP.', 2, NULL, 'Rizal', 'active', '2026-07-18 10:00:00'),
(3, 'Juan dela Cruz', 'treasurer@paule1.gov.ph', '$2y$10$L15QFapIfSOUBC0z4mnfge4MVekNvf/ADAXHSMlHtWqUOBZQWk1ru', 3, 1, 'Rizal', 'active', '2026-07-18 10:00:00'),
(4, 'Maria Santos', 'sk@paule1.gov.ph', '$2y$10$NHE./TfEHrSVzHLK3ku6pe5wV593kekFaAR5rfSwUz99pNRgUMpUi', 4, 1, 'Rizal', 'active', '2026-07-18 10:00:00');

-- 4. Budgets Table
CREATE TABLE IF NOT EXISTS budgets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    barangayId INT NOT NULL,
    fiscalYear INT NOT NULL,
    totalBudget DECIMAL(15, 2) NOT NULL DEFAULT 0,
    allocatedAmount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    remainingAmount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    status ENUM('active', 'inactive') DEFAULT 'active',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (barangayId) REFERENCES barangays(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO budgets (id, barangayId, fiscalYear, totalBudget, allocatedAmount, remainingAmount, status) VALUES
(1, 1, 2025, 5000000, 3200000, 1800000, 'active'),
(2, 1, 2026, 5500000, 1200000, 4300000, 'active');

-- 5. Income Table
CREATE TABLE IF NOT EXISTS income (
    id INT AUTO_INCREMENT PRIMARY KEY,
    barangayId INT NOT NULL,
    source VARCHAR(255) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    dateReceived DATE NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'approved',
    userId INT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (barangayId) REFERENCES barangays(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO income (id, barangayId, source, amount, dateReceived, category, description, status, userId, createdAt) VALUES
(1, 1, 'IRA (Internal Revenue Allotment)', 2500000, '2026-01-15', 'IRA', 'Q1 IRA Release', 'approved', 3, '2026-01-15 08:00:00'),
(2, 1, 'Business Permits & Licenses', 150000, '2026-02-10', 'Local Revenue', 'January-February permits', 'approved', 3, '2026-02-10 09:00:00'),
(3, 1, 'Barangay Clearance Fees', 25000, '2026-03-05', 'Fees', 'March clearance fees', 'approved', 3, '2026-03-05 10:00:00'),
(4, 1, 'Other Receipts', 18500, '2026-04-12', 'Miscellaneous', 'Miscellaneous income', 'pending', 3, '2026-04-12 11:00:00'),
(5, 1, 'IRA (Internal Revenue Allotment)', 2600000, '2026-06-01', 'IRA', 'Q2 IRA Release', 'approved', 3, '2026-06-01 08:00:00'),
(6, 1, 'Barangay Clearance Fees', 8500, '2026-06-09', 'Fees', 'Clearance fees - June 9', 'approved', 3, '2026-06-09 09:00:00'),
(7, 1, 'Market Stall Rentals', 12000, '2026-06-11', 'Local Revenue', 'June 11 stall collections', 'approved', 3, '2026-06-11 08:30:00');

-- 6. Expenses Table
CREATE TABLE IF NOT EXISTS expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    barangayId INT NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    amount DECIMAL(15, 2) NOT NULL,
    dateSpent DATE NOT NULL,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'approved',
    userId INT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (barangayId) REFERENCES barangays(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO expenses (id, barangayId, category, description, amount, dateSpent, status, userId, createdAt) VALUES
(1, 1, 'Personnel Services', 'Salaries & Wages - April', 320000, '2026-04-30', 'approved', 3, '2026-04-30 08:00:00'),
(2, 1, 'Maintenance & Operations', 'Office Supplies Q1', 45000, '2026-03-15', 'approved', 3, '2026-03-15 09:00:00'),
(3, 1, 'Capital Outlay', 'Street Lighting Equipment', 185000, '2026-02-20', 'approved', 3, '2026-02-20 10:00:00'),
(4, 1, 'Social Services', 'Medical Assistance Program', 50000, '2026-04-01', 'pending', 3, '2026-04-01 11:00:00'),
(5, 1, 'Personnel Services', 'Salaries & Wages - May', 325000, '2026-05-31', 'approved', 3, '2026-05-31 08:00:00'),
(6, 1, 'Maintenance & Operations', 'Electricity & Water Bills - June', 28000, '2026-06-05', 'approved', 3, '2026-06-05 09:00:00'),
(7, 1, 'Maintenance & Operations', 'Office Supplies - June 11', 6200, '2026-06-11', 'approved', 3, '2026-06-11 10:00:00');

-- 7. SK Income Table
CREATE TABLE IF NOT EXISTS sk_income (
    id INT AUTO_INCREMENT PRIMARY KEY,
    barangayId INT NOT NULL,
    source VARCHAR(255) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    dateReceived DATE NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'approved',
    userId INT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (barangayId) REFERENCES barangays(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO sk_income (id, barangayId, source, amount, dateReceived, category, description, status, userId, createdAt) VALUES
(1, 1, 'SK Fund Allocation', 500000, '2026-01-10', 'Government Allocation', '2026 SK Budget Allocation', 'approved', 4, '2026-01-10 08:00:00'),
(2, 1, 'Donations', 25000, '2026-03-20', 'Donations', 'Community donations for youth programs', 'approved', 4, '2026-03-20 09:00:00'),
(3, 1, 'Fundraising Event', 15000, '2026-06-08', 'Fundraising', 'June fun run proceeds', 'approved', 4, '2026-06-08 08:00:00'),
(4, 1, 'Donations', 3000, '2026-06-11', 'Donations', 'Local sponsor donation - June 11', 'approved', 4, '2026-06-11 09:00:00');

-- 8. SK Expenses Table
CREATE TABLE IF NOT EXISTS sk_expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    barangayId INT NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    amount DECIMAL(15, 2) NOT NULL,
    dateSpent DATE NOT NULL,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'approved',
    userId INT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (barangayId) REFERENCES barangays(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO sk_expenses (id, barangayId, category, description, amount, dateSpent, status, userId, createdAt) VALUES
(1, 1, 'Youth Programs', 'Linggo ng Kabataan Activities', 23750, '2026-04-15', 'approved', 4, '2026-04-15 08:00:00'),
(2, 1, 'Sports Equipment', 'SK Federation Sports League Equipment', 41000, '2026-03-10', 'approved', 4, '2026-03-10 09:00:00'),
(3, 1, 'School Supplies', 'School supplies for students', 49093, '2026-02-15', 'approved', 4, '2026-02-15 10:00:00'),
(4, 1, 'Youth Programs', 'June Fun Run logistics', 9800, '2026-06-08', 'approved', 4, '2026-06-08 09:00:00'),
(5, 1, 'Office Supplies', 'SK office supplies - June 11', 1500, '2026-06-11', 'approved', 4, '2026-06-11 10:00:00');

-- 9. Reports Table
CREATE TABLE IF NOT EXISTS reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    barangayId INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    period VARCHAR(100) NOT NULL,
    submittedBy INT NOT NULL,
    submittedAt DATETIME NOT NULL,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    approvedBy INT NULL,
    approvedAt DATETIME NULL,
    notes TEXT,
    file_path VARCHAR(255) NULL,
    data JSON,
    FOREIGN KEY (barangayId) REFERENCES barangays(id) ON DELETE CASCADE,
    FOREIGN KEY (submittedBy) REFERENCES users(id),
    FOREIGN KEY (approvedBy) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO reports (id, barangayId, title, type, period, submittedBy, submittedAt, status, approvedBy, approvedAt, notes, file_path, data) VALUES
(1, 1, 'Q1 2026 Income & Expense Report', 'income_expense', 'Q1 2026', 3, '2026-04-10 10:00:00', 'approved', 1, '2026-04-12 14:00:00', 'Approved - records are complete and accurate.', NULL, '{}'),
(2, 1, '2026 Budget Proposal', 'budget_proposal', '2026', 3, '2026-01-05 09:00:00', 'approved', 1, '2026-01-08 11:00:00', '', NULL, '{}'),
(3, 1, 'April 2026 Disbursement Voucher', 'disbursement_voucher', 'April 2026', 3, '2026-05-02 08:00:00', 'pending', NULL, NULL, '', NULL, '{}');

-- 10. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId INT NOT NULL,
    action VARCHAR(100) NOT NULL,
    description TEXT,
    module VARCHAR(100) NOT NULL,
    ipAddress VARCHAR(50) DEFAULT 'N/A',
    location VARCHAR(255) DEFAULT 'Unknown',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO audit_logs (id, userId, action, description, module, ipAddress, createdAt) VALUES
(1, 1, 'LOGIN', 'Super Admin logged in', 'Authentication', '192.168.1.1', '2026-07-18 09:00:00'),
(2, 3, 'SUBMIT_REPORT', 'Treasurer submitted Q1 2026 Income & Expense Report', 'Reports', '192.168.1.5', '2026-07-18 08:00:00'),
(3, 1, 'APPROVE_REPORT', 'Super Admin approved Q1 2026 Income & Expense Report', 'Reports', '192.168.1.1', '2026-07-18 09:00:00');

-- 11. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'info',
    is_read BOOLEAN DEFAULT FALSE,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO notifications (id, userId, title, message, type, is_read, createdAt) VALUES
(1, 1, 'New Report Submitted', 'April 2026 Disbursement Voucher from Paule 1 needs review.', 'info', FALSE, '2026-07-18 10:00:00'),
(2, 3, 'Report Approved', 'Your Q1 2026 Income & Expense Report has been approved.', 'success', FALSE, '2026-07-18 10:00:00');

-- 12. System Config Table
CREATE TABLE IF NOT EXISTS system_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fiscalYear INT NOT NULL,
    municipality VARCHAR(100) NOT NULL,
    reportDeadline DATE NOT NULL,
    sessionTimeout INT NOT NULL,
    passwordMinLength INT NOT NULL,
    maxFileUploadMB INT NOT NULL,
    systemName VARCHAR(100) NOT NULL,
    systemVersion VARCHAR(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO system_config (id, fiscalYear, municipality, reportDeadline, sessionTimeout, passwordMinLength, maxFileUploadMB, systemName, systemVersion) VALUES
(1, 2026, 'Rizal', '2026-12-31', 30, 8, 10, 'BFMSS', '1.0.0');
