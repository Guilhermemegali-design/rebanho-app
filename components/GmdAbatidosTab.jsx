"use client";

import { useMemo, useState } from "react";
import { styles } from "@/lib/styles";
import { formatKg, formatDataBR } from "@/lib/format";
import { calcularAnimaisAbatidos } from "@/lib/abatidos";
import { TrendingUp, Tag, ChevronRight } from "lucide-react";
import { PageHeader, EmptyHint, SelectField } from "@/components/UI";

export default function GmdAbatidosTab({ dados, onAbrirAnimal }) {
  const [racaFiltro, setRacaFiltro] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [sexoFiltro, setSexoFiltro] = useState("");

  const abatidos = useMemo(
    () => calcularAnimaisAbatidos(dados.animais, dados.movimentacoes),
    [dados.animais, dados.movimentacoes]
  );

  const racas = useMemo(() => [...new Set(abatidos.map((i) => i.animal.raca).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [abatidos]);
  const categorias = useMemo(() => [...new Set(abatidos.map((i) => i.animal.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [abatidos]);

  const filtrados = useMemo(() => {
    return abatidos
      .filter((item) => (
        (!racaFiltro || item.animal.raca === racaFiltro) &&
        (!categoriaFiltro || item.animal.categoria === categoriaFiltro) &&
        (!sexoFiltro || item.animal.sexo === sexoFiltro)
      ))
      .sort((a, b) => (b.venda.data || "").localeCompare(a.venda.data || ""));
  }, [abatidos, racaFiltro, categoriaFiltro, sexoFiltro]);

  const gmdMedio = useMemo(() => {
    const validos = filtrados.map((i) => i.gmd).filter((v) => v != null);
    if (validos.length === 0) return null;
    return validos.reduce((s, v) => s + v, 0) / validos.length;
  }, [filtrados]);

  return (
    <div>
      <PageHeader title="GMD de abatidos" subtitle="Ganho médio diário dos animais vendidos/abatidos, do peso de entrada até a venda." />

      <div style={styles.kpiGrid}>
        <div style={styles.kpiCard}>
          <div style={styles.kpiHeader}><TrendingUp size={14} /> GMD médio</div>
          <div style={styles.kpiValor}>{gmdMedio != null ? `${gmdMedio.toFixed(3)} kg/d` : "—"}</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiHeader}><Tag size={14} /> Animais abatidos</div>
          <div style={styles.kpiValor}>{filtrados.length}</div>
        </div>
      </div>

      <div style={styles.tableFiltersRow}>
        <SelectField
          label="Raça"
          value={racaFiltro}
          onChange={setRacaFiltro}
          options={[{ value: "", label: "Todas as raças" }, ...racas.map((r) => ({ value: r, label: r }))]}
        />
        <SelectField
          label="Categoria"
          value={categoriaFiltro}
          onChange={setCategoriaFiltro}
          options={[{ value: "", label: "Todas as categorias" }, ...categorias.map((c) => ({ value: c, label: c }))]}
        />
        <SelectField
          label="Sexo"
          value={sexoFiltro}
          onChange={setSexoFiltro}
          options={[{ value: "", label: "Todos" }, { value: "macho", label: "Macho" }, { value: "femea", label: "Fêmea" }]}
        />
      </div>

      {filtrados.length === 0 ? (
        <EmptyHint text="Nenhum animal abatido encontrado com esses filtros." />
      ) : (
        <div style={styles.tableCard}>
          <div className="table-view" style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.tableTh}>Animal</th>
                  <th style={styles.tableTh}>Categoria</th>
                  <th style={styles.tableTh}>Sexo</th>
                  <th style={styles.tableTh}>Entrada</th>
                  <th style={styles.tableTh}>Saída (venda)</th>
                  <th style={styles.tableTh}>GMD</th>
                  <th style={styles.tableTh}></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(({ animal, venda, gmd }) => (
                  <tr key={animal.id} style={styles.tableRow} onClick={() => onAbrirAnimal?.(animal.id)}>
                    <td style={styles.tableTd}>
                      <div style={styles.tableCellTitle}>{animal.brinco_atual}</div>
                      <div style={styles.tableCellSub}>{animal.raca || "Raça não informada"}</div>
                    </td>
                    <td style={styles.tableTd}>{animal.categoria || "—"}</td>
                    <td style={styles.tableTd}>{animal.sexo === "macho" ? "Macho" : animal.sexo === "femea" ? "Fêmea" : "—"}</td>
                    <td style={styles.tableTd}>
                      <div style={styles.tableCellStrong}>{formatKg(animal.peso_entrada)}</div>
                      <div style={styles.tableCellSub}>{formatDataBR(animal.data_entrada)}</div>
                    </td>
                    <td style={styles.tableTd}>
                      <div style={styles.tableCellStrong}>{formatKg(venda.peso_saida)}</div>
                      <div style={styles.tableCellSub}>{formatDataBR(venda.data)}</div>
                    </td>
                    <td style={styles.tableTd}>
                      {gmd != null ? <span style={gmd >= 0.5 ? styles.gmdBom : styles.gmdBaixo}>{gmd.toFixed(3)} kg/d</span> : "—"}
                    </td>
                    <td style={{ ...styles.tableTd, textAlign: "right" }}><ChevronRight size={17} color="#9A9A94" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card-view" style={{ padding: "10px 12px" }}>
            {filtrados.map(({ animal, venda, gmd }) => (
              <button
                key={animal.id}
                type="button"
                onClick={() => onAbrirAnimal?.(animal.id)}
                style={{ ...styles.listItem, marginBottom: 8 }}
              >
                <div style={styles.avatar}><Tag size={17} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.listItemTitle}>{animal.brinco_atual}</div>
                  <div style={styles.listItemSub}>{[animal.categoria, animal.raca].filter(Boolean).join(" · ") || "Sem categoria"}</div>
                  <div style={{ ...styles.listItemSub, marginTop: 4 }}>
                    {formatKg(animal.peso_entrada)} → {formatKg(venda.peso_saida)} em {formatDataBR(venda.data)}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={gmd != null ? (gmd >= 0.5 ? styles.gmdBom : styles.gmdBaixo) : styles.listItemSub}>
                    {gmd != null ? `${gmd.toFixed(3)} kg/d` : "GMD —"}
                  </div>
                </div>
                <ChevronRight size={17} color="#9A9A94" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
