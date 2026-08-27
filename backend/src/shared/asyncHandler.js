// Wraps an async route handler so any rejected promise is forwarded to
// Express's error-handling middleware. Express 4 does not catch errors thrown
// from async handlers, so without this every handler needs its own
// `try { ... } catch (e) { next(e); }` block. Wrapping centralizes that.
//
//   router.get('/', asyncHandler(async (req, res) => { ... }));
//
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { asyncHandler };
