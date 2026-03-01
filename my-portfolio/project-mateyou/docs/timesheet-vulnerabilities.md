# Timesheet(출근부) 시스템 취약점 및 개선사항

## 📖 시스템 개요

Timesheet는 **파트너+**(아르바이트생)의 출근/퇴근/휴게 관리 시스템입니다.

### 사용자 역할
| 역할 | 설명 |
|------|------|
| **파트너+** | 출근/퇴근/휴게 요청을 보내는 직원 |
| **매니저** | 본인이 담당하는 가게의 요청을 승인/반려 |
| **어드민** | 전체 시스템 관리자 |

### 기본 플로우
```
파트너+가 "출근 요청" 전송 → 매니저가 "승인" → 파트너+가 "근무 중" 상태로 변경
```

---

## 🔴 심각도 높음 (Critical)

### 1. 매니저/어드민 Realtime 구독 - 과도한 이벤트 수신

#### 📌 이 문제가 무엇인가요?

매니저가 화면을 열어놓으면, **본인과 관계없는 모든 가게의 출근 요청**까지 받아서 처리하고 있습니다.

#### 📋 구체적인 사례

**상황**: 
- 가게가 10개 있고, 각 가게에 매니저가 1명씩 배정
- 철수 매니저는 "카페A"만 담당
- 현재 전체 파트너+ 100명이 동시에 근무 중

**현재 문제**:
```
08:00 - 영희(카페B) 출근 요청 → 철수 화면에도 이벤트 도착 ❌ (무관한 이벤트)
08:01 - 민수(카페C) 출근 요청 → 철수 화면에도 이벤트 도착 ❌ (무관한 이벤트)
08:02 - 지영(카페A) 출근 요청 → 철수 화면에도 이벤트 도착 ✅ (관련 이벤트!)
```

철수는 "지영(카페A)"의 요청만 받으면 되는데, **다른 가게의 모든 요청(99개)**도 받고 있음.

#### 🔍 현재 코드 상황

[useTimesheetRealtime.ts:91-122](file:///Users/jidong/workspace/side/moemoe/mate_you/src/hooks/useTimesheetRealtime.ts#L91-L122)

```typescript
if (isPartnerManager && assignedStoreIds && assignedStoreIds.length > 0) {
  // ⚠️ 문제: 필터 없이 "모든" 요청을 받음
  channel.on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'timesheet_attendance_requests',
    // filter가 없음! 모든 이벤트 수신
  }, (payload) => {
    // 클라이언트에서 필터링 (이미 네트워크로 데이터를 받은 후)
    const storeId = payload.new?.store_id
    if (storeId && assignedStoreIds.includes(storeId)) {
      handleRequestChange(payload)
    }
  })
}
```

#### ❌ 현재 상태 문제점

| 항목 | 현재 상태 |
|------|----------|
| 네트워크 사용량 | 필요량의 **10~100배** |
| 클라이언트 CPU | 불필요한 필터링 로직 실행 |
| 모바일 배터리 | 빠르게 소모 |

#### ✅ 개선 후 변화

```typescript
// 개선안: 담당 가게별로 필터 적용
assignedStoreIds.forEach(storeId => {
  channel.on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'timesheet_attendance_requests',
    filter: `store_id=eq.${storeId}`,  // ✅ 담당 가게만 필터
  }, handleRequestChange)
})
```

| 항목 | 개선 후 |
|------|---------|
| 네트워크 사용량 | 담당 가게 요청만 수신 (1/10~1/100로 감소) |
| 클라이언트 CPU | 필터링 불필요 |
| 모바일 배터리 | 대폭 절약 |

---

### 2. API 트랜잭션 부재 - 데이터 정합성 위험

#### 📌 이 문제가 무엇인가요?

출근 요청을 승인할 때 **여러 테이블을 동시에 업데이트**해야 하는데, 중간에 에러가 나면 **일부만 업데이트**되어 데이터가 꼬입니다.

#### 📋 구체적인 사례

**상황**: 철수 매니저가 영희의 출근 요청을 승인함

**정상적인 경우**:
```
1단계: requests 테이블 → "pending" → "approved" ✅
2단계: records 테이블에 새 출근 기록 생성 ✅
3단계: 감사 로그에 승인 기록 저장 ✅
```

**문제 발생 시 (현재 코드)**:
```
1단계: requests 테이블 → "pending" → "approved" ✅
2단계: records 테이블에 출근 기록 생성 ❌ (네트워크 오류!)
3단계: 실행 안 됨
```

**결과**: 요청은 "승인됨"으로 바뀌었는데, 실제 출근 기록은 없음!
영희 화면에는 "승인됨"이라고 표시되지만, 실제로는 출근 상태가 아님.

#### 🔍 현재 코드 상황

[timesheetApi.ts:557-874](file:///Users/jidong/workspace/side/moemoe/mate_you/src/lib/timesheetApi.ts#L557-L874)

```typescript
// 1단계: 요청 상태 변경
const { error: updateError } = await supabase
  .from('timesheet_attendance_requests')
  .update({ status: 'approved' })
  .eq('id', requestId)

// 2단계: 출근 기록 생성 (별도 쿼리 - 1단계와 연결 안 됨!)
await supabase
  .from('timesheet_attendance_records')
  .insert({ ... })

// 💥 1단계 성공 후 2단계에서 실패하면?
// → 요청은 "approved"인데 출근 기록은 없음!
```

#### ❌ 현재 상태 문제점

| 상황 | 결과 |
|------|------|
| 승인 중 네트워크 끊김 | 요청은 승인됨, 출근 기록 없음 |
| 서버 장애 시 | 데이터 불일치 상태로 남음 |

#### ✅ 개선 후 변화

```sql
-- PostgreSQL Function으로 트랜잭션 처리
CREATE OR REPLACE FUNCTION approve_attendance_request(
  p_request_id UUID,
  p_manager_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  -- 모든 작업이 하나의 트랜잭션
  UPDATE timesheet_attendance_requests SET status = 'approved' WHERE id = p_request_id;
  INSERT INTO timesheet_attendance_records (...);
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN RETURN FALSE;  -- 에러 시 전부 취소
END;
$$ LANGUAGE plpgsql;
```

| 상황 | 개선 후 결과 |
|------|-------------|
| 승인 중 네트워크 끊김 | 전부 롤백, 요청은 여전히 "pending" |
| 서버 장애 시 | 일관된 상태 보장 |

---

### 3. 중복 승인 레이스 컨디션

#### 📌 이 문제가 무엇인가요?

두 명의 매니저가 **동시에 같은 요청을 승인**하면, 둘 다 성공해버릴 수 있습니다.

#### 📋 구체적인 사례

**상황**:
- 영희가 출근 요청을 보냄
- 철수 매니저와 민수 매니저가 동시에 화면을 보고 있음
- 둘 다 동시에 "승인" 버튼 클릭

**현재 문제**:
```
10:00:00.100 - 철수: 요청 상태 확인 (pending) ✅
10:00:00.150 - 민수: 요청 상태 확인 (pending) ✅
10:00:00.200 - 철수: 상태를 approved로 변경 ✅
10:00:00.250 - 민수: 상태를 approved로 변경 ✅ (이미 approved인데 또!)
```

결과: 출근 기록이 2개 생성될 수 있음!

#### 🔍 현재 코드 상황

[timesheetApi.ts:576-659](file:///Users/jidong/workspace/side/moemoe/mate_you/src/lib/timesheetApi.ts#L576-L659)

```typescript
// 현재: "확인"과 "업데이트" 사이에 시간차 존재
async function approveAttendanceRequest(requestId) {
  // 1. 먼저 확인
  const request = await supabase.from(...).select().eq('id', requestId).single()

  if (request.status === 'approved') {
    throw new Error('이미 승인됨')  // 💥 여기 도달하기 전에 다른 사람이 승인할 수 있음!
  }

  // 2. 시간이 지난 후 업데이트
  await supabase.from(...).update({ status: 'approved' }).eq('id', requestId)
}
```

#### ✅ 개선 후 변화

```typescript
// 개선안: 원자적 업데이트 (확인과 업데이트를 동시에)
const { data: updatedRequest } = await supabase
  .from('timesheet_attendance_requests')
  .update({ status: 'approved' })
  .eq('id', requestId)
  .eq('status', 'pending')  // ✅ pending인 경우에만 업데이트
  .select()
  .single()

if (!updatedRequest) {
  throw new Error('요청이 이미 처리되었습니다.')
}
```

| 상황 | 개선 후 결과 |
|------|-------------|
| 철수가 먼저 승인 | 철수: 성공, 민수: "이미 처리됨" 메시지 |
| 동시 클릭 | 하나만 성공 (DB가 보장) |

---

## 🟠 심각도 중간 (Medium)

### 4. Realtime 변경 시 전체 데이터 리패치

#### 📌 이 문제가 무엇인가요?

누군가 출근 요청을 보내면, 화면에 있는 **모든 데이터를 처음부터 다시 불러옵니다**.

#### 📋 구체적인 사례

**상황**: 매니저 화면에 현재 10명의 대기 요청이 표시되어 있음

**현재 동작**:
```
1. 영희가 새로운 출근 요청 전송
2. 매니저 화면이 이벤트 수신
3. API 호출: "모든 대기 요청 다시 가져오기" (11개 전부)
4. 화면 전체 새로고침 (깜빡임 발생)
```

**기대하는 동작**:
```
1. 영희가 새로운 출근 요청 전송
2. 매니저 화면이 이벤트 수신
3. 기존 10개 유지 + 영희 요청 1개만 추가
4. 부드럽게 목록에 추가됨
```

#### 🔍 현재 코드 상황

[timesheet/index.tsx:136-138](file:///Users/jidong/workspace/side/moemoe/mate_you/src/routes/timesheet/index.tsx#L136-L138)

```typescript
useTimesheetRealtime({
  onRequestChange: refreshData,  // 변경이 감지되면 전체 리패치
})

const refreshData = () => {
  loadData(false)  // 💥 모든 데이터 다시 불러오기
}
```

#### ✅ 개선 후 변화

```typescript
// 개선안: 변경된 항목만 업데이트
useTimesheetRealtime({
  onRequestChange: (payload) => {
    const { eventType, new: newData, old: oldData } = payload
    
    if (eventType === 'INSERT') {
      setPendingRequests(prev => [...prev, newData])  // 추가만
    } else if (eventType === 'UPDATE') {
      setPendingRequests(prev => 
        prev.map(req => req.id === newData.id ? { ...req, ...newData } : req)
      )
    }
  },
})
```

| 항목 | 현재 | 개선 후 |
|------|------|---------|
| API 호출 | 변경마다 전체 조회 | 0회 |
| UI 경험 | 깜빡임 발생 | 부드러운 애니메이션 |

---

### 5. 연결 끊김 시 재연결 로직 부재

#### 📌 이 문제가 무엇인가요?

인터넷이 잠깐 끊겼다가 다시 연결되면, **실시간 업데이트가 더 이상 작동하지 않습니다**.

#### 📋 구체적인 사례

**상황**: 매니저가 카페에서 WiFi로 접속 중

```
10:00 - 정상 연결, 실시간 업데이트 작동 ✅
10:05 - WiFi 불안정으로 연결 끊김
10:06 - WiFi 다시 연결됨
10:10 - 영희가 출근 요청 전송
💥 매니저 화면에 표시 안 됨! (실시간 구독이 끊어진 상태)
```

매니저는 화면이 정상인 줄 알고 있지만, 실제로는 새 요청을 못 받는 상태.

#### 🔍 현재 코드 상황

[useTimesheetRealtime.ts](file:///Users/jidong/workspace/side/moemoe/mate_you/src/hooks/useTimesheetRealtime.ts)

```typescript
channel.subscribe((status) => {
  console.log(`구독 상태: ${status}`)
  // 💥 연결 끊김(CHANNEL_ERROR) 시 아무 처리도 안 함!
})
```

#### ✅ 개선 후 변화

```typescript
// 개선안: 자동 재연결 로직
channel.subscribe((status) => {
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
    console.log('❌ 연결 끊김, 재연결 시도...')
    
    setTimeout(() => {
      channel.unsubscribe()
      setupChannel()  // 새 채널로 재연결
    }, retryDelay)
    
    retryDelay = Math.min(retryDelay * 2, 30000)  // 최대 30초
  }
})
```

| 상황 | 현재 | 개선 후 |
|------|------|---------|
| WiFi 끊겼다 복구 | 실시간 업데이트 멈춤 | 자동 재연결 |
| 연결 상태 표시 | 없음 | "연결 중..." 표시 |

---

### 6. 에러 핸들링 미흡 - 사용자 피드백 부족

#### 📌 이 문제가 무엇인가요?

API 호출 실패 시 **사용자에게 아무런 피드백이 없습니다**.

#### 📋 구체적인 사례

**상황**: 네트워크 오류로 현재 상태 조회 실패

**현재 동작**:
- 영희는 실제로 출근 중인데 화면에 "미출근"으로 표시
- 영희는 뭔가 잘못된 줄 모르고 "출근 요청"을 다시 보냄
- 중복 요청 발생!

#### 🔍 현재 코드 상황

[timesheetApi.ts](file:///Users/jidong/workspace/side/moemoe/mate_you/src/lib/timesheetApi.ts)

```typescript
} catch (error) {
  console.error('에러:', error)  // 콘솔에만 출력
  return 'OFF'  // 💥 에러인데 "미출근"으로 표시됨!
}
```

#### ✅ 개선 후 변화

```typescript
// 개선안: 명확한 에러 피드백
} catch (error) {
  globalToast.error('상태 조회에 실패했습니다. 다시 시도해주세요.')
  return { status: null, error: 'NETWORK_ERROR' }
}

// UI에서 처리
if (status.error) {
  return <ErrorState message="상태를 불러올 수 없습니다" onRetry={reload} />
}
```

---

### 7. N+1 쿼리 문제

#### 📌 이 문제가 무엇인가요?

하나의 작업을 위해 **불필요하게 많은 DB 쿼리**가 실행됩니다.

#### 📋 구체적인 사례

**상황**: 영희가 출근 요청을 보냄

**현재 실행되는 쿼리**:
```
쿼리 1: 요청 INSERT (필수)
쿼리 2: 가게 이름 조회 (SELECT * FROM stores WHERE id = ?)
쿼리 3: 파트너 이름 조회 (SELECT * FROM members WHERE id = ?)
쿼리 4: 담당 매니저 목록 조회
쿼리 5: 매니저 1에게 알림 전송
쿼리 6: 매니저 2에게 알림 전송
...
```

매니저가 5명이면 총 **4 + 5 = 9개** 쿼리 실행!

#### 🔍 현재 코드 상황

[timesheetApi.ts](file:///Users/jidong/workspace/side/moemoe/mate_you/src/lib/timesheetApi.ts)

```typescript
// 1. 요청 생성
const { data } = await supabase.from('timesheet_attendance_requests').insert({...})

// 2. 가게 정보 별도 조회 (왜?)
const { data: storeInfo } = await supabase.from('timesheet_stores').select('name').eq('id', storeId)

// 3. 파트너 정보 별도 조회 (왜?)
const { data: partnerInfo } = await supabase.from('members').select('name').eq('id', partnerPlusId)
```

#### ✅ 개선 후 변화

```typescript
// 개선안: JOIN으로 한 번에 조회
const { data } = await supabase
  .from('timesheet_attendance_requests')
  .insert({...})
  .select(`
    *,
    store:timesheet_stores(name),
    partner_plus:members!partner_plus_id(name)
  `)
  .single()
```

| 항목 | 현재 | 개선 후 |
|------|------|---------|
| 쿼리 수 | 4 + 매니저 수 | 2개 |
| 응답 시간 | 느림 | 빠름 |

---

## 🟡 심각도 낮음 (Low) / UX 개선

### 8. 시간 선택 UI - 불필요한 리렌더링

#### 📌 이 문제가 무엇인가요?

파트너+가 요청 시트를 열면, **1초마다 시간이 업데이트**되어 불필요한 리렌더링이 발생합니다.

#### 📋 구체적인 사례

```
요청 시트 열림 → 10:00:00 표시
1초 후 → 10:00:01 표시 (리렌더링)
1초 후 → 10:00:02 표시 (리렌더링)
... 60번 리렌더링/분
```

#### 🔍 현재 코드 상황

[AttendanceRequestSheet.tsx:248-266](file:///Users/jidong/workspace/side/moemoe/mate_you/src/components/features/timesheet/AttendanceRequestSheet.tsx#L248-L266)

```typescript
// 1초마다 현재 시간 업데이트
const interval = setInterval(() => {
  setRequestedTime(getCurrentTimeString())
}, 1000)  // 💥 1초마다 리렌더링
```

#### ✅ 개선 후 변화

```typescript
// 개선안: 1분 간격으로 변경
const interval = setInterval(() => {
  setRequestedTime(getCurrentTimeString())
}, 60000)  // 60초마다 업데이트
```

---

### 9. 로딩 상태 일관성 부족

#### 📌 이 문제가 무엇인가요?

여러 개의 로딩 상태가 **개별적으로 관리**되어 복잡합니다.

#### 🔍 현재 코드 상황

```typescript
const [isLoading, setIsLoading] = useState(true)
const [isSubmitting, setIsSubmitting] = useState(false)
const [isApproving, setIsApproving] = useState(false)
// 3개의 boolean 관리 = 8가지 조합 가능 😵
```

#### ✅ 개선 후 변화

```typescript
type LoadingState = 'idle' | 'loading' | 'submitting' | 'approving' | 'error'
const [loadingState, setLoadingState] = useState<LoadingState>('idle')
// 1개의 상태만 관리 = 5가지 명확한 상태
```

---

### 10. 가게별 그룹 - 접힌 상태에서 정보 부족

#### 📌 이 문제가 무엇인가요?

매니저 뷰에서 가게별 출근자 목록이 접혀있을 때, **요약 정보가 부족**합니다.

#### 📋 구체적인 사례

**현재**: 접힌 상태에서 아바타 8개만 표시, "+2" 같은 숫자만 보임
**기대**: "근무 5명, 휴게 2명, 총 48시간 근무" 같은 요약 정보

#### 🔍 현재 코드 상황

[timesheet/index.tsx:1131-1150](file:///Users/jidong/workspace/side/moemoe/mate_you/src/routes/timesheet/index.tsx#L1131-L1150)

```jsx
{/* 접힌 상태: 아바타만 표시 */}
{records.slice(0, 8).map((record) => (
  <CompactPartnerCard ... />
))}
{records.length > 8 && <span>+{records.length - 8}</span>}
```

#### ✅ 개선 후 변화

```jsx
<div className="flex items-center justify-between mb-2">
  <div className="flex gap-2 text-xs">
    <span className="text-emerald-600">근무 {workingCount}명</span>
    <span className="text-amber-600">휴게 {breakCount}명</span>
  </div>
  <span className="text-xs text-gray-400">총 {formatHours(totalWorkTime)} 근무</span>
</div>
```

---

## 🔴 심각도 높음 - 어드민 페이지

### 11. stats.tsx 파일 크기 과대 (1962줄)

#### 📌 이 문제가 무엇인가요?

하나의 파일에 **너무 많은 코드**가 있어서 유지보수가 어렵습니다.

#### 📋 구체적인 사례

**문제점**:
- [stats.tsx](file:///Users/jidong/workspace/side/moemoe/mate_you/src/routes/timesheet/admin/stats.tsx) - **1962줄, 109KB**
- 통계 조회, 정렬, 그룹핑, 캘린더 뷰, 시간 수정 모달, 휴게 기록 CRUD 등 모든 로직 포함
- 버그 발생 시 원인 찾기 어려움
- 새 기능 추가 시 어디에 넣어야 할지 모름

#### ✅ 개선 후 구조

```
src/routes/timesheet/admin/
├── stats.tsx              # 메인 컴포넌트 (200줄)
├── _components/
│   ├── StatsFilter.tsx    # 필터 UI (150줄)
│   ├── PartnerStatsCard.tsx (200줄)
│   ├── CalendarView.tsx   (300줄)
│   └── TimeEditModal.tsx  (250줄)
├── _hooks/
│   ├── useStats.ts        # 데이터 로직 (150줄)
│   └── useTimeEdit.ts     # 시간 수정 로직 (200줄)
└── _types/
    └── stats.types.ts     # 타입 정의
```

각 파일이 **200~300줄** 이내로 관리 가능해짐.

---

### 12. 시간 수정 로직 복잡도 - 버그 발생 위험

#### 📌 이 문제가 무엇인가요?

시간 수정 함수가 **200줄**에 달하며, 하나의 함수에 너무 많은 책임이 있습니다.

#### 🔍 현재 코드 상황

[stats.tsx:471-666](file:///Users/jidong/workspace/side/moemoe/mate_you/src/routes/timesheet/admin/stats.tsx#L471-L666)

```typescript
async function handleSaveTimeEdit() {
  // 200줄에 달하는 복잡한 로직
  // - 변경 여부 감지 (7가지 조건)
  // - UUID 형식 검증
  // - 휴게 기록 CRUD (추가/수정/삭제)
  // - 출퇴근 시간 업데이트
  // - 에러 핸들링 미흡
}
```

#### ✅ 개선 후 변화

```typescript
// 책임 분리
class TimeEditService {
  detectChanges(original, edited): ChangeSet { ... }
  validateTimes(times): ValidationResult { ... }
  async updateBreakRecords(changes): Promise<void> { ... }
  async updateAttendanceRecord(changes): Promise<void> { ... }
}
```

---

## 🟠 심각도 중간 - 어드민 페이지

### 13. 권한 체크 중복 코드

#### 📌 이 문제가 무엇인가요?

어드민 페이지 4개에 **똑같은 권한 체크 코드 8줄**이 반복됩니다.

#### 🔍 현재 코드 상황

```typescript
// audit.tsx, managers.tsx, stores.tsx, settings.tsx 전부에 동일 코드
useEffect(() => {
  if (roleLoading) return
  if (!isAdmin) {
    navigate({ to: '/timesheet/admin/stats', replace: true })
  }
}, [isAdmin, roleLoading, navigate])
```

#### ✅ 개선 후 변화

```typescript
// hooks/useAdminGuard.ts - 한 번만 정의
export function useAdminGuard() {
  const navigate = useNavigate()
  const { isAdmin, isLoading } = useTimesheetRole()
  
  useEffect(() => {
    if (!isLoading && !isAdmin) {
      navigate({ to: '/timesheet/admin/stats', replace: true })
    }
  }, [isAdmin, isLoading, navigate])
  
  return { isLoading }
}

// 각 페이지에서 사용
function AuditPage() {
  const { isLoading } = useAdminGuard()  // 한 줄로 끝!
  ...
}
```

---

### 14. 삭제/해제 확인 다이얼로그 미흡

#### 📌 이 문제가 무엇인가요?

삭제 확인에 **브라우저 기본 confirm**을 사용하여 디자인이 불일치합니다.

#### 🔍 현재 코드 상황

[managers.tsx:70-79](file:///Users/jidong/workspace/side/moemoe/mate_you/src/routes/timesheet/admin/managers.tsx#L70-L79)

```typescript
if (confirm('정말 파트너+를 삭제하시겠습니까?')) {
  // 브라우저 기본 confirm - 디자인 안 맞음
  // 삭제 대상 이름이 표시 안 됨
}
```

#### ✅ 개선 후 변화

```jsx
<ConfirmModal
  isOpen={deleteModal.open}
  title="파트너+ 삭제"
  message={`${deleteModal.target?.name}님을 정말 삭제하시겠습니까?`}
  confirmText="삭제"
  variant="danger"
/>
```

---

### 15. 감사 로그 페이지네이션 부재

#### 📌 이 문제가 무엇인가요?

감사 로그를 **한 번에 200개**만 불러와서, 오래된 로그를 볼 수 없습니다.

#### 📋 구체적인 사례

**1개월 후 상황**:
- 감사 로그 5,000개 누적
- 페이지 접속 → 200개만 로드
- 오래된 로그 확인 불가
- 스크롤해도 더 이상 로드 안 됨

#### 🔍 현재 코드 상황

[audit.tsx:129-148](file:///Users/jidong/workspace/side/moemoe/mate_you/src/routes/timesheet/admin/audit.tsx#L129-L148)

```typescript
const logs = await getAuditLogs({
  limit: 200,  // 한 번에 200개 로드
  // 페이지네이션 없음
})
```

#### ✅ 개선 후 변화

```typescript
// 무한 스크롤 구현
async function loadMore() {
  const newLogs = await getAuditLogs({
    limit: 50,
    offset: page * 50
  })
  setLogs(prev => [...prev, ...newLogs])
  setHasMore(newLogs.length === 50)
  setPage(p => p + 1)
}
```

---

### 16. 통계 페이지 초기 로딩 최적화 부재

#### 📌 이 문제가 무엇인가요?

통계 페이지 접속 시 **필터를 변경하기도 전에** 최근 1주일 전체 데이터를 즉시 조회합니다.

#### 📋 구체적인 사례

**상황**: 어드민이 3개월 전 데이터를 보려고 통계 페이지 접속

```
1. 페이지 접속 → 자동으로 최근 1주일 데이터 조회 시작 (불필요!)
2. 어드민이 날짜를 3개월 전으로 변경
3. 다시 3개월 전 데이터 조회
```

1번의 로딩이 완전히 불필요한 작업.

#### 🔍 현재 코드 상황

[stats.tsx:192-198](file:///Users/jidong/workspace/side/moemoe/mate_you/src/routes/timesheet/admin/stats.tsx#L192-L198)

```typescript
useEffect(() => {
  if (!initialLoadDone) {
    loadStats()  // 페이지 접속 시 무조건 전체 조회
    setInitialLoadDone(true)
  }
}, [initialLoadDone, loadStats])
```

#### ✅ 개선 후 변화

```typescript
// 방안: 캐싱 + 스켈레톤 UI
const { data: stats, isLoading } = useQuery({
  queryKey: ['attendance-stats', statsDateRange],
  queryFn: () => getAttendanceStats({...}),
  staleTime: 5 * 60 * 1000, // 5분 캐싱
})

if (isLoading) {
  return <StatsSkeletonUI />  // 로딩 중 스켈레톤
}
```

---

## 🟡 심각도 낮음 - 어드민 페이지

### 17. 파트너+ 목록 - 실시간 상태 업데이트 없음

#### 📌 이 문제가 무엇인가요?

파트너+ 목록에 현재 상태(근무 중/휴게 중)가 표시되지만 **실시간 업데이트가 없습니다**.

#### 📋 구체적인 사례

```
10:00 - 어드민이 파트너+ 목록 조회 → 영희: "미출근" 표시
10:05 - 영희가 출근
10:10 - 어드민 화면에는 여전히 "미출근" 표시 (새로고침 전까지)
```

#### ✅ 개선 후 변화

```typescript
// debounce로 빠른 연속 이벤트 방지
const debouncedLoad = useMemo(
  () => debounce(() => loadPartnerPlus(), 500),
  [loadPartnerPlus]
)

useTimesheetRealtime({
  onRecordChange: debouncedLoad,
})
```

> **참고**: 어드민 전용 페이지이고 파트너+ 수가 제한적이므로 렉 걱정은 크지 않습니다.

---

### 18. 타입 안정성 부족 - `any` 타입 사용

#### 📌 이 문제가 무엇인가요?

여러 어드민 페이지에서 **any 타입**을 사용하여 타입 안정성이 떨어집니다.

#### 🔍 현재 코드 상황

```typescript
const [managers, setManagers] = useState<any[]>([])  // any!
const [partnerPlusList, setPartnerPlusList] = useState<any[]>([])  // any!
```

#### ✅ 개선 후 변화

```typescript
// 실제 API 응답 타입과 일치하도록 정의
// timesheetApi.ts에서 반환하는 실제 타입을 그대로 사용
import type { ManagerWithStores, PartnerPlusWithStatus } from '@/lib/timesheetApi'

const [managers, setManagers] = useState<ManagerWithStores[]>([])
const [partnerPlusList, setPartnerPlusList] = useState<PartnerPlusWithStatus[]>([])
```

> **주의**: 타입 정의 시 실제 API 응답 구조와 정확히 일치해야 합니다. `timesheetApi.ts`에서 export하는 타입을 재사용하는 것을 권장합니다.

---

## 📊 요약 테이블 (전체 18개)

| # | 문제 | 심각도 | 카테고리 | 예상 공수 |
|---|------|--------|----------|----------|
| 1 | 매니저 Realtime 과도한 이벤트 | 🔴 높음 | 성능 | 4h |
| 2 | API 트랜잭션 부재 | 🔴 높음 | 데이터 정합성 | 8h |
| 3 | 중복 승인 레이스 컨디션 | 🔴 높음 | 데이터 정합성 | 2h |
| 4 | Realtime 전체 리패치 | 🟠 중간 | 성능 | 4h |
| 5 | 재연결 로직 부재 | 🟠 중간 | 안정성 | 2h |
| 6 | 에러 핸들링 미흡 | 🟠 중간 | UX | 4h |
| 7 | N+1 쿼리 | 🟠 중간 | 성능 | 3h |
| 8 | 시간 UI 리렌더링 | 🟡 낮음 | 성능 | 1h |
| 9 | 로딩 상태 일관성 | 🟡 낮음 | 코드 품질 | 2h |
| 10 | 접힌 상태 정보 부족 | 🟡 낮음 | UX | 1h |
| 11 | stats.tsx 파일 과대 | 🔴 높음 | 유지보수성 | 8h |
| 12 | 시간 수정 로직 복잡도 | 🔴 높음 | 버그 위험 | 4h |
| 13 | 권한 체크 중복 코드 | 🟠 중간 | 코드 품질 | 2h |
| 14 | 삭제 확인 다이얼로그 미흡 | 🟠 중간 | UX | 2h |
| 15 | 감사 로그 페이지네이션 부재 | 🟠 중간 | 성능/UX | 3h |
| 16 | 통계 초기 로딩 최적화 | 🟠 중간 | 성능 | 2h |
| 17 | 파트너+ 실시간 상태 없음 | 🟡 낮음 | 기능 | 1h |
| 18 | any 타입 사용 | 🟡 낮음 | 타입 안정성 | 2h |

---

## 🎯 권장 개선 순서

### 1차 (즉시) - 데이터 정합성
- **#2** 트랜잭션 추가
- **#3** 중복 승인 방지

### 2차 (1주일 이내) - 안정성/유지보수성
- **#1** Realtime 필터링
- **#5** 재연결 로직
- **#11** stats.tsx 분리

### 3차 (2주일 이내) - 성능
- **#4** 부분 업데이트
- **#7** N+1 해결
- **#12** 시간 수정 로직 리팩토링
- **#15** 페이지네이션

### 4차 (여유 있을 때) - UX/코드 품질
- **#6** 에러 핸들링
- **#13** 권한 체크 통합
- **#14** 확인 다이얼로그
- **#17** 파트너+ 실시간 상태
- 기타 개선
