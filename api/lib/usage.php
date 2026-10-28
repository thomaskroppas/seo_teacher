<?php
declare(strict_types=1);

function user_limit(array $u, array $s): float {
    return $u['daily_limit_usd'] !== null && $u['daily_limit_usd'] !== '' ? (float)$u['daily_limit_usd'] : (float)$s['daily_limit_default'];
}

function spent_on(int $userId, string $day): float {
    $st = db()->prepare('SELECT COALESCE(SUM(cost_usd),0) FROM usage WHERE user_id = ? AND day = ?');
    $st->execute([$userId, $day]);
    return (float)$st->fetchColumn();
}

function spent_all_on(string $day): float {
    $st = db()->prepare('SELECT COALESCE(SUM(cost_usd),0) FROM usage WHERE day = ?');
    $st->execute([$day]);
    return (float)$st->fetchColumn();
}

function usage_summary(array $u, ?array $s = null): array {
    $s = $s ?? settings_all();
    $day = now_day();
    $limit = user_limit($u, $s);
    $spent = spent_on((int)$u['id'], $day);
    return ['day' => $day, 'spent' => round($spent, 4), 'limit' => round($limit, 4), 'remaining' => round(max(0, $limit - $spent), 4), 'model' => $s['model']];
}

function action_me(): void {
    $u = current_user();
    if (!$u) json_out(['user' => null], 401);
    json_out(['user' => user_public($u), 'usage' => usage_summary($u)]);
}
