const { z } = require('zod');

/**
 * validate(schema) — reusable zod validation middleware.
 *
 * Usage:  router.post('/login', validate(loginSchema), handler)
 *
 * On success it REPLACES req.body with the parsed result, so downstream
 * handlers receive clean, typed data with unknown keys stripped (zod object
 * defaults to stripping extras — non-breaking, never rejects unexpected fields).
 * On failure it returns 400 with a structured list of field errors.
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map(i => ({
        field: i.path.join('.') || 'body',
        message: i.message,
      }));
      // Surface the first issue as the top-level `error` so existing frontend
      // error handling (which reads `.error`) still shows a friendly message.
      return res.status(400).json({ error: details[0].message, details });
    }
    req.body = result.data;
    next();
  };
}

// ─── Shared schemas ─────────────────────────────────────────────────────────────

// Note: email is trimmed but NOT lowercased — keeps lookups byte-identical to the
// existing data. (If you later normalize emails to lowercase, migrate stored rows
// in the same change so existing accounts don't break.)
const registerSchema = z.object({
  email:    z.string().trim().email('A valid email is required').max(254),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  name:     z.string().trim().max(120).optional().nullable(),
});

const loginSchema = z.object({
  email:    z.string().trim().email('A valid email is required').max(254),
  password: z.string().min(1, 'Password is required').max(200),
});

module.exports = { validate, z, registerSchema, loginSchema };
