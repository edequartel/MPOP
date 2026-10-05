<?php
declare(strict_types=1);

require_once __DIR__ . '/server_auth.php';
cors_preflight('GET, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_out(405, ['error' => 'Method not allowed.']);
}
// Only public connection settings belong in this response.
json_out(200, ['url' => $SUPABASE_URL, 'anonKey' => $SUPABASE_ANON_KEY]);
