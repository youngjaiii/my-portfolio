import nodemailer from "nodemailer";
import { Resend } from "resend";

/**
 * 이메일 전송 설정 타입
 */
interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
}

/**
 * Primary 이메일 전송 설정 가져오기 (AWS SES)
 */
function getPrimaryEmailConfig(): EmailConfig | null {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587");
  const secure = process.env.SMTP_SECURE === "true"; // true for 465, false for other ports
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM || user;

  if (!user || !password) {
    console.error("❌ Primary SMTP credentials not configured");
    return null;
  }

  return {
    host,
    port,
    secure,
    auth: {
      user,
      pass: password,
    },
    from: from!,
  };
}

/**
 * Resend 설정 가져오기 (Fallback)
 */
function getResendConfig(): { apiKey: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || process.env.SMTP_FROM;

  if (!apiKey) {
    console.warn("⚠️  Resend API key not configured");
    return null;
  }

  if (!from) {
    console.warn("⚠️  Resend from address not configured");
    return null;
  }

  return {
    apiKey,
    from,
  };
}

/**
 * 이메일 전송기 생성
 */
function createTransporter(config: EmailConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });
}

/**
 * 이메일 발송 인터페이스
 */
export interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}

/**
 * 단일 이메일 발송 (Primary 실패 시 Fallback 사용)
 */
export async function sendEmail(options: EmailOptions): Promise<any> {
  const primaryConfig = getPrimaryEmailConfig();
  if (!primaryConfig) {
    throw new Error("Primary SMTP configuration is missing");
  }

  const mailOptions = {
    from: primaryConfig.from,
    to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  };

  // Primary SMTP (AWS SES)로 먼저 시도
  try {
    const transporter = createTransporter(primaryConfig);
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully via Primary SMTP:", info.messageId);
    return {
      success: true,
      messageId: info.messageId,
      response: info.response,
      provider: "primary",
    };
  } catch (primaryError: any) {
    console.error("❌ Primary SMTP (AWS SES) failed:", primaryError.message);

    // Fallback Resend로 재시도
    const resendConfig = getResendConfig();
    if (!resendConfig) {
      console.error("❌ No fallback Resend configured, email send failed");
      throw primaryError; // Fallback이 없으면 원래 에러를 throw
    }

    try {
      console.log("🔄 Attempting to send email via Resend (Fallback)...");
      const resend = new Resend(resendConfig.apiKey);

      // Resend는 배열로 받음
      const recipients = Array.isArray(options.to) ? options.to : [options.to];

      // Resend는 html 또는 text 중 하나는 필수
      const emailPayload: any = {
        from: resendConfig.from,
        to: recipients,
        subject: options.subject,
      };

      if (options.html) {
        emailPayload.html = options.html;
      }
      if (options.text) {
        emailPayload.text = options.text;
      }

      // html과 text가 모두 없으면 text를 기본값으로 설정
      if (!emailPayload.html && !emailPayload.text) {
        emailPayload.text = options.subject;
      }

      const { data, error } = await resend.emails.send(emailPayload);

      if (error) {
        throw new Error(error.message || "Resend API error");
      }

      console.log("✅ Email sent successfully via Resend (Fallback):", data?.id);
      console.warn("⚠️  Primary SMTP failed, but email was sent via Resend");
      
      return {
        success: true,
        messageId: data?.id,
        response: "Resend API",
        provider: "resend",
        primaryError: primaryError.message,
      };
    } catch (fallbackError: any) {
      console.error("❌ Resend (Fallback) also failed:", fallbackError.message);
      // 두 방법 모두 실패한 경우 원래 에러를 throw
      throw new Error(
        `Both Primary SMTP and Resend failed. Primary: ${primaryError.message}, Resend: ${fallbackError.message}`
      );
    }
  }
}

/**
 * 여러 수신자에게 이메일 발송
 */
export async function sendBulkEmail(
  recipients: string[],
  subject: string,
  text?: string,
  html?: string
): Promise<{ success: number; failed: number; errors: any[] }> {
  const results = {
    success: 0,
    failed: 0,
    errors: [] as any[],
  };

  for (const recipient of recipients) {
    try {
      await sendEmail({
        to: recipient,
        subject,
        text,
        html,
      });
      results.success++;
    } catch (error: any) {
      results.failed++;
      results.errors.push({
        recipient,
        error: error.message,
      });
    }
  }

  return results;
}

/**
 * 이메일 템플릿 헬퍼
 */
export const emailTemplates = {
  /**
   * 환영 이메일
   */
  welcome: (name: string, verificationLink?: string) => ({
    subject: "MateYou에 오신 것을 환영합니다!",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 5px 5px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 MateYou에 오신 것을 환영합니다!</h1>
          </div>
          <div class="content">
            <p>안녕하세요, <strong>${name}</strong>님!</p>
            <p>MateYou 서비스에 가입해 주셔서 감사합니다.</p>
            ${verificationLink ? `
            <p>아래 버튼을 클릭하여 이메일을 인증해주세요:</p>
            <a href="${verificationLink}" class="button">이메일 인증하기</a>
            ` : ""}
            <p>궁금한 점이 있으시면 언제든지 문의해주세요.</p>
            <p>감사합니다.<br>MateYou 팀</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      안녕하세요, ${name}님!
      
      MateYou 서비스에 가입해 주셔서 감사합니다.
      ${verificationLink ? `이메일 인증: ${verificationLink}` : ""}
      
      궁금한 점이 있으시면 언제든지 문의해주세요.
      
      감사합니다.
      MateYou 팀
    `,
  }),

  /**
   * 비밀번호 재설정 이메일
   */
  passwordReset: (name: string, resetLink: string) => ({
    subject: "MateYou 비밀번호 재설정",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #DC2626; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 5px 5px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #DC2626; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
          .warning { background-color: #FEF2F2; border-left: 4px solid #DC2626; padding: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔒 비밀번호 재설정</h1>
          </div>
          <div class="content">
            <p>안녕하세요, <strong>${name}</strong>님!</p>
            <p>비밀번호 재설정을 요청하셨습니다.</p>
            <div class="warning">
              <p><strong>⚠️ 주의:</strong> 이 링크는 1시간 후에 만료됩니다.</p>
            </div>
            <p>아래 버튼을 클릭하여 비밀번호를 재설정하세요:</p>
            <a href="${resetLink}" class="button">비밀번호 재설정하기</a>
            <p>만약 비밀번호 재설정을 요청하지 않으셨다면, 이 이메일을 무시하셔도 됩니다.</p>
            <p>감사합니다.<br>MateYou 팀</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      안녕하세요, ${name}님!
      
      비밀번호 재설정을 요청하셨습니다.
      아래 링크를 클릭하여 비밀번호를 재설정하세요:
      ${resetLink}
      
      ⚠️ 주의: 이 링크는 1시간 후에 만료됩니다.
      
      만약 비밀번호 재설정을 요청하지 않으셨다면, 이 이메일을 무시하셔도 됩니다.
      
      감사합니다.
      MateYou 팀
    `,
  }),

  /**
   * 출금 요청 알림 (관리자용)
   */
  withdrawalRequest: (partnerName: string, amount: number, bankInfo: string) => ({
    subject: `[MateYou] 출금 요청 알림 - ${amount.toLocaleString()}원`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #059669; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 5px 5px; }
          .info-box { background-color: white; border: 1px solid #e5e7eb; border-radius: 5px; padding: 20px; margin: 20px 0; }
          .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
          .info-row:last-child { border-bottom: none; }
          .label { font-weight: bold; color: #6b7280; }
          .value { color: #111827; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>💰 출금 요청 알림</h1>
          </div>
          <div class="content">
            <p>새로운 출금 요청이 접수되었습니다.</p>
            <div class="info-box">
              <div class="info-row">
                <span class="label">파트너명:</span>
                <span class="value">${partnerName}</span>
              </div>
              <div class="info-row">
                <span class="label">출금 금액:</span>
                <span class="value">${amount.toLocaleString()}원</span>
              </div>
              <div class="info-row">
                <span class="label">은행 정보:</span>
                <span class="value">${bankInfo}</span>
              </div>
            </div>
            <p>관리자 페이지에서 확인 후 처리해주세요.</p>
            <p>감사합니다.<br>MateYou 팀</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      새로운 출금 요청이 접수되었습니다.
      
      파트너명: ${partnerName}
      출금 금액: ${amount.toLocaleString()}원
      은행 정보: ${bankInfo}
      
      관리자 페이지에서 확인 후 처리해주세요.
      
      감사합니다.
      MateYou 팀
    `,
  }),

  /**
   * 출금 완료 알림
   */
  withdrawalCompleted: (partnerName: string, amount: number) => ({
    subject: `[MateYou] 출금이 완료되었습니다 - ${amount.toLocaleString()}원`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #059669; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 5px 5px; }
          .success-box { background-color: #D1FAE5; border-left: 4px solid #059669; padding: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ 출금 완료</h1>
          </div>
          <div class="content">
            <p>안녕하세요, <strong>${partnerName}</strong>님!</p>
            <div class="success-box">
              <p><strong>출금이 완료되었습니다.</strong></p>
              <p>출금 금액: <strong>${amount.toLocaleString()}원</strong></p>
            </div>
            <p>출금 금액은 등록하신 계좌로 입금되었습니다.</p>
            <p>감사합니다.<br>MateYou 팀</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      안녕하세요, ${partnerName}님!
      
      출금이 완료되었습니다.
      출금 금액: ${amount.toLocaleString()}원
      
      출금 금액은 등록하신 계좌로 입금되었습니다.
      
      감사합니다.
      MateYou 팀
    `,
  }),
};

