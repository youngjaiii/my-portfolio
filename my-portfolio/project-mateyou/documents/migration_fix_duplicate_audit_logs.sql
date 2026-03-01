-- =====================================================================
-- 근태 승인/반려 시 중복 감사 로그 생성 문제 수정
-- RPC 함수에서 감사 로그 생성 부분 제거 (애플리케이션 레벨에서만 기록)
-- =====================================================================
--
-- ⚠️ 실행 방법:
-- 1. Supabase Dashboard 접속: https://supabase.com/dashboard
-- 2. 프로젝트 선택
-- 3. 좌측 메뉴에서 "SQL Editor" 클릭
-- 4. "New query" 클릭
-- 5. 이 파일의 전체 내용을 복사하여 붙여넣기
-- 6. "Run" 버튼 클릭 (또는 Cmd/Ctrl + Enter)
--
-- 또는 Supabase CLI 사용:
-- supabase db execute -f documents/migration_fix_duplicate_audit_logs.sql
-- =====================================================================
--
-- 📋 변경 사항:
-- - approve_attendance_request 함수에서 감사 로그 생성 제거
-- - reject_attendance_request 함수에서 감사 로그 생성 제거
-- - 감사 로그는 애플리케이션 레벨(TypeScript)에서만 기록됨
--   (더 상세한 메타데이터 포함: request_snapshot, is_time_modified 등)
--
-- ⚠️ 주의사항:
-- - 기존에 중복 생성된 로그는 그대로 유지됩니다 (감사 로그는 삭제하지 않음)
-- - 이 마이그레이션 실행 후부터는 중복 생성되지 않습니다
-- =====================================================================

