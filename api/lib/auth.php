<?php
declare(strict_types=1);

const SESSION_COOKIE = 'seo_sid';
const SESSION_TTL = 60 * 60 * 24 * 30;

function set_session_cookie(string $token, int $expires): void {
    setcookie(SESSION_COOKIE, $token, [
        'expires' => $expires, 'path' => '/', 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax',
    ]);
}

/** Атомарно проверяет лимиты попыток и записывает новую. true — можно продолжать.
    Ключи: логин+IP (6 за 15 мин), логин глобально (40, защита от распределённого перебора), IP (60, только для публичных адресов). */
function attempt_begin(string $kind, string $name): bool {
    $p = db(); $now = time(); $ip = client_ip(); $n = mb_strtolower($name);
    $keys = [[$kind . ':' . $n . '|' . $ip, 6], [$kind . ':' . $n, 40]];
    if (ip_is_public($ip)) $keys[] = [$kind . '-ip:' . $ip, 60];
    $p->exec('BEGIN IMMEDIATE');
    try {
        $p->prepare('DELETE FROM login_attempts WHERE ts < ?')->execute([$now - 900]);
        $cnt = $p->prepare('SELECT COUNT(*) FROM login_attempts WHERE k = ?');
        foreach ($keys as [$k, $max]) { $cnt->execute([$k]); if ((int)$cnt->fetchColumn() >= $max) { $p->exec('COMMIT'); return false; } }
        $ins = $p->prepare('INSERT INTO login_attempts(k, ts) VALUES(?, ?)');
        foreach ($keys as [$k]) $ins->execute([$k, $now]);
        $p->exec('COMMIT');
        return true;
    } catch (Throwable $e) { if ($p->inTransaction()) $p->exec('ROLLBACK'); throw $e; }
}

function attempt_clear(string $kind, string $name): void {
    db()->prepare('DELETE FROM login_attempts WHERE k = ?')->execute([$kind . ':' . mb_strtolower($name) . '|' . client_ip()]);
}

function create_session(int $userId): void {
    $token = random_hex(32);
    $exp = time() + SESSION_TTL;
    db()->prepare('DELETE FROM sessions WHERE expires_at < ?')->execute([time()]);
    db()->prepare('INSERT INTO sessions(token_hash, user_id, created_at, expires_at) VALUES(?,?,?,?)')
        ->execute([hash('sha256', $token), $userId, time(), $exp]);
    set_session_cookie($token, $exp);
}

/** Текущий пользователь или null. Роль и активность всегда берутся из БД. */
function current_user(): ?array {
    static $cache = false;
    if ($cache !== false) return $cache;
    $cache = null;
    $tok = $_COOKIE[SESSION_COOKIE] ?? '';
    if (!is_string($tok) || !preg_match('/^[a-f0-9]{64}$/', $tok)) return null;
    $st = db()->prepare('SELECT s.token_hash, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?');
    $st->execute([hash('sha256', $tok)]);
    $r = $st->fetch();
    if (!$r || (int)$r['expires_at'] < time() || !(int)$r['active']) return null;
    if ((int)$r['expires_at'] - time() < SESSION_TTL - 86400) { // продлеваем раз в сутки
        $exp = time() + SESSION_TTL;
        db()->prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?')->execute([$exp, $r['token_hash']]);
        set_session_cookie($tok, $exp);
    }
    unset($r['pass_hash'], $r['token_hash'], $r['expires_at']);
    return $cache = $r;
}

function require_user(): array {
    $u = current_user();
    if (!$u) fail('unauthorized', 'Нужно войти', 401);
    return $u;
}

function require_admin(): array {
    $u = require_user();
    if ($u['role'] !== 'admin') fail('forbidden', 'Только для администратора', 403);
    return $u;
}

function user_public(array $u): array {
    return ['id' => (int)$u['id'], 'username' => $u['username'], 'displayName' => $u['display_name'] ?: $u['username'], 'role' => $u['role']];
}

function check_password_strength(string $p): void {
    if (mb_strlen($p) < 8) fail('weak_password', 'Пароль должен быть не короче 8 символов', 400);
    if (mb_strlen($p) > 200) fail('weak_password', 'Пароль слишком длинный', 400);
}

function valid_username(string $n): void {
    if (!preg_match('/^[A-Za-z0-9._-]{3,32}$/', $n)) fail('bad_username', 'Логин: 3–32 символа, латиница, цифры, точка, дефис, подчёркивание', 400);
}

