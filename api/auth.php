<?php
// api/auth.php
require_once 'config.php';

header('Content-Type: application/json');
$input = json_decode(file_get_contents('php://input'), true);
$action = isset($_GET['action']) ? $_GET['action'] : '';

function getRealIpAddr() {
    if (!empty($_SERVER['HTTP_CLIENT_IP'])) {
        return $_SERVER['HTTP_CLIENT_IP'];
    } elseif (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $ips = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
        return trim($ips[0]);
    } else {
        return $_SERVER['REMOTE_ADDR'];
    }
}

function getLocationFromIP($ip) {
    if ($ip == '127.0.0.1' || $ip == '::1') return 'Localhost';
    
    // Quick API call to ip-api.com
    $ctx = stream_context_create(['http' => ['timeout' => 2]]);
    $response = @file_get_contents("http://ip-api.com/json/{$ip}?fields=city,country", false, $ctx);
    if ($response) {
        $data = json_decode($response, true);
        if (isset($data['city']) && isset($data['country'])) {
            return $data['city'] . ', ' . $data['country'];
        }
    }
    return 'Unknown Location';
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'login') {
    $email = trim($input['email'] ?? '');
    $password = trim($input['password'] ?? '');

    if (empty($email) || empty($password)) {
        sendJsonResponse(['status' => 'error', 'message' => 'Email and password are required.']);
    }

    $stmt = $pdo->prepare("SELECT u.*, r.name as roleName FROM users u JOIN roles r ON u.roleId = r.id WHERE u.email = ? AND u.status = 'active'");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if ($user && password_verify($password, $user['password'])) {
        // Remove password hash from session data
        unset($user['password']);
        
        $_SESSION['user'] = $user;
        
        // Update lastLogin
        $updateStmt = $pdo->prepare("UPDATE users SET lastLogin = NOW() WHERE id = ?");
        $updateStmt->execute([$user['id']]);

        // Audit Log
        $ipAddress = getRealIpAddr();
        $location = getLocationFromIP($ipAddress);
        $logStmt = $pdo->prepare("INSERT INTO audit_logs (userId, action, description, module, ipAddress, location) VALUES (?, 'LOGIN', 'User logged in', 'Authentication', ?, ?)");
        $logStmt->execute([$user['id'], $ipAddress, $location]);

        sendJsonResponse(['status' => 'success', 'user' => $user]);
    } else {
        sendJsonResponse(['status' => 'error', 'message' => 'Invalid email or password.']);
    }
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'register') {
    $fullName = trim($input['fullName'] ?? '');
    $email = trim($input['email'] ?? '');
    $password = $input['password'] ?? '';
    $roleId = intval($input['roleId'] ?? 4);
    $municipality = trim($input['municipality'] ?? '');
    $barangayId = $input['barangayId'] ?? null;

    if (empty($fullName) || empty($email) || empty($password)) {
        sendJsonResponse(['status' => 'error', 'message' => 'All fields are required.']);
    }

    $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        sendJsonResponse(['status' => 'error', 'message' => 'An account with this email already exists.']);
    }

    $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

    $stmt = $pdo->prepare("INSERT INTO users (fullName, email, password, roleId, barangayId, municipality, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, 'active', NOW())");
    $stmt->execute([$fullName, $email, $hashedPassword, $roleId, $barangayId, $municipality]);
    $newUserId = $pdo->lastInsertId();

    $ipAddress = getRealIpAddr();
    $location = getLocationFromIP($ipAddress);
    $logStmt = $pdo->prepare("INSERT INTO audit_logs (userId, action, description, module, ipAddress, location) VALUES (?, 'REGISTER', 'User registered', 'Authentication', ?, ?)");
    $logStmt->execute([$newUserId, $ipAddress, $location]);

    sendJsonResponse(['status' => 'success', 'userId' => $newUserId]);
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'logout') {
    if (isset($_SESSION['user'])) {
        $userId = $_SESSION['user']['id'];
        $ipAddress = getRealIpAddr();
        $location = getLocationFromIP($ipAddress);
        $logStmt = $pdo->prepare("INSERT INTO audit_logs (userId, action, description, module, ipAddress, location) VALUES (?, 'LOGOUT', 'User logged out', 'Authentication', ?, ?)");
        $logStmt->execute([$userId, $ipAddress, $location]);
    }
    
    session_destroy();
    sendJsonResponse(['status' => 'success']);
} elseif ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'check') {
    if (isset($_SESSION['user'])) {
        sendJsonResponse(['status' => 'success', 'user' => $_SESSION['user']]);
    } else {
        sendJsonResponse(['status' => 'error', 'message' => 'Not authenticated.']);
    }
} else {
    sendJsonResponse(['status' => 'error', 'message' => 'Invalid action.']);
}
?>