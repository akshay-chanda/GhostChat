/**
 * Wraps a Zod schema as Express middleware. On success, req.body is
 * replaced with the parsed/coerced data so downstream controllers
 * only ever see values that matched the schema. On failure, returns
 * a 400 without leaking Zod's internal error structure — just enough
 * detail for the client to fix the request.
 */
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        code: 'generic',
        message: 'The request was invalid.',
        fields: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      });
    }
    req.body = result.data;
    next();
  };
}

module.exports = { validateBody };
