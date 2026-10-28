<?php
declare(strict_types=1);

const STATE_MAX_BYTES = 2_000_000;

function action_state_get(): void {
    $u = require_user();
    $st = db()->prepare('SELECT rev, state, updated_at FROM progress WHERE user_id = ?');
    $st->execute([$u['id']]);
    $r = $st->fetch() ?: ['rev' => 0, 'state' => '{}', 'updated_at' => 0];
    json_out(['rev' => (int)$r['rev'], 'state' => json_decode($r['state'], true) ?: new stdClass(), 'updatedAt' => (int)$r['updated_at']]);
}

/** Сохранение с оптимистичной блокировкой: baseRev должен совпасть с текущей ревизией, иначе 409 + актуальное состояние. */
function action_state_put(): void {
    require_xhr();
    $u = require_user();
    $in = json_input(STATE_MAX_BYTES + 1000);
    if (!isset($in['state']) || !is_array($in['state'])) fail('bad_state', 'Нет данных', 400);
    $json = json_encode($in['state'], JSON_UNESCAPED_UNICODE);
    if ($json === false || strlen($json) > STATE_MAX_BYTES) fail('too_large', 'Слишком большой объём данных прогресса', 413);
    $base = (int)($in['baseRev'] ?? 0);
    $p = db();
    $p->exec('BEGIN IMMEDIATE');
    try {
        $st = $p->prepare('SELECT rev, state, updated_at FROM progress WHERE user_id = ?');
        $st->execute([$u['id']]);
        $r = $st->fetch();
        $rev = $r ? (int)$r['rev'] : 0;
        if ($rev !== $base) {
            $p->exec('ROLLBACK');
            json_out(['error' => 'conflict', 'rev' => $rev, 'state' => json_decode($r['state'] ?? '{}', true) ?: new stdClass()], 409);
        }
        $p->prepare('INSERT INTO progress(user_id, rev, state, updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET rev=excluded.rev, state=excluded.state, updated_at=excluded.updated_at')
            ->execute([$u['id'], $rev + 1, $json, time()]);
        $p->exec('COMMIT');
    } catch (Throwable $e) {
        if ($p->inTransaction()) $p->exec('ROLLBACK');
        throw $e;
    }
    json_out(['rev' => $rev + 1]);
}
