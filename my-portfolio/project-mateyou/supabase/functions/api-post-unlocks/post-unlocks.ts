import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createSupabaseClient, getAuthUser, parseRequestBody } from '../_shared/utils.ts';

// Deno 전역 타입 선언 (로컬 TS 환경에서 Deno 인식용)
declare const Deno: typeof globalThis.Deno;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

interface PostUnlockRequestBody {
  post_id?: string;
  media_order?: number; // 개별 구매인 경우 미디어 인덱스 (0부터 시작)
  media_indices?: number[]; // 묶음 구매인 경우 미디어 인덱스 배열
  is_bundle?: boolean; // 묶음 구매 여부
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();
    const url = new URL(req.url);
    const pathname = url.pathname;

    // --------------------------------------
    // POST /api-post-unlocks → 단건 구매 결제
    // --------------------------------------
    if (pathname === '/api-post-unlocks' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body: PostUnlockRequestBody = await parseRequestBody(req);

      if (!body?.post_id) {
        return new Response(JSON.stringify({ success: false, error: 'post_id is required' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      const postId = body.post_id;
      const mediaOrder = body.media_order; // 개별 구매인 경우 미디어 인덱스
      const mediaIndices = body.media_indices; // 묶음 구매인 경우 미디어 인덱스 배열
      const isBundle = body.is_bundle ?? false;

      // 1) 게시글 조회 (단건 구매용인지 확인 + 파트너 정보 가져오기)
      const { data: post, error: postErr } = await supabase
        .from('posts')
        .select(
          `
            id,
            partner_id,
            point_price,
            is_bundle,
            discount_rate,
            partner:partners!partner_id(
              id,
              partner_name,
              total_points
            )
          `,
        )
        .eq('id', postId)
        .maybeSingle();

      if (postErr) {
        return new Response(JSON.stringify({ success: false, error: postErr.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      if (!post) {
        return new Response(JSON.stringify({ success: false, error: 'Post not found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        });
      }

      // 2) 미디어 정보 조회
      const { data: mediaList, error: mediaErr } = await supabase
        .from('post_media')
        .select('id, point_price, sort_order')
        .eq('post_id', postId)
        .order('sort_order', { ascending: true });

      if (mediaErr) {
        return new Response(JSON.stringify({ success: false, error: mediaErr.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      const sortedMedia = (mediaList || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
      const hasIndividualMediaPrices = sortedMedia.some((m: any) => m.point_price != null && m.point_price > 0);
      
      // 개별 판매 여부 판단:
      // - mediaOrder나 mediaIndices가 명시적으로 전달되면 개별 판매
      // - 그 외에는 일괄 판매 (post.point_price 또는 files 총합 사용)
      const isIndividualSale = hasIndividualMediaPrices && (mediaOrder != null || (isBundle && mediaIndices && mediaIndices.length > 0));

      // 3) 가격 계산
      let totalPrice = 0;
      let finalMediaOrder: number | null = null;

      if (isIndividualSale) {
        // 개별 판매인 경우
        if (isBundle && mediaIndices && mediaIndices.length > 0) {
          // 묶음 구매: 선택한 미디어들의 가격 합계
          totalPrice = mediaIndices.reduce((sum: number, idx: number) => {
            const media = sortedMedia[idx];
            if (media && media.point_price != null && media.point_price > 0) {
              return sum + media.point_price;
            }
            return sum;
          }, 0);
          finalMediaOrder = Math.max(...mediaIndices);
        } else if (mediaOrder != null && sortedMedia[mediaOrder]) {
          // 개별 구매: 특정 미디어만
          const media = sortedMedia[mediaOrder];
          totalPrice = media.point_price || 0;
          finalMediaOrder = mediaOrder;
        } else {
          return new Response(JSON.stringify({ success: false, error: 'Invalid media selection for individual sale' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          });
        }
      } else {
        // 일괄 판매인 경우
        const pointPrice: number | null = post.point_price;
        if (pointPrice == null || pointPrice <= 0) {
          // post.point_price가 없으면 files의 point_price 총합 사용
          const filesTotalPrice = sortedMedia.reduce((sum: number, m: any) => {
            return sum + (m.point_price || 0);
          }, 0);
          
          if (filesTotalPrice <= 0) {
            return new Response(JSON.stringify({ success: false, error: 'This post is not a paid (single purchase) post' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 400,
            });
          }
          totalPrice = filesTotalPrice;
          // files의 마지막 index를 media_order에 저장
          finalMediaOrder = sortedMedia.length > 0 ? sortedMedia.length - 1 : null;
        } else {
          totalPrice = pointPrice;
          // files의 마지막 index를 media_order에 저장
          finalMediaOrder = sortedMedia.length > 0 ? sortedMedia.length - 1 : null;
        }
      }

      // 할인율 적용
      const discountRate = post.discount_rate || 0;
      if (discountRate > 0 && discountRate <= 100) {
        totalPrice = Math.round(totalPrice * (1 - discountRate / 100));
      }

      if (totalPrice <= 0) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid price calculation' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // 4) 이미 구매한 게시글인지 확인
      const { data: existingUnlock, error: unlockCheckErr } = await supabase
        .from('post_unlocks')
        .select('id, media_order, point_price')
        .eq('user_id', user.id)
        .eq('post_id', postId)
        .maybeSingle();

      if (unlockCheckErr) {
        return new Response(JSON.stringify({ success: false, error: unlockCheckErr.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      if (isIndividualSale) {
        // 개별 판매인 경우: 이미 구매한 미디어인지 확인
        if (existingUnlock && existingUnlock.media_order != null) {
          if (finalMediaOrder != null && finalMediaOrder <= existingUnlock.media_order) {
            return new Response(JSON.stringify({ success: false, error: 'Media already unlocked' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 400,
            });
          }
        }
      } else {
        // 일괄 판매인 경우: 전체 구매 여부 확인
        if (existingUnlock) {
          return new Response(JSON.stringify({ success: false, error: 'Post already unlocked' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          });
        }
      }

      // 5) 유저 포인트 조회 (members.total_points)
      const { data: member, error: memberErr } = await supabase
        .from('members')
        .select('id, total_points, name')
        .eq('id', user.id)
        .maybeSingle();

      if (memberErr) {
        return new Response(JSON.stringify({ success: false, error: memberErr.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      if (!member) {
        return new Response(JSON.stringify({ success: false, error: 'Member not found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        });
      }

      const currentPoints: number = member.total_points ?? 0;

      // 포인트 부족
      if (currentPoints < totalPrice) {
        return new Response(JSON.stringify({ success: false, error: 'INSUFFICIENT_POINTS' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // 6) 미디어 타입 (설명에 사용)
      const firstMediaType = sortedMedia.length > 0 ? sortedMedia[0].media_type : null;

      // description 생성
      const partnerName: string = post.partner?.partner_name ?? '파트너';
      let description = `${partnerName} 피드 단건구매`;
      if (isIndividualSale) {
        if (isBundle) {
          description = `${partnerName} 피드 묶음 구매`;
        } else {
          description = `${partnerName} 피드 개별 구매`;
        }
      }

      // 로그 id: 단건구매용 고유 식별자
      const logId = `post_unlock_${postId}_${user.id}${finalMediaOrder != null ? `_${finalMediaOrder}` : ''}`;

      // 7) post_unlocks 생성 또는 업데이트
      let unlockInserted: any;
      if (existingUnlock && isIndividualSale) {
        // 기존 레코드 업데이트 (media_order를 더 큰 값으로, point_price 누적)
        const accumulatedPrice = (existingUnlock.point_price || 0) + totalPrice;
        const { data: updated, error: updateErr } = await supabase
          .from('post_unlocks')
          .update({
            media_order: finalMediaOrder,
            point_price: accumulatedPrice,
          })
          .eq('user_id', user.id)
          .eq('post_id', postId)
          .select()
          .single();

        if (updateErr) {
          return new Response(JSON.stringify({ success: false, error: updateErr.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          });
        }
        unlockInserted = updated;
      } else {
        // 새 레코드 생성
        const { data: inserted, error: insertErr } = await supabase
          .from('post_unlocks')
          .insert({
            user_id: user.id,
            post_id: postId,
            point_price: totalPrice,
            media_order: finalMediaOrder,
          })
          .select()
          .single();

        if (insertErr) {
          return new Response(JSON.stringify({ success: false, error: insertErr.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          });
        }
        unlockInserted = inserted;
      }

      // 8) member_points_logs 생성 (type = 'spend')
      const { error: logErr } = await supabase.from('member_points_logs').insert({
        member_id: user.id,
        type: 'spend',
        amount: totalPrice,
        description,
        log_id: logId,
      });

      if (logErr) {
        // 롤백: post_unlocks 삭제 또는 업데이트
        if (existingUnlock && isIndividualSale) {
          // 기존 레코드가 있었으면 원래 값으로 복구
          await supabase
            .from('post_unlocks')
            .update({
              media_order: existingUnlock.media_order,
              point_price: existingUnlock.point_price,
            })
            .eq('user_id', user.id)
            .eq('post_id', postId);
        } else {
          // 새 레코드였으면 삭제
          await supabase
            .from('post_unlocks')
            .delete()
            .eq('user_id', user.id)
            .eq('post_id', postId);
        }

        return new Response(JSON.stringify({ success: false, error: logErr.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      // 9) members.total_points 차감
      const newTotalPoints = Math.max(0, currentPoints - totalPrice);

      const { error: updateMemberErr } = await supabase
        .from('members')
        .update({ total_points: newTotalPoints })
        .eq('id', user.id);

      if (updateMemberErr) {
        // 롤백: 로그 + unlock 삭제 또는 업데이트
        await supabase
          .from('member_points_logs')
          .delete()
          .eq('member_id', user.id)
          .eq('log_id', logId);

        if (existingUnlock && isIndividualSale) {
          // 기존 레코드가 있었으면 원래 값으로 복구
          await supabase
            .from('post_unlocks')
            .update({
              media_order: existingUnlock.media_order,
              point_price: existingUnlock.point_price,
            })
            .eq('user_id', user.id)
            .eq('post_id', postId);
        } else {
          // 새 레코드였으면 삭제
          await supabase
            .from('post_unlocks')
            .delete()
            .eq('user_id', user.id)
            .eq('post_id', postId);
        }

        return new Response(JSON.stringify({ success: false, error: updateMemberErr.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      // 10) 판매자(파트너)에게 포인트 지급 (partners.total_points만 증가)
      // 참고: members.total_points는 충전/사용 포인트, partners.total_points는 번 포인트 (분리됨)
      const partnerId = post.partner_id;
      const partnerCurrentPoints: number = post.partner?.total_points ?? 0;

      if (partnerId) {
        // partners.total_points 증가
        const partnerNewPoints = partnerCurrentPoints + totalPrice;
        const { error: partnerUpdateErr } = await supabase
          .from('partners')
          .update({ total_points: partnerNewPoints })
          .eq('id', partnerId);

        if (partnerUpdateErr) {
          console.error('Failed to update partner points:', partnerUpdateErr);
          // 판매자 포인트 지급 실패해도 구매는 성공으로 처리 (나중에 정산으로 보완 가능)
        }

        // partner_points_logs에 수익 기록
        const { error: partnerLogErr } = await supabase
          .from('partner_points_logs')
          .insert({
            partner_id: partnerId,
            type: 'earn',
            amount: totalPrice,
            description,
            log_id: logId,
          });

        if (partnerLogErr) {
          console.error('Failed to insert partner points log:', partnerLogErr);
          // 로그 실패는 치명적이지 않으므로 경고만 남기고 계속 진행
        }
      }

      // 8-1) album_posts의 썸네일 업데이트 (null인 경우에만)
      try {
        // 해당 유저의 album_posts 중 이 게시글이 저장되어 있고 썸네일이 null인 것들 찾기
        const { data: albumPosts, error: albumPostsError } = await supabase
          .from('album_posts')
          .select('id, post_id')
          .eq('user_id', user.id)
          .eq('post_id', postId)
          .is('thumbnail', null);

        if (!albumPostsError && albumPosts && albumPosts.length > 0) {
          // 썸네일 URL 생성
          const { data: postForThumbnail } = await supabase
            .from('posts')
            .select(`
              id,
              partner_id,
              is_subscribers_only,
              point_price,
              partner:partners!partner_id(
                id,
                member:members!member_id(id)
              )
            `)
            .eq('id', postId)
            .maybeSingle();

          if (postForThumbnail) {
            const { data: postMedia } = await supabase
              .from('post_media')
              .select('id, media_type, media_url, sort_order')
              .eq('post_id', postId)
              .order('sort_order', { ascending: true })
              .limit(1);

            if (postMedia && postMedia.length > 0) {
              const m = postMedia[0];
              let thumbnailUrl: string | null = null;

              // 이제 구매했으므로 권한이 있음
              if (m.media_url) {
                try {
                  if (m.media_type === 'video') {
                    const thumbnailPath = `${postId}/thumbnails/${m.id}.jpg`;
                    const { data: signedThumbnail } = await supabase
                      .storage
                      .from('post-media')
                      .createSignedUrl(thumbnailPath, 3600);
                    thumbnailUrl = signedThumbnail?.signedUrl || null;
                  } else {
                    const { data: signed } = await supabase
                      .storage
                      .from('post-media')
                      .createSignedUrl(m.media_url, 3600);
                    thumbnailUrl = signed?.signedUrl || null;
                  }
                } catch {
                  thumbnailUrl = null;
                }
              }

              // 썸네일 업데이트
              if (thumbnailUrl) {
                for (const ap of albumPosts) {
                  await supabase
                    .from('album_posts')
                    .update({ thumbnail: thumbnailUrl })
                    .eq('id', ap.id);
                }
              }
            }
          }
        }
      } catch (thumbnailUpdateError) {
        console.error('Failed to update album_posts thumbnail:', thumbnailUpdateError);
        // 썸네일 업데이트 실패해도 구매는 성공으로 처리
      }

      // 9) 네이티브 푸시: 게시글 작성자(파트너)에게 단건 구매 알림
      try {
        const postOwnerId = post?.partner?.member?.id;
        if (postOwnerId && postOwnerId !== user.id) {
          const supabaseUrl = Deno.env.get('SUPABASE_URL');
          const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

          if (supabaseUrl && anonKey) {
            const authHeader =
              (req.headers.get('Authorization') as string | null) ||
              `Bearer ${anonKey}`;

            const headers = {
              Authorization: authHeader,
              apikey: anonKey,
              'Content-Type': 'application/json',
            };

            const buyerName = member.name || '회원';
            const url = `/feed/${postId}`;

            await fetch(`${supabaseUrl}/functions/v1/push-native`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                action: 'enqueue_notification',
                user_id: postOwnerId,
                target_member_id: postOwnerId,
                title: '단건 구매 알림',
                body: `${buyerName}님이 유료 게시글을 구매했습니다.`,
                icon: null,
                url,
                notification_type: 'post_purchase',
                data: {
                  type: 'post_purchase',
                  post_id: postId,
                  buyer_id: user.id,
                  url,
                },
                process_immediately: true, // 즉시 FCM 전송
              }),
            });
          }
        }
      } catch (pushErr) {
        console.error('Failed to enqueue post purchase notification:', pushErr);
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            post_unlock: unlockInserted,
            remaining_points: newTotalPoints,
          },
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    // --------------------------------------
    // GET /api-post-unlocks → 단건 구매 이력 + post 정보
    // 날짜 파라미터 형식:
    //   - start_at=YYYY-MM-DD
    //   - end_at=YYYY-MM-DD
    // 내부적으로는
    //   start_at => YYYY-MM-DDT00:00:00Z
    //   end_at   => YYYY-MM-DDT23:59:59.999Z
    // 로 변환하여 purchased_at 기준 필터링
    // --------------------------------------
    if (pathname === '/api-post-unlocks' && req.method === 'GET') {
      const user = await getAuthUser(req);

      const rawStartAt = url.searchParams.get('start_at');
      const rawEndAt = url.searchParams.get('end_at');

      const normalizeDateParam = (value: string | null, isStart: boolean): string | null => {
        if (!value) return null;
        // YYYY-MM-DD 형태만 들어오면 하루의 시작/끝으로 변환
        const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (dateOnlyRegex.test(value)) {
          return isStart ? `${value}T00:00:00Z` : `${value}T23:59:59.999Z`;
        }
        // 그 외에는 그대로 사용 (ISO 문자열 등)
        return value;
      };

      const startAt = normalizeDateParam(rawStartAt, true);
      const endAt = normalizeDateParam(rawEndAt, false);

      // 1) post_unlocks 기본 이력 조회 (media_order 포함)
      let unlockQuery = supabase
        .from('post_unlocks')
        .select('id, user_id, post_id, point_price, purchased_at, media_order')
        .eq('user_id', user.id)
        .order('purchased_at', { ascending: false });

      if (startAt) {
        unlockQuery = unlockQuery.gte('purchased_at', startAt);
      }
      if (endAt) {
        unlockQuery = unlockQuery.lte('purchased_at', endAt);
      }

      const { data: unlocks, error: unlocksError } = await unlockQuery;

      if (unlocksError) {
        return new Response(JSON.stringify({ success: false, error: unlocksError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      if (!unlocks || unlocks.length === 0) {
        return new Response(JSON.stringify({ success: true, data: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      const postIds = Array.from(new Set(unlocks.map((u: any) => u.post_id)));

      // 2) post 정보 조회 (post list / post get 과 비슷한 구조)
      const { data: posts, error: postsError } = await supabase
        .from('posts')
        .select(
          `
            *,
            partner:partners!partner_id(
              id,
              partner_name,
              member:members!member_id(
                id,
                name,
                profile_image,
                member_code
              )
            ),
            post_likes(id, user_id)
          `,
        )
        .in('id', postIds);

      if (postsError) {
        return new Response(JSON.stringify({ success: false, error: postsError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      const postMap = new Map<string, any>();
      for (const p of posts || []) {
        postMap.set(p.id, p);
      }

      // 3) post_media 조회 + signed URL 생성 (post list 와 동일하게 media_full_url 포함)
      const { data: mediaRows, error: mediaError } = await supabase
        .from('post_media')
        .select('id, post_id, media_type, media_url, sort_order, created_at')
        .in('post_id', postIds)
        .order('sort_order', { ascending: true });

      if (mediaError) {
        return new Response(JSON.stringify({ success: false, error: mediaError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      const storage = supabase.storage.from('post-media');
      const paths = (mediaRows || []).map((m: any) => m.media_url);
      const signedUrlMap: Map<string, string> = new Map();

      if (paths.length > 0) {
        const { data: signedUrls, error: signedErr } = await storage.createSignedUrls(
          paths,
          60 * 60 * 24 * 7,
        );
        if (signedErr) {
          return new Response(JSON.stringify({ success: false, error: signedErr.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          });
        }

        (signedUrls || []).forEach((s: any, idx: number) => {
          const p = paths[idx];
          if (p && s?.signedUrl) {
            signedUrlMap.set(p, s.signedUrl);
          }
        });
      }

      const mediaMap: Record<string, any[]> = {};
      for (const m of mediaRows || []) {
        if (!mediaMap[m.post_id]) mediaMap[m.post_id] = [];
        mediaMap[m.post_id].push(m);
      }

      // 4) unlock + post 정보 매핑
      const result = unlocks.map((u: any) => {
        const p = postMap.get(u.post_id);
        if (!p) {
          return {
            ...u,
            post: null,
          };
        }

        const isSubscribersOnly = !!p.is_subscribers_only;
        const isPaidPost = p.point_price != null && p.point_price > 0;
        const purchasedMediaOrder = u.media_order;

        const rawFiles = mediaMap[p.id] || [];
        // media_order 기준으로 구매한 미디어만 media_full_url 반환
        const files = rawFiles.map((m: any, idx: number) => {
          // media_order가 null이면 전체 구매, 아니면 해당 인덱스까지만 구매
          const canAccess = purchasedMediaOrder === null || idx <= purchasedMediaOrder;
          return {
            id: m.id,
            media_type: m.media_type,
            media_url: null, // 보안을 위해 숨김
            media_full_url: canAccess ? (signedUrlMap.get(m.media_url) || null) : null,
            sort_order: m.sort_order,
            created_at: m.created_at,
          };
        });

        // 좋아요 여부 확인
        const isLiked = (p.post_likes || []).some((like: any) => like.user_id === user.id);

        return {
          ...u,
          media_order: purchasedMediaOrder,
          post: {
            id: p.id,
            content: p.content,
            partner_id: p.partner_id,
            published_at: p.published_at,
            partner: {
              name: p.partner?.partner_name ?? p.partner?.member?.name ?? null,
              profile_image: p.partner?.member?.profile_image ?? null,
              member_code: p.partner?.member?.member_code ?? null,
            },
            files,
            like_count: p.post_likes?.length || p.like_count || 0,
            comment_count: p.comment_count ?? 0,
            is_liked: isLiked,
            is_subscribers_only: isSubscribersOnly,
            is_paid_post: isPaidPost,
            point_price: p.point_price ?? null,
          },
        };
      });

      return new Response(JSON.stringify({ success: true, data: result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Endpoint not found' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 404,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});


