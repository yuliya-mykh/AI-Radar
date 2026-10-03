<?php
// Посередник між браузером і публічним API freeserp.ai для хостингу з PHP.
// Робить те саме, що api/freeserp.js на Vercel: пересилає рядок параметрів
// на зафіксовану адресу й повертає відповідь з одним коректним CORS-заголовком.
const UPSTREAM = 'https://freeserp.ai/api.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') { http_response_code(204); exit; }
if ($method !== 'GET') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'method_not_allowed']);
    exit;
}

$query = $_SERVER['QUERY_STRING'] ?? '';
if (strlen($query) > 2000) {
    http_response_code(414);
    echo json_encode(['ok' => false, 'error' => 'query_too_long']);
    exit;
}

$ch = curl_init(UPSTREAM . ($query !== '' ? '?' . $query : ''));
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_TIMEOUT        => 15,
    CURLOPT_HTTPHEADER     => ['Accept: application/json'],
    CURLOPT_USERAGENT      => 'AI-Radar-proxy/1.0',
]);
$body   = curl_exec($ch);
$status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($body === false || $status === 0) {
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => 'upstream', 'detail' => 'FreeSerp API недоступний']);
    exit;
}

http_response_code($status);
if ($status >= 200 && $status < 300) header('Cache-Control: public, max-age=300');
echo $body;
