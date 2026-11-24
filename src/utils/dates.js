const DAY_MS = 24 * 60 * 60 * 1000;
const addDays = (date, days) => new Date(new Date(date).getTime() + days * DAY_MS);
const daysBetween = (from, to) => (new Date(to).getTime() - new Date(from).getTime()) / DAY_MS;
module.exports = { DAY_MS, addDays, daysBetween };
