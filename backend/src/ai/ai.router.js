const router = require('express').Router();
const service = require('./ai.service');
const repo = require('./ai.repository');
const llm = require('./llm.client');
const { authenticate, authorize } = require('../shared/middleware/auth');
const { rateLimit } = require('../shared/middleware/rateLimit');
const { asyncHandler } = require('../shared/asyncHandler');

router.use(authenticate, authorize('admin', 'staff'));

// Chat turns drive the LLM (and writes), so cap them per user to bound cost and
// prevent a single account from hammering the model or the write path.
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  key: (req) => `ai:${req.user.userId}`,
  message: 'Too many AI requests, please slow down',
});

// Liveness for the chat UI — lets the bubble hide itself when the model is down.
// `enabled: false` means the operator turned the assistant off for this
// restaurant (feature hidden), as opposed to `ok: false` (model unreachable).
router.get('/status', asyncHandler(async (req, res) => {
  if (!(await repo.getAiEnabled(req.user.restaurantId))) {
    return res.json({ ok: false, enabled: false });
  }
  res.json({ enabled: true, ...(await llm.healthCheck()) });
}));

// One chat turn, streamed as SSE:
//   data: {"type":"text","delta":"..."}
//   data: {"type":"confirm_required","tool":"...","args":{...},"summary":"..."}
//   data: {"type":"error","message":"..."}
//   data: {"type":"done"}
router.post('/chat', chatLimiter, async (req, res, next) => {
  // Reject before headers are flushed so this travels as a normal JSON error
  try {
    if (!(await repo.getAiEnabled(req.user.restaurantId))) {
      return res.status(403).json({ error: 'The AI assistant is disabled for this restaurant' });
    }
  } catch (e) { return next(e); }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable buffering in nginx-style reverse proxies
  });
  res.flushHeaders();

  let clientGone = false;
  req.on('close', () => { clientGone = true; });

  const send = (ev) => {
    if (!clientGone) res.write(`data: ${JSON.stringify(ev)}\n\n`);
  };

  try {
    const turn = service.streamChat({
      sessionId:    req.body.sessionId,
      restaurantId: req.user.restaurantId,
      userId:       req.user.userId,
      role:         req.user.role,
      message:      req.body.message,
    });
    for await (const ev of turn) {
      if (clientGone) break;
      send(ev);
    }
  } catch (err) {
    // Headers are already sent — errors must travel inside the stream
    console.error('[ai/chat]', err);
    send({ type: 'error', message: err.statusCode ? err.message : 'AI service error' });
    send({ type: 'done' });
  }
  res.end();
});

// Execute or decline a write action previously offered via confirm_required
router.post('/confirm', chatLimiter, asyncHandler(async (req, res) => {
  if (!(await repo.getAiEnabled(req.user.restaurantId))) {
    return res.status(403).json({ error: 'The AI assistant is disabled for this restaurant' });
  }
  res.json(
    await service.confirmAction({
      sessionId:    req.body.sessionId,
      restaurantId: req.user.restaurantId,
      userId:       req.user.userId,
      role:         req.user.role,
      tool:         req.body.tool,
      args:         req.body.args,
      confirmed:    req.body.confirmed === true,
      summary:      req.body.summary,
    }),
  );
}));

module.exports = router;
