import { Router, Request, Response } from "express";
import {
  createSupabaseClient,
  successResponse,
  errorResponse,
  getAuthUser,
  asyncHandler,
} from "../lib/utils";
import { sendEmail, sendBulkEmail, emailTemplates, EmailOptions } from "../lib/email";

const router = Router();

/**
 * @swagger
 * /api/email/send:
 *   post:
 *     summary: 이메일 발송
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - subject
 *             properties:
 *               to:
 *                 type: string
 *                 description: 수신자 이메일 주소 (여러 개는 배열로)
 *               subject:
 *                 type: string
 *                 description: 이메일 제목
 *               text:
 *                 type: string
 *                 description: 텍스트 본문
 *               html:
 *                 type: string
 *                 description: HTML 본문
 *     responses:
 *       200:
 *         description: 성공
 *       400:
 *         description: 잘못된 요청
 */
// POST /send - Send email
router.post(
  "/send",
  asyncHandler(async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    const { to, subject, text, html } = req.body;

    if (!to || !subject) {
      return errorResponse(res, "INVALID_REQUEST", "수신자(to)와 제목(subject)은 필수입니다.");
    }

    if (!text && !html) {
      return errorResponse(res, "INVALID_REQUEST", "본문(text 또는 html)은 필수입니다.");
    }

    try {
      const result = await sendEmail({
        to,
        subject,
        text,
        html,
      });

      return successResponse(res, {
        message: "이메일이 성공적으로 발송되었습니다.",
        messageId: result.messageId,
      });
    } catch (error: any) {
      return errorResponse(res, "EMAIL_SEND_ERROR", "이메일 발송 실패", error.message);
    }
  })
);

/**
 * @swagger
 * /api/email/send-by-member-id:
 *   post:
 *     summary: member.id로 이메일 발송
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - member_id
 *               - subject
 *             properties:
 *               member_id:
 *                 type: string
 *                 description: 멤버 ID (UUID) 또는 배열
 *               subject:
 *                 type: string
 *                 description: 이메일 제목
 *               text:
 *                 type: string
 *                 description: 텍스트 본문
 *               html:
 *                 type: string
 *                 description: HTML 본문
 *     responses:
 *       200:
 *         description: 성공
 *       400:
 *         description: 잘못된 요청
 */
// POST /send-by-member-id - Send email by member ID
router.post(
  "/send-by-member-id",
  asyncHandler(async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const { member_id, subject, text, html } = req.body;

    if (!member_id || !subject) {
      return errorResponse(res, "INVALID_REQUEST", "멤버 ID(member_id)와 제목(subject)은 필수입니다.");
    }

    if (!text && !html) {
      return errorResponse(res, "INVALID_REQUEST", "본문(text 또는 html)은 필수입니다.");
    }

    // member_id를 email 주소로 변환하는 함수
    const resolveEmailFromMemberId = async (id: string): Promise<string> => {
      const { data: member, error } = await supabase
        .from("members")
        .select("email")
        .eq("id", id)
        .single();

      if (error || !member || !member.email) {
        throw new Error(`Member not found or email not set for ID: ${id}`);
      }

      return member.email;
    };

    try {
      // member_id가 배열인 경우 각각 처리, 단일 값인 경우도 처리
      const memberIds = Array.isArray(member_id) ? member_id : [member_id];
      const emailAddresses = await Promise.all(
        memberIds.map((id) => resolveEmailFromMemberId(id))
      );

      const result = await sendEmail({
        to: emailAddresses,
        subject,
        text,
        html,
      });

      return successResponse(res, {
        message: "이메일이 성공적으로 발송되었습니다.",
        messageId: result.messageId,
      });
    } catch (error: any) {
      return errorResponse(res, "EMAIL_SEND_ERROR", "이메일 발송 실패", error.message);
    }
  })
);

/**
 * @swagger
 * /api/email/send-by-member-code:
 *   post:
 *     summary: member.member_code로 이메일 발송
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - member_code
 *               - subject
 *             properties:
 *               member_code:
 *                 type: string
 *                 description: 멤버 코드 또는 배열
 *               subject:
 *                 type: string
 *                 description: 이메일 제목
 *               text:
 *                 type: string
 *                 description: 텍스트 본문
 *               html:
 *                 type: string
 *                 description: HTML 본문
 *     responses:
 *       200:
 *         description: 성공
 *       400:
 *         description: 잘못된 요청
 */
