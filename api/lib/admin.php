<?php
declare(strict_types=1);

function admin_user_row(array $r, array $s): array {
    $day = now_day();
    $month = substr($day, 0, 7);
    $st = db()->prepare("SELECT COALESCE(SUM(CASE WHEN day = ? THEN cost_usd END),0) AS today, COALESCE(SUM(CASE WHEN day LIKE ? THEN cost_usd END),0) AS month, COUNT(CASE WHEN day = ? THEN 1 END) AS reqs FROM usage WHERE user_id = ?");
    $st->execute([$day, $month . '%', $day, $r['id']]);
    $x = $st->fetch();
    return [
        'id' => (int)$r['id'], 'username' => $r['username'], 'displayName' => $r['display_name'], 'role' => $r['role'],
        'active' => (bool)$r['active'], 'dailyLimit' => $r['daily_limit_usd'] === null ? null : (float)$r['daily_limit_usd'],
        'effectiveLimit' => user_limit($r, $s), 'spentToday' => round((float)$x['today'], 4), 'spentMonth' => round((float)$x['month'], 4),
        'requestsToday' => (int)$x['reqs'], 'lastLogin' => $r['last_login'] ? (int)$r['last_login'] : null, 'createdAt' => (int)$r['created_at'],
    ];
}

function action_admin_overview(): void {
    require_admin();
    $s = settings_all();
    $users = [];
    foreach (db()->query('SELECT * FROM users ORDER BY role DESC, username COLLATE NOCASE') as $r) $users[] = admin_user_row($r, $s);
    $days = [];
    $st = db()->query("SELECT day, COALESCE(SUM(cost_usd),0) AS cost, COUNT(*) AS reqs FROM usage WHERE day >= date('now','-14 day') GROUP BY day ORDER BY day DESC");
    foreach ($st as $r) $days[] = ['day' => $r['day'], 'cost' => round((float)$r['cost'], 4), 'requests' => (int)$r['reqs']];
    json_out(['users' => $users, 'settings' => $s, 'days' => $days, 'today' => now_day(), 'globalSpentToday' => round(spent_all_on(now_day()), 4), 'timezone' => cfg()['timezone']]);
}

function action_admin_user_create(): void {
    require_xhr(); require_admin();
    $in = json_input(20000);
    $role = ($in['role'] ?? 'student') === 'admin' ? 'admin' : 'student';
    $limit = isset($in['dailyLimit']) && $in['dailyLimit'] !== '' && $in['dailyLimit'] !== null ? max(0.0, min(1000.0, (float)$in['dailyLimit'])) : null;
    $id = user_create(str_in($in, 'username', 32), (string)($in['password'] ?? ''), $role, str_in($in, 'displayName', 60), $limit);
    json_out(['id' => $id]);
}

function action_admin_user_update(): void {
    require_xhr(); $me = require_admin();
    $in = json_input(20000);
    $id = (int)($in['id'] ?? 0);
    $st = db()->prepare('SELECT * FROM users WHERE id = ?'); $st->execute([$id]);
    $u = $st->fetch();
    if (!$u) fail('not_found', 'Пользователь не найден', 404);
    $p = db();
    if (array_key_exists('dailyLimit', $in)) {
        $v = $in['dailyLimit'];
        $lim = ($v === null || $v === '') ? null : max(0.0, min(1000.0, (float)$v));
        $p->prepare('UPDATE users SET daily_limit_usd = ? WHERE id = ?')->execute([$lim, $id]);
    }
    if (array_key_exists('displayName', $in)) $p->prepare('UPDATE users SET display_name = ? WHERE id = ?')->execute([str_in($in, 'displayName', 60), $id]);
    if (isset($in['password']) && $in['password'] !== '') {
        check_password_strength((string)$in['password']);
        $p->prepare('UPDATE users SET pass_hash = ? WHERE id = ?')->execute([password_hash((string)$in['password'], PASSWORD_DEFAULT), $id]);
        $p->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$id]);
    }
    $newRole = isset($in['role']) ? (($in['role'] === 'admin') ? 'admin' : 'student') : $u['role'];
    $newActive = isset($in['active']) ? ((bool)$in['active'] ? 1 : 0) : (int)$u['active'];
    if (($newRole !== 'admin' || !$newActive) && $u['role'] === 'admin') {
        $c = (int)$p->query("SELECT COUNT(*) FROM users WHERE role='admin' AND active=1 AND id != " . (int)$id)->fetchColumn();
        if ($c < 1) fail('last_admin', 'Нельзя отключить или понизить последнего администратора', 409);
    }
    $p->prepare('UPDATE users SET role = ?, active = ? WHERE id = ?')->execute([$newRole, $newActive, $id]);
    if (!$newActive) $p->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$id]);
    json_out(['ok' => true]);
}

