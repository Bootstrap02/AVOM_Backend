// Pattern tokens: {year} and {seq:N} (zero-padded). Example: "ABBS/{year}/{seq:3}" -> "ABBS/2026/001".
function formatStudentNumber(pattern, year, seq) {
  return String(pattern || 'ABBS/{year}/{seq:3}')
    .replace(/\{year\}/g, String(year))
    .replace(/\{seq(?::(\d+))?\}/g, (_m, width) => String(seq).padStart(Number(width) || 3, '0'));
}
module.exports = { formatStudentNumber };
