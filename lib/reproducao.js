// ============================================================
// NÚCLEO REPRODUTIVO — datas previstas, índices e alertas do módulo
// Cria. Mesma filosofia de lib/alerts.js: nada aqui é persistido, tudo
// é derivado na hora a partir dos registros já carregados (protocolo
// IATF, diagnósticos de gestação, partos, desmames).
// ============================================================

import { diasEntre, somarDias } from "./format";

export const DIAS_GESTACAO_PADRAO = 283;
export const DIAS_DESMAME_PADRAO = 210;
export const DIAS_DG_PADRAO = 30;
export const MESES_DESMAME_CATEGORIA = 10;
export const DIAS_VAZIA_ALERTA_DESCARTE = 60;
const JANELA_ALERTA_DIAS = 14;

function hojeIso() {
  return new Date().toISOString().slice(0, 10);
}

// Negativo = já passou, 0 = hoje, positivo = faltam N dias.
function diasAte(dataIso) {
  if (!dataIso) return null;
  return diasEntre(hojeIso(), dataIso);
}

function idadeEmMeses(dataNascimentoIso) {
  if (!dataNascimentoIso) return null;
  const nascimento = new Date(dataNascimentoIso + "T00:00:00");
  const hoje = new Date();
  return (hoje.getFullYear() - nascimento.getFullYear()) * 12 + (hoje.getMonth() - nascimento.getMonth());
}

function textoPrazo(dias) {
  if (dias < 0) return `atrasado há ${-dias}d`;
  if (dias === 0) return "hoje";
  return `em ${dias}d`;
}

// ---------- Datas previstas do protocolo (nunca persistidas) ----------
export function dataRetiradaPrevista(protocoloAnimal, protocolo) {
  return somarDias(protocoloAnimal?.data_d0, protocolo?.dias_ate_retirada ?? 8);
}

export function dataIaPrevista(protocoloAnimal, protocolo) {
  return somarDias(protocoloAnimal?.data_d0, protocolo?.dias_ate_ia ?? 11);
}

export function dataPartoPrevisto(dataReferenciaIa, diasGestacao = DIAS_GESTACAO_PADRAO) {
  return somarDias(dataReferenciaIa, diasGestacao);
}

export function dataDesmamePrevisto(dataParto, diasDesmame = DIAS_DESMAME_PADRAO) {
  return somarDias(dataParto, diasDesmame);
}

// ---------- Índices reprodutivos ----------
export function calcularIndicesReprodutivos({ protocoloAnimais = [], diagnosticosGestacao: diagnosticos = [], partos = [] }) {
  const totalExpostas = protocoloAnimais.length;
  const inseminadas = protocoloAnimais.filter((pa) => pa.data_ia);
  const taxaServico = totalExpostas > 0 ? inseminadas.length / totalExpostas : null;

  const dgComResultado = diagnosticos.filter((d) => d.resultado === "prenha" || d.resultado === "vazia");
  const prenhas = diagnosticos.filter((d) => d.resultado === "prenha");
  const taxaConcepcao = dgComResultado.length > 0 ? prenhas.length / dgComResultado.length : null;
  const taxaPrenhez = totalExpostas > 0 ? prenhas.length / totalExpostas : null;

  const partosPorAnimal = new Map();
  for (const p of partos) {
    if (!p.animal_id || !p.data_parto) continue;
    if (!partosPorAnimal.has(p.animal_id)) partosPorAnimal.set(p.animal_id, []);
    partosPorAnimal.get(p.animal_id).push(p.data_parto);
  }
  const intervalos = [];
  for (const datas of partosPorAnimal.values()) {
    const ordenadas = [...datas].sort();
    for (let i = 1; i < ordenadas.length; i++) {
      const dias = diasEntre(ordenadas[i - 1], ordenadas[i]);
      if (dias != null && dias > 0) intervalos.push(dias);
    }
  }
  const intervaloMedioPartos = intervalos.length > 0
    ? Math.round(intervalos.reduce((a, b) => a + b, 0) / intervalos.length)
    : null;

  return {
    totalExpostas,
    totalInseminadas: inseminadas.length,
    totalPrenhas: prenhas.length,
    taxaServico,
    taxaConcepcao,
    taxaPrenhez,
    intervaloMedioPartos,
  };
}

// ---------- Categoria sugerida por idade (bezerro → novilha/boi) ----------
export function categoriaSugeridaPorIdade(animal) {
  if (!animal || animal.categoria !== "Bezerro" || !animal.data_nascimento) return null;
  const meses = idadeEmMeses(animal.data_nascimento);
  if (meses == null || meses < MESES_DESMAME_CATEGORIA) return null;
  return animal.sexo === "macho" ? "Boi" : "Novilha";
}

