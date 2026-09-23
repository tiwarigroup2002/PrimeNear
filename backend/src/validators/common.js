const Joi = require('joi');

const objectId = () => Joi.string().hex().length(24);
const mobile = () => Joi.string().pattern(/^[6-9]\d{9}$/).messages({ 'string.pattern.base': 'Mobile number must be a valid 10 digit Indian number' });
const password = () =>
  Joi.string()
    .min(8)
    .max(64)
    .pattern(/[A-Z]/, 'uppercase')
    .pattern(/[a-z]/, 'lowercase')
    .pattern(/\d/, 'number')
    .pattern(/[^A-Za-z0-9]/, 'special')
    .messages({ 'string.pattern.name': 'Password must contain an uppercase letter, a lowercase letter, a number and a special character' });

const listQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(20),
  search: Joi.string().allow('').max(100),
  sortBy: Joi.string().allow('').max(50),
  sortDir: Joi.string().valid('asc', 'desc').default('desc'),
  from: Joi.string().isoDate().allow(''),
  to: Joi.string().isoDate().allow(''),
}).unknown(true);

module.exports = { Joi, objectId, mobile, password, listQuery };
