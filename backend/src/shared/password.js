const { ValidationError } = require('./errors');

// One password policy for every human account — restaurant staff AND platform
// operators (previously operators had a weaker ≥8 no-complexity rule — UR2):
// at least 10 chars, at most 128, with an uppercase letter and a digit.
function assertStrongPassword(password) {
  if (typeof password !== 'string' || password.length < 10) {
    throw new ValidationError('Password must be at least 10 characters');
  }
  if (password.length > 128) {
    throw new ValidationError('Password must be at most 128 characters');
  }
  if (!/[A-Z]/.test(password)) {
    throw new ValidationError('Password must contain at least one uppercase letter');
  }
  if (!/[0-9]/.test(password)) {
    throw new ValidationError('Password must contain at least one number');
  }
}

module.exports = { assertStrongPassword };
