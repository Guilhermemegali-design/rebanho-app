"use client";

import { useState, useRef } from "react";
import { styles } from "@/lib/styles";
import { Download, Upload, FileSpreadsheet } from "lucide-react";
import { PrimaryButton, SectionTitle } from "@/components/UI";
import { encontrarAnimalPorTag } from "@/lib/rfid";

function indiceColuna(cabecalho, termos) {
  return cabecalho.findIndex((c) => c != null && termos.some((t) => String(c).toLowerCase().includes(t)));
}

function normalizarNumero(valor) {
  if (valor == null || valor === "") return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const n = Number(String(valor).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function normalizarData(valor) {
  if (!valor) return new Date().toISOString().slice(0, 10);
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  const s = String(valor).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const partes = s.split("/");
  if (partes.length === 3) {
    const [d, m, y] = partes;
    return `${y.length === 2 ? "20" + y : y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return new Date().toISOString().slice(0, 10);
}

export default function ImportExportTab({ dados }) {
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");
  const [preview, setPreview] = useState(null);
  const [importando, setImportando] = useState(false);
  const [concluido, setConcluido] = useState(null);
  const inputRef = useRef(null);

  async function exportar() {
    const XLSX = await import("xlsx");
    const linhas = dados.animais.map((a) => {
      const lote = dados.lotes.find((l) => l.id === a.lote_atual_id);
      const local = dados.locais.find((l) => l.id === a.local_atual_id);
      const fornecedor = dados.fornecedores.find((f) => f.id === a.fornecedor_id);
      return {
        Brinco: a.brinco_atual,
        "Brinco RFID": a.brinco_rfid || "",
        Sexo: a.sexo === "macho" ? "Macho" : "Fêmea",
        Raça: a.raca || "",
        Categoria: a.categoria || "",
        Situação: a.situacao,
        "Data de entrada": a.data_entrada,
        "Peso de entrada (kg)": a.peso_entrada ?? "",
        "Valor de entrada (R$)": a.valor_entrada ?? "",
        Fornecedor: fornecedor?.nome || "",
        "Lote atual": lote?.nome || "",
        "Local atual": local?.nome || "",
      };
    });
    const planilha = XLSX.utils.json_to_sheet(linhas);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, planilha, "Animais");
    XLSX.writeFile(workbook, `rebanho-animais-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function processarArquivo(file) {
    if (!file) return;
    setProcessando(true);
    setErro("");
    setPreview(null);
    setConcluido(null);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const aba = workbook.Sheets[workbook.SheetNames[0]];
      const linhas = XLSX.utils.sheet_to_json(aba, { header: 1, defval: null });
      if (linhas.length < 2) throw new Error("Planilha vazia ou sem linhas de dados.");

      const cabecalho = linhas[0];
      const idxBrincoRfid = indiceColuna(cabecalho, ["rfid"]);
      const idxBrinco = cabecalho.findIndex(
        (c, i) => i !== idxBrincoRfid && c != null && String(c).toLowerCase().includes("brinco")
      );
      if (idxBrinco === -1 && idxBrincoRfid === -1) {
        throw new Error('Não encontrei a coluna "Brinco" (visual ou RFID) na planilha — confira o cabeçalho.');
      }

      const idxSexo = indiceColuna(cabecalho, ["sexo"]);
      const idxRaca = indiceColuna(cabecalho, ["raça", "raca"]);
      const idxCategoria = indiceColuna(cabecalho, ["categoria"]);
      const idxOrigem = indiceColuna(cabecalho, ["origem"]);
      const idxData = indiceColuna(cabecalho, ["data de entrada", "data entrada", "entrada"]);
      const idxPeso = indiceColuna(cabecalho, ["peso"]);
      const idxValor = indiceColuna(cabecalho, ["valor"]);

      // Linha cujo brinco já existe no rebanho vira uma pesagem nova no
      // animal existente (se a planilha tiver peso e data), em vez de
      // criar um cadastro duplicado — isso já causou um bug real: uma
      // planilha de pesagem mensal recriava os mesmos animais toda vez.
      const registros = [];
      const pesagensExistentes = [];
      let ignoradas = 0;
      for (const linha of linhas.slice(1)) {
        if (!linha || linha.every((v) => v == null || v === "")) continue;
        const brincoVisual = idxBrinco !== -1 ? linha[idxBrinco] : null;
        const brincoRfid = idxBrincoRfid !== -1 ? linha[idxBrincoRfid] : null;
        // Fazenda que só usa RFID (sem coluna de brinco visual, ou linha
        // sem valor nela): usa o código RFID como identificador principal.
        const brinco = brincoVisual || brincoRfid;
        if (!brinco) { ignoradas++; continue; }
        const brincoTexto = String(brinco).trim();
        const peso = idxPeso !== -1 ? normalizarNumero(linha[idxPeso]) : null;
        const data = idxData !== -1 ? normalizarData(linha[idxData]) : new Date().toISOString().slice(0, 10);

        const animalExistente = encontrarAnimalPorTag(dados.animais, brincoTexto);
        if (animalExistente) {
          if (peso != null) {
            pesagensExistentes.push({ animalId: animalExistente.id, brinco: animalExistente.brinco_atual, peso, data });
          } else {
            ignoradas++;
          }
          continue;
        }

        const sexoTexto = idxSexo !== -1 ? String(linha[idxSexo] || "").toLowerCase() : "";
        registros.push({
          brinco_atual: brincoTexto,
          brinco_rfid: brincoRfid ? String(brincoRfid).trim() : null,
          sexo: sexoTexto.startsWith("m") ? "macho" : "femea",
          raca: idxRaca !== -1 ? linha[idxRaca] || null : null,
          categoria: idxCategoria !== -1 ? linha[idxCategoria] || null : null,
          origem: idxOrigem !== -1 ? linha[idxOrigem] || null : null,
          data_entrada: data,
          peso_entrada: peso,
          valor_entrada: idxValor !== -1 ? normalizarNumero(linha[idxValor]) : null,
        });
      }

      if (registros.length === 0 && pesagensExistentes.length === 0) {
        throw new Error("Nenhuma linha válida encontrada (confira se a coluna Brinco está preenchida).");
      }
      setPreview({ registros, pesagensExistentes, ignoradas });
    } catch (err) {
      setErro(err.message);
    } finally {
      setProcessando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function confirmarImportacao() {
    if (!preview) return;
    setImportando(true);
    setErro("");
    try {
      if (preview.registros.length > 0) {
        await dados.criarAnimaisEmLote(preview.registros);
      }
      for (const p of preview.pesagensExistentes) {
        await dados.registrarPesagem(p.animalId, { peso: p.peso, data: p.data, origem_peso: "manual" });
      }
      setConcluido(preview.registros.length + preview.pesagensExistentes.length);
      setPreview(null);
    } catch (err) {
      setErro(err.message);
    } finally {
      setImportando(false);
    }
  }

  return (
    <div>
      <SectionTitle>Exportar</SectionTitle>
      <div style={styles.card}>
        <div style={{ padding: "12px 0", fontSize: 13.5, color: "#5C5C58" }}>
          Baixa uma planilha com todos os animais cadastrados (brinco, categoria, situação, peso e valor de entrada, lote e local atuais).
        </div>
        <button onClick={exportar} style={{ ...styles.secondaryBtn, marginBottom: 12 }}>
          <Download size={15} style={{ verticalAlign: -2, marginRight: 6 }} /> Exportar planilha (.xlsx)
        </button>
      </div>

      <SectionTitle>Importar</SectionTitle>
      <div style={styles.card}>
        <div style={{ padding: "12px 0", fontSize: 13.5, color: "#5C5C58" }}>
          Planilha Excel ou CSV com uma linha por animal e coluna "Brinco" e/ou "Brinco RFID" (pelo menos uma é obrigatória). Colunas opcionais reconhecidas: Sexo, Raça, Categoria, Origem, Data de entrada, Peso, Valor. Se o brinco já existir no rebanho, a linha vira uma pesagem nova nesse animal (não cria um cadastro duplicado) — precisa ter Peso preenchido pra isso.
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => processarArquivo(e.target.files?.[0])}
          style={{ marginBottom: 12 }}
        />
      </div>

      {processando && <div style={styles.emptyHint}>Lendo planilha...</div>}
      {erro && <div style={styles.errorBox}>{erro}</div>}

      {preview && (
        <div style={styles.card}>
          <div style={{ padding: "12px 0", display: "flex", alignItems: "center", gap: 8 }}>
            <FileSpreadsheet size={16} color="#1F4D45" />
            <div style={{ fontSize: 13.5 }}>
              {preview.registros.length} animal(is) novo(s) pronto(s) para cadastrar
              {preview.pesagensExistentes.length > 0 ? ` · ${preview.pesagensExistentes.length} pesagem(ns) em animal(is) já cadastrado(s)` : ""}
              {preview.ignoradas > 0 ? ` (${preview.ignoradas} linha(s) ignorada(s) — sem brinco, ou brinco já cadastrado sem peso na planilha)` : ""}.
            </div>
          </div>
          <PrimaryButton onClick={confirmarImportacao} disabled={importando}>
            {importando ? "Importando..." : "Confirmar importação"}
          </PrimaryButton>
        </div>
      )}

      {concluido != null && (
        <div style={{ ...styles.alertaCard, background: "#E4EFE9", border: "1px solid #CDE3D9" }}>
          <Upload size={16} color="#1F4D45" />
          <div style={{ ...styles.alertaTitulo, color: "#1F4D45" }}>{concluido} registro(s) importado(s) com sucesso.</div>
        </div>
      )}
    </div>
  );
}
