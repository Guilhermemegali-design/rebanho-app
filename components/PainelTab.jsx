"use client";

import { useMemo, useRef, useState } from "react";
import { styles } from "@/lib/styles";
import { formatKg, formatDataBR, calcularGmd, diasEntre } from "@/lib/format";
import { calcularAlertas } from "@/lib/alerts";
import { calcularAnimaisAbatidos } from "@/lib/abatidos";
import { Users, TrendingUp, AlertTriangle, Syringe, Scale, ChevronLeft, ChevronRight, Tag, Skull } from "lucide-react";
import { EmptyHint, PageHeader } from "@/components/UI";

export default function PainelTab({ dados, onAbrirAnimal, onAbrirGmdAbatidos }) {
  const { locais, lotes } = dados;
  const [loteSelecionadoId, setLoteSelecionadoId] = useState(null);
  const lotesSectionRef = useRef(null);
  const loteSelecionado = lotes.find((l) => l.id === loteSelecionadoId) || null;

  // Painel geral olha a fazenda inteira; clicar num lote em "Distribuição
  // por lote" filtra os mesmos indicadores só pros animais daquele lote.
  const animais = useMemo(
    () => (loteSelecionadoId ? dados.animais.filter((a) => a.lote_atual_id === loteSelecionadoId) : dados.animais),
    [dados.animais, loteSelecionadoId]
  );
  const idsAnimais = useMemo(() => new Set(animais.map((a) => a.id)), [animais]);
  const pesagens = useMemo(() => dados.pesagens.filter((p) => idsAnimais.has(p.animal_id)), [dados.pesagens, idsAnimais]);
  const procedimentos = useMemo(() => dados.procedimentos.filter((p) => idsAnimais.has(p.animal_id)), [dados.procedimentos, idsAnimais]);

  const ativos = useMemo(() => animais.filter((a) => a.situacao === "ativo"), [animais]);

  const pesoMedio = useMemo(() => {
    // Animal sem pesagem ainda entra na média pelo peso de entrada do
    // cadastro — assim o indicador não fica em branco só porque ninguém
    // pesou esse animal específico ainda.
    const valores = ativos
      .map((a) => {
        const historico = pesagens.filter((p) => p.animal_id === a.id).sort((x, y) => y.data.localeCompare(x.data));
        return historico[0] ? historico[0].peso : a.peso_entrada;
      })
      .filter((v) => v != null);
    if (valores.length === 0) return null;
    return valores.reduce((s, v) => s + v, 0) / valores.length;
  }, [pesagens, ativos]);

  const gmdMedio = useMemo(() => {
    const gmds = [];
    for (const animal of ativos) {
      const historico = pesagens.filter((p) => p.animal_id === animal.id).sort((a, b) => a.data.localeCompare(b.data));
      if (historico.length < 2) continue;
      const anterior = historico[historico.length - 2];
      const atual = historico[historico.length - 1];
      const gmd = calcularGmd(anterior.peso, anterior.data, atual.peso, atual.data);
      if (gmd != null) gmds.push(gmd);
    }
    if (gmds.length === 0) return null;
    return gmds.reduce((s, v) => s + v, 0) / gmds.length;
  }, [pesagens, ativos]);

  // Alertas calculados na hora — nunca ficam desatualizados porque não
  // existe uma tabela separada de alertas pra sincronizar.
  const todosAlertas = useMemo(() => calcularAlertas({ animais, pesagens, procedimentos }), [animais, pesagens, procedimentos]);
  const alertas = todosAlertas.slice(0, 5);

  const gmdAbatidosMedio = useMemo(() => {
    const abatidos = calcularAnimaisAbatidos(animais, dados.movimentacoes);
    const validos = abatidos.map((i) => i.gmd).filter((v) => v != null);
    if (validos.length === 0) return null;
    return validos.reduce((s, v) => s + v, 0) / validos.length;
  }, [animais, dados.movimentacoes]);

  // Mortalidade: mortes registradas nos últimos 12 meses sobre o rebanho
  // atual + essas mortes (aproximação do tamanho do plantel no período,
  // já que não guardamos a contagem de cabeças dia a dia).
  const hoje = new Date().toISOString().slice(0, 10);
  const mortes12Meses = useMemo(() => {
    const idsDoEscopo = new Set(animais.map((a) => a.id));
    return dados.movimentacoes.filter((m) => (
      m.tipo === "morte" && idsDoEscopo.has(m.animal_id) && diasEntre(m.data, hoje) != null && diasEntre(m.data, hoje) <= 365
    )).length;
  }, [animais, dados.movimentacoes, hoje]);
  const percentualMortalidade = (ativos.length + mortes12Meses) > 0
    ? (mortes12Meses / (ativos.length + mortes12Meses)) * 100
    : null;

  const lotesAtivos = lotes.filter((l) => l.situacao === "ativo");
  const animaisDoLote = useMemo(() => {
    if (!loteSelecionado) return [];
    return ativos
      .map((animal) => {
        const historico = pesagens
          .filter((pesagem) => pesagem.animal_id === animal.id)
          .sort((a, b) => a.data.localeCompare(b.data));
        const ultima = historico.at(-1);
        const anterior = historico.at(-2);
        const pesoAtual = ultima?.peso ?? animal.peso_entrada;
        const gmd = anterior && ultima
          ? calcularGmd(anterior.peso, anterior.data, ultima.peso, ultima.data)
          : calcularGmd(animal.peso_entrada, animal.data_entrada, ultima?.peso, ultima?.data);
        return { animal, pesoAtual, gmd, dataPeso: ultima?.data || animal.data_entrada };
      })
      .sort((a, b) => String(a.animal.brinco_atual).localeCompare(String(b.animal.brinco_atual), "pt-BR", { numeric: true }));
  }, [ativos, loteSelecionado, pesagens]);

  return (
    <div>
      {loteSelecionado ? (
        <>
          <button onClick={() => setLoteSelecionadoId(null)} style={{ ...styles.linkBtn, width: "auto", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
            <ChevronLeft size={14} /> Ver painel geral da fazenda
          </button>
          <PageHeader title={loteSelecionado.nome} subtitle="Indicadores só deste lote." />
        </>
      ) : (
        <PageHeader title="Painel" subtitle="Indicadores gerais do rebanho." />
      )}

      <div style={styles.kpiGrid}>
        <div style={styles.kpiCard}>
          <div style={styles.kpiHeader}><Users size={14} /> Ativos</div>
          <div style={styles.kpiValor}>{ativos.length}</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiHeader}><Scale size={14} /> Peso médio</div>
          <div style={styles.kpiValor}>{pesoMedio != null ? formatKg(pesoMedio) : "—"}</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiHeader}><TrendingUp size={14} /> GMD médio</div>
          <div style={styles.kpiValor}>{gmdMedio != null ? `${gmdMedio.toFixed(3)} kg/d` : "—"}</div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (loteSelecionado) setLoteSelecionadoId(null);
            else lotesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          style={{ ...styles.kpiCard, border: "1px solid #E8E5DE", textAlign: "left", cursor: "pointer" }}
          aria-label={loteSelecionado ? "Voltar para todos os lotes" : "Ver lotes ativos"}
        >
          <div style={styles.kpiHeader}><Syringe size={14} /> {loteSelecionado ? "Lote" : "Lotes ativos"}</div>
          <div style={styles.kpiValor}>{loteSelecionado ? 1 : lotesAtivos.length}</div>
          <div style={{ ...styles.listItemSub, marginTop: 4 }}>{loteSelecionado ? "Voltar aos lotes" : "Clique para escolher um lote"}</div>
        </button>
        {onAbrirGmdAbatidos ? (
          <button type="button" onClick={onAbrirGmdAbatidos} style={{ ...styles.kpiCard, border: "1px solid #E8E5DE", textAlign: "left", cursor: "pointer" }}>
            <div style={styles.kpiHeader}><TrendingUp size={14} /> GMD abatidos</div>
            <div style={styles.kpiValor}>{gmdAbatidosMedio != null ? `${gmdAbatidosMedio.toFixed(3)} kg/d` : "—"}</div>
            <div style={{ ...styles.listItemSub, marginTop: 4 }}>Ver detalhes</div>
          </button>
        ) : (
          <div style={styles.kpiCard}>
            <div style={styles.kpiHeader}><TrendingUp size={14} /> GMD abatidos</div>
            <div style={styles.kpiValor}>{gmdAbatidosMedio != null ? `${gmdAbatidosMedio.toFixed(3)} kg/d` : "—"}</div>
          </div>
        )}
        <div style={styles.kpiCard}>
          <div style={styles.kpiHeader}><Skull size={14} /> Mortalidade 12 meses</div>
          <div style={styles.kpiValor}>{mortes12Meses}{percentualMortalidade != null ? ` · ${percentualMortalidade.toFixed(1)}%` : ""}</div>
        </div>
      </div>

      {!loteSelecionado && (
        <div ref={lotesSectionRef}>
          <div style={styles.sectionTitle}>Lotes — clique para abrir</div>
          {lotesAtivos.length === 0 && <EmptyHint text="Nenhum lote cadastrado ainda." />}
          {lotesAtivos.map((lote) => {
            const qtd = dados.animais.filter((a) => a.lote_atual_id === lote.id && a.situacao === "ativo").length;
            const local = locais.find((l) => l.id === lote.local_id);
            return (
              <button key={lote.id} type="button" style={{ ...styles.rowCard, width: "100%", cursor: "pointer", textAlign: "left" }} onClick={() => setLoteSelecionadoId(lote.id)}>
                <div style={{ flex: 1 }}>
                  <div style={styles.listItemTitle}>{lote.nome}</div>
                  <div style={styles.listItemSub}>{local ? local.nome : "Sem local definido"}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{qtd}</div>
                  <ChevronRight size={18} color="#6F7773" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {loteSelecionado && (
        <>
          <div style={styles.sectionTitle}>Animais do lote e GMD individual</div>
          {animaisDoLote.length === 0 && <EmptyHint text="Este lote não possui animais ativos." />}
          <div style={styles.tableCard}>
            {animaisDoLote.length > 0 && (
              <div className="table-view" style={{ overflowX: "auto" }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.tableTh}>Animal</th>
                      <th style={styles.tableTh}>Categoria</th>
                      <th style={styles.tableTh}>Peso atual</th>
                      <th style={styles.tableTh}>GMD</th>
                      <th style={styles.tableTh}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {animaisDoLote.map(({ animal, pesoAtual, gmd, dataPeso }) => (
                      <tr key={animal.id} style={styles.tableRow} onClick={() => onAbrirAnimal?.(animal.id)}>
                        <td style={styles.tableTd}>
                          <div style={styles.tableCellTitle}>{animal.brinco_atual}</div>
                          <div style={styles.tableCellSub}>{animal.raca || "Raça não informada"}</div>
                        </td>
                        <td style={styles.tableTd}>{animal.categoria || "—"}</td>
                        <td style={styles.tableTd}>
                          <div style={styles.tableCellStrong}>{formatKg(pesoAtual)}</div>
                          <div style={styles.tableCellSub}>{formatDataBR(dataPeso)}</div>
                        </td>
                        <td style={styles.tableTd}>
                          {gmd != null
                            ? <span style={gmd >= 0.5 ? styles.gmdBom : styles.gmdBaixo}>{gmd.toFixed(3)} kg/d</span>
                            : "—"}
                        </td>
                        <td style={{ ...styles.tableTd, textAlign: "right" }}><ChevronRight size={17} color="#9A9A94" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="card-view" style={{ padding: animaisDoLote.length ? "10px 12px" : 0 }}>
              {animaisDoLote.map(({ animal, pesoAtual, gmd, dataPeso }) => (
                <button
                  key={animal.id}
                  type="button"
                  onClick={() => onAbrirAnimal?.(animal.id)}
                  style={{ ...styles.listItem, marginBottom: 8 }}
                >
                  <div style={styles.avatar}><Tag size={17} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={styles.listItemTitle}>{animal.brinco_atual}</div>
                    <div style={styles.listItemSub}>
                      {[animal.categoria, animal.raca].filter(Boolean).join(" · ") || "Sem categoria"}
                    </div>
                    <div style={{ ...styles.listItemSub, marginTop: 4 }}>
                      {formatKg(pesoAtual)} em {formatDataBR(dataPeso)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={gmd != null ? (gmd >= 0.5 ? styles.gmdBom : styles.gmdBaixo) : styles.listItemSub}>
                      {gmd != null ? `${gmd.toFixed(3)} kg/d` : "GMD —"}
                    </div>
                    <div style={styles.listItemSub}>Ver ficha</div>
                  </div>
                  <ChevronRight size={17} color="#9A9A94" />
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div style={styles.sectionTitle}>Precisam de atenção</div>
      {alertas.length === 0 && <EmptyHint text="Nenhuma pendência no momento." />}
      {alertas.map((al, i) => (
        <div key={i} style={styles.alertaCard}>
          <AlertTriangle size={16} color="#A85A2A" />
          <div>
            <div style={styles.alertaTitulo}>{al.tipo === "peso" ? "Pesagem atrasada" : "Carência ativa"}</div>
            <div style={styles.alertaSub}>{al.texto}</div>
          </div>
        </div>
      ))}
      {todosAlertas.length > alertas.length && (
        <div style={{ ...styles.listItemSub, marginTop: 10 }}>
          Exibindo 5 de {todosAlertas.length} alertas. Consulte a aba Alertas para ver todos.
        </div>
      )}
    </div>
  );
}
