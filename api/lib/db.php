<?php
declare(strict_types=1);

const SETTING_DEFAULTS = [
    'model' => 'gpt-6-sol',
    'price_in' => '2.00',           // $ за 1 млн входных токенов
    'price_out' => '10.00',         // $ за 1 млн выходных токенов
    'daily_limit_default' => '1.00',// $ на ученика в сутки
    'global_daily_limit' => '5.00', // $ на всех в сутки (0 = выключено)
    'max_output_tokens' => '1500',
    'token_param' => 'max_completion_tokens',
    'reasoning_effort' => '',
    'extra_instructions' => '',
];

function data_dir(): string {
    $dir = cfg()['data_dir'];
    if ($dir === '') fail('config', 'Не задан data_dir в api/config.php', 500);
    if (!is_dir($dir) && !@mkdir($dir, 0750, true)) fail('config', 'Не удалось создать папку данных: ' . $dir, 500);
    if (!is_writable($dir)) fail('config', 'Папка данных недоступна для записи: ' . $dir, 500);
    $real = realpath($dir) ?: $dir;
    $root = isset($_SERVER['DOCUMENT_ROOT']) ? (realpath((string)$_SERVER['DOCUMENT_ROOT']) ?: '') : '';
    if ($root !== '' && str_starts_with($real . '/', rtrim($root, '/') . '/') && !cfg()['allow_data_in_webroot']) {
        fail('config', 'data_dir находится внутри веб-каталога сайта — файл базы можно будет скачать. Укажите папку выше (например ~/seo_data).', 500);
    }
    return $real;
}

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    if (!extension_loaded('pdo_sqlite')) fail('config', 'На хостинге не включено расширение pdo_sqlite', 500);
    $pdo = new PDO('sqlite:' . data_dir() . '/app.sqlite', null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA busy_timeout = 8000');
    $pdo->exec('PRAGMA foreign_keys = ON');
    migrate($pdo);
    return $pdo;
}

function migrate(PDO $p): void {
    $p->exec("CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name TEXT NOT NULL DEFAULT '',
        pass_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin')),
        active INTEGER NOT NULL DEFAULT 1,
        daily_limit_usd REAL,
        created_at INTEGER NOT NULL,
        last_login INTEGER
    )");
    $p->exec("CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
    )");
    $p->exec("CREATE TABLE IF NOT EXISTS progress (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        rev INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL DEFAULT '{}',
        updated_at INTEGER NOT NULL DEFAULT 0
    )");
    $p->exec("CREATE TABLE IF NOT EXISTS usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ts INTEGER NOT NULL,
        day TEXT NOT NULL,
        model TEXT NOT NULL DEFAULT '',
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending'
    )");
    $p->exec('CREATE INDEX IF NOT EXISTS usage_user_day ON usage(user_id, day)');
    $p->exec('CREATE INDEX IF NOT EXISTS usage_day ON usage(day)');
    $p->exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    $p->exec("CREATE TABLE IF NOT EXISTS login_attempts (k TEXT NOT NULL, ts INTEGER NOT NULL)");
    $p->exec('CREATE INDEX IF NOT EXISTS la_k ON login_attempts(k, ts)');
}

function settings_all(): array {
    $out = SETTING_DEFAULTS;
    foreach (db()->query('SELECT key, value FROM settings') as $r) {
        if (array_key_exists($r['key'], $out)) $out[$r['key']] = $r['value'];
    }
    return $out;
}

function setting_set(string $k, string $v): void {
    $st = db()->prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    $st->execute([$k, $v]);
}

function user_count(): int {
    return (int)db()->query('SELECT COUNT(*) FROM users')->fetchColumn();
}
