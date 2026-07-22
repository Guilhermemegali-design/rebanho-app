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

// GMD = ganho de peso ÷ dias entre pesagens (indicador do MVP)
export function calcularGmd(pesoAnterior, dataAnterior, pesoAtual, dataAtual) {
  const dias = diasEntre(dataAnterior, dataAtual);
  if (!dias || dias <= 0 || pesoAnterior == null || pesoAtual == null) return null;
  return Number(((pesoAtual - pesoAnterior) / dias).toFixed(3));
}