// ---------- Agenda/alertas reprodutivos ----------
// Mesmo formato de lib/alerts.js ({tipo, animal, texto, diasRestantes}),
// pra mesclar direto na aba Alertas e no painel do módulo Cria.
export function calcularAlertasReproducao({
  animais = [],
  protocolosIatf = [],
  protocoloAnimais = [],
  diagnosticosGestacao: diagnosticos = [],
  partos = [],
  desmames = [],
}) {
  const lista = [];
  const animaisPorId = new Map(animais.map((a) => [a.id, a]));
  const protocolosPorId = new Map(protocolosIatf.map((p) => [p.id, p]));
  const protocoloAnimaisPorId = new Map(protocoloAnimais.map((pa) => [pa.id, pa]));

  for (const pa of protocoloAnimais) {
    const animal = animaisPorId.get(pa.animal_id);
    if (!animal || animal.situacao !== "ativo") continue;
    const protocolo = protocolosPorId.get(pa.protocolo_id);

    if (pa.status === "aguardando_retirada") {
      const dias = diasAte(dataRetiradaPrevista(pa, protocolo));
      if (dias != null && dias <= JANELA_ALERTA_DIAS) {
        lista.push({
          tipo: "iatf_retirada", animal, diasRestantes: dias,
          texto: `${animal.brinco_atual}: retirada do implante ${textoPrazo(dias)}`,
        });
      }
    } else if (pa.status === "aguardando_ia") {
      const dias = diasAte(dataIaPrevista(pa, protocolo));
      if (dias != null && dias <= JANELA_ALERTA_DIAS) {
        lista.push({
          tipo: "iatf_ia", animal, diasRestantes: dias,
          texto: `${animal.brinco_atual}: inseminação (IA) ${textoPrazo(dias)}`,
        });
      }
    } else if (pa.status === "inseminada" && pa.data_ia) {
      const jaTemDg = diagnosticos.some((d) => d.protocolo_animal_id === pa.id);
      if (!jaTemDg) {
        const diasDesdeIa = -diasAte(pa.data_ia);
        if (diasDesdeIa >= DIAS_DG_PADRAO) {
          lista.push({
            tipo: "dg_pendente", animal, diasRestantes: -diasDesdeIa,
            texto: `${animal.brinco_atual}: diagnóstico de gestação pendente (IA há ${diasDesdeIa}d)`,
          });
        }
      }
    }
  }

  const dgIdsComParto = new Set(partos.filter((p) => p.diagnostico_gestacao_id).map((p) => p.diagnostico_gestacao_id));
  for (const dg of diagnosticos) {
    if (dg.resultado !== "prenha" || dgIdsComParto.has(dg.id)) continue;
    const animal = animaisPorId.get(dg.animal_id);
    if (!animal || animal.situacao !== "ativo") continue;
    const referencia = dg.data_ia_referencia || protocoloAnimaisPorId.get(dg.protocolo_animal_id)?.data_ia || dg.data_dg;
    const dias = diasAte(dataPartoPrevisto(referencia));
    if (dias != null && dias <= JANELA_ALERTA_DIAS) {
      lista.push({
        tipo: "parto_previsto", animal, diasRestantes: dias,
        texto: `${animal.brinco_atual}: parto previsto ${textoPrazo(dias)}`,
      });
    }
  }

  const criasComDesmame = new Set(desmames.map((d) => d.animal_id));
  for (const animal of animais) {
    if (animal.situacao !== "ativo" || animal.categoria !== "Bezerro") continue;
    if (!animal.data_nascimento || criasComDesmame.has(animal.id)) continue;
    const dias = diasAte(dataDesmamePrevisto(animal.data_nascimento));
    if (dias != null && dias <= JANELA_ALERTA_DIAS) {
      lista.push({
        tipo: "desmame_previsto", animal, diasRestantes: dias,
        texto: `${animal.brinco_atual}: desmame previsto ${textoPrazo(dias)}`,
      });
    }
    const sugestao = categoriaSugeridaPorIdade(animal);
    if (sugestao) {
      lista.push({
        tipo: "categoria_sugerida", animal, categoriaSugerida: sugestao,
        texto: `${animal.brinco_atual}: apto a virar categoria "${sugestao}"`,
      });
    }
  }

  const ultimoDgPorAnimal = new Map();
  for (const dg of diagnosticos) {
    const atual = ultimoDgPorAnimal.get(dg.animal_id);
    if (!atual || dg.data_dg > atual.data_dg) ultimoDgPorAnimal.set(dg.animal_id, dg);
  }
  for (const [animalId, dg] of ultimoDgPorAnimal) {
    if (dg.resultado !== "vazia") continue;
    const animal = animaisPorId.get(animalId);
    if (!animal || animal.situacao !== "ativo") continue;
    const novaTentativa = protocoloAnimais.some((pa) => pa.animal_id === animalId && pa.data_d0 > dg.data_dg);
    if (novaTentativa) continue;
    const diasDesdeDg = -diasAte(dg.data_dg);
    if (diasDesdeDg >= DIAS_VAZIA_ALERTA_DESCARTE) {
      lista.push({
        tipo: "descarte_sugerido", animal,
        texto: `${animal.brinco_atual}: vazia há ${diasDesdeDg}d sem nova tentativa — considerar descarte`,
      });
    }
  }

  return lista;
}
