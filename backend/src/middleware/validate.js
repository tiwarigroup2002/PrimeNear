const ApiError = require('../utils/ApiError');

/**
 * Validates req[source] against a Joi schema and replaces it with the
 * sanitised value (unknown keys stripped, types converted).
 */
function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const { value, error } = schema.validate(req[source] || {}, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    if (error) {
      const details = error.details.map((d) => ({ field: d.path.join('.'), message: d.message.replace(/"/g, '') }));
      return next(ApiError.badRequest(details[0].message, details));
    }
    if (source === 'query') {
      // req.query is a getter in Express 5, store the parsed copy separately
      req.validatedQuery = value;
    } else {
      req[source] = value;
    }
    return next();
  };
}

module.exports = validate;
