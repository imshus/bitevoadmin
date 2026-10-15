// HTTP errors with friendly messages, plus small request helpers shared by the routes.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const badRequest = message => new HttpError(400, message);
export const unauthorized = (message = 'Please sign in again.') => new HttpError(401, message);
export const forbidden = message => new HttpError(403, message);
export const notFound = (message = 'This record no longer exists.') => new HttpError(404, message);
export const conflict = message => new HttpError(409, message);

// Copies only the allowed fields from a request body (stops clients from setting _id, createdAt, …).
export function pick(body, fields) {
  const out = {};
  for (const f of fields) if (body && Object.prototype.hasOwnProperty.call(body, f)) out[f] = body[f];
  return out;
}

export const nowIso = () => new Date().toISOString();
export const DAY = 86400000;

export function startOfToday(now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Express error handler: known errors keep their message, anything else becomes a generic 500.
export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That file is too large.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request body is not valid JSON.' });
  if (err.code === 11000) return res.status(409).json({ error: 'That value is already in use.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
}
