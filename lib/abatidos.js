import { calcularGmd } from "./format";

// Animal com situação "abatido" (movimentação tipo "abate", separada de
// "venda" comum). GMD do peso de entrada até o peso de saída do abate.
// Usado tanto no Painel quanto na aba própria de GMD de abatidos, pra
// manter os dois números sempre iguais.
export function calcularAnimaisAbatidos(animais, movimentacoes) {
  return animais
    .filter((a) => a.situacao === "abatido")
    .map((animal) => {
      const abate = movimentacoes
        .filter((m) => m.animal_id === animal.id && m.tipo === "abate")
        .sort((a, b) => (b.data || "").localeCompare(a.data || ""))[0];
      if (!abate) return null;
      const gmd = calcularGmd(animal.peso_entrada, animal.data_entrada, abate.peso_saida, abate.data);
      return { animal, abate, gmd };
    })
    .filter(Boolean);
}
