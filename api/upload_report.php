<?php
// api/upload_report.php
require_once 'config.php';

$user = getAuthenticatedUser();
if (!$user) {
    sendJsonResponse(['status' => 'error', 'message' => 'Unauthorized access'], 401);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJsonResponse(['status' => 'error', 'message' => 'Method not allowed'], 405);
}

// Check for file upload errors
if (!isset($_FILES['pdf_file']) || $_FILES['pdf_file']['error'] !== UPLOAD_ERR_OK) {
    sendJsonResponse(['status' => 'error', 'message' => 'Failed to upload PDF file'], 400);
}

// Validate metadata
$metadataJson = $_POST['metadata'] ?? '{}';
$metadata = json_decode($metadataJson, true);

if (!$metadata) {
    sendJsonResponse(['status' => 'error', 'message' => 'Invalid metadata'], 400);
}

// Generate unique filename
$uploadDir = '../uploads/reports/';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

$prefix = $metadata['module'] === 'sk' ? 'BFMSS_SK' : 'BFMSS';
$safeType = preg_replace('/[^a-zA-Z0-9]/', '_', $metadata['type'] ?? 'report');
$filename = $prefix . '_' . $safeType . '_' . time() . '_' . uniqid() . '.pdf';
$targetPath = $uploadDir . $filename;
$dbPath = '/updated_capstone/uploads/reports/' . $filename;

// Move uploaded file
if (!move_uploaded_file($_FILES['pdf_file']['tmp_name'], $targetPath)) {
    sendJsonResponse(['status' => 'error', 'message' => 'Failed to save PDF to server'], 500);
}

// Insert or Update database record
try {
    $dataJson = json_encode($metadata['data'] ?? []);
    
    if (isset($metadata['resubmitId']) && $metadata['resubmitId']) {
        // Resubmitting existing report
        $sql = "UPDATE `reports` SET status = 'pending', submittedAt = NOW(), data = ?, period = ?, title = ?, file_path = ? WHERE id = ?";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            $dataJson,
            $metadata['period'] ?? date('Y-m-d'),
            $metadata['title'] ?? 'Report',
            $dbPath,
            $metadata['resubmitId']
        ]);
        
        $reportId = $metadata['resubmitId'];
    } else {
        // New report
        $sql = "INSERT INTO `reports` (`barangayId`, `title`, `type`, `period`, `submittedBy`, `submittedAt`, `status`, `data`, `file_path`) 
                VALUES (?, ?, ?, ?, ?, NOW(), 'pending', ?, ?)";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            $metadata['barangayId'] ?? $user['barangayId'],
            $metadata['title'] ?? 'Report',
            $metadata['type'] ?? 'unknown',
            $metadata['period'] ?? date('Y-m-d'),
            $user['id'],
            $dataJson,
            $dbPath
        ]);
        
        $reportId = $pdo->lastInsertId();
    }
    
    // Fetch inserted record
    $stmt = $pdo->prepare("SELECT * FROM `reports` WHERE id = ?");
    $stmt->execute([$reportId]);
    $inserted = $stmt->fetch();
    
    sendJsonResponse(['status' => 'success', 'data' => $inserted]);
} catch (\PDOException $e) {
    // Delete file if DB insert fails
    if (file_exists($targetPath)) {
        unlink($targetPath);
    }
    sendJsonResponse(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()], 500);
}
?>
