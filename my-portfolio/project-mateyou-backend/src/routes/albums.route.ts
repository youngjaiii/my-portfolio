import { Router, Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import { createClient } from "@supabase/supabase-js";

const execAsync = promisify(exec);

const router = Router();

// Supabase 클라이언트 생성
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// 임시 파일 저장 디렉토리
const tmpDir = path.join(os.tmpdir(), "mateyou-album-thumbnails");
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

/**
 * 비디오 URL에서 썸네일을 캡처하고 Supabase Storage에 업로드
 * @param videoUrl - 비디오 URL (signed URL)
 * @param postId - 게시물 ID
 * @returns { storagePath, publicUrl } 또는 null
 */
async function captureAndUploadThumbnail(
  videoUrl: string,
  postId: string
): Promise<{ storagePath: string; publicUrl: string } | null> {
  const outputFileName = `${postId}_${Date.now()}.jpg`;
  const outputPath = path.join(tmpDir, outputFileName);

  try {
    console.log(`📸 썸네일 캡처 시작: ${videoUrl.substring(0, 100)}...`);

    // FFmpeg로 비디오에서 1초 지점의 프레임 캡처
    const ffmpegCmd = `ffmpeg -i "${videoUrl}" -ss 00:00:01 -vframes 1 -vf "scale=480:-1" -q:v 2 -y "${outputPath}"`;
    
    await execAsync(ffmpegCmd, { timeout: 30000 }); // 30초 타임아웃

    // 파일이 생성되었는지 확인
    if (!fs.existsSync(outputPath)) {
      console.error("❌ 썸네일 파일 생성 실패");
      return null;
    }

    const stats = fs.statSync(outputPath);
    console.log(`✅ 썸네일 캡처 완료: ${(stats.size / 1024).toFixed(1)}KB`);

    // Supabase Storage에 업로드 (video-thumbnail 버킷)
    const fileBuffer = fs.readFileSync(outputPath);
    const storagePath = `${postId}/${outputFileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("video-thumbnail")
      .upload(storagePath, fileBuffer, {
        contentType: "image/jpeg",
        upsert: true,
      });

    // 임시 파일 삭제
    fs.unlinkSync(outputPath);

    if (uploadError) {
      console.error("❌ Storage 업로드 실패:", uploadError);
      return null;
    }

    console.log(`✅ Storage 업로드 완료 (video-thumbnail): ${storagePath}`);

    // Public URL 생성
    const { data: publicUrlData } = supabase.storage
      .from("video-thumbnail")
      .getPublicUrl(storagePath);

    return {
      storagePath: `video-thumbnail:${storagePath}`,
      publicUrl: publicUrlData?.publicUrl || "",
    };
  } catch (error: any) {
    console.error("❌ 썸네일 처리 실패:", error.message);

    // 임시 파일 정리
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    return null;
  }
}

/**
 * @swagger
 * /api/albums/generate-thumbnail:
 *   post:
 *     summary: 앨범 비디오 썸네일 생성
 *     description: 비디오 URL에서 썸네일을 캡처하여 video-thumbnail 버킷에 저장, albums/album_posts 테이블 업데이트
 *     tags: [Albums]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - album_id
 *               - post_id
 *               - video_url
 *             properties:
 *               album_id:
 *                 type: string
 *                 description: 앨범 ID
 *               post_id:
 *                 type: string
 *                 description: 게시물 ID
 *               video_url:
 *                 type: string
 *                 description: 비디오 URL (signed URL)
 *               album_post_id:
 *                 type: string
 *                 description: album_posts 테이블의 ID (선택)
 *               user_id:
 *                 type: string
 *                 description: 사용자 ID (선택)
 *     responses:
 *       200:
 *         description: 썸네일 생성 성공
 *       400:
 *         description: 필수 파라미터 누락
 *       500:
 *         description: 서버 에러
 */
router.post("/generate-thumbnail", async (req: Request, res: Response) => {
  const { album_id, post_id, video_url, album_post_id, user_id } = req.body;

  if (!album_id || !post_id || !video_url) {
    return res.status(400).json({
      success: false,
      error: "album_id, post_id, video_url are required",
    });
  }

  try {
    // 썸네일 캡처 및 업로드
    const thumbnailResult = await captureAndUploadThumbnail(video_url, post_id);

    if (!thumbnailResult) {
      return res.status(500).json({
        success: false,
        error: "썸네일 생성에 실패했습니다.",
      });
    }

    const { storagePath, publicUrl } = thumbnailResult;

    // albums 테이블 업데이트
    const { error: albumUpdateError } = await supabase
      .from("albums")
      .update({
        thumbnail: storagePath, // video-thumbnail:path 형식
        updated_at: new Date().toISOString(),
      })
      .eq("id", album_id);

    if (albumUpdateError) {
      console.error("❌ albums 테이블 업데이트 실패:", albumUpdateError);
    } else {
      console.log(`✅ albums ${album_id} 썸네일 업데이트 완료`);
    }

    // album_posts 테이블 업데이트 (album_post_id가 있는 경우)
    if (album_post_id) {
      const { error: albumPostUpdateError } = await supabase
        .from("album_posts")
        .update({
          thumbnail: storagePath,
        })
        .eq("id", album_post_id);

      if (albumPostUpdateError) {
        console.error("❌ album_posts 테이블 업데이트 실패:", albumPostUpdateError);
      } else {
        console.log(`✅ album_posts ${album_post_id} 썸네일 업데이트 완료`);
      }
    }

    // user_id가 있으면 해당 사용자의 '저장됨' 앨범도 업데이트
    if (user_id) {
      const { data: defaultAlbum } = await supabase
        .from("albums")
        .select("id")
        .eq("user_id", user_id)
        .eq("title", "저장됨")
        .maybeSingle();

      if (defaultAlbum && defaultAlbum.id !== album_id) {
        const { error: defaultAlbumUpdateError } = await supabase
          .from("albums")
          .update({
            thumbnail: storagePath,
            updated_at: new Date().toISOString(),
          })
          .eq("id", defaultAlbum.id);

        if (defaultAlbumUpdateError) {
          console.error("❌ 기본 앨범 썸네일 업데이트 실패:", defaultAlbumUpdateError);
        } else {
          console.log(`✅ 기본 앨범 ${defaultAlbum.id} 썸네일 업데이트 완료`);
        }
      }
    }

    return res.json({
      success: true,
      data: {
        album_id,
        post_id,
        storage_path: storagePath,
        thumbnail_url: publicUrl,
      },
    });
  } catch (error: any) {
    console.error("❌ 썸네일 생성 API 에러:", error);
    return res.status(500).json({
      success: false,
      error: "썸네일 생성에 실패했습니다.",
      details: error.message,
    });
  }
});

/**
 * @swagger
 * /api/albums/update-thumbnail-from-post:
 *   post:
 *     summary: 게시물의 첫 번째 미디어로 앨범 썸네일 업데이트
 *     description: 게시물의 첫 번째 콘텐츠가 동영상이면 썸네일 캡처, 이미지면 그대로 사용
 *     tags: [Albums]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - album_id
 *               - post_id
 *             properties:
 *               album_id:
 *                 type: string
 *               post_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: 썸네일 업데이트 성공
 */
router.post("/update-thumbnail-from-post", async (req: Request, res: Response) => {
  const { album_id, post_id, user_id, album_post_id } = req.body;

  if (!album_id || !post_id) {
    return res.status(400).json({
      success: false,
      error: "album_id, post_id are required",
    });
  }

  try {
    // 게시물의 첫 번째 미디어 조회
    const { data: postMedia, error: mediaError } = await supabase
      .from("post_media")
      .select("id, media_type, media_url, sort_order")
      .eq("post_id", post_id)
      .order("sort_order", { ascending: true })
      .limit(1);

    if (mediaError) {
      console.error("❌ post_media 조회 실패:", mediaError);
      return res.status(500).json({
        success: false,
        error: "미디어 조회에 실패했습니다.",
      });
    }

    if (!postMedia || postMedia.length === 0) {
      return res.status(404).json({
        success: false,
        error: "해당 게시물에 미디어가 없습니다.",
      });
    }

    const media = postMedia[0];
    let storagePath: string | null = null;
    let publicUrl: string | null = null;

    if (media.media_type === "video") {
      // 동영상인 경우: Signed URL 생성 후 썸네일 캡처
      const { data: signedUrlData, error: signedError } = await supabase.storage
        .from("post-media")
        .createSignedUrl(media.media_url, 3600); // 1시간 유효

      if (signedError || !signedUrlData?.signedUrl) {
        console.error("❌ Signed URL 생성 실패:", signedError);
        return res.status(500).json({
          success: false,
          error: "비디오 URL 생성에 실패했습니다.",
        });
      }

      // 썸네일 캡처 및 업로드
      const thumbnailResult = await captureAndUploadThumbnail(
        signedUrlData.signedUrl,
        post_id
      );

      if (thumbnailResult) {
        storagePath = thumbnailResult.storagePath;
        publicUrl = thumbnailResult.publicUrl;
      } else {
        console.error("❌ 비디오 썸네일 캡처 실패");
      }
    } else {
      // 이미지인 경우: storage path 저장
      storagePath = `storage:${media.media_url}`;
    }

    // albums 테이블 업데이트
    if (storagePath) {
      console.log(`📝 albums 테이블 업데이트 시도: album_id=${album_id}, thumbnail=${storagePath}`);
      const { data: updateData, error: albumUpdateError } = await supabase
        .from("albums")
        .update({
          thumbnail: storagePath,
          updated_at: new Date().toISOString(),
        })
        .eq("id", album_id)
        .select();

      if (albumUpdateError) {
        console.error("❌ albums 테이블 업데이트 실패:", albumUpdateError);
        return res.status(500).json({
          success: false,
          error: "앨범 썸네일 업데이트 실패",
          details: albumUpdateError.message,
        });
      }
      
      console.log(`✅ albums 테이블 업데이트 성공:`, updateData);

      // album_posts 테이블 업데이트
      if (album_post_id) {
        await supabase
          .from("album_posts")
          .update({ thumbnail: storagePath })
          .eq("id", album_post_id);
      }

      // user_id가 있으면 '저장됨' 앨범도 업데이트
      if (user_id) {
        const { data: defaultAlbum } = await supabase
          .from("albums")
          .select("id")
          .eq("user_id", user_id)
          .eq("title", "저장됨")
          .maybeSingle();

        if (defaultAlbum && defaultAlbum.id !== album_id) {
          await supabase
            .from("albums")
            .update({
              thumbnail: storagePath,
              updated_at: new Date().toISOString(),
            })
            .eq("id", defaultAlbum.id);
        }
      }
    }

    console.log(`✅ 앨범 ${album_id} 썸네일 업데이트 완료 (타입: ${media.media_type})`);

    return res.json({
      success: true,
      data: {
        album_id,
        post_id,
        media_type: media.media_type,
        storage_path: storagePath,
        thumbnail_url: publicUrl,
      },
    });
  } catch (error: any) {
    console.error("❌ 썸네일 업데이트 API 에러:", error);
    return res.status(500).json({
      success: false,
      error: "썸네일 업데이트에 실패했습니다.",
      details: error.message,
    });
  }
});

export default router;

