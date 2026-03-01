import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { Application } from "express";

const options = {
  definition: {
    openapi: "3.1.0",
    info: {
      title: "MateYou Backend API",
      version: "1.0.0",
      description: "MateYou backend with TossPayments Payout integration",
      contact: {
        name: "MateYou API Support",
        email: "support@mateyou.com"
      },
      license: {
        name: "ISC"
      }
    },
    servers: [
      { 
        url: "http://localhost:4000",
        description: "Local development server"
      },
      {
        url: process.env.API_URL || "https://api.mateyou.com",
        description: "Production server"
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Supabase JWT 토큰을 사용한 인증\n\n토큰 발급 방법:\n1. 프론트엔드에서 Supabase 클라이언트로 로그인/회원가입\n2. session.access_token 또는 sessionData.session.access_token 사용\n3. 또는 supabase.auth.getSession()으로 세션에서 토큰 추출\n\n예시:\n```javascript\nconst { data: { session } } = await supabase.auth.signInWithPassword({\n  email: 'user@example.com',\n  password: 'password'\n});\nconst token = session?.access_token;\n```"
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ["./src/routes/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);

export function swaggerDocs(app: Application, port: number) {
  try {
    // Swagger 스펙 검증
    const spec = swaggerSpec as any;
    if (!spec || !spec.paths) {
      console.error("❌ Swagger spec is invalid or empty");
      return;
    }

    app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
      customCss: ".swagger-ui .topbar { display: none }",
      customSiteTitle: "MateYou API Documentation",
      customfavIcon: "/favicon.ico",
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
      }
    }));

    // Swagger JSON 엔드포인트
    app.get("/swagger.json", (req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.send(swaggerSpec);
    });

    console.log(`📚 Swagger UI: http://localhost:${port}/docs`);
    console.log(`📄 Swagger JSON: http://localhost:${port}/swagger.json`);
  } catch (error) {
    console.error("❌ Error setting up Swagger:", error);
  }
}
