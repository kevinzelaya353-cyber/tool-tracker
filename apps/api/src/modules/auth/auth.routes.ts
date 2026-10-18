import { Router, type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { loginSchema, refreshSchema, type LoginInput, type RefreshInput } from "@tt/shared";
import { currentUser } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import type { AuthService } from "./auth.service.js";

const loginLimiter = () =>
  rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: { code: "TOO_MANY_ATTEMPTS", message: "Demasiados intentos, espera unos minutos" } },
});

// Por cuenta: frena fuerza bruta distribuida (muchas IPs contra un mismo usuario).
const loginAccountLimiter = () =>
  rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => `acct:${String((req.body as { username?: unknown })?.username ?? "").trim().toLowerCase()}`,
  message: { error: { code: "TOO_MANY_ATTEMPTS", message: "Demasiados intentos, espera unos minutos" } },
});

const refreshLimiter = () =>
  rateLimit({ windowMs: 15 * 60_000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false });

const passThrough: RequestHandler = (_req, _res, next) => next();

/**
 * Los limitadores se crean por router (cada app, su propio contador). En pruebas se desactivan:
 * los casos de bloqueo por PIN necesitan más fallos seguidos que el límite por IP.
 */
export function authRouter(auth: AuthService, requireAuth: RequestHandler, opts: { rateLimit?: boolean } = {}) {
  const r = Router();
  const on = opts.rateLimit ?? true;
  const login = on ? [loginLimiter(), loginAccountLimiter()] : [passThrough];
  const refresh = on ? refreshLimiter() : passThrough;

  r.post("/login", ...login, validate("body", loginSchema), async (req, res) => {
    const result = await auth.login(res.locals.body as LoginInput, req.ip);
    res.json(result);
  });

  r.post("/refresh", refresh, validate("body", refreshSchema), async (req, res) => {
    const { refreshToken } = res.locals.body as RefreshInput;
    res.json(await auth.refresh(refreshToken, req.ip));
  });

  // No exige access token: debe poder cerrarse sesión aunque el access haya expirado.
  r.post("/logout", refresh, validate("body", refreshSchema), async (req, res) => {
    const { refreshToken } = res.locals.body as RefreshInput;
    await auth.logout(refreshToken, req.ip);
    res.status(204).end();
  });

  r.get("/me", requireAuth, async (_req, res) => {
    res.json(await auth.me(currentUser(res).userId));
  });

  return r;
}
