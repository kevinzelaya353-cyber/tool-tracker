import type { PrismaClient } from "@prisma/client";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import type { Env } from "./config/env.js";
import { authenticate } from "./middleware/auth.js";
import { errorHandler, notFound } from "./middleware/error-handler.js";
import { auditRouter } from "./modules/audit/audit.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { prismaRefreshStore } from "./modules/auth/refresh-store.prisma.js";
import { TokenService } from "./modules/auth/token.service.js";
import { catalogRouter } from "./modules/catalog/catalog.routes.js";
import { CatalogService } from "./modules/catalog/catalog.service.js";
import { lifecycleRouter } from "./modules/lifecycle/lifecycle.routes.js";
import { LifecycleService } from "./modules/lifecycle/lifecycle.service.js";
import { mediaRouter } from "./modules/media/media.routes.js";
import { MediaService } from "./modules/media/media.service.js";
import type { ObjectStorage } from "./modules/media/storage.js";
import { ExportService } from "./modules/reports/export.service.js";
import { exportRouter, reportsRouter } from "./modules/reports/reports.routes.js";
import { ReportsService } from "./modules/reports/reports.service.js";
import { toolsRouter } from "./modules/tools/tools.routes.js";
import { ToolsService } from "./modules/tools/tools.service.js";
import { transfersRouter } from "./modules/transfers/transfers.routes.js";
import { TransfersService } from "./modules/transfers/transfers.service.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { UsersService } from "./modules/users/users.service.js";

type AppEnv = Pick<Env, "NODE_ENV" | "CORS_ORIGINS"> &
  Partial<
    Pick<
      Env,
      | "JWT_ACCESS_SECRET"
      | "JWT_REFRESH_SECRET"
      | "ACCESS_TTL_MIN"
      | "REFRESH_TTL_DAYS"
      | "MEDIA_URL_TTL_SEC"
      | "MEDIA_ORPHAN_TTL_HOURS"
      | "REPORTS_TZ"
      | "TRUST_PROXY"
    >
  >;

/** Sin `prisma` solo se montan /health y los middlewares base (útil para tests sin BD). */
export function createApp(
  env: AppEnv,
  deps?: { prisma: PrismaClient; storage?: ObjectStorage; filesRouter?: express.Router },
) {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY ?? 0);

  app.use(
    pinoHttp({
      enabled: env.NODE_ENV !== "test",
      redact: ["req.headers.authorization", "req.headers.cookie", "req.body.password", "req.body.refreshToken"],
    }),
  );
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: false }));
  app.use(express.json({ limit: "100kb" })); // las fotos van por /media, no por JSON
  app.use(
    "/api",
    rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: "draft-7", legacyHeaders: false }),
  );

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Fotos en disco (STORAGE_DRIVER=local): fuera de /api, autorizadas por URL firmada.
  if (deps?.filesRouter) app.use("/files", deps.filesRouter);

  if (deps) {
    const { prisma } = deps;
    if (!env.JWT_ACCESS_SECRET || !env.JWT_REFRESH_SECRET) throw new Error("Faltan secretos JWT");

    const tokens = new TokenService(
      {
        accessSecret: env.JWT_ACCESS_SECRET,
        refreshSecret: env.JWT_REFRESH_SECRET,
        accessTtlMin: env.ACCESS_TTL_MIN ?? 15,
        refreshTtlDays: env.REFRESH_TTL_DAYS ?? 30,
      },
      prismaRefreshStore(prisma),
    );
    const requireAuth = authenticate(tokens);

    app.use("/api/auth", authRouter(new AuthService(prisma, tokens), requireAuth));
    app.use("/api/users", requireAuth, usersRouter(new UsersService(prisma, tokens)));
    app.use("/api/audit", requireAuth, auditRouter(prisma));
    app.use("/api/tools", requireAuth, toolsRouter(new ToolsService(prisma)));
    app.use("/api/transfers", requireAuth, transfersRouter(new TransfersService(prisma)));
    app.use("/api/lifecycle-events", requireAuth, lifecycleRouter(new LifecycleService(prisma)));
    app.use("/api/reports/export", requireAuth, exportRouter(new ExportService(prisma, deps.storage)));
    app.use("/api/reports", requireAuth, reportsRouter(new ReportsService(prisma, env.REPORTS_TZ ?? "UTC")));
    if (deps.storage) {
      const media = new MediaService(prisma, deps.storage, {
        urlTtlSec: env.MEDIA_URL_TTL_SEC ?? 600,
        orphanTtlHours: env.MEDIA_ORPHAN_TTL_HOURS ?? 24,
      });
      app.use("/api/media", requireAuth, mediaRouter(media));
    }
    // /api/categories, /api/locations, /api/vehicles. Va al final: cualquier otra ruta /api
    // sin token responde 401 (no revela qué rutas existen).
    app.use("/api", requireAuth, catalogRouter(new CatalogService(prisma)));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
