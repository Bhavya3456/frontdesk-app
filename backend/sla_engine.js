/**
 * SLA Engine for Frontdesk
 * Calculates remaining working hours and determines SLA deadline dates.
 */

const WORK_START_HOUR = 9;
const WORK_START_MIN = 30;
const WORK_END_HOUR = 18;
const WORK_END_MIN = 30;
const DAILY_WORK_HOURS = 9.0;

// Returns response SLA target in working hours based on severity[cite: 2, 3]
function getResponseSlaHours(severity) {
  switch (severity) {
    case 'CRITICAL': return 2.0;       // 2 working hours[cite: 2]
    case 'MEDIUM':   return 4.5;       // Half working day (4.5 hrs)[cite: 2, 3]
    case 'LOW':      return 9.0;       // 1 working day (9 hrs)[cite: 3]
    default:         return 4.5;
  }
}

/**
 * Checks if a given Date object falls within working hours (Mon-Fri, 9:30-18:30)[cite: 3]
 */
function isWorkingTime(date, holidays = []) {
  const day = date.getDay();
  if (day === 0 || day === 6) return false; // Weekend[cite: 3]

  const dateStr = date.toISOString().split('T')[0];
  if (holidays.includes(dateStr)) return false; // Holiday[cite: 3]

  const mins = date.getHours() * 60 + date.getMinutes();
  const startMins = WORK_START_HOUR * 60 + WORK_START_MIN;
  const endMins = WORK_END_HOUR * 60 + WORK_END_MIN;

  return mins >= startMins && mins < endMins;
}

/**
 * Adds working hours to a starting date to compute exact SLA due date[cite: 3]
 */
function addWorkingHours(startDate, hoursToAdd, holidays = []) {
  let cur = new Date(startDate);
  let remainingMs = hoursToAdd * 60 * 60 * 1000;

  while (remainingMs > 0) {
    // If outside working hours, jump forward to next working day start[cite: 3]
    const day = cur.getDay();
    const dateStr = cur.toISOString().split('T')[0];
    const isWeekend = (day === 0 || day === 6);
    const isHoliday = holidays.includes(dateStr);

    const mins = cur.getHours() * 60 + cur.getMinutes();
    const startMins = WORK_START_HOUR * 60 + WORK_START_MIN;
    const endMins = WORK_END_HOUR * 60 + WORK_END_MIN;

    if (isWeekend || isHoliday || mins >= endMins) {
      // Move to 9:30 AM next day[cite: 3]
      cur.setDate(cur.getDate() + 1);
      cur.setHours(WORK_START_HOUR, WORK_START_MIN, 0, 0);
      continue;
    }

    if (mins < startMins) {
      cur.setHours(WORK_START_HOUR, WORK_START_MIN, 0, 0);
      continue;
    }

    // Available working ms remaining today
    const endOfDay = new Date(cur);
    endOfDay.setHours(WORK_END_HOUR, WORK_END_MIN, 0, 0);
    const availableMs = endOfDay.getTime() - cur.getTime();

    if (remainingMs <= availableMs) {
      cur = new Date(cur.getTime() + remainingMs);
      remainingMs = 0;
    } else {
      remainingMs -= availableMs;
      cur.setDate(cur.getDate() + 1);
      cur.setHours(WORK_START_HOUR, WORK_START_MIN, 0, 0);
    }
  }

  return cur;
}

/**
 * Determines if a ticket is currently late based on creation time, severity, and status[cite: 3]
 */
function calculateTicketSlaStatus(ticket, holidays = []) {
  // If waiting on customer, timer is paused! (Meera's key rule[cite: 3])
  if (ticket.status === 'WAITING_ON_CUSTOMER') {
    return { isLate: false, paused: true, statusText: 'PAUSED (Waiting on customer)' };
  }

  const slaHours = getResponseSlaHours(ticket.severity);
  const slaDueDate = addWorkingHours(new Date(ticket.created_at), slaHours, holidays);
  const now = new Date();

  const isLate = now > slaDueDate;

  return {
    isLate,
    paused: false,
    slaDueDate,
    statusText: isLate ? 'LATE' : 'ON TIME'
  };
}

module.exports = {
  getResponseSlaHours,
  isWorkingTime,
  addWorkingHours,
  calculateTicketSlaStatus
};