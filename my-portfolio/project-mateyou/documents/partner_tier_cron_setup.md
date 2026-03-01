# 파트너 티어 크론 설정 (pg_cron)

## 어디서 하나요?

**Supabase Dashboard**에서 다음 두 가지 중 하나로 등록합니다.

1. **UI**: [Integrations → Cron → Jobs](https://supabase.com/dashboard/project/rmooqijhkmomdtkvuzrr/integrations/cron/jobs)  
   - `Create job` → 이름·스케줄 입력 후 **HTTP request** 또는 **Invoke Edge Function** 선택  
   - URL/함수명과 스케줄만 넣으면 됨  

2. **SQL**: [SQL Editor](https://supabase.com/dashboard/project/rmooqijhkmomdtkvuzrr/sql/new)  
   - 아래 SQL을 그대로 붙여넣고 실행  

---

## 사전 조건

- **Database → Extensions**에서 `pg_cron`, `pg_net` 확장이 켜져 있어야 합니다.  
- 꺼져 있으면 Extensions 페이지에서 검색 후 Enable.

---

## 크론잡 목록

| 잡 이름 | 스케줄 | 함수 | 설명 |
|---------|--------|------|------|
| `hourly-tier-score` | `0 * * * *` | `cron-tier-eval` | 매시 정각 5축 점수 산정 → snapshot_hourly |
| `daily-tier-eval` | `0 15 * * *` | `cron-tier-daily-eval` | 매일 KST 자정 티어 승강 (상위10%↑ 하위10%↓) |
| `monthly-tier-season-reset` | `5 15 1 * *` | `cron-tier-season-reset` | 매월 1일 KST 00:05 시즌 소프트 리셋 |
| `daily-tier-abuse-detect` | `30 3 * * *` | `cron-tier-abuse-detect` | 매일 03:30 UTC 악용 탐지 |

---

## SQL로 등록 (복사해서 사용)

프로젝트 URL과 anon key는 이미 반영되어 있습니다.  
**Service role key는 보안상 SQL에 넣지 말고**, anon key로 호출해도 Edge Function 내부에서는 service role client를 쓰므로 동작합니다.

### 0단계: 기존 주간 잡 삭제

```sql
-- 기존 주간 크론잡 삭제 (이미 삭제했으면 무시)
SELECT cron.unschedule('weekly-tier-eval');
```

### 1단계: 새 크론잡 등록

```sql
-- 1) 시간별 점수 산정: 매시 정각
SELECT cron.schedule(
  'hourly-tier-score',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://rmooqijhkmomdtkvuzrr.supabase.co/functions/v1/cron-tier-eval',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtb29xaWpoa21vbWR0a3Z1enJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NjkyNzQsImV4cCI6MjA3NjM0NTI3NH0.2Qj0t4u1gqJCtIftgmnfPqlUrEiFqGilK20yN2Yg6Cw"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  ) AS request_id;
  $$
);

-- 2) 일일 티어 승강: 매일 15:00 UTC (KST 자정)
SELECT cron.schedule(
  'daily-tier-eval',
  '0 15 * * *',
  $$
  SELECT net.http_post(
    url := 'https://rmooqijhkmomdtkvuzrr.supabase.co/functions/v1/cron-tier-daily-eval',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtb29xaWpoa21vbWR0a3Z1enJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NjkyNzQsImV4cCI6MjA3NjM0NTI3NH0.2Qj0t4u1gqJCtIftgmnfPqlUrEiFqGilK20yN2Yg6Cw"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  ) AS request_id;
  $$
);

-- 3) 월간 시즌 리셋: 매월 1일 15:05 UTC (KST 00:05)
SELECT cron.schedule(
  'monthly-tier-season-reset',
  '5 15 1 * *',
  $$
  SELECT net.http_post(
    url := 'https://rmooqijhkmomdtkvuzrr.supabase.co/functions/v1/cron-tier-season-reset',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtb29xaWpoa21vbWR0a3Z1enJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NjkyNzQsImV4cCI6MjA3NjM0NTI3NH0.2Qj0t4u1gqJCtIftgmnfPqlUrEiFqGilK20yN2Yg6Cw"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  ) AS request_id;
  $$
);

-- 4) 악용 탐지: 매일 03:30 UTC (기존 유지)
SELECT cron.schedule(
  'daily-tier-abuse-detect',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://rmooqijhkmomdtkvuzrr.supabase.co/functions/v1/cron-tier-abuse-detect',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtb29xaWpoa21vbWR0a3Z1enJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NjkyNzQsImV4cCI6MjA3NjM0NTI3NH0.2Qj0t4u1gqJCtIftgmnfPqlUrEiFqGilK20yN2Yg6Cw"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) AS request_id;
  $$
);
```

---

## 확인·수정·삭제

- **등록된 job 목록**: Dashboard **Integrations → Cron → Jobs** 또는  
  `SELECT * FROM cron.job;`
- **실행 이력 확인**:  
  `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;`
- **스케줄 변경**: 같은 job name으로 다시 `cron.schedule()` 실행하면 덮어씌워짐  
- **삭제**:  
  `SELECT cron.unschedule('hourly-tier-score');`  
  `SELECT cron.unschedule('daily-tier-eval');`  
  `SELECT cron.unschedule('monthly-tier-season-reset');`  
  `SELECT cron.unschedule('daily-tier-abuse-detect');`

---

## 요약

| 항목 | 위치 |
|------|------|
| Cron Job 생성/관리 | **Dashboard → Integrations → Cron → Jobs** |
| SQL로 한 번에 등록 | **Dashboard → SQL Editor** 에서 위 SQL 실행 |
| 확장 프로그램 켜기 | **Dashboard → Database → Extensions** (pg_cron, pg_net) |
| Edge Function 로그 확인 | **Dashboard → Edge Functions → 함수 선택 → Logs** |