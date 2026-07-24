export function formatBRL(v) {
  if (v === "" || v === null || v === undefined || isNaN(v)) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDataBR(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function formatKg(v) {
  if (v === "" || v === null || v === undefined || isNaN(v)) return "—";
  return `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
}

export function diasEntre(dataInicioIso, dataFimIso) {
  if (!dataInicioIso || !dataFimIso) return null;
  const inicio = new Date(dataInicioIso + "T00:00:00");
  const fim = new Date(dataFimIso + "T00:00:00");
  return Math.round((fim - inicio) / 86400000);
}

// Arroba usada neste app = 30kg (padrão definido pelo consultor para o
// cálculo de valor de entrada — não confundir com a arroba de carcaça,
// de 15kg, usada em outros contextos).
export const KG_POR_ARROBA = 30;

export function calcularValorPorArroba(pesoKg, precoArroba) {
  if (pesoKg == null || precoArroba == null || pesoKg === "" || precoArroba === "") return null;
  const valor = (Number(pesoKg) / KG_POR_ARROBA) * Number(precoArroba);
  return Number.isFinite(valor) ? valor : null;
}

// GMD = ganho de peso ÷ dias entre pesagens (indicador do MVP)
export function calcularGmd(pesoAnterior, dataAnterior, pesoAtual, dataAtual) {
  const dias = diasEntre(dataAnterior, dataAtual);
  if (!dias || dias <= 0 || pesoAnterior == null || pesoAtual == null) return null;
  return Number(((pesoAtual - pesoAnterior) / dias).toFixed(3));
}
