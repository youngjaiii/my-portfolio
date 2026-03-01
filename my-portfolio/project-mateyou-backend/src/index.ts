import "dotenv/config";
import express from "express";
import payoutRouter from "./routes/payout.route.js";
import authRouter from "./routes/auth.route.js";
import adminRouter from "./routes/admin.route.js";
import bannersRouter from "./routes/banners.route.js";
import chatRouter from "./routes/chat.route.js";
import chatUploadRouter from "./routes/chat-upload.route.js";
import chatMessagesRouter from "./routes/chat-messages.route.js";
import emailRouter from "./routes/email.route.js";
import membersRouter from "./routes/members.route.js";
import partnerDashboardRouter from "./routes/partner-dashboard.route.js";
import partnerProfileRouter from "./routes/partner-profile.route.js";
import partnerSettlementRouter from "./routes/partner-settlement.route.js";
import partnersRouter from "./routes/partners.route.js";
import paymentRouter from "./routes/payment.route.js";
import postsRouter from "./routes/posts.route.js";
import pushRouter from "./routes/push.route.js";
import rankingsRouter from "./routes/rankings.route.js";
import reviewsRouter from "./routes/reviews.route.js";
import storageRouter from "./routes/storage.route.js";
import testRouter from "./routes/test.route.js";
import tossRouter from "./routes/toss.route.js";
import voiceCallRouter from "./routes/voice-call.route.js";
import videoRouter from "./routes/video.route.js";
import albumsRouter from "./routes/albums.route.js";
import bannedWordsRouter from "./routes/banned-words.route.js";
import { swaggerDocs } from "./swagger/swagger.js";
import { corsMiddleware, authMiddleware } from "./lib/middleware.js";
import { processPushQueue } from "./lib/push-queue.js";
import { processExpiredRequests } from "./lib/request-expiry.js";

console.log("🐾 Build Version: 2025-12-30-02");

const app = express();

// CORS 설정 (환경변수로 제어 가능)
app.use(corsMiddleware);

// JSON 파싱
app.use(express.json());

// 전역 인증 미들웨어 (공개 엔드포인트는 자동으로 제외됨)
app.use(authMiddleware);

// Routes
app.use("/api/payouts", payoutRouter);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/banners", bannersRouter);
app.use("/api/chat", chatRouter);
app.use("/api/chat", chatUploadRouter);
app.use("/api/chat-messages", chatMessagesRouter);
app.use("/api/email", emailRouter);
app.use("/api/members", membersRouter);
app.use("/api/partner-dashboard", partnerDashboardRouter);
app.use("/api/partner-profile", partnerProfileRouter);
app.use("/api/partner-settlement", partnerSettlementRouter);
app.use("/api/partners", partnersRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/posts", postsRouter);
app.use("/api/push", pushRouter);
app.use("/api/rankings", rankingsRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/storage", storageRouter);
app.use("/api/test", testRouter);
app.use("/api/toss", tossRouter);
app.use("/api/voice-call", voiceCallRouter);
app.use("/api/video", videoRouter);
app.use("/api/albums", albumsRouter);
app.use("/api/banned-words", bannedWordsRouter);

// Swagger
swaggerDocs(app, Number(process.env.PORT) || 4000);

// 푸시 알림 큐 워커 (백그라운드에서 주기적으로 실행)
const PUSH_QUEUE_INTERVAL = parseInt(process.env.PUSH_QUEUE_INTERVAL || "5000"); // 기본 5초
const PUSH_QUEUE_BATCH_SIZE = parseInt(
  process.env.PUSH_QUEUE_BATCH_SIZE || "50"
); // 기본 50개
let pushQueueWorkerInterval: NodeJS.Timeout | null = null;

async function startPushQueueWorker() {
  // 즉시 한 번 실행
  try {
    await processPushQueue(PUSH_QUEUE_BATCH_SIZE);
  } catch (error: any) {
    console.error("❌ Push queue worker error:", {
      message: error.message,
      details: error.toString(),
      stack: error.stack?.split("\n").slice(0, 3).join("\n"),
    });
  }

  // 주기적으로 실행
  pushQueueWorkerInterval = setInterval(async () => {
    try {
      await processPushQueue(PUSH_QUEUE_BATCH_SIZE);
    } catch (error: any) {
      console.error("❌ Push queue worker error:", {
        message: error.message,
        details: error.toString(),
        stack: error.stack?.split("\n").slice(0, 3).join("\n"),
      });
    }
  }, PUSH_QUEUE_INTERVAL);

  const intervalSeconds = PUSH_QUEUE_INTERVAL / 1000;
  console.log(
    `📬 Push queue worker started (interval: ${intervalSeconds}s, batch size: ${PUSH_QUEUE_BATCH_SIZE})`
  );

  // 짧은 간격일 때 경고
  if (PUSH_QUEUE_INTERVAL < 5000) {
    console.warn(
      `⚠️  Push queue interval is very short (${intervalSeconds}s). This may increase database load.`
    );
  }

  // 큰 배치 사이즈일 때 경고
  if (PUSH_QUEUE_BATCH_SIZE > 100) {
    console.warn(
      `⚠️  Push queue batch size is large (${PUSH_QUEUE_BATCH_SIZE}). This may increase memory usage and processing time.`
    );
  }
}

// 의뢰 만료 처리 워커 (백그라운드에서 주기적으로 실행)
const REQUEST_EXPIRY_INTERVAL = parseInt(
  process.env.REQUEST_EXPIRY_INTERVAL || "300000"
); // 기본 5분 (300000ms)
let requestExpiryWorkerInterval: NodeJS.Timeout | null = null;

async function startRequestExpiryWorker() {
  // 즉시 한 번 실행
  try {
    await processExpiredRequests();
  } catch (error: any) {
    console.error("❌ Request expiry worker error:", {
      message: error.message,
      details: error.toString(),
      stack: error.stack?.split("\n").slice(0, 3).join("\n"),
    });
  }

  // 주기적으로 실행
  requestExpiryWorkerInterval = setInterval(async () => {
    try {
      await processExpiredRequests();
    } catch (error: any) {
      console.error("❌ Request expiry worker error:", {
        message: error.message,
        details: error.toString(),
        stack: error.stack?.split("\n").slice(0, 3).join("\n"),
      });
    }
  }, REQUEST_EXPIRY_INTERVAL);

  const intervalMinutes = REQUEST_EXPIRY_INTERVAL / 1000 / 60;
  console.log(
    `⏰ Request expiry worker started (interval: ${intervalMinutes} minutes)`
  );
}

// 워커 시작
if (process.env.ENABLE_PUSH_QUEUE_WORKER !== "false") {
  startPushQueueWorker();
}

if (process.env.ENABLE_REQUEST_EXPIRY_WORKER !== "false") {
  startRequestExpiryWorker();
}

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 Shutting down workers...");
  if (pushQueueWorkerInterval) {
    clearInterval(pushQueueWorkerInterval);
  }
  if (requestExpiryWorkerInterval) {
    clearInterval(requestExpiryWorkerInterval);
  }
  process.exit(0);
});

app.listen(process.env.PORT || 4000, () => {
  console.log(`🚀 Server running on port ${process.env.PORT || 4000}`);
});
