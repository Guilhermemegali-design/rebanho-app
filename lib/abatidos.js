import { calcularGmd } from "./format";

// "Abatido" aqui = animal com uma movimentação de venda (tipo "venda") —
// o app não distingue venda comum de abate, e pra recria/engorda vendida
// direto pro frigorífico, venda é abate. GMD do peso de entrada até o
// peso de saída da venda. Usado tanto no Painel quanto na aba própria de
// GMD de abatidos, pra manter os dois números sempre iguais.
export function calcularAnimaisAbatidos(animais, movimentacoes) {
  return animais
    .filter((a) => a.situacao === "vendido")
    .map((animal) => {
      const venda = movimentacoes
        .filter((m) => m.animal_id === animal.id && m.tipo === "venda")
        .sort((a, b) => (b.data || "").localeCompare(a.data || ""))[0];
      if (!venda) return null;
      const gmd = calcularGmd(animal.peso_entrada, animal.data_entrada, venda.peso_saida, venda.data);
      return { animal, venda, gmd };
    })
    .filter(Boolean);
}