// POST /send-by-member-code - Send email by member code
router.post(
  "/send-by-member-code",
  asyncHandler(async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const { member_code, subject, text, html } = req.body;

    if (!member_code || !subject) {
      return errorResponse(res, "INVALID_REQUEST", "멤버 코드(member_code)와 제목(subject)은 필수입니다.");
    }

    if (!text && !html) {
      return errorResponse(res, "INVALID_REQUEST", "본문(text 또는 html)은 필수입니다.");
    }

    // member_code를 email 주소로 변환하는 함수
    const resolveEmailFromMemberCode = async (code: string): Promise<string> => {
      const { data: member, error } = await supabase
        .from("members")
        .select("email")
        .eq("member_code", code)
        .single();

      if (error || !member || !member.email) {
        throw new Error(`Member not found or email not set for member_code: ${code}`);
      }

      return member.email;
    };

    try {
      // member_code가 배열인 경우 각각 처리, 단일 값인 경우도 처리
      const memberCodes = Array.isArray(member_code) ? member_code : [member_code];
      const emailAddresses = await Promise.all(
        memberCodes.map((code) => resolveEmailFromMemberCode(code))
      );

      const result = await sendEmail({
        to: emailAddresses,
        subject,
        text,
        html,
      });

      return successResponse(res, {
        message: "이메일이 성공적으로 발송되었습니다.",
        messageId: result.messageId,
      });
    } catch (error: any) {
      return errorResponse(res, "EMAIL_SEND_ERROR", "이메일 발송 실패", error.message);
    }
  })
);

/**
 * @swagger
 * /api/email/send-bulk:
 *   post:
 *     summary: 여러 수신자에게 이메일 발송
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - recipients
 *               - subject
 *             properties:
 *               recipients:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 수신자 배열 (이메일 주소, member.id (UUID), 또는 member.member_code)
 *               subject:
 *                 type: string
 *                 description: 이메일 제목
 *               text:
 *                 type: string
 *                 description: 텍스트 본문
 *               html:
 *                 type: string
 *                 description: HTML 본문
 *     responses:
 *       200:
 *         description: 성공
 */
// POST /send-bulk - Send bulk email
router.post(
  "/send-bulk",
  asyncHandler(async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const { recipients, subject, text, html } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return errorResponse(res, "INVALID_REQUEST", "수신자(recipients) 배열은 필수입니다.");
    }

    if (!subject) {
      return errorResponse(res, "INVALID_REQUEST", "제목(subject)은 필수입니다.");
    }

    if (!text && !html) {
      return errorResponse(res, "INVALID_REQUEST", "본문(text 또는 html)은 필수입니다.");
    }

    // recipients를 email 주소로 변환하는 함수
    const resolveEmailAddress = async (recipient: string): Promise<string> => {
      // UUID 형식인지 확인
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      
      if (uuidRegex.test(recipient)) {
        // member.id로 조회
        const { data: member, error } = await supabase
          .from("members")
          .select("email")
          .eq("id", recipient)
          .single();

        if (error || !member || !member.email) {
          throw new Error(`Member not found or email not set for ID: ${recipient}`);
        }

        return member.email;
      } else if (recipient.startsWith("USER_")) {
        // member_code로 조회
        const { data: member, error } = await supabase
          .from("members")
          .select("email")
          .eq("member_code", recipient)
          .single();

        if (error || !member || !member.email) {
          throw new Error(`Member not found or email not set for member_code: ${recipient}`);
        }

        return member.email;
      }

      // 이메일 주소 형식이면 그대로 반환
      return recipient;
    };

    try {
      // 모든 recipients를 email 주소로 변환
      const emailAddresses = await Promise.all(
        recipients.map((recipient) => resolveEmailAddress(recipient))
      );

      const result = await sendBulkEmail(emailAddresses, subject, text, html);

      return successResponse(res, {
        message: `이메일 발송 완료: 성공 ${result.success}건, 실패 ${result.failed}건`,
        success: result.success,
        failed: result.failed,
        errors: result.errors,
      });
    } catch (error: any) {
      return errorResponse(res, "EMAIL_SEND_ERROR", "이메일 발송 실패", error.message);
    }
  })
);

/**
 * @swagger
 * /api/email/welcome:
 *   post:
 *     summary: 환영 이메일 발송
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - name
 *             properties:
 *               to:
 *                 type: string
 *                 description: 수신자 이메일 주소
 *               name:
 *                 type: string
 *                 description: 사용자 이름
 *               verificationLink:
 *                 type: string
 *                 description: 이메일 인증 링크 (선택사항)
 *     responses:
 *       200:
 *         description: 성공
 */
// POST /welcome - Send welcome email
router.post(
  "/welcome",
  asyncHandler(async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    const { to, name, verificationLink } = req.body;

    if (!to || !name) {
      return errorResponse(res, "INVALID_REQUEST", "수신자(to)와 이름(name)은 필수입니다.");
    }

    try {
      const template = emailTemplates.welcome(name, verificationLink);
      const result = await sendEmail({
        to,
        subject: template.subject,
        text: template.text,
        html: template.html,
      });

      return successResponse(res, {
        message: "환영 이메일이 성공적으로 발송되었습니다.",
        messageId: result.messageId,
      });
    } catch (error: any) {
      return errorResponse(res, "EMAIL_SEND_ERROR", "이메일 발송 실패", error.message);
    }
  })
);

/**
 * @swagger
 * /api/email/password-reset:
 *   post:
 *     summary: 비밀번호 재설정 이메일 발송
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - name
 *               - resetLink
 *             properties:
 *               to:
 *                 type: string
 *                 description: 수신자 이메일 주소
 *               name:
 *                 type: string
 *                 description: 사용자 이름
 *               resetLink:
 *                 type: string
 *                 description: 비밀번호 재설정 링크
 *     responses:
 *       200:
 *         description: 성공
 */
// POST /password-reset - Send password reset email
router.post(
  "/password-reset",
  asyncHandler(async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    const { to, name, resetLink } = req.body;

    if (!to || !name || !resetLink) {
      return errorResponse(
        res,
        "INVALID_REQUEST",
        "수신자(to), 이름(name), 재설정 링크(resetLink)는 필수입니다."
      );
    }

    try {
      const template = emailTemplates.passwordReset(name, resetLink);
      const result = await sendEmail({
        to,
        subject: template.subject,
        text: template.text,
        html: template.html,
      });

      return successResponse(res, {
        message: "비밀번호 재설정 이메일이 성공적으로 발송되었습니다.",
        messageId: result.messageId,
      });
    } catch (error: any) {
      return errorResponse(res, "EMAIL_SEND_ERROR", "이메일 발송 실패", error.message);
    }
  })
);

/**
 * @swagger
 * /api/email/withdrawal-request:
 *   post:
 *     summary: 출금 요청 알림 이메일 발송 (관리자용)
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - partnerName
 *               - amount
 *               - bankInfo
 *             properties:
 *               to:
 *                 type: string
 *                 description: 관리자 이메일 주소
 *               partnerName:
 *                 type: string
 *                 description: 파트너 이름
 *               amount:
 *                 type: integer
 *                 description: 출금 금액
 *               bankInfo:
 *                 type: string
 *                 description: 은행 정보
 *     responses:
 *       200:
 *         description: 성공
 */
// POST /withdrawal-request - Send withdrawal request notification email
router.post(
  "/withdrawal-request",
  asyncHandler(async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    const { to, partnerName, amount, bankInfo } = req.body;

    if (!to || !partnerName || !amount || !bankInfo) {
      return errorResponse(
        res,
        "INVALID_REQUEST",
        "수신자(to), 파트너명(partnerName), 금액(amount), 은행정보(bankInfo)는 필수입니다."
      );
    }

    try {
      const template = emailTemplates.withdrawalRequest(partnerName, amount, bankInfo);
      const result = await sendEmail({
        to,
        subject: template.subject,
        text: template.text,
        html: template.html,
      });

      return successResponse(res, {
        message: "출금 요청 알림 이메일이 성공적으로 발송되었습니다.",
        messageId: result.messageId,
      });
    } catch (error: any) {
      return errorResponse(res, "EMAIL_SEND_ERROR", "이메일 발송 실패", error.message);
    }
  })
);

/**
 * @swagger
 * /api/email/withdrawal-completed:
 *   post:
 *     summary: 출금 완료 알림 이메일 발송
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - partnerName
 *               - amount
 *             properties:
 *               to:
 *                 type: string
 *                 description: 파트너 이메일 주소
 *               partnerName:
 *                 type: string
 *                 description: 파트너 이름
 *               amount:
 *                 type: integer
 *                 description: 출금 금액
 *     responses:
 *       200:
 *         description: 성공
 */
// POST /withdrawal-completed - Send withdrawal completed email
router.post(
  "/withdrawal-completed",
  asyncHandler(async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    const { to, partnerName, amount } = req.body;

    if (!to || !partnerName || !amount) {
      return errorResponse(
        res,
        "INVALID_REQUEST",
        "수신자(to), 파트너명(partnerName), 금액(amount)는 필수입니다."
      );
    }

    try {
      const template = emailTemplates.withdrawalCompleted(partnerName, amount);
      const result = await sendEmail({
        to,
        subject: template.subject,
        text: template.text,
        html: template.html,
      });

      return successResponse(res, {
        message: "출금 완료 알림 이메일이 성공적으로 발송되었습니다.",
        messageId: result.messageId,
      });
    } catch (error: any) {
      return errorResponse(res, "EMAIL_SEND_ERROR", "이메일 발송 실패", error.message);
    }
  })
);

export default router;

