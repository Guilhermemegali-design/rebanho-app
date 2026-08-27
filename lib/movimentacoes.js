// Tipos de movimentação que encerram a situação "ativo" do animal, e a
// situação que cada um deixa — usado tanto ao salvar direto (online)
// quanto ao sincronizar uma movimentação feita offline (lib/sync.js),
// pra nunca desalinhar os dois caminhos.
export const TIPOS_QUE_ENCERRAM_SITUACAO = ["saida", "morte", "venda", "abate"];

export function situacaoAposMovimento(tipo) {
  if (tipo === "venda") return "vendido";
  if (tipo === "abate") return "abatido";
  if (tipo === "morte") return "morto";
  return "transferido"; // saida
}
