<?php
declare(strict_types=1);

/** Конфигурация: api/config.php (не хранится в git). См. config.sample.php */
function cfg(): array {
    static $c = null;
    if ($c !== null) return $c;
    $f = __DIR__ . '/../config.php';
    $c = is_file($f) ? (array)require $f : [];
    $c += [
        'data_dir' => '',
        'setup_key' => '',
        'relay_url' => '',
        'relay_secret' => '',
        'timezone' => 'Europe/Moscow',
        'allow_data_in_webroot' => false,
        'debug' => false,
    ];
    return $c;
}

function now_day(): string {
    $tz = new DateTimeZone(cfg()['timezone'] ?: 'Europe/Moscow');
    return (new DateTimeImmutable('now', $tz))->format('Y-m-d');
}

function is_https(): bool {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || (($_SERVER['SERVER_PORT'] ?? '') === '443');
}

function json_out($data, int $code = 200): void {
    if (!headers_sent()) {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
    }
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $code, string $message, int $status = 400, array $extra = []): void {
    json_out(['error' => $code, 'message' => $message] + $extra, $status);
}

function json_input(int $maxBytes = 3_000_000): array {
    $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
    if ($raw === false || strlen($raw) > $maxBytes) fail('too_large', 'Слишком большой запрос', 413);
    if ($raw === '') return [];
    $d = json_decode($raw, true);
    if (!is_array($d)) fail('bad_json', 'Некорректные данные', 400);
    return $d;
}

function str_in(array $a, string $k, int $max = 200): string {
    $v = $a[$k] ?? '';
    if (!is_string($v)) return '';
    $v = trim($v);
    return mb_substr($v, 0, $max);
}

/** CSRF-защита: изменяющие запросы только JSON + кастомный заголовок (его нельзя отправить с чужого сайта без CORS). */
function require_xhr(): void {
    if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'seo-teacher') fail('csrf', 'Запрос отклонён', 403);
}

function client_ip(): string {
    return (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
}

function random_hex(int $bytes = 32): string {
    return bin2hex(random_bytes($bytes));
}

function secure_equals(string $a, string $b): bool {
    return $a !== '' && hash_equals($a, $b);
}
