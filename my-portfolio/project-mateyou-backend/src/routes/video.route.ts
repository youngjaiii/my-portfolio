import { Router, Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import multer from "multer";

const execAsync = promisify(exec);

const router = Router();

// 임시 파일 저장 디렉토리
const uploadDir = path.join(os.tmpdir(), "mateyou-video-uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer 설정 - 최대 500MB까지 허용
const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
  },
});

/**
 * @swagger
 * /api/video/compress:
 *   post:
 *     summary: 동영상 압축
 *     description: 동영상을 720p, 15MB 이하로 압축합니다.
 *     tags: [Video]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               video:
 *                 type: string
 *                 format: binary
 *               maxSizeMB:
 *                 type: number
 *                 default: 15
 *     responses:
 *       200:
 *         description: 압축된 동영상 파일
 *         content:
 *           video/mp4:
 *             schema:
 *               type: string
 *               format: binary
 */
router.post("/compress", upload.single("video"), async (req: Request, res: Response) => {
  const inputPath = req.file?.path;
  
  if (!inputPath) {
    return res.status(400).json({ error: "동영상 파일이 필요합니다." });
  }

  const maxSizeMB = parseInt(req.body.maxSizeMB) || 15;
  const outputPath = path.join(uploadDir, `compressed_${Date.now()}.mp4`);

  try {
    // 원본 파일 크기 확인
    const stats = fs.statSync(inputPath);
    const originalSizeMB = stats.size / (1024 * 1024);
    console.log(`📹 원본 파일 크기: ${originalSizeMB.toFixed(1)}MB`);

    // 이미 작은 파일이면 그대로 반환
    if (stats.size <= maxSizeMB * 1024 * 1024) {
      console.log(`✅ 이미 ${maxSizeMB}MB 이하, 원본 반환`);
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", 'attachment; filename="video.mp4"');
      res.setHeader("X-Original-Size", stats.size.toString());
      res.setHeader("X-Compressed-Size", stats.size.toString());
      
      const readStream = fs.createReadStream(inputPath);
      readStream.pipe(res);
      readStream.on("end", () => {
        fs.unlink(inputPath, () => {});
      });
      return;
    }

    // 압축 비율 계산
    const compressionRatio = (maxSizeMB * 1024 * 1024) / stats.size;
    const targetBitrate = Math.floor(2000 * compressionRatio);
    const videoBitrate = Math.max(300, Math.min(targetBitrate, 2000)); // 300k ~ 2000k

    console.log(`🎬 압축 시작: ${originalSizeMB.toFixed(1)}MB → 목표 ${maxSizeMB}MB (비트레이트: ${videoBitrate}k)`);

    // FFmpeg 압축 명령어
    const ffmpegCmd = `ffmpeg -i "${inputPath}" \
      -c:v libx264 -preset fast -crf 28 \
      -b:v ${videoBitrate}k \
      -vf "scale=-2:min(720\\,ih)" \
      -c:a aac -b:a 128k \
      -movflags +faststart \
      -y "${outputPath}"`;

    await execAsync(ffmpegCmd);

    // 압축 결과 확인
    const compressedStats = fs.statSync(outputPath);
    const compressedSizeMB = compressedStats.size / (1024 * 1024);
    console.log(`✅ 압축 완료: ${compressedSizeMB.toFixed(1)}MB (${((1 - compressedStats.size / stats.size) * 100).toFixed(0)}% 감소)`);

    // 압축된 파일 전송
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", 'attachment; filename="compressed.mp4"');
    res.setHeader("X-Original-Size", stats.size.toString());
    res.setHeader("X-Compressed-Size", compressedStats.size.toString());

    const readStream = fs.createReadStream(outputPath);
    readStream.pipe(res);

    readStream.on("end", () => {
      // 임시 파일 정리
      fs.unlink(inputPath, () => {});
      fs.unlink(outputPath, () => {});
    });

  } catch (error: any) {
    console.error("❌ 압축 실패:", error.message);
    
    // 임시 파일 정리
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    // FFmpeg 미설치 체크
    if (error.message.includes("ffmpeg") || error.message.includes("not found") || error.message.includes("not recognized")) {
      return res.status(500).json({ 
        error: "FFmpeg가 설치되지 않았습니다.",
        details: "서버에 FFmpeg를 설치해주세요: apt install ffmpeg"
      });
    }

    return res.status(500).json({ 
      error: "동영상 압축에 실패했습니다.",
      details: error.message 
    });
  }
});

/**
 * @swagger
 * /api/video/health:
 *   get:
 *     summary: FFmpeg 설치 상태 확인
 *     tags: [Video]
 */
router.get("/health", async (_req: Request, res: Response) => {
  try {
    const { stdout } = await execAsync("ffmpeg -version");
    const versionMatch = stdout.match(/ffmpeg version (\S+)/);
    res.json({ 
      status: "ok", 
      ffmpeg: versionMatch ? versionMatch[1] : "installed",
      message: "FFmpeg is available"
    });
  } catch (error) {
    res.status(500).json({ 
      status: "error", 
      ffmpeg: null,
      message: "FFmpeg is not installed"
    });
  }
});

export default router;

