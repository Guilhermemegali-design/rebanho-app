// ============================================================
// ALERTAS — calculados na hora a partir de pesagens/procedimentos já
// carregados, nunca guardados numa tabela à parte (evita estado
// duplicado; o painel e a lista de animais nunca ficam desatualizados).
// Usado pelo Painel (resumo), pela aba Alertas (lista completa) e pela
// tabela de Animais (badge de status por linha).
// ============================================================

const DIAS_SEM_PESAGEM_ALERTA = 45;
const GMD_MINIMO_ACEITAVEL = 0.5;

export function calcularAlertas({ animais, pesagens, procedimentos }) {
  const ativos = animais.filter((a) => a.situacao === "ativo");
  const lista = [];
  const hoje = new Date();

  for (const animal of ativos) {
    const historico = pesagens.filter((p) => p.animal_id === animal.id).sort((a, b) => b.data.localeCompare(a.data));
    const ultima = historico[0];
    const diasSemPesar = ultima
      ? Math.round((hoje - new Date(ultima.data + "T00:00:00")) / 86400000)
      : Math.round((hoje - new Date(animal.data_entrada + "T00:00:00")) / 86400000);
    if (diasSemPesar >= DIAS_SEM_PESAGEM_ALERTA) {
      lista.push({ tipo: "peso", animal, texto: `${animal.brinco_atual} sem pesagem há ${diasSemPesar} dias` });
    }
  }

  for (const p of procedimentos) {
    if (!p.carencia_dias || !p.data_aplicacao) continue;
    const fimCarencia = new Date(p.data_aplicacao + "T00:00:00");
    fimCarencia.setDate(fimCarencia.getDate() + p.carencia_dias);
    if (fimCarencia >= hoje) {
      const animal = ativos.find((a) => a.id === p.animal_id);
      if (animal) {
        const diasRestantes = Math.round((fimCarencia - hoje) / 86400000);
        lista.push({ tipo: "carencia", animal, texto: `${animal.brinco_atual} em carência (${diasRestantes}d restantes)`, diasRestantes });
      }
    }
  }

  return lista;
}

// Status por animal pra badge da tabela: carência ativa pesa mais que
// GMD baixo (não dá pra vender/abater de qualquer forma), depois GMD
// abaixo do mínimo aceitável vira "atenção", senão é só "ativo".
export function statusAnimal(animal, { pesagens, procedimentos }) {
  if (animal.situacao !== "ativo") return { rotulo: capitalizar(animal.situacao), cor: "neutro" };

  const hoje = new Date();
  const emCarencia = procedimentos.some((p) => {
    if (p.animal_id !== animal.id || !p.carencia_dias || !p.data_aplicacao) return false;
    const fim = new Date(p.data_aplicacao + "T00:00:00");
    fim.setDate(fim.getDate() + p.carencia_dias);
    return fim >= hoje;
  });
  if (emCarencia) return { rotulo: "Carência", cor: "carencia" };

  const historico = pesagens.filter((p) => p.animal_id === animal.id).sort((a, b) => a.data.localeCompare(b.data));
  if (historico.length >= 2) {
    const anterior = historico[historico.length - 2];
    const atual = historico[historico.length - 1];
    const dias = diasEntreDatas(anterior.data, atual.data);
    const gmd = dias > 0 ? (atual.peso - anterior.peso) / dias : null;
    if (gmd != null && gmd < GMD_MINIMO_ACEITAVEL) return { rotulo: "Atenção", cor: "atencao" };
  }

  return { rotulo: "Ativo", cor: "ativo" };
}

function diasEntreDatas(a, b) {
  return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
}

function capitalizar(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
