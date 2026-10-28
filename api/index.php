<?php
declare(strict_types=1);
/* Единая точка входа API: api/index.php?a=<действие> */
error_reporting(E_ALL);
ini_set('display_errors', '0');
mb_internal_encoding('UTF-8');
foreach (['util', 'db', 'auth', 'usage', 'state', 'chat', 'admin'] as $f) require __DIR__ . '/lib/' . $f . '.php';
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
if (cfg()['force_https']) header('Strict-Transport-Security: max-age=31536000');
date_default_timezone_set(cfg()['timezone'] ?: 'Europe/Moscow');

set_exception_handler(function (Throwable $e) {
    error_log('[seo-teacher] ' . $e);
    $out = ['error' => 'server', 'message' => 'Внутренняя ошибка сервера'];
    if (cfg()['debug']) $out['debug'] = $e->getMessage();
    if (!headers_sent()) json_out($out, 500);
    exit;
});

$a = (string)($_GET['a'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$routes = [
    'setup_status' => ['GET', 'action_setup_status'], 'setup' => ['POST', 'action_setup'],
    'login' => ['POST', 'action_login'], 'logout' => ['POST', 'action_logout'], 'me' => ['GET', 'action_me'],
    'change_password' => ['POST', 'action_change_password'],
    'state_get' => ['GET', 'action_state_get'], 'state_put' => ['POST', 'action_state_put'],
    'chat' => ['POST', 'action_chat'],
    'admin_overview' => ['GET', 'action_admin_overview'], 'admin_user_create' => ['POST', 'action_admin_user_create'],
    'admin_user_update' => ['POST', 'action_admin_user_update'], 'admin_user_delete' => ['POST', 'action_admin_user_delete'],
    'admin_settings_set' => ['POST', 'action_admin_settings_set'], 'diag' => ['GET', 'action_diag'],
];
if (!isset($routes[$a])) fail('not_found', 'Неизвестное действие', 404);
if ($routes[$a][0] !== $method) fail('method', 'Неверный метод', 405);
$routes[$a][1]();
