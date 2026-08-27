const repo = require('./labour.repository');
const hours = require('../modules/labour/hours');
const { ValidationError, NotFoundError } = require('../shared/errors');

const REVIEW_WINDOW_DAYS = 30;

const listShifts = (restaurantId, from, to) => repo.listShifts(restaurantId, from, to);
const listStaffRates = (restaurantId) => repo.listStaffRates(restaurantId);

async function setStaffRate(userId, restaurantId, rate) {
  const value = Number(rate);
  if (!Number.isFinite(value) || value < 0) {
    throw new ValidationError('An hourly rate must be zero or more');
  }
  const updated = await repo.setStaffRate(userId, restaurantId, value);
  if (!updated) throw new NotFoundError('User');
  return updated;
}

/**
 * Resolve the rate to snapshot onto a shift.
 *
 * A shift cannot be logged without one. The alternative — defaulting to zero —
 * would silently record free labour and understate every prime cost that reads
 * it, which is precisely the number this feature exists to make honest.
 */
async function resolveRate(userId, restaurantId, explicitRate) {
  if (explicitRate != null && explicitRate !== '') {
    const value = Number(explicitRate);
    if (!Number.isFinite(value) || value < 0) {
      throw new ValidationError('An hourly rate must be zero or more');
    }
    return value;
  }
  const staff = await repo.getStaffRate(userId, restaurantId);
  if (!staff) throw new NotFoundError('User');
  if (staff.hourly_rate == null) {
    throw new ValidationError(
      `No hourly rate is set for ${staff.name || 'this staff member'}. ` +
      'Set one before logging their hours, or pass a rate with the shift.',
    );
  }
  return Number(staff.hourly_rate);
}

/** Log a completed shift directly — the manual labour-cost path. */
async function logShift(restaurantId, { userId, workDate, hours: worked, hourlyRate }) {
  if (!userId) throw new ValidationError('userId is required');
  if (!workDate) throw new ValidationError('workDate is required');

  const value = Number(worked);
  if (!Number.isFinite(value) || value <= 0) {
    throw new ValidationError('hours must be above zero');
  }
  if (value > hours.MAX_SHIFT_HOURS) {
    throw new ValidationError(`A single shift cannot exceed ${hours.MAX_SHIFT_HOURS} hours`);
  }

  const rate = await resolveRate(userId, restaurantId, hourlyRate);
  return repo.createShift(restaurantId, {
    userId, workDate, hours: value, hourlyRate: rate, status: 'completed',
  });
}

async function clockIn(restaurantId, userId, hourlyRate) {
  const existing = await repo.getActiveShift(restaurantId, userId);
  if (existing) throw new ValidationError('This staff member is already clocked in');
  const rate = await resolveRate(userId, restaurantId, hourlyRate);
  return repo.clockIn(restaurantId, { userId, hourlyRate: rate });
}

/**
 * Close a running shift, deriving hours from the stamps.
 *
 * hoursBetween clamps to [0, MAX_SHIFT_HOURS]; the review list separately
 * surfaces any shift whose stamps say the stored value can't be trusted.
 */
async function clockOut(restaurantId, userId) {
  const shift = await repo.getActiveShift(restaurantId, userId);
  if (!shift) throw new ValidationError('This staff member is not clocked in');
  const worked = hours.hoursBetween(shift.clock_in_at, new Date());
  return repo.closeShift(shift.id, restaurantId, worked);
}

async function deleteShift(id, restaurantId) {
  const removed = await repo.deleteShift(id, restaurantId);
  if (!removed) throw new NotFoundError('Shift');
  return removed;
}

/** Shifts whose clock stamps disagree with their stored hours. */
async function getShiftsForReview(restaurantId) {
  const rows = await repo.getShiftsForReview(restaurantId, REVIEW_WINDOW_DAYS);
  const now = new Date();
  return rows
    .map((row) => {
      const review = hours.reviewShift(row.clock_in_at, row.clock_out_at, now);
      return review ? { ...row, ...review } : null;
    })
    .filter(Boolean);
}

/** Labour cost, hours and efficiency over a window, against revenue. */
async function getLabourTotals(restaurantId, days, revenue) {
  const shifts = await repo.getWorkedShifts(restaurantId, days);
  return hours.computeLabourTotals(shifts, revenue);
}

module.exports = {
  REVIEW_WINDOW_DAYS,
  listShifts, listStaffRates, setStaffRate, logShift,
  clockIn, clockOut, deleteShift, getShiftsForReview, getLabourTotals,
};
