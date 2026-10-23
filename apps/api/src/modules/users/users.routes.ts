import { Router } from "express";
import { z } from "zod";
import {
  id,
  passwordResetSchema,
  personCreateSchema,
  userCreateSchema,
  userUpdateSchema,
  type PasswordResetInput,
  type PersonCreateInput,
  type UserCreateInput,
  type UserUpdateInput,
} from "@tt/shared";
import { authorize, currentUser, forbidDuringImpersonation } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import type { UsersService } from "./users.service.js";

const idParams = z.object({ id });
const listQuery = z.object({ includeInactive: z.enum(["true", "false"]).optional() });

/**
 * Montar detrás de `authenticate`. Usuarios de la organización del contexto. Las escrituras sobre
 * cuentas y credenciales no se permiten desde una sesión de soporte (impersonación).
 */
export function usersRouter(users: UsersService) {
  const r = Router();
  const manage = [authorize("users:manage"), forbidDuringImpersonation];
  const userId = (res: { locals: Record<string, unknown> }) => (res.locals.params as z.infer<typeof idParams>).id;

  r.get("/", authorize("users:read"), validate("query", listQuery), async (_req, res) => {
    const q = res.locals.query as z.infer<typeof listQuery>;
    res.json(await users.list(currentUser(res), { includeInactive: q.includeInactive === "true" }));
  });

  r.post("/", ...manage, validate("body", userCreateSchema), async (req, res) => {
    const user = await users.create(currentUser(res), res.locals.body as UserCreateInput, req.ip);
    res.status(201).json(user);
  });

  // Quien administra catálogos puede registrar a quien entrega o recibe sin crearle una cuenta.
  r.post("/people", authorize("catalog:write"), validate("body", personCreateSchema), async (req, res) => {
    const person = await users.createPerson(currentUser(res), res.locals.body as PersonCreateInput, req.ip);
    res.status(201).json(person);
  });

  r.get("/:id", authorize("users:manage"), validate("params", idParams), async (_req, res) => {
    res.json(await users.get(userId(res)));
  });

  r.patch("/:id", ...manage, validate("params", idParams), validate("body", userUpdateSchema), async (req, res) => {
    res.json(await users.update(currentUser(res), userId(res), res.locals.body as UserUpdateInput, req.ip));
  });

  r.post("/:id/reset-password", ...manage, validate("params", idParams), validate("body", passwordResetSchema), async (req, res) => {
    res.json(await users.resetPassword(currentUser(res), userId(res), res.locals.body as PasswordResetInput, req.ip));
  });

  r.post("/:id/revoke-sessions", ...manage, validate("params", idParams), async (req, res) => {
    res.json(await users.revokeSessions(currentUser(res), userId(res), req.ip));
  });

  r.delete("/:id", ...manage, validate("params", idParams), async (req, res) => {
    await users.remove(currentUser(res), userId(res), req.ip);
    res.status(204).end();
  });

  return r;
}
