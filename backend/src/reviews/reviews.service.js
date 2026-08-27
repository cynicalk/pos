const repo = require('./reviews.repository');
const { validateTimezone } = require('../shared/timezone');

const list = (restaurantId, { from, to, rating, timezone = 'UTC' } = {}) =>
  repo.list(restaurantId, {
    from:     from || null,
    to:       to || null,
    rating:   rating ? parseInt(rating, 10) : null,
    timezone: validateTimezone(timezone),
  });

module.exports = { list };
