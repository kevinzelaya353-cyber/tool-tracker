import { Router } from "express";
import { z } from "zod";
import {
  id,
  personCreateSchema,
  userCreateSchema,
  userUpdateSchema,
  type PersonCreateInput,
  type UserCreateInput,
  type UserUpdateInput,
} from "@tt/shared";
import { authorize, currentUser } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import type { UsersService } from "./users.service.js";

const idParams = z.object({ id });
const listQuery = z.object({ includeInactive: z.enum(["true", "false"]).optional() });

/** Montar detrás de `authenticate`. */
export function usersRouter(users: UsersService) {
  const r = Router();

  r.get("/", authorize("users:read"), validate("query", listQuery), async (_req, res) => {
    const q = res.locals.query as z.infer<typeof listQuery>;
    res.json(await users.list(currentUser(res), { includeInactive: q.includeInactive === "true" }));
  });

  r.post("/", authorize("users:manage"), validate("body", userCreateSchema), async (req, res) => {
    const user = await users.create(currentUser(res), res.locals.body as UserCreateInput, req.ip);
    res.status(201).json(user);
  });

  // Quien administra catálogos puede registrar a quien entrega o recibe sin crearle una cuenta.
  r.post("/people", authorize("catalog:write"), validate("body", personCreateSchema), async (req, res) => {
    const person = await users.createPerson(currentUser(res), res.locals.body as PersonCreateInput, req.ip);
    res.status(201).json(person);
  });

  r.patch(
    "/:id",
    authorize("users:manage"),
    validate("params", idParams),
    validate("body", userUpdateSchema),
    async (req, res) => {
      const { id: userId } = res.locals.params as z.infer<typeof idParams>;
      res.json(await users.update(currentUser(res), userId, res.locals.body as UserUpdateInput, req.ip));
    },
  );

  return r;
}