function action_admin_user_delete(): void {
    require_xhr(); $me = require_admin();
    $id = (int)(json_input(2000)['id'] ?? 0);
    if ($id === (int)$me['id']) fail('self', 'Нельзя удалить самого себя', 409);
    $st = db()->prepare('SELECT role FROM users WHERE id = ?'); $st->execute([$id]);
    if (!$st->fetch()) fail('not_found', 'Пользователь не найден', 404);
    db()->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
    json_out(['ok' => true]);
}

function action_admin_settings_set(): void {
    require_xhr(); require_admin();
    $in = json_input(20000);
    $num = fn($v, $min, $max) => (string)max($min, min($max, (float)$v));
    $map = [
        'model' => fn($v) => mb_substr(trim((string)$v), 0, 80),
        'price_in' => fn($v) => $num($v, 0, 1000),
        'price_out' => fn($v) => $num($v, 0, 1000),
        'daily_limit_default' => fn($v) => $num($v, 0, 1000),
        'global_daily_limit' => fn($v) => $num($v, 0, 100000),
        'max_output_tokens' => fn($v) => (string)(int)max(100, min(8000, (int)$v)),
        'token_param' => fn($v) => $v === 'max_tokens' ? 'max_tokens' : 'max_completion_tokens',
        'reasoning_effort' => fn($v) => in_array($v, ['', 'none', 'minimal', 'low', 'medium', 'high'], true) ? (string)$v : '',
        'extra_instructions' => fn($v) => mb_substr((string)$v, 0, 2000),
    ];
    foreach ($map as $k => $fn) {
        if (!array_key_exists($k, $in)) continue;
        $val = $fn($in[$k]);
        if ($k === 'model' && $val === '') fail('bad_model', 'Название модели не может быть пустым', 400);
        setting_set($k, $val);
    }
    json_out(['settings' => settings_all()]);
}

/** Диагностика окружения (только администратор или по setup_key до создания первого аккаунта). */
function action_diag(): void {
    $allowed = false;
    if (user_count() === 0) $allowed = secure_equals((string)cfg()['setup_key'], (string)($_GET['key'] ?? ''));
    else { $u = current_user(); $allowed = $u && $u['role'] === 'admin'; }
    if (!$allowed) fail('forbidden', 'Нет доступа', 403);
    $c = cfg();
    $checks = [
        'php' => PHP_VERSION, 'pdo_sqlite' => extension_loaded('pdo_sqlite'), 'curl' => function_exists('curl_init'), 'mbstring' => function_exists('mb_substr'),
        'https' => is_https(), 'timezone' => $c['timezone'], 'setup_key_set' => $c['setup_key'] !== '', 'relay_configured' => $c['relay_url'] !== '' && $c['relay_secret'] !== '',
    ];
    try { $checks['data_dir'] = data_dir(); $checks['db_ok'] = (bool)db()->query('SELECT 1')->fetchColumn(); } catch (Throwable $e) { $checks['db_ok'] = false; }
    if ($checks['relay_configured'] && function_exists('curl_init')) {
        $ch = curl_init(rtrim($c['relay_url'], '/') . (str_contains($c['relay_url'], '?') ? '&' : '?') . 'check=1');
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 25, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_HTTPHEADER => ['X-Relay-Secret: ' . $c['relay_secret']]]);
        $r = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $err = curl_error($ch); curl_close($ch);
        $checks['relay_http'] = $code; $checks['relay_error'] = $err; $checks['relay_reply'] = is_string($r) ? substr($r, 0, 300) : null;
    }
    json_out($checks);
}
