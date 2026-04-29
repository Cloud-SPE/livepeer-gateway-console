/**
 * Display helpers reused across the SPA. Pure functions, no Lit imports.
 */

/** @param {string | null | undefined} weiStr Decimal-string wei (or null). */
export function formatWei(weiStr) {
  if (weiStr === null || weiStr === undefined || weiStr === "") return "—";
  let v;
  try {
    v = BigInt(weiStr);
  } catch {
    return weiStr;
  }
  const ETH = 10n ** 18n;
  const whole = v / ETH;
  const frac = v % ETH;
  if (frac === 0n) return `${whole} ETH`;
  // 6-digit precision after the decimal.
  const fracStr = (frac + ETH).toString(10).slice(1, 7).replace(/0+$/, "");
  return `${whole}${fracStr ? "." + fracStr : ""} ETH`;
}

/** @param {number | null | undefined} ms Epoch milliseconds. */
export function formatTimestamp(ms) {
  if (!ms || ms <= 0) return "—";
  return new Date(ms)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "Z");
}

/** @param {string} addr 0x-prefixed eth address. */
export function shortAddress(addr) {
  if (!addr || typeof addr !== "string" || addr.length < 10) return addr ?? "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
