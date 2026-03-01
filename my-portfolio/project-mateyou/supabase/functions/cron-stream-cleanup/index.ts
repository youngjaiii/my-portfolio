/**
 * cron-stream-cleanup - 스트림 방 자동 정리 Cron Function
 * 
 * 주기: 1분마다 실행 (Supabase Dashboard에서 설정)
 * 
 * 기능:
 * - last_heartbeat가 2분 이상 지난 라이브 방 자동 종료 (WebRTC 방송만, HLS 방송 제외)
 * - last_heartbeat가 2분 이상 지난 시청자 자동 퇴장 처리 (시청자 Heartbeat)
 * - 종료 시 모든 참가자 퇴장 처리
 * 
 * 참고: HLS 방송은 RTMP 서버의 on_publish_done 콜백으로 방송 종료를 감지
 * 
 * 설정 방법 (Supabase Dashboard):
 * 1. Database > Extensions > pg_cron 활성화
 * 2. SQL Editor에서 다음 실행:
 *    SELECT cron.schedule(
 *      'stream-cleanup',
 *      '* * * * *',  -- 매분 실행
 *      $$SELECT net.http_post(
 *        url := 'https://<project-ref>.supabase.co/functions/v1/cron-stream-cleanup',
 *        headers := '{"Authorization": "Bearer <service_role_key>"}'::jsonb
 *      )$$
 *    );
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, createSupabaseClient, errorResponse, successResponse } from '../_shared/utils.ts';

// 하트비트 타임아웃 (밀리초) - 2분
const HEARTBEAT_TIMEOUT_MS = 2 * 60 * 1000;

serve(async (req) => {
  // CORS 처리
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Service Role 클라이언트 사용 (RLS 우회)
    const supabase = createSupabaseClient();
    
    const now = new Date();
    const timeoutThreshold = new Date(now.getTime() - HEARTBEAT_TIMEOUT_MS);

    console.log(`[cron-stream-cleanup] 실행 시작: ${now.toISOString()}`);
    console.log(`[cron-stream-cleanup] 타임아웃 기준: ${timeoutThreshold.toISOString()}`);

    // 2분 이상 하트비트 없는 라이브 방 조회
    // HLS 방송은 RTMP 서버에서 방송 상태를 관리하므로 제외
    const { data: staleRooms, error: queryError } = await supabase
      .from('stream_rooms')
      .select('id, title, host_member_id, host_partner_id, last_heartbeat, broadcast_type')
      .eq('status', 'live')
      .neq('broadcast_type', 'hls')
      .lt('last_heartbeat', timeoutThreshold.toISOString());

    if (queryError) {
      console.error('[cron-stream-cleanup] 조회 오류:', queryError);
      return errorResponse('QUERY_FAILED', '오래된 방 조회 실패', queryError.message);
    }

    if (!staleRooms || staleRooms.length === 0) {
      console.log('[cron-stream-cleanup] 정리할 방 없음');
      return successResponse({ 
        message: '정리할 방 없음',
        cleaned_count: 0,
        timestamp: now.toISOString()
      });
    }

    console.log(`[cron-stream-cleanup] 정리 대상 방 ${staleRooms.length}개 발견`);

    const results: Array<{ room_id: string; title: string; success: boolean; error?: string }> = [];

    for (const room of staleRooms) {
      try {
        console.log(`[cron-stream-cleanup] 방 종료 처리: ${room.id} (${room.title})`);

        // 방 상태 종료로 변경
        const { error: endError } = await supabase
          .from('stream_rooms')
          .update({
            status: 'ended',
            ended_at: now.toISOString(),
            // ended_by는 null로 (시스템에 의한 자동 종료)
          })
          .eq('id', room.id);

        if (endError) {
          console.error(`[cron-stream-cleanup] 방 종료 실패 (${room.id}):`, endError);
          results.push({ room_id: room.id, title: room.title, success: false, error: endError.message });
          continue;
        }

        // 모든 시청자 퇴장 처리
        await supabase
          .from('stream_viewers')
          .update({ left_at: now.toISOString() })
          .eq('room_id', room.id)
          .is('left_at', null);

        // 모든 호스트/발언자 퇴장 처리
        await supabase
          .from('stream_hosts')
          .update({ left_at: now.toISOString() })
          .eq('room_id', room.id)
          .is('left_at', null);

        console.log(`[cron-stream-cleanup] 방 종료 완료: ${room.id}`);
        results.push({ room_id: room.id, title: room.title, success: true });

      } catch (roomError) {
        console.error(`[cron-stream-cleanup] 방 처리 중 오류 (${room.id}):`, roomError);
        results.push({ 
          room_id: room.id, 
          title: room.title, 
          success: false, 
          error: (roomError as Error).message 
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`[cron-stream-cleanup] 방 정리 완료: 성공 ${successCount}개, 실패 ${failCount}개`);

    // ========== 시청자 Heartbeat 정리 ==========
    // 2분 이상 Heartbeat 없는 시청자 자동 퇴장 처리
    console.log('[cron-stream-cleanup] 시청자 Heartbeat 정리 시작');

    const { data: staleViewers, error: viewerQueryError } = await supabase
      .from('stream_viewers')
      .select('id, room_id, member_id')
      .lt('last_heartbeat', timeoutThreshold.toISOString())
      .is('left_at', null);

    let viewerCleanedCount = 0;
    let viewerFailedCount = 0;

    if (viewerQueryError) {
      console.error('[cron-stream-cleanup] 시청자 조회 오류:', viewerQueryError);
    } else if (staleViewers && staleViewers.length > 0) {
      console.log(`[cron-stream-cleanup] 정리 대상 시청자 ${staleViewers.length}명 발견`);

      // 배치로 시청자 퇴장 처리
      const viewerIds = staleViewers.map(v => v.id);
      const { error: updateError } = await supabase
        .from('stream_viewers')
        .update({ left_at: now.toISOString() })
        .in('id', viewerIds);

      if (updateError) {
        console.error('[cron-stream-cleanup] 시청자 퇴장 처리 실패:', updateError);
        viewerFailedCount = staleViewers.length;
      } else {
        viewerCleanedCount = staleViewers.length;
        console.log(`[cron-stream-cleanup] 시청자 ${viewerCleanedCount}명 퇴장 처리 완료`);
      }
    } else {
      console.log('[cron-stream-cleanup] 정리할 시청자 없음');
    }

    return successResponse({
      message: `방 ${successCount}개, 시청자 ${viewerCleanedCount}명 정리 완료`,
      rooms: {
        cleaned_count: successCount,
        failed_count: failCount,
        details: results,
      },
      viewers: {
        cleaned_count: viewerCleanedCount,
        failed_count: viewerFailedCount,
      },
      timestamp: now.toISOString()
    });

  } catch (error) {
    console.error('[cron-stream-cleanup] 오류:', error);
    return errorResponse('INTERNAL_ERROR', '서버 오류가 발생했습니다', (error as Error).message, 500);
  }
});
