import type { AccessClaims } from "../modules/auth/token.service.js";

declare global {
  namespace Express {
    interface Locals {
      /** Lo establece el middleware `authenticate`. */
      auth?: AccessClaims;
    }
  }
}

export {};
