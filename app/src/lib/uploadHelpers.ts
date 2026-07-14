export function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (s === "" || s === "None") return 0;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let clean = s;
  if (lastComma > -1 && lastDot > -1) {
    // Mixed separators: the rightmost one is the decimal separator.
    if (lastComma > lastDot) {
      clean = s.replace(/\./g, "").replace(",", ".");
    } else {
      clean = s.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    const commaCount = (s.match(/,/g) || []).length;
    clean = commaCount > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot > -1) {
    const dotCount = (s.match(/\./g) || []).length;
    clean = dotCount > 1 ? s.replace(/\./g, "") : s;
  }
  const n = parseFloat(clean);
  return (isNaN(n) || !isFinite(n)) ? 0 : n;
}

export function normalizeUsername(s: string): string {
  return String(s || "").trim().toLowerCase();
}

export function pDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/.test(s)) return s.replace(/\//g, "-");
  const p = s.split("/");
  if (p.length === 3) return p[0].length === 4 ? `${p[0]}-${p[1].padStart(2, "0")}-${p[2].padStart(2, "0")}` : `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`;
  return null;
}

export function pDt(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim().replace(/\/\/\s*/, "");
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}:\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}` : null;
}

export function det(hdr: string[]): string {
  const h = hdr.map((x) => x.toLowerCase().trim());
  const joined = h.join("|");
  if (h.includes("ticket") && h.includes("stato")) return "tickets";
  if (joined.includes("kyc") || joined.includes("pvr ref") || joined.includes("withdrawable")) return "players_master";
  if (h.includes("gioco")) return "daily_player_game";
  if (h.some((x) => x.includes("liv 1"))) return "daily_pvr";
  if (h[0] === "username" && !h.includes("data")) return "player_summary";
  if (h[0] === "data" && !h.includes("username")) return "daily_network";
  return "daily_player";
}

export function col(row: Record<string, unknown>, names: string[]): unknown {
  for (const n of names) {
    if (n in row) return row[n];
  }
  return undefined;
}