function user_create(string $username, string $password, string $role, string $display = '', ?float $limit = null): int {
    valid_username($username);
    check_password_strength($password);
    $st = db()->prepare('SELECT 1 FROM users WHERE username = ?');
    $st->execute([$username]);
    if ($st->fetchColumn()) fail('exists', 'Такой логин уже есть', 409);
    db()->prepare('INSERT INTO users(username, display_name, pass_hash, role, active, daily_limit_usd, created_at) VALUES(?,?,?,?,1,?,?)')
        ->execute([$username, mb_substr($display, 0, 60), password_hash($password, PASSWORD_DEFAULT), $role, $limit, time()]);
    $id = (int)db()->lastInsertId();
    db()->prepare('INSERT INTO progress(user_id, rev, state, updated_at) VALUES(?,0,?,0)')->execute([$id, '{}']);
    return $id;
}

function action_setup_status(): void {
    json_out(['needsSetup' => user_count() === 0]);
}

function action_setup(): void {
    require_xhr();
    if (user_count() > 0) fail('already', 'Система уже настроена', 409);
    if (!attempt_begin('setup', 'key')) fail('throttled', 'Слишком много попыток. Подождите 15 минут.', 429);
    $in = json_input();
    $key = cfg()['setup_key'];
    if (!secure_equals((string)$key, (string)($in['setupKey'] ?? ''))) fail('bad_setup_key', 'Неверный ключ установки (setup_key из api/config.php)', 403);
    $p = db();
    $p->exec('BEGIN IMMEDIATE');
    if (user_count() > 0) { $p->exec('ROLLBACK'); fail('already', 'Система уже настроена', 409); }
    try { $id = user_create(str_in($in, 'username', 32), (string)($in['password'] ?? ''), 'admin', str_in($in, 'displayName', 60)); $p->exec('COMMIT'); }
    catch (Throwable $e) { if ($p->inTransaction()) $p->exec('ROLLBACK'); throw $e; }
    create_session($id);
    $u = $p->prepare('SELECT * FROM users WHERE id = ?'); $u->execute([$id]);
    json_out(['user' => user_public($u->fetch())]);
}

function action_login(): void {
    require_xhr();
    $in = json_input(20000);
    $username = str_in($in, 'username', 32);
    $password = (string)($in['password'] ?? '');
    if ($username === '' || $password === '') fail('bad_credentials', 'Введите логин и пароль', 400);
    if (!attempt_begin('u', $username)) fail('throttled', 'Слишком много попыток. Подождите 15 минут.', 429);
    $st = db()->prepare('SELECT * FROM users WHERE username = ?');
    $st->execute([$username]);
    $u = $st->fetch();
    $ok = $u && password_verify($password, $u['pass_hash']);
    if (!$ok) {
        if (!$u) password_verify($password, '$2y$10$fLDOfpqNBys7j15W2VsBEOQ37j0yWa1y8iVqPrmQcOZiiwz3c/cLa'); // выравниваем время ответа для несуществующих логинов
        fail('bad_credentials', 'Неверный логин или пароль', 401);
    }
    if (!(int)$u['active']) fail('disabled', 'Аккаунт отключён администратором', 403);
    attempt_clear('u', $username);
    db()->prepare('UPDATE users SET last_login = ? WHERE id = ?')->execute([time(), $u['id']]);
    if (password_needs_rehash($u['pass_hash'], PASSWORD_DEFAULT)) {
        db()->prepare('UPDATE users SET pass_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $u['id']]);
    }
    create_session((int)$u['id']);
    json_out(['user' => user_public($u)]);
}

function action_logout(): void {
    require_xhr();
    $tok = $_COOKIE[SESSION_COOKIE] ?? '';
    if (is_string($tok) && preg_match('/^[a-f0-9]{64}$/', $tok)) {
        db()->prepare('DELETE FROM sessions WHERE token_hash = ?')->execute([hash('sha256', $tok)]);
    }
    set_session_cookie('', time() - 3600);
    json_out(['ok' => true]);
}

function action_change_password(): void {
    require_xhr();
    $u = require_user();
    $in = json_input(20000);
    $st = db()->prepare('SELECT pass_hash FROM users WHERE id = ?'); $st->execute([$u['id']]);
    if (!password_verify((string)($in['current'] ?? ''), (string)$st->fetchColumn())) fail('bad_credentials', 'Текущий пароль неверен', 403);
    $new = (string)($in['new'] ?? '');
    check_password_strength($new);
    db()->prepare('UPDATE users SET pass_hash = ? WHERE id = ?')->execute([password_hash($new, PASSWORD_DEFAULT), $u['id']]);
    // остальные сессии завершаем, текущую оставляем
    $tok = (string)($_COOKIE[SESSION_COOKIE] ?? '');
    db()->prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?')->execute([$u['id'], hash('sha256', $tok)]);
    json_out(['ok' => true]);
}
