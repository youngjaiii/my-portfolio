import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createSupabaseClient, getAuthUser, corsHeaders } from '../_shared/utils.ts';

// album_posts 썸네일 URL 생성 헬퍼 함수
async function generateAlbumPostThumbnail(
  supabase: any,
  user: any,
  postId: string
): Promise<string | null> {
  try {
    // 게시글 정보 조회
    const { data: post } = await supabase
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

    if (!post) return null;

    // 게시글의 미디어 조회
    const { data: postMedia } = await supabase
      .from('post_media')
      .select('id, media_type, media_url, sort_order')
      .eq('post_id', postId)
      .order('sort_order', { ascending: true })
      .limit(1);

    if (!postMedia || postMedia.length === 0) {
      return null;
    }

    const m = postMedia[0];
    let thumbnailUrl: string | null = null;

    // 권한 체크
    const isOwner = post.partner?.member?.id === user.id;
    const isPaidPost = post.point_price != null && post.point_price > 0;
    const isSubscribersOnly = !!post.is_subscribers_only;
    
    // 단건 구매 여부 확인
    const { data: unlock } = await supabase
      .from('post_unlocks')
      .select('id')
      .eq('user_id', user.id)
      .eq('post_id', postId)
      .maybeSingle();
    
    const isPurchased = !!unlock;

    // 멤버십 여부 확인
    let hasMembership = false;
    if (post.partner_id) {
      const { data: subscriptions } = await supabase
        .from('membership_subscriptions')
        .select(`
          id,
          status,
          membership:membership_id(
            partner_id,
            is_active
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (subscriptions) {
        hasMembership = subscriptions.some((s: any) => 
          s.membership?.partner_id === post.partner_id && s.membership?.is_active !== false
        );
      }
    }

    // 수정된 로직: 단건 구매(isPurchased)가 최우선
    const canViewFiles =
      isOwner ||
      isPurchased ||
      (!isPaidPost && (!isSubscribersOnly || hasMembership));

    if (canViewFiles && m.media_url) {
      try {
        // 영상인 경우 video-thumbnail 버킷 경로 반환
        if (m.media_type === 'video') {
          const thumbnailPath = `${postId}/${m.id}.jpg`;
          thumbnailUrl = `video-thumbnail:${thumbnailPath}`;
        } else {
          // 이미지인 경우 post-media storage path 반환
          thumbnailUrl = `storage:${m.media_url}`;
        }
      } catch {
        thumbnailUrl = null;
      }
    }

    return thumbnailUrl;
  } catch (error) {
    console.error('Thumbnail generation error:', error);
    return null;
  }
}

// Express API URL (환경변수 또는 기본값)
const EXPRESS_API_URL = Deno.env.get('EXPRESS_API_URL') || 'https://api.mateyou.me';

// 앨범 order 재정렬 및 썸네일 업데이트 헬퍼 함수
async function reorderAndUpdateThumbnail(
  supabase: any,
  user: any,
  albumId: string
) {
  try {
    const { data: remaining, error: remainingError } = await supabase
      .from('album_posts')
      .select('id, post_id')
      .eq('album_id', albumId)
      .order('order', { ascending: true });

    if (!remainingError && remaining && remaining.length > 0) {
      // order 재정렬
      for (let i = 0; i < remaining.length; i++) {
        const ap = remaining[i];
        const newOrder = i + 1;
        await supabase
          .from('album_posts')
          .update({ order: newOrder })
          .eq('id', ap.id);
      }

      // 앨범 썸네일 업데이트 (남은 게시글 중 최신 것)
      const { data: latestAlbumPost } = await supabase
        .from('album_posts')
        .select('post_id')
        .eq('album_id', albumId)
        .order('order', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestAlbumPost) {
        await updateAlbumThumbnail(supabase, user, albumId, latestAlbumPost.post_id);
      }
    } else {
      // 남은 게시글이 없으면 썸네일을 null로 설정
      await supabase
        .from('albums')
        .update({
          thumbnail: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', albumId);
    }
  } catch (error) {
    console.error('reorderAndUpdateThumbnail error:', error);
  }
}

// 앨범 썸네일 업데이트 헬퍼 함수
async function updateAlbumThumbnail(
  supabase: any,
  user: any,
  albumId: string,
  postId: string,
  albumPostId?: string
) {
  try {
    // 게시글 정보 조회
    const { data: post } = await supabase
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

    if (!post) return;

    // 게시글의 미디어 조회
    const { data: postMedia } = await supabase
      .from('post_media')
      .select('id, media_type, media_url, sort_order')
      .eq('post_id', postId)
      .order('sort_order', { ascending: true })
      .limit(1);

    if (!postMedia || postMedia.length === 0) {
      // 미디어가 없으면 썸네일을 null로 설정
      await supabase
        .from('albums')
        .update({
          thumbnail: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', albumId);
      return;
    }

    const m = postMedia[0];
    let thumbnailUrl: string | null = null;

    // 권한 체크
    const isOwner = post.partner?.member?.id === user.id;
    const isPaidPost = post.point_price != null && post.point_price > 0;
    const isSubscribersOnly = !!post.is_subscribers_only;
    
    // 단건 구매 여부 확인
    const { data: unlock } = await supabase
      .from('post_unlocks')
      .select('id')
      .eq('user_id', user.id)
      .eq('post_id', postId)
      .maybeSingle();
    
    const isPurchased = !!unlock;

    // 멤버십 여부 확인
    let hasMembership = false;
    if (post.partner_id) {
      const { data: subscriptions } = await supabase
        .from('membership_subscriptions')
        .select(`
          id,
          status,
          membership:membership_id(
            partner_id,
            is_active
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (subscriptions) {
        hasMembership = subscriptions.some((s: any) => 
          s.membership?.partner_id === post.partner_id && s.membership?.is_active !== false
        );
      }
    }

    // 수정된 로직: 단건 구매(isPurchased)가 최우선
    const canViewFiles =
      isOwner ||
      isPurchased ||
      (!isPaidPost && (!isSubscribersOnly || hasMembership));

    if (canViewFiles && m.media_url) {
      try {
        if (m.media_type === 'video') {
          // 비디오: Express API 호출
          console.log(`[updateAlbumThumbnail] 비디오 썸네일 생성 시작 - albumId: ${albumId}, postId: ${postId}`);
          
          const { data: signedVideo, error: signedError } = await supabase
            .storage
            .from('post-media')
            .createSignedUrl(m.media_url, 3600);

          if (signedError) {
            console.error(`[updateAlbumThumbnail] Signed URL 생성 실패:`, signedError);
            return;
          }

          if (signedVideo?.signedUrl) {
            console.log(`[updateAlbumThumbnail] Express API 호출: ${EXPRESS_API_URL}/api/albums/generate-thumbnail`);
            try {
              const response = await fetch(`${EXPRESS_API_URL}/api/albums/generate-thumbnail`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  album_id: albumId,
                  post_id: postId,
                  video_url: signedVideo.signedUrl,
                  user_id: user.id,
                  album_post_id: albumPostId,
                }),
              });

              console.log(`[updateAlbumThumbnail] Express 응답 상태: ${response.status}`);
              
              if (response.ok) {
                const result = await response.json();
                console.log(`[updateAlbumThumbnail] Express 응답:`, JSON.stringify(result));
                if (result.success && result.data?.storage_path) {
                  // storage_path가 이미 prefix 포함 여부 확인
                  const rawPath = result.data.storage_path;
                  const storagePath = rawPath.startsWith('video-thumbnail:') ? rawPath : `video-thumbnail:${rawPath}`;
                  console.log(`✅ 비디오 썸네일 생성 완료: ${storagePath}`);
                  
                  // album_posts.thumbnail도 업데이트 (albumPostId가 있는 경우)
                  if (albumPostId) {
                    await supabase
                      .from('album_posts')
                      .update({ thumbnail: storagePath })
                      .eq('id', albumPostId);
                    console.log(`✅ album_posts.thumbnail 업데이트 완료: ${albumPostId}`);
                  }
                  
                  // 같은 post_id를 가진 모든 album_posts의 thumbnail도 업데이트
                  await supabase
                    .from('album_posts')
                    .update({ thumbnail: storagePath })
                    .eq('user_id', user.id)
                    .eq('post_id', postId);
                  console.log(`✅ 모든 album_posts.thumbnail 업데이트 완료: post_id=${postId}`);
                  
                  return; // Express에서 DB 업데이트 완료
                }
              } else {
                const errorText = await response.text();
                console.error(`[updateAlbumThumbnail] Express 에러 응답:`, errorText);
              }
            } catch (e) {
              console.error('[updateAlbumThumbnail] Express API 호출 실패:', e);
            }
          } else {
            console.error(`[updateAlbumThumbnail] signedVideo가 없음`);
          }
          // Express 실패 시 DB 업데이트 안 함
          return;
        } else {
          // 이미지: storage path 저장
          thumbnailUrl = `storage:${m.media_url}`;
        }
      } catch {
        return;
      }
    }

    // albums 테이블에 썸네일 경로 저장 (storage: prefix로 저장됨)
    await supabase
      .from('albums')
      .update({
        thumbnail: thumbnailUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', albumId);
    
    // album_posts.thumbnail도 업데이트 (이미지인 경우)
    if (thumbnailUrl) {
      await supabase
        .from('album_posts')
        .update({ thumbnail: thumbnailUrl })
        .eq('user_id', user.id)
        .eq('post_id', postId);
      console.log(`✅ 이미지 album_posts.thumbnail 업데이트 완료: post_id=${postId}`);
    }
  } catch (error) {
    console.error('Thumbnail update error:', error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();
    const url = new URL(req.url);
    const pathname = url.pathname;

    // ----------------------------------
    // POST /api-album-posts → 게시글 저장 (기본 앨범에 추가)
    // body: { post_id, album_id? }
    //
    // - album_id 없으면 "저장됨" 기본 앨범에 자동 추가
    // - 단건 구매/멤버십 여부와 상관없이 앨범에는 저장 가능
    //   (파일 열람 권한은 GET /api-album-posts/list 에서 별도로 제어)
    // ----------------------------------
    if (req.method === 'POST' && pathname === '/api-album-posts') {
      const user = await getAuthUser(req);
      const body = await req.json().catch(() => null);

      const selectedAlbumId = body?.album_id || body?.albumId;
      const postId = body?.post_id || body?.postId;

      if (!postId || typeof postId !== 'string') {
        return new Response(JSON.stringify({ success: false, error: 'post_id is required' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // "저장됨" 기본 앨범 찾기 또는 생성
      let defaultAlbumId: string;
      
      // 1단계: user_id로 "저장됨" 앨범 찾기
      const { data: foundAlbums, error: findError } = await supabase
        .from('albums')
        .select('id')
        .eq('user_id', user.id)
        .eq('title', '저장됨')
        .limit(1);

      if (findError) {
        console.error('Error finding default album:', findError);
        return new Response(JSON.stringify({ success: false, error: findError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      if (foundAlbums && foundAlbums.length > 0) {
        defaultAlbumId = foundAlbums[0].id;
        console.log('Found default album:', defaultAlbumId, 'for user:', user.id);
      } else {
        // 2단계: 앨범이 없으면 생성
        console.log('Creating default album for user:', user.id);
        const { data: newAlbum, error: createError } = await supabase
          .from('albums')
          .insert({
            user_id: user.id,
            title: '저장됨',
          })
          .select('id')
          .single();

        if (createError) {
          console.error('Error creating default album:', createError);
          return new Response(JSON.stringify({ success: false, error: createError.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          });
        }

        if (!newAlbum || !newAlbum.id) {
          console.error('Failed to create default album: newAlbum is null');
          return new Response(JSON.stringify({ success: false, error: 'Failed to create default album' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          });
        }

        defaultAlbumId = newAlbum.id;
        console.log('Created default album:', defaultAlbumId, 'for user:', user.id);
      }

      if (!defaultAlbumId) {
        console.error('defaultAlbumId is undefined');
        return new Response(JSON.stringify({ success: false, error: 'Failed to get or create default album' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      // 게시글 정보 조회
      const { data: post, error: postError } = await supabase
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

      if (postError || !post) {
        return new Response(JSON.stringify({ success: false, error: 'Post not found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        });
      }

      const insertedData: any[] = [];

      // 썸네일은 나중에 updateAlbumThumbnail 호출 후 albums.thumbnail에서 가져옴
      let thumbnailUrl: string | null = null;

      // 1. 항상 "저장됨" 앨범에 저장
      console.log('Attempting to save to default album:', { user_id: user.id, album_id: defaultAlbumId, post_id: postId });
      
      // 이미 있는지 확인
      const { data: existingInDefault, error: checkError } = await supabase
        .from('album_posts')
        .select('id')
        .eq('user_id', user.id)
        .eq('album_id', defaultAlbumId)
        .eq('post_id', postId)
        .maybeSingle();

      if (checkError) {
        console.error('Error checking existing in default album:', checkError);
        return new Response(JSON.stringify({ success: false, error: checkError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      if (!existingInDefault) {
        // "저장됨" 앨범에 없으면 추가
        // order 계산
        const { data: orderData, error: orderError } = await supabase
          .from('album_posts')
          .select('order')
          .eq('album_id', defaultAlbumId)
          .order('order', { ascending: false })
          .limit(1);

        if (orderError) {
          console.error('Error getting order:', orderError);
        }

        const maxOrder = orderData && orderData.length > 0 ? (orderData[0].order ?? 0) : 0;
        const nextOrder = maxOrder + 1;

        console.log('Inserting to default album:', { user_id: user.id, album_id: defaultAlbumId, post_id: postId, order: nextOrder, thumbnail: thumbnailUrl });

        const { data: insertedDefault, error: insertError } = await supabase
          .from('album_posts')
          .insert({
            user_id: user.id,
            album_id: defaultAlbumId,
            post_id: postId,
            order: nextOrder,
            thumbnail: thumbnailUrl,
          })
          .select('*')
          .single();

        if (insertError) {
          console.error('Failed to insert to default album:', insertError);
          // unique constraint 위반 등으로 실패할 수 있음 - 다시 확인
          const { data: retryCheck } = await supabase
            .from('album_posts')
            .select('*')
            .eq('user_id', user.id)
            .eq('album_id', defaultAlbumId)
            .eq('post_id', postId)
            .maybeSingle();
          
          if (retryCheck) {
            console.log('Post already exists after insert error, using existing:', retryCheck.id);
            insertedData.push(retryCheck);
            await updateAlbumThumbnail(supabase, user, defaultAlbumId, postId);
          } else {
            return new Response(JSON.stringify({ success: false, error: insertError.message }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 500,
            });
          }
        } else if (!insertedDefault) {
          console.error('Insert result is null, checking if it exists...');
          // insert 결과가 null이어도 실제로 저장되었을 수 있음 - 확인
          const { data: verifyCheck } = await supabase
            .from('album_posts')
            .select('*')
            .eq('user_id', user.id)
            .eq('album_id', defaultAlbumId)
            .eq('post_id', postId)
            .maybeSingle();
          
          if (verifyCheck) {
            console.log('Post exists after null insert result:', verifyCheck.id);
            insertedData.push(verifyCheck);
            await updateAlbumThumbnail(supabase, user, defaultAlbumId, postId);
          } else {
            return new Response(JSON.stringify({ success: false, error: 'Failed to insert post to default album' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 500,
            });
          }
        } else {
          console.log('Successfully inserted to default album:', insertedDefault.id);
          insertedData.push(insertedDefault);
          
          // 앨범 썸네일 업데이트 (album_post_id 전달)
          await updateAlbumThumbnail(supabase, user, defaultAlbumId, postId, insertedDefault.id);
        }
      } else {
        // 이미 있으면 기존 데이터 반환
        console.log('Post already exists in default album:', existingInDefault.id);
        const { data: existingData } = await supabase
          .from('album_posts')
          .select('*')
          .eq('id', existingInDefault.id)
          .maybeSingle();
        
        if (existingData) {
          insertedData.push(existingData);
        }
        
        // order를 최신으로 업데이트
        const { data: orderData } = await supabase
          .from('album_posts')
          .select('order')
          .eq('album_id', defaultAlbumId)
          .order('order', { ascending: false })
          .limit(1);
        const maxOrder = orderData && orderData.length > 0 ? (orderData[0].order ?? 0) : 0;
        const nextOrder = maxOrder + 1;
        
        await supabase
          .from('album_posts')
          .update({ order: nextOrder })
          .eq('id', existingInDefault.id);
        
        // 앨범 썸네일 업데이트
        await updateAlbumThumbnail(supabase, user, defaultAlbumId, postId);
      }

      // 2. 선택한 앨범이 있고 "저장됨" 앨범이 아니면 추가 저장
      if (selectedAlbumId && selectedAlbumId !== defaultAlbumId) {
        // 선택한 앨범 소유권 확인
        const { data: selectedAlbum, error: selectedAlbumError } = await supabase
          .from('albums')
          .select('id, user_id')
          .eq('id', selectedAlbumId)
          .maybeSingle();

        if (selectedAlbumError || !selectedAlbum) {
          // 선택한 앨범이 없어도 "저장됨" 앨범 저장은 성공으로 처리
          console.error('Selected album not found:', selectedAlbumError);
        } else if (selectedAlbum.user_id !== user.id) {
          // 권한이 없어도 "저장됨" 앨범 저장은 성공으로 처리
          console.error('Unauthorized to access selected album');
        } else {
          // 선택한 앨범에 이미 있는지 확인
          const { data: existingInSelected } = await supabase
            .from('album_posts')
            .select('id')
            .eq('user_id', user.id)
            .eq('album_id', selectedAlbumId)
            .eq('post_id', postId)
            .maybeSingle();

          if (!existingInSelected) {
            // 선택한 앨범에 없으면 추가
            const { data: orderAggSelected } = await supabase
              .from('album_posts')
              .select('order')
              .eq('album_id', selectedAlbumId)
              .order('order', { ascending: false })
              .limit(1);

            const currentMaxOrderSelected = orderAggSelected && orderAggSelected.length > 0 ? orderAggSelected[0].order ?? 0 : 0;
            const nextOrderSelected = (currentMaxOrderSelected || 0) + 1;

            const { data: insertedSelected, error: insertErrorSelected } = await supabase
              .from('album_posts')
              .insert({
                user_id: user.id,
                album_id: selectedAlbumId,
                post_id: postId,
                order: nextOrderSelected,
                thumbnail: thumbnailUrl,
              })
              .select('*')
              .maybeSingle();

            if (insertErrorSelected) {
              console.error(`Failed to add post to selected album ${selectedAlbumId}:`, insertErrorSelected);
              // unique constraint 위반 등으로 실패할 수 있음 - 다시 확인
              const { data: retryCheckSelected } = await supabase
                .from('album_posts')
                .select('*')
                .eq('user_id', user.id)
                .eq('album_id', selectedAlbumId)
                .eq('post_id', postId)
                .maybeSingle();
              
              if (retryCheckSelected) {
                console.log('Post already exists in selected album after insert error, using existing:', retryCheckSelected.id);
                insertedData.push(retryCheckSelected);
                await updateAlbumThumbnail(supabase, user, selectedAlbumId, postId);
              } else {
                // 실제로 저장 실패 - unique 제약 위반일 가능성
                console.error(`Post could not be saved to selected album ${selectedAlbumId}. Error:`, insertErrorSelected.message);
                // 선택한 앨범 추가 실패해도 "저장됨" 앨범 저장은 성공으로 처리
              }
            } else if (!insertedSelected) {
              // insert 결과가 null이어도 실제로 저장되었을 수 있음 - 확인
              const { data: verifyCheckSelected } = await supabase
                .from('album_posts')
                .select('*')
                .eq('user_id', user.id)
                .eq('album_id', selectedAlbumId)
                .eq('post_id', postId)
                .maybeSingle();
              
              if (verifyCheckSelected) {
                console.log('Post exists in selected album after null insert result:', verifyCheckSelected.id);
                insertedData.push(verifyCheckSelected);
                await updateAlbumThumbnail(supabase, user, selectedAlbumId, postId);
              } else {
                console.error('Post not found in selected album after insert');
              }
            } else {
              insertedData.push(insertedSelected);
              // 앨범 썸네일 즉시 업데이트 (새로 추가했든 기존 것이든, 최신 게시글이므로)
              await updateAlbumThumbnail(supabase, user, selectedAlbumId, postId);
            }
          } else {
            // 이미 선택한 앨범에 있으면 기존 데이터를 결과에 포함
            const { data: existingSelectedData } = await supabase
              .from('album_posts')
              .select('*')
              .eq('id', existingInSelected.id)
              .maybeSingle();
            if (existingSelectedData) {
              insertedData.push(existingSelectedData);
            }
            // 이미 있어도 order를 최신으로 업데이트하고 앨범 썸네일도 업데이트
            const { data: orderAggSelected } = await supabase
              .from('album_posts')
              .select('order')
              .eq('album_id', selectedAlbumId)
              .order('order', { ascending: false })
              .limit(1);
            const currentMaxOrderSelected = orderAggSelected && orderAggSelected.length > 0 ? orderAggSelected[0].order ?? 0 : 0;
            const nextOrderSelected = (currentMaxOrderSelected || 0) + 1;
            
            // order를 최신으로 업데이트
            await supabase
              .from('album_posts')
              .update({ order: nextOrderSelected })
              .eq('id', existingInSelected.id);
            
            // 앨범 썸네일 업데이트
            await updateAlbumThumbnail(supabase, user, selectedAlbumId, postId);
          }
        }
      }

      // "저장됨" 앨범에 저장이 성공했는지 최종 확인
      if (insertedData.length === 0) {
        // insertedData가 비어있으면 실제로 저장되었는지 확인
        const { data: finalCheck } = await supabase
          .from('album_posts')
          .select('*')
          .eq('user_id', user.id)
          .eq('album_id', defaultAlbumId)
          .eq('post_id', postId)
          .maybeSingle();
        
        if (finalCheck) {
          console.log('Post found in default album after all operations:', finalCheck.id);
          insertedData.push(finalCheck);
        } else {
          console.error('Post not found in default album after all operations');
          return new Response(JSON.stringify({ success: false, error: 'Failed to save post to default album' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          });
        }
      }

      return new Response(JSON.stringify({ success: true, data: insertedData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // ----------------------------------
    // GET /api-album-posts/list → 특정 앨범의 게시글 리스트 조회
    // query: album_id (필수)
    //  - 앨범 소유자 기준으로만 조회 가능
    //  - album_posts.order 내림차순(최근 추가 순) 정렬
    //  - 각 항목은 post + media 정보 포함
    // ----------------------------------
    if (req.method === 'GET' && (pathname === '/api-album-posts/list' || pathname.endsWith('/api-album-posts/list'))) {
      const user = await getAuthUser(req);
      
      // query 파라미터에서 album_id 추출
      const albumId = url.searchParams.get('album_id') || url.searchParams.get('albumId');
      
      console.log('GET /api-album-posts/list - pathname:', pathname, 'albumId:', albumId, 'searchParams:', Object.fromEntries(url.searchParams));

      if (!albumId || albumId.trim() === '') {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'album_id is required',
          details: { pathname, searchParams: Object.fromEntries(url.searchParams) }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // 앨범 소유권 확인
      const { data: album, error: albumError } = await supabase
        .from('albums')
        .select('id, user_id')
        .eq('id', albumId)
        .maybeSingle();

      if (albumError || !album) {
        return new Response(JSON.stringify({ success: false, error: 'Album not found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        });
      }

      if (album.user_id !== user.id) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        });
      }

      // 1) album_posts 에서 해당 앨범의 post_id 목록 조회 (order 기준 정렬)
      const { data: albumPosts, error: albumPostsError } = await supabase
        .from('album_posts')
        .select('id, album_id, post_id, order, thumbnail')
        .eq('album_id', albumId)
        .order('order', { ascending: false });

      if (albumPostsError) {
        return new Response(JSON.stringify({ success: false, error: albumPostsError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      if (!albumPosts || albumPosts.length === 0) {
        return new Response(JSON.stringify({ success: true, data: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      const postIds = albumPosts.map((ap: any) => ap.post_id);

      // 2) posts + partner + media + likes 조회
      const { data: posts, error: postsError } = await supabase
        .from('posts')
        .select(`
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
          post_media(*),
          post_likes(id, user_id)
        `)
        .in('id', postIds);

      if (postsError) {
        return new Response(JSON.stringify({ success: false, error: postsError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      // 단건 구매 여부(post_unlocks) 조회
      const { data: unlocks, error: unlocksError } = await supabase
        .from('post_unlocks')
        .select('post_id')
        .eq('user_id', user.id)
        .in('post_id', postIds);

      if (unlocksError) {
        return new Response(JSON.stringify({ success: false, error: unlocksError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      const purchasedPostIds = new Set<string>((unlocks || []).map((u: any) => u.post_id));

      // 멤버십 보유 여부(membership_subscriptions) 조회
      const { data: subscriptions, error: subsError } = await supabase
        .from('membership_subscriptions')
        .select(`
          id,
          status,
          membership:membership_id(
            partner_id,
            is_active
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (subsError) {
        return new Response(JSON.stringify({ success: false, error: subsError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      const partnerMembershipMap = new Map<string, boolean>();
      (subscriptions || []).forEach((s: any) => {
        const m = s.membership;
        if (m?.partner_id && m.is_active !== false) {
          partnerMembershipMap.set(m.partner_id, true);
        }
      });

      // post_id -> post 매핑
      const postMap = new Map<string, any>();
      for (const p of posts || []) {
        postMap.set(p.id, p);
      }

      // 3) 각 post 별 접근 권한 계산 (owner / 단건구매 / 멤버십)
      const accessMap = new Map<
        string,
        {
          isSubscribersOnly: boolean;
          isPaidPost: boolean;
          isOwner: boolean;
          isPurchased: boolean;
          hasMembership: boolean;
          canViewFiles: boolean;
        }
      >();

      for (const p of posts || []) {
        const isSubscribersOnly = !!p.is_subscribers_only;
        const isPaidPost = p.point_price != null && p.point_price > 0;
        const isOwner = p.partner?.member?.id === user.id;
        const isPurchased = purchasedPostIds.has(p.id);
        const hasMembership =
          partnerMembershipMap.get(p.partner_id || p.partner?.id) === true;

        // 수정된 로직: 단건 구매(isPurchased)가 최우선
        // - 소유자면 볼 수 있음
        // - 단건 구매했으면 무조건 볼 수 있음 (멤버십 여부 무관)
        // - 무료 게시글이면서 (구독자 전용 아님 또는 멤버십 있음)
        const canViewFiles =
          isOwner ||
          isPurchased ||
          (!isPaidPost && (!isSubscribersOnly || hasMembership));

        accessMap.set(p.id, {
          isSubscribersOnly,
          isPaidPost,
          isOwner,
          isPurchased,
          hasMembership,
          canViewFiles,
        });
      }

      // 4) media signed URL 생성 (볼 수 있는 게시글에 대해서만)
      for (const p of posts || []) {
        const access = accessMap.get(p.id);
        if (!access?.canViewFiles) continue;

        if (p.post_media) {
          for (const media of p.post_media) {
            if (media.media_url) {
              const { data: signed } = await supabase.storage
                .from('post-media')
                .createSignedUrl(media.media_url, 3600);
              media.signed_url = signed?.signedUrl || null;
            }
          }
        }
      }

      // 5) album_posts.order 순서를 유지한 채로 결과 구성
      const result = await Promise.all(albumPosts
        .map(async (ap: any) => {
          const p = postMap.get(ap.post_id);
          if (!p) return null;

          const access = accessMap.get(p.id);
          if (!access) return null;

          const {
            isSubscribersOnly,
            isPaidPost,
            isPurchased,
            hasMembership,
            canViewFiles,
          } = access;

          // 잠긴 게시글이면 files 자체를 빈 배열로 내려서 썸네일/미디어 정보가 노출되지 않게 함
          const files = canViewFiles ? p.post_media || [] : [];

          // thumbnail_url 처리: storage/video-thumbnail prefix면 signed URL 생성
          // 저장된 앨범의 썸네일은 본인이 저장한 것이므로 canViewFiles 체크 없이 항상 보여줌
          let thumbnailUrl: string | null = null;
          console.log(`[album-posts/list] ap.id=${ap.id}, ap.thumbnail=${ap.thumbnail}, canViewFiles=${canViewFiles}`);
          
          if (ap.thumbnail) {
            if (ap.thumbnail.startsWith('video-thumbnail:')) {
              // video-thumbnail 버킷에서 signed URL 생성
              const storagePath = ap.thumbnail.replace('video-thumbnail:', '');
              console.log(`[album-posts/list] video-thumbnail storagePath=${storagePath}`);
              const { data: signedData, error: signedError } = await supabase
                .storage
                .from('video-thumbnail')
                .createSignedUrl(storagePath, 3600);
              if (signedError) {
                console.error(`[album-posts/list] video-thumbnail signed URL error:`, signedError);
              }
              thumbnailUrl = signedData?.signedUrl || null;
              console.log(`[album-posts/list] thumbnailUrl=${thumbnailUrl}`);
            } else if (ap.thumbnail.startsWith('storage:')) {
              // post-media 버킷에서 signed URL 생성
              const storagePath = ap.thumbnail.replace('storage:', '');
              
              // 비디오 파일인지 확인 (.mov, .mp4, .webm, .avi 등)
              const isVideoFile = /\.(mov|mp4|webm|avi|mkv|m4v)$/i.test(storagePath);
              
              if (isVideoFile) {
                // 비디오 파일이면 video-thumbnail 버킷에서 썸네일 찾기
                // post_media 테이블에서 해당 파일의 ID 찾기
                const { data: mediaData } = await supabase
                  .from('post_media')
                  .select('id')
                  .eq('media_url', storagePath)
                  .maybeSingle();
                
                if (mediaData?.id) {
                  const videoThumbPath = `${p.id}/${mediaData.id}.jpg`;
                  const { data: videoThumbData } = await supabase
                    .storage
                    .from('video-thumbnail')
                    .createSignedUrl(videoThumbPath, 3600);
                  thumbnailUrl = videoThumbData?.signedUrl || null;
                } else {
                  // 미디어 ID를 찾을 수 없으면 null
                  thumbnailUrl = null;
                }
              } else {
                // 이미지 파일이면 post-media에서 signed URL 생성
                const { data: signedData, error: signedError } = await supabase
                  .storage
                  .from('post-media')
                  .createSignedUrl(storagePath, 3600);
                if (signedError) {
                  console.error(`[album-posts/list] post-media signed URL error:`, signedError);
                }
                thumbnailUrl = signedData?.signedUrl || null;
              }
            } else {
              // 이미 URL인 경우 - 비디오 파일 URL인지 확인
              const isVideoUrl = /\.(mov|mp4|webm|avi|mkv|m4v)(\?|$)/i.test(ap.thumbnail);
              thumbnailUrl = isVideoUrl ? null : ap.thumbnail;
            }
          }
          
          // ap.thumbnail이 null이고 canViewFiles가 true인 경우, files에서 첫 번째 미디어로 썸네일 생성
          if (!thumbnailUrl && canViewFiles && files.length > 0) {
            const firstMedia = files[0];
            if (firstMedia.media_type === 'video') {
              // 비디오인 경우: video-thumbnail 버킷에서 찾기 시도
              const videoThumbPath = `${p.id}/${firstMedia.id}.jpg`;
              const { data: videoThumbData } = await supabase
                .storage
                .from('video-thumbnail')
                .createSignedUrl(videoThumbPath, 3600);
              // 비디오 썸네일이 있으면 사용, 없으면 null (원본 비디오 파일은 썸네일로 사용 안 함)
              thumbnailUrl = videoThumbData?.signedUrl || null;
            } else if (firstMedia.signed_url) {
              // 이미지인 경우: signed_url 사용
              thumbnailUrl = firstMedia.signed_url;
            }
          }

          return {
            id: ap.id,
            order: ap.order,
            post_id: p.id,
            content: p.content,
            published_at: p.published_at,
            partner_id: p.partner?.id ?? p.partner_id,
            partner: {
              name: p.partner?.partner_name || p.partner?.member?.member_code,
              profile_image: p.partner?.member?.profile_image,
              member_code: p.partner?.member?.member_code,
            },
            thumbnail_url: thumbnailUrl,
            files,
            like_count: p.post_likes?.length || 0,
            comment_count: p.comment_count || 0,
            is_liked: (p.post_likes || []).some((l: any) => l.user_id === user.id),
            is_subscribers_only: isSubscribersOnly,
            is_paid_post: isPaidPost,
            is_purchased: isPurchased,
            has_subscription: hasMembership,
            point_price: p.point_price ?? null,
          };
        }));
      
      const filteredResult = result.filter((item: any) => item !== null);

      return new Response(JSON.stringify({ success: true, data: filteredResult }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // ----------------------------------
    // PUT /api-album-posts → 앨범에서 게시글 이동 또는 업데이트
    // body: { post_id, album_id }
    //  - post_id를 다른 album_id로 이동 (단, "저장됨" 앨범은 항상 유지)
    // ----------------------------------
    if (req.method === 'PUT' && pathname === '/api-album-posts') {
      const user = await getAuthUser(req);
      const body = await req.json().catch(() => null);

      const postId = body?.post_id || body?.postId;
      const albumId = body?.album_id || body?.albumId;

      if (!postId || typeof postId !== 'string') {
        return new Response(JSON.stringify({ success: false, error: 'post_id is required' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      if (!albumId || typeof albumId !== 'string') {
        return new Response(JSON.stringify({ success: false, error: 'album_id is required' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // "저장됨" 앨범 찾기
      const { data: defaultAlbum } = await supabase
        .from('albums')
        .select('id')
        .eq('user_id', user.id)
        .eq('title', '저장됨')
        .maybeSingle();

      if (!defaultAlbum) {
        return new Response(JSON.stringify({ success: false, error: 'Default album not found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      // 앨범 소유권 확인
      const { data: album, error: albumError } = await supabase
        .from('albums')
        .select('id, user_id')
        .eq('id', albumId)
        .maybeSingle();

      if (albumError || !album) {
        return new Response(JSON.stringify({ success: false, error: 'Album not found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        });
      }

      if (album.user_id !== user.id) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        });
      }

      // "저장됨" 앨범으로 이동하려는 경우는 허용하지 않음 (이미 항상 있어야 함)
      if (albumId === defaultAlbum.id) {
        return new Response(JSON.stringify({ success: false, error: 'Cannot move to default album' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // 기존 album_posts 레코드 찾기 (현재 유저의 모든 앨범에서)
      const { data: existingList, error: existingError } = await supabase
        .from('album_posts')
        .select('id, album_id, user_id, order')
        .eq('post_id', postId)
        .eq('user_id', user.id);

      if (existingError) {
        return new Response(JSON.stringify({ success: false, error: existingError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      if (!existingList || existingList.length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'Album post not found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        });
      }

      // 이동할 대상 앨범이 이미 있는지 확인
      const existingInTarget = existingList.find((e: any) => e.album_id === albumId);
      if (existingInTarget) {
        return new Response(JSON.stringify({ success: false, error: '이미 해당 앨범에 저장된 게시글입니다.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // "저장됨" 앨범에 있는지 확인
      const existingInDefaultBeforeMove = existingList.find((e: any) => e.album_id === defaultAlbum.id);
      
      // 이동할 레코드 선택: "저장됨" 앨범이 아닌 것 중 하나를 선택
      let existing = existingList.find((e: any) => e.album_id !== defaultAlbum.id);
      
      // "저장됨" 앨범에만 있는 경우: (user_id, post_id) unique 제약 때문에
      // 기존 레코드를 삭제하고 새 앨범에 추가한 후, "저장됨" 앨범에도 다시 추가
      if (!existing) {
        // 기존 "저장됨" 앨범의 레코드 ID 저장
        const defaultAlbumPostId = existingInDefaultBeforeMove.id;
        
        // 기존 레코드 삭제 (unique 제약 때문에 먼저 삭제해야 함)
        const { error: deleteError } = await supabase
          .from('album_posts')
          .delete()
          .eq('id', defaultAlbumPostId);

        if (deleteError) {
          return new Response(JSON.stringify({ success: false, error: deleteError.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          });
        }

        // 새 앨범의 최대 order 값 조회
        const { data: orderAgg, error: orderError } = await supabase
          .from('album_posts')
          .select('order', { count: 'exact' })
          .eq('album_id', albumId)
          .order('order', { ascending: false })
          .limit(1);

        if (orderError) {
          return new Response(JSON.stringify({ success: false, error: orderError.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          });
        }

        const currentMaxOrder = orderAgg && orderAgg.length > 0 ? orderAgg[0].order ?? 0 : 0;
        const nextOrder = (currentMaxOrder || 0) + 1;

        // 썸네일 생성
        const thumbnailUrl = await generateAlbumPostThumbnail(supabase, user, postId);

        // 새 앨범에 추가
        const { data: inserted, error: insertError } = await supabase
          .from('album_posts')
          .insert({
            user_id: user.id,
            album_id: albumId,
            post_id: postId,
            order: nextOrder,
            thumbnail: thumbnailUrl,
          })
          .select('*')
          .maybeSingle();

        if (insertError || !inserted) {
          return new Response(JSON.stringify({ success: false, error: insertError?.message || 'Failed to add post to album' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          });
        }

        // "저장됨" 앨범의 order 조회
        const { data: orderDataDefault } = await supabase
          .from('album_posts')
          .select('order')
          .eq('album_id', defaultAlbum.id)
          .order('order', { ascending: false })
          .limit(1);

        const maxOrderDefault = orderDataDefault && orderDataDefault.length > 0 ? (orderDataDefault[0].order ?? 0) : 0;
        const nextOrderDefault = maxOrderDefault + 1;

        // "저장됨" 앨범에 다시 추가
        const { data: insertedDefault, error: insertDefaultError } = await supabase
          .from('album_posts')
          .insert({
            user_id: user.id,
            album_id: defaultAlbum.id,
            post_id: postId,
            order: nextOrderDefault,
            thumbnail: thumbnailUrl,
          })
          .select('*')
          .maybeSingle();

        if (insertDefaultError) {
          console.error('Failed to re-insert to default album:', insertDefaultError);
          // "저장됨" 앨범 추가 실패해도 새 앨범 추가는 성공으로 처리
        }

        // 새 앨범의 썸네일 업데이트
        await updateAlbumThumbnail(supabase, user, albumId, postId);
        
        // "저장됨" 앨범의 썸네일 업데이트
        if (insertedDefault) {
          await updateAlbumThumbnail(supabase, user, defaultAlbum.id, postId);
        }

        const resultData: any[] = [inserted];
        if (insertedDefault) {
          resultData.push(insertedDefault);
        }

        return new Response(JSON.stringify({ success: true, data: resultData }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      // 새 앨범에 이미 같은 post_id가 있는지 확인
      const { data: duplicate, error: duplicateError } = await supabase
        .from('album_posts')
        .select('id')
        .eq('album_id', albumId)
        .eq('post_id', postId)
        .maybeSingle();

      if (duplicateError) {
        return new Response(JSON.stringify({ success: false, error: duplicateError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      if (duplicate) {
        return new Response(JSON.stringify({ success: false, error: 'Post already exists in target album' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // 새 앨범의 최대 order 값 조회
      const { data: orderAgg, error: orderError } = await supabase
        .from('album_posts')
        .select('order', { count: 'exact' })
        .eq('album_id', albumId)
        .order('order', { ascending: false })
        .limit(1);

      if (orderError) {
        return new Response(JSON.stringify({ success: false, error: orderError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      const currentMaxOrder = orderAgg && orderAgg.length > 0 ? orderAgg[0].order ?? 0 : 0;
      const nextOrder = (currentMaxOrder || 0) + 1;

      // (user_id, post_id) unique 제약 때문에:
      // 1. 기존 레코드를 삭제
      // 2. 새 앨범에 추가
      // 3. "저장됨" 앨범에도 추가
      
      const existingId = existing.id;
      const existingAlbumId = existing.album_id;

      // 기존 레코드 삭제
      const { error: deleteError } = await supabase
        .from('album_posts')
        .delete()
        .eq('id', existingId);

      if (deleteError) {
        return new Response(JSON.stringify({ success: false, error: deleteError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      // 썸네일 생성
      const thumbnailUrl = await generateAlbumPostThumbnail(supabase, user, postId);

      // 새 앨범에 추가
      const { data: inserted, error: insertError } = await supabase
        .from('album_posts')
        .insert({
          user_id: user.id,
          album_id: albumId,
          post_id: postId,
          order: nextOrder,
          thumbnail: thumbnailUrl,
        })
        .select('*')
        .maybeSingle();

      if (insertError || !inserted) {
        return new Response(JSON.stringify({ success: false, error: insertError?.message || 'Failed to add post to album' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      // "저장됨" 앨범의 order 조회
      const { data: orderDataDefault } = await supabase
        .from('album_posts')
        .select('order')
        .eq('album_id', defaultAlbum.id)
        .order('order', { ascending: false })
        .limit(1);

      const maxOrderDefault = orderDataDefault && orderDataDefault.length > 0 ? (orderDataDefault[0].order ?? 0) : 0;
      const nextOrderDefault = maxOrderDefault + 1;

      // "저장됨" 앨범에 추가
      let insertedDefault: any = null;
      const { data: insertedDefaultData, error: insertDefaultError } = await supabase
        .from('album_posts')
        .insert({
          user_id: user.id,
          album_id: defaultAlbum.id,
          post_id: postId,
          order: nextOrderDefault,
          thumbnail: thumbnailUrl,
        })
        .select('*')
        .maybeSingle();

      if (insertDefaultError || !insertedDefaultData) {
        console.error('Failed to insert to default album:', insertDefaultError);
        // "저장됨" 앨범 추가 실패해도 새 앨범 추가는 성공으로 처리
        // unique 제약 위반 등으로 실패할 수 있음 - 다시 확인
        const { data: retryCheck } = await supabase
          .from('album_posts')
          .select('*')
          .eq('user_id', user.id)
          .eq('album_id', defaultAlbum.id)
          .eq('post_id', postId)
          .maybeSingle();
        
        if (retryCheck) {
          // 이미 있으면 기존 데이터 사용
          insertedDefault = retryCheck;
        }
      } else {
        insertedDefault = insertedDefaultData;
      }

      // 기존 앨범의 order 재정렬 및 썸네일 업데이트
      const { data: remaining, error: remainingError } = await supabase
        .from('album_posts')
        .select('id, post_id')
        .eq('album_id', existingAlbumId)
        .order('order', { ascending: true });

      if (!remainingError && remaining && remaining.length > 0) {
        for (let i = 0; i < remaining.length; i++) {
          const ap = remaining[i];
          const newOrder = i + 1;
          await supabase
            .from('album_posts')
            .update({ order: newOrder })
            .eq('id', ap.id);
        }

        // 기존 앨범의 썸네일 업데이트 (남은 게시글 중 최신 것)
        const { data: latestAlbumPost } = await supabase
          .from('album_posts')
          .select('post_id')
          .eq('album_id', existingAlbumId)
          .order('order', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestAlbumPost) {
          await updateAlbumThumbnail(supabase, user, existingAlbumId, latestAlbumPost.post_id);
        }
      } else {
        // 기존 앨범에 남은 게시글이 없으면 썸네일을 null로 설정
        await supabase
          .from('albums')
          .update({
            thumbnail: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingAlbumId);
      }

      // 새 앨범의 썸네일 업데이트
      await updateAlbumThumbnail(supabase, user, albumId, postId);
      
      // "저장됨" 앨범의 썸네일 업데이트
      if (insertedDefault) {
        await updateAlbumThumbnail(supabase, user, defaultAlbum.id, postId);
      }

      const resultData: any[] = [inserted];
      if (insertedDefault) {
        resultData.push(insertedDefault);
      }

      return new Response(JSON.stringify({ success: true, data: resultData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // ----------------------------------
    // DELETE /api-album-posts/:postId → 앨범에서 게시글 제거
    //  - :postId는 posts.id (user_id + post_id 기준으로 모든 앨범에서 삭제)
    //  - 삭제 후 해당 앨범의 order 를 1부터 연속되게 재정렬
    // ----------------------------------
    const deleteMatch = pathname.match(/\/api-album-posts\/([a-zA-Z0-9-]+)$/);
    if (req.method === 'DELETE' && deleteMatch) {
      const postId = deleteMatch[1];
      const user = await getAuthUser(req);

      // 1. post_id로 조회 (user_id + post_id 기준으로 모든 앨범에서 삭제)
      const { data: albumPostsList, error: listError } = await supabase
        .from('album_posts')
        .select('id, album_id')
        .eq('user_id', user.id)
        .eq('post_id', postId);

      if (listError) {
        return new Response(JSON.stringify({ success: false, error: listError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      if (!albumPostsList || albumPostsList.length === 0) {
        return new Response(JSON.stringify({ success: true, message: 'Album post not found or already deleted' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      // 영향받는 앨범 ID 수집
      const affectedAlbumIds = [...new Set(albumPostsList.map(r => r.album_id))];

      // 2. user_id + post_id 기준으로 전체 삭제
      const { error: deleteError } = await supabase
        .from('album_posts')
        .delete()
        .eq('user_id', user.id)
        .eq('post_id', postId);

      if (deleteError) {
        return new Response(JSON.stringify({ success: false, error: deleteError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      // 3. 각 앨범의 order 재정렬 및 썸네일 업데이트
      for (const albumId of affectedAlbumIds) {
        await reorderAndUpdateThumbnail(supabase, user, albumId);
      }

      return new Response(JSON.stringify({ success: true, deleted: albumPostsList.length, affected_albums: affectedAlbumIds }), {
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


