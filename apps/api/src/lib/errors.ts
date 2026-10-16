export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }

  static badRequest(code: string, message: string, details?: unknown) {
    return new AppError(400, code, message, details);
  }
  static unauthorized(message = "No autenticado") {
    return new AppError(401, "UNAUTHORIZED", message);
  }
  static forbidden(message = "Sin permisos") {
    return new AppError(403, "FORBIDDEN", message);
  }
  static notFound(entity: string) {
    return new AppError(404, "NOT_FOUND", `${entity} no encontrado`);
  }
  static conflict(code: string, message: string, details?: unknown) {
    return new AppError(409, code, message, details);
  }
}
