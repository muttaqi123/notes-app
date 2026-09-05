/**
 * The one error type the service layer throws. It carries an HTTP status
 * because that is the only thing the HTTP layer needs to know about a
 * failure — the services never build a response themselves.
 */
export class ApiError extends Error {
  constructor(status, message, code = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  static badRequest(msg, code) { return new ApiError(400, msg, code); }
  static unauthorized(msg = 'Not authenticated', code) { return new ApiError(401, msg, code); }
  static forbidden(msg = 'Not allowed', code) { return new ApiError(403, msg, code); }
  static notFound(msg = 'Not found', code) { return new ApiError(404, msg, code); }
  static conflict(msg, code) { return new ApiError(409, msg, code); }
}
