<?php
// api/crud.php
require_once 'config.php';

$user = getAuthenticatedUser();
if (!$user) {
    sendJsonResponse(['status' => 'error', 'message' => 'Unauthorized access'], 401);
}

// Whitelist allowed tables to prevent SQL injection via table names
$allowedTables = [
    'roles', 'barangays', 'users', 'budgets', 'income', 
    'expenses', 'sk_income', 'sk_expenses', 'reports', 
    'audit_logs', 'notifications', 'system_config'
];

$table = $_GET['table'] ?? '';
if (!in_array($table, $allowedTables)) {
    sendJsonResponse(['status' => 'error', 'message' => 'Invalid table'], 400);
}

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true);

try {
    switch ($method) {
        case 'GET':
            // Simple filtering based on query params
            $sql = "SELECT * FROM `$table`";
            $params = [];
            
            $conditions = [];
            foreach ($_GET as $key => $value) {
                if ($key !== 'table' && $key !== '_' /* jQuery cache buster */) {
                    $conditions[] = "`$key` = ?";
                    $params[] = $value;
                }
            }
            
            if (count($conditions) > 0) {
                $sql .= " WHERE " . implode(' AND ', $conditions);
            }
            
            // Default ordering
            $sql .= " ORDER BY id ASC";
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $data = $stmt->fetchAll();
            
            // Special handling for JSON fields if needed
            if ($table === 'reports') {
                foreach ($data as &$row) {
                    $row['data'] = json_decode($row['data'], true);
                }
            }
            
            sendJsonResponse(['status' => 'success', 'data' => $data]);
            break;

        case 'POST':
            if (empty($input)) {
                sendJsonResponse(['status' => 'error', 'message' => 'No data provided'], 400);
            }
            
            // Special handling for JSON fields
            if ($table === 'reports' && isset($input['data'])) {
                $input['data'] = json_encode($input['data']);
            }
            
            $columns = array_keys($input);
            $placeholders = array_fill(0, count($columns), '?');
            $values = array_values($input);
            
            $sql = "INSERT INTO `$table` (`" . implode('`, `', $columns) . "`) VALUES (" . implode(', ', $placeholders) . ")";
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute($values);
            
            $id = $pdo->lastInsertId();
            
            // Fetch the inserted row to return
            $stmt = $pdo->prepare("SELECT * FROM `$table` WHERE id = ?");
            $stmt->execute([$id]);
            $inserted = $stmt->fetch();
            
            sendJsonResponse(['status' => 'success', 'data' => $inserted]);
            break;

        case 'PUT':
            $id = $_GET['id'] ?? null;
            if (!$id || empty($input)) {
                sendJsonResponse(['status' => 'error', 'message' => 'ID and data required'], 400);
            }
            
            // Special handling for JSON fields
            if ($table === 'reports' && isset($input['data'])) {
                $input['data'] = json_encode($input['data']);
            }
            
            $setClause = [];
            $values = [];
            foreach ($input as $key => $value) {
                if ($key !== 'id') {
                    $setClause[] = "`$key` = ?";
                    $values[] = $value;
                }
            }
            $values[] = $id; // For WHERE clause
            
            $sql = "UPDATE `$table` SET " . implode(', ', $setClause) . " WHERE id = ?";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($values);
            
            // Fetch updated row
            $stmt = $pdo->prepare("SELECT * FROM `$table` WHERE id = ?");
            $stmt->execute([$id]);
            $updated = $stmt->fetch();
            
            sendJsonResponse(['status' => 'success', 'data' => $updated]);
            break;

        case 'DELETE':
            $id = $_GET['id'] ?? null;
            if (!$id) {
                sendJsonResponse(['status' => 'error', 'message' => 'ID required'], 400);
            }
            
            $stmt = $pdo->prepare("DELETE FROM `$table` WHERE id = ?");
            $stmt->execute([$id]);
            
            sendJsonResponse(['status' => 'success']);
            break;

        default:
            sendJsonResponse(['status' => 'error', 'message' => 'Method not allowed'], 405);
    }
} catch (\PDOException $e) {
    // Return safe error message
    sendJsonResponse(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()], 500);
}
?>
