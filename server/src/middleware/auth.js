import { verifyAccessToken } from '../utils/tokens.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Reads the access token from the Authorization header and puts the user id
 * on the request. This is the ONLY place a route learns who is calling; no
 * controller reads a header itself.
 */
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(ApiError.unauthorized('Missing access token', 'no_token'));
  }

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    return next();
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    return next(
      ApiError.unauthorized(
        expired ? 'Access token expired' : 'Invalid access token',
        expired ? 'token_expired' : 'bad_token'
      )
    );
  }
}