-- 근태 요청 승인을 위한 RPC 함수 업데이트
-- 감사 로그 생성 부분 제거 (애플리케이션 레벨에서 처리)
CREATE OR REPLACE FUNCTION approve_attendance_request(
  p_request_id UUID,
  p_manager_id UUID,
  p_approved_time TIMESTAMPTZ DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_request RECORD;
  v_current_record RECORD;
  v_effective_time TIMESTAMPTZ;
  v_attendance_record_id UUID;
  v_additional_break_minutes INTEGER := 0;
  v_existing_break_minutes INTEGER := 0;
BEGIN
  -- 1. 요청 정보 조회 및 잠금 (동시성 제어)
  SELECT * INTO v_request
  FROM timesheet_attendance_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', '요청을 찾을 수 없습니다.');
  END IF;

  IF v_request.status = 'approved' THEN
    RETURN jsonb_build_object('success', false, 'message', '이미 승인된 요청입니다.');
  END IF;

  IF v_request.status = 'rejected' THEN
    RETURN jsonb_build_object('success', false, 'message', '이미 반려된 요청입니다.');
  END IF;
  
  IF v_request.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'message', '취소된 요청입니다.');
  END IF;

  -- 2. 실제 적용 시간 결정
  v_effective_time := COALESCE(p_approved_time, v_request.requested_time);

  -- 3. 현재 활성화된(종료되지 않은) 모든 기록 조회
  -- 해당 매장의 기록을 우선적으로 찾기 위함 (나머지는 아래에서 일괄 처리)
  SELECT * INTO v_current_record
  FROM timesheet_attendance_records
  WHERE partner_plus_id = v_request.partner_plus_id
    AND store_id = v_request.store_id
    AND ended_at IS NULL
  ORDER BY started_at DESC
  LIMIT 1;

  IF v_current_record IS NULL THEN
    SELECT * INTO v_current_record
    FROM timesheet_attendance_records
    WHERE partner_plus_id = v_request.partner_plus_id
      AND ended_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1;
  END IF;

  -- 4. 비즈니스 로직 및 시간 검증
  IF v_request.request_type = 'BREAK_END' THEN
    IF v_current_record IS NULL OR v_current_record.status != 'BREAK' THEN
       RETURN jsonb_build_object('success', false, 'message', '휴게 중인 기록이 없습니다.');
    END IF;
    IF v_effective_time < v_current_record.break_started_at THEN
      RETURN jsonb_build_object('success', false, 'message', '휴게 종료 시간은 휴게 시작 시간보다 이후여야 합니다.');
    END IF;
  ELSIF v_request.request_type = 'OFF' THEN
    IF v_current_record IS NULL THEN
      -- 활성 기록이 없더라도 요청은 승인 처리할 수 있도록 허용 (상태 동기화 목적)
      -- 단, 감사 로그에는 기록하되 업데이트할 레코드는 없음
      NULL; 
    ELSE
      IF v_effective_time < v_current_record.started_at THEN
        RETURN jsonb_build_object('success', false, 'message', '퇴근 시간은 출근 시간보다 이후여야 합니다.');
      END IF;
      IF v_current_record.status = 'BREAK' AND v_effective_time < v_current_record.break_started_at THEN
        RETURN jsonb_build_object('success', false, 'message', '퇴근 시간은 휴게 시작 시간보다 이후여야 합니다.');
      END IF;
    END IF;
  END IF;

  -- 5. 요청 상태 업데이트
  UPDATE timesheet_attendance_requests
  SET 
    status = 'approved',
    processed_at = now(),
    processed_by = p_manager_id,
    approved_time = CASE WHEN p_approved_time IS NOT NULL AND p_approved_time != requested_time THEN p_approved_time ELSE approved_time END,
    updated_at = now()
  WHERE id = p_request_id;

  -- 6. 근태 및 휴게 기록 처리
  IF v_request.request_type = 'WORKING' THEN
    -- 이미 출근 중인 모든 기록 종료 (중복 출근 방지)
    -- 진행 중인 휴게가 있다면 휴게 기록도 먼저 종료
    UPDATE timesheet_break_records
    SET ended_at = v_effective_time, updated_at = now()
    WHERE attendance_record_id IN (
      SELECT id FROM timesheet_attendance_records 
      WHERE partner_plus_id = v_request.partner_plus_id AND ended_at IS NULL
    ) AND ended_at IS NULL AND is_deleted = false;

    UPDATE timesheet_attendance_records
    SET 
      status = 'OFF', 
      ended_at = v_effective_time, 
      break_ended_at = CASE WHEN status = 'BREAK' THEN v_effective_time ELSE break_ended_at END,
      updated_at = now()
    WHERE partner_plus_id = v_request.partner_plus_id AND ended_at IS NULL;

    -- 새 출근 기록 생성
    INSERT INTO timesheet_attendance_records (
      partner_plus_id, store_id, manager_id, request_id, status, started_at
    ) VALUES (
      v_request.partner_plus_id, v_request.store_id, v_request.manager_id, p_request_id, 'WORKING', v_effective_time
    ) RETURNING id INTO v_attendance_record_id;

  ELSIF v_request.request_type = 'BREAK' THEN
    IF v_current_record IS NOT NULL AND v_current_record.status = 'WORKING' THEN
      -- 출근 기록 업데이트
      UPDATE timesheet_attendance_records
      SET status = 'BREAK', break_started_at = v_effective_time, updated_at = now()
      WHERE id = v_current_record.id;

      -- 개별 휴게 기록 생성
      INSERT INTO timesheet_break_records (
        attendance_record_id, started_at
      ) VALUES (
        v_current_record.id, v_effective_time
      );
      v_attendance_record_id := v_current_record.id;
    END IF;

  ELSIF v_request.request_type = 'BREAK_END' THEN
    IF v_current_record IS NOT NULL AND v_current_record.status = 'BREAK' THEN
      -- 개별 휴게 기록 종료
      UPDATE timesheet_break_records
      SET ended_at = v_effective_time, updated_at = now()
      WHERE attendance_record_id = v_current_record.id AND ended_at IS NULL AND is_deleted = false;

      -- 출근 기록 업데이트
      UPDATE timesheet_attendance_records
      SET 
        status = 'WORKING',
        break_ended_at = v_effective_time,
        updated_at = now()
      WHERE id = v_current_record.id;
      v_attendance_record_id := v_current_record.id;
    END IF;

  ELSIF v_request.request_type = 'OFF' THEN
    -- 퇴근 시에는 모든 활성 기록을 종료 처리하여 '고스트 기록' 문제 해결
    
    -- 1. 모든 활성 휴게 기록 종료
    UPDATE timesheet_break_records
    SET ended_at = v_effective_time, updated_at = now()
    WHERE attendance_record_id IN (
      SELECT id FROM timesheet_attendance_records 
      WHERE partner_plus_id = v_request.partner_plus_id AND ended_at IS NULL
    ) AND ended_at IS NULL AND is_deleted = false;

    -- 2. 모든 활성 출근 기록 종료
    UPDATE timesheet_attendance_records
    SET 
      status = 'OFF',
      ended_at = v_effective_time,
      break_ended_at = CASE WHEN status = 'BREAK' THEN v_effective_time ELSE break_ended_at END,
      updated_at = now()
    WHERE partner_plus_id = v_request.partner_plus_id AND ended_at IS NULL;
    
    v_attendance_record_id := v_current_record.id;
  END IF;

  -- 7. 감사 로그는 애플리케이션 레벨에서 기록 (중복 방지)
  -- 애플리케이션 레벨에서 더 상세한 메타데이터를 포함할 수 있음:
  -- - request_snapshot (전체 요청 정보)
  -- - is_time_modified (시간 수정 여부)
  -- - modification_reason (수정 사유)
  -- - attendance_record_id (생성된 출근 기록 ID)

  RETURN jsonb_build_object('success', true, 'attendance_record_id', v_attendance_record_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 근태 요청 반려를 위한 RPC 함수 업데이트
-- 감사 로그 생성 부분 제거 (애플리케이션 레벨에서 처리)
CREATE OR REPLACE FUNCTION reject_attendance_request(
  p_request_id UUID,
  p_manager_id UUID,
  p_rejection_reason TEXT
) RETURNS JSONB AS $$
DECLARE
  v_request RECORD;
BEGIN
  -- 1. 요청 정보 조회 및 잠금
  SELECT * INTO v_request
  FROM timesheet_attendance_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', '요청을 찾을 수 없습니다.');
  END IF;

  IF v_request.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'message', '대기 중인 요청이 아닙니다.');
  END IF;

  -- 2. 요청 상태 업데이트
  UPDATE timesheet_attendance_requests
  SET 
    status = 'rejected',
    processed_at = now(),
    processed_by = p_manager_id,
    rejection_reason = p_rejection_reason,
    updated_at = now()
  WHERE id = p_request_id;

  -- 3. 감사 로그는 애플리케이션 레벨에서 기록 (중복 방지)
  -- 애플리케이션 레벨에서 더 상세한 메타데이터를 포함할 수 있음:
  -- - request_id
  -- - rejection_reason
  -- - processed_at

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 마이그레이션 완료
-- =====================================================================
--
-- ✅ 변경 사항:
-- 1. approve_attendance_request 함수에서 감사 로그 생성 제거
-- 2. reject_attendance_request 함수에서 감사 로그 생성 제거
--
-- 📝 참고:
-- - 기존에 중복 생성된 로그는 그대로 유지됩니다 (감사 로그는 삭제하지 않음)
-- - 이 마이그레이션 실행 후부터는 중복 생성되지 않습니다
-- - 애플리케이션 레벨에서 기록되는 로그가 더 상세한 정보를 포함합니다
-- =====================================================================