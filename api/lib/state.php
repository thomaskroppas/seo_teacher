<?php
declare(strict_types=1);

const STATE_MAX_BYTES = 2_000_000;

/** Состояние декодируем в stdClass (не в массивы): иначе пустые объекты {} превращаются в [] и клиент теряет данные. */
function state_decode(?string $json): stdClass {
    $d = json_decode($json ?? '{}');
    return $d instanceof stdClass ? $d : new stdClass();
}

function action_state_get(): void {
    $u = require_user();
    $st = db()->prepare('SELECT rev, state, updated_at FROM progress WHERE user_id = ?');
    $st->execute([$u['id']]);
    $r = $st->fetch() ?: ['rev' => 0, 'state' => '{}', 'updated_at' => 0];
    json_out(['rev' => (int)$r['rev'], 'state' => state_decode($r['state']), 'updatedAt' => (int)$r['updated_at']]);
}

/** Сохранение с оптимистичной блокировкой: baseRev должен совпасть с текущей ревизией, иначе 409 + актуальное состояние. */
function action_state_put(): void {
    require_xhr();
    $u = require_user();
    $in = json_decode(raw_input(STATE_MAX_BYTES + 1000));
    if (!$in instanceof stdClass || !isset($in->state) || !$in->state instanceof stdClass) fail('bad_state', 'Нет данных', 400);
    $json = json_encode($in->state, JSON_UNESCAPED_UNICODE);
    if ($json === false || strlen($json) > STATE_MAX_BYTES) fail('too_large', 'Слишком большой объём данных прогресса', 413);
    $base = (int)($in->baseRev ?? 0);
    $p = db();
    $p->exec('BEGIN IMMEDIATE');
    try {
        $st = $p->prepare('SELECT rev, state, updated_at FROM progress WHERE user_id = ?');
        $st->execute([$u['id']]);
        $r = $st->fetch();
        $rev = $r ? (int)$r['rev'] : 0;
        if ($rev !== $base) {
            $p->exec('ROLLBACK');
            json_out(['error' => 'conflict', 'rev' => $rev, 'state' => state_decode($r['state'] ?? '{}')], 409);
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
