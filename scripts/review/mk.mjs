// helper: build a likelihood table from columns P(yes,maybe,no | value)
export const lik = (y, m, n) => ({
  yes: { yes: y[0], maybe: m[0], no: n[0], unknown: 1 / 3 },
  maybe: { yes: y[1], maybe: m[1], no: n[1], unknown: 1 / 3 },
  no: { yes: y[2], maybe: m[2], no: n[2], unknown: 1 / 3 },
});
