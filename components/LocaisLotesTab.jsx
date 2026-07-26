"use client";

import { useState } from "react";
import { styles } from "@/lib/styles";
import { MapPin, Layers, Trash2, Pencil, Map, PackagePlus, Navigation, Wheat, Move } from "lucide-react";
import { ListHeader, PageHeader, BackHeader, EmptyHint, InputField, SelectField, PrimaryButton } from "@/components/UI";

const TIPOS_LOCAL = { pasto: "Pasto", curral: "Curral", baia: "Baia", outro: "Outro" };

export default function LocaisLotesTab({ dados }) {
  const [sub, setSub] = useState("locais");
  const [modo, setModo] = useState("lista");
  const [itemEditando, setItemEditando] = useState(null);

  return (
    <div>
      {modo === "lista" && <PageHeader title="Lotes e locais" subtitle="Pastos, currais e agrupamentos de animais na fazenda." />}
      <div style={styles.viewToggle}>
        <button onClick={() => { setSub("mapa"); setModo("lista"); }} style={sub === "mapa" ? { ...styles.viewToggleBtn, ...styles.viewToggleBtnActive } : styles.viewToggleBtn}>Mapa</button>
        <button onClick={() => { setSub("locais"); setModo("lista"); }} style={sub === "locais" ? { ...styles.viewToggleBtn, ...styles.viewToggleBtnActive } : styles.viewToggleBtn}>Locais</button>
        <button onClick={() => { setSub("lotes"); setModo("lista"); }} style={sub === "lotes" ? { ...styles.viewToggleBtn, ...styles.viewToggleBtnActive } : styles.viewToggleBtn}>Lotes</button>
        <button onClick={() => { setSub("cochos"); setModo("lista"); }} style={sub === "cochos" ? { ...styles.viewToggleBtn, ...styles.viewToggleBtnActive } : styles.viewToggleBtn}>Cochos</button>
      </div>

      {sub === "mapa" ? (
        <MapaFazenda dados={dados} />
      ) : sub === "locais" ? (
        modo === "novo" || modo === "editar" ? (
          <FormLocal
            inicial={modo === "editar" ? itemEditando : null}
            onSalvar={async (p) => {
              if (modo === "editar") await dados.atualizarLocal(itemEditando.id, p);
              else await dados.criarLocal(p);
              setModo("lista");
              setItemEditando(null);
            }}
            onCancelar={() => { setModo("lista"); setItemEditando(null); }}
          />
        ) : (
          <ListaLocais
            dados={dados}
            onNovo={() => setModo("novo")}
            onEditar={(local) => { setItemEditando(local); setModo("editar"); }}
          />
        )
      ) : sub === "lotes" && (modo === "novo" || modo === "editar") ? (
        <FormLote
          dados={dados}
          inicial={modo === "editar" ? itemEditando : null}
          onSalvar={async (p) => {
            if (modo === "editar") await dados.atualizarLote(itemEditando.id, p);
            else await dados.criarLote(p);
            setModo("lista");
            setItemEditando(null);
          }}
          onCancelar={() => { setModo("lista"); setItemEditando(null); }}
        />
      ) : sub === "lotes" ? (
        <ListaLotes
          dados={dados}
          onNovo={() => setModo("novo")}
          onEditar={(lote) => { setItemEditando(lote); setModo("editar"); }}
        />
      ) : modo === "novo" ? (
        <FormCocho
          dados={dados}
          onSalvar={async (payload) => {
            await dados.criarCocho(payload);
            setModo("lista");
          }}
          onCancelar={() => setModo("lista")}
        />
      ) : itemEditando ? (
        <DetalheCocho
          dados={dados}
          cocho={itemEditando}
          onVoltar={() => setItemEditando(null)}
        />
      ) : (
        <ListaCochos
          dados={dados}
          onNovo={() => setModo("novo")}
          onAbrir={setItemEditando}
        />
      )}
    </div>
  );
}

function localAtualDoLote(lote, dados) {
  const animal = dados.animais.find((item) => (
    item.situacao === "ativo" && item.lote_atual_id === lote.id && item.local_atual_id
  ));
  return animal?.local_atual_id || lote.local_id || null;
}

function MapaFazenda({ dados }) {
  const [loteSelecionadoId, setLoteSelecionadoId] = useState(null);
  const [movendo, setMovendo] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const locaisMapa = dados.locais.filter((local) => ["pasto", "curral", "baia"].includes(local.tipo));
  const lotesAtivos = dados.lotes.filter((lote) => lote.situacao === "ativo");

  async function transferirLote(loteId, localDestinoId) {
    const lote = lotesAtivos.find((item) => item.id === loteId);
    const origemId = localAtualDoLote(lote, dados);
    if (!lote || origemId === localDestinoId) {
      setLoteSelecionadoId(null);
      return;
    }
    const destino = dados.locais.find((item) => item.id === localDestinoId);
    const animais = dados.animais.filter((animal) => (
      animal.situacao === "ativo" && animal.lote_atual_id === lote.id
    ));
    if (!window.confirm(`Transferir o ${lote.nome}, com ${animais.length} animal(is), para ${destino.nome}?`)) return;
    setMovendo(true);
    setMensagem("");
    try {
      const hoje = new Date().toISOString().slice(0, 10);
      await dados.registrarMovimentacoesEmLote(animais.map((animal) => ({
        animalId: animal.id,
        dados: {
          tipo: "transferencia_local",
          lote_origem_id: lote.id,
          lote_destino_id: lote.id,
          local_origem_id: animal.local_atual_id || origemId,
          local_destino_id: localDestinoId,
          data: hoje,
          observacoes: `Movimentação do lote pelo mapa para ${destino.nome}`,
        },
      })));
      setMensagem(`Lote transferido para ${destino.nome}. Se estiver offline, a movimentação será enviada quando voltar o sinal.`);
      setLoteSelecionadoId(null);
    } catch (err) {
      setMensagem(err.message || "Não foi possível movimentar o lote.");
    } finally {
      setMovendo(false);
    }
  }

  return (
    <div>
      <div style={{ ...styles.offlineNotice, background: "#E4EFE9", color: "#1F4D45" }}>
        <Map size={17} />
        <div>
          <strong>Mapa operacional offline</strong><br />
          No celular, toque no lote e depois no pasto de destino. No computador, também é possível arrastar.
        </div>
      </div>
      {mensagem && <div style={styles.errorBox}>{mensagem}</div>}
      {locaisMapa.length === 0 ? (
        <EmptyHint text="Cadastre os pastos e currais para montar o mapa." />
      ) : (
        <div style={mapStyles.fazenda}>
          {locaisMapa.map((local, index) => {
            const lotesLocal = lotesAtivos.filter((lote) => localAtualDoLote(lote, dados) === local.id);
            const cochosLocal = dados.cochos.filter((cocho) => cocho.local_id === local.id);
            return (
              <div
                key={local.id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => transferirLote(event.dataTransfer.getData("text/lote-id"), local.id)}
                onClick={() => loteSelecionadoId && !movendo && transferirLote(loteSelecionadoId, local.id)}
                style={{ ...mapStyles.pasto, background: index % 3 === 0 ? "#EAF1DC" : index % 3 === 1 ? "#E1EDDF" : "#EDF0D7", outline: loteSelecionadoId ? "2px dashed #D2883F" : "none" }}
              >
                <div style={mapStyles.pastoTopo}>
                  <div>
                    <div style={mapStyles.pastoNome}>{local.nome}</div>
                    <div style={mapStyles.pastoTipo}>{TIPOS_LOCAL[local.tipo]} · {lotesLocal.reduce((total, lote) => total + dados.animais.filter((a) => a.situacao === "ativo" && a.lote_atual_id === lote.id).length, 0)} animais</div>
                  </div>
                  <MapPin size={16} color="#53725D" />
                </div>
                <div style={mapStyles.lotesArea}>
                  {lotesLocal.map((lote) => {
                    const quantidade = dados.animais.filter((animal) => animal.situacao === "ativo" && animal.lote_atual_id === lote.id).length;
                    const selecionado = loteSelecionadoId === lote.id;
                    return (
                      <button
                        key={lote.id}
                        type="button"
                        draggable
                        onDragStart={(event) => event.dataTransfer.setData("text/lote-id", lote.id)}
                        onClick={(event) => {
                          event.stopPropagation();
                          setLoteSelecionadoId(selecionado ? null : lote.id);
                        }}
                        style={{ ...mapStyles.lote, ...(selecionado ? mapStyles.loteSelecionado : {}) }}
                      >
                        <Move size={13} /> {lote.nome} · {quantidade}
                      </button>
                    );
                  })}
                </div>
                {cochosLocal.length > 0 && (
                  <div style={mapStyles.cochos}>
                    {cochosLocal.map((cocho) => <span key={cocho.id} title={cocho.nome} style={mapStyles.cocho}><Wheat size={13} /> {cocho.nome}</span>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ListaCochos({ dados, onNovo, onAbrir }) {
  return (
    <div>
      <ListHeader title="Cochos" actionLabel="Novo cocho" onAction={onNovo} />
      {dados.cochos.length === 0 && <EmptyHint text="Nenhum cocho cadastrado." />}
      {dados.cochos.map((cocho) => {
        const local = dados.locais.find((item) => item.id === cocho.local_id);
        const ultimo = dados.abastecimentos.find((item) => item.cocho_id === cocho.id);
        return (
          <button key={cocho.id} type="button" style={{ ...styles.listItem, width: "100%" }} onClick={() => onAbrir(cocho)}>
            <div style={styles.avatar}><Wheat size={17} /></div>
            <div style={{ flex: 1 }}>
              <div style={styles.listItemTitle}>{cocho.nome}</div>
              <div style={styles.listItemSub}>{local?.nome || "Sem local"}{ultimo ? ` · último: ${ultimo.quantidade} ${ultimo.unidade} de ${ultimo.produto}` : " · ainda não abastecido"}</div>
            </div>
            <PackagePlus size={17} color="#1F4D45" />
          </button>
        );
      })}
    </div>
  );
}

function FormCocho({ dados, onSalvar, onCancelar }) {
  const [nome, setNome] = useState("");
  const [localId, setLocalId] = useState("");
  const [tipo, setTipo] = useState("sal");
  const [capacidade, setCapacidade] = useState("");
  const [gps, setGps] = useState(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  function capturarGps() {
    if (!navigator.geolocation) return setErro("GPS não disponível neste aparelho.");
    setErro("Buscando localização...");
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        setGps({ latitude: posicao.coords.latitude, longitude: posicao.coords.longitude, precisao: posicao.coords.accuracy });
        setErro("");
      },
      () => setErro("Não foi possível obter o GPS. Autorize a localização do navegador."),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function salvar() {
    if (!nome.trim() || !localId) return setErro("Informe nome e pasto/local do cocho.");
    setSalvando(true);
    try {
      await onSalvar({
        nome: nome.trim(),
        local_id: localId,
        tipo,
        capacidade_kg: capacidade === "" ? null : Number(capacidade),
        latitude: gps?.latitude || null,
        longitude: gps?.longitude || null,
      });
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <BackHeader title="Novo cocho" onBack={onCancelar} />
      <div style={styles.card}>
        <InputField label="Nome ou código" value={nome} onChange={setNome} placeholder="Ex: Cocho Pasto 01" />
        <SelectField label="Pasto/local" value={localId} onChange={setLocalId} options={[{ value: "", label: "Selecione" }, ...dados.locais.map((local) => ({ value: local.id, label: local.nome }))]} />
        <SelectField label="Tipo" value={tipo} onChange={setTipo} options={[{ value: "sal", label: "Sal/mineral" }, { value: "racao", label: "Ração" }, { value: "agua", label: "Água" }, { value: "outro", label: "Outro" }]} />
        <InputField label="Capacidade (kg)" type="number" value={capacidade} onChange={setCapacidade} placeholder="Opcional" />
      </div>
      <button type="button" onClick={capturarGps} style={styles.secondaryBtn}><Navigation size={15} style={{ verticalAlign: "middle", marginRight: 7 }} />Usar minha localização para o cocho</button>
      {gps && <div style={styles.hardwareHint}>GPS salvo · precisão aproximada de {Math.round(gps.precisao)} m</div>}
      {erro && <div style={styles.errorBox}>{erro}</div>}
      <PrimaryButton onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar cocho"}</PrimaryButton>
    </div>
  );
}

function DetalheCocho({ dados, cocho, onVoltar }) {
  const [produto, setProduto] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [unidade, setUnidade] = useState("kg");
  const [loteId, setLoteId] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [salvando, setSalvando] = useState(false);
  const local = dados.locais.find((item) => item.id === cocho.local_id);
  const lotesLocal = dados.lotes.filter((lote) => lote.situacao === "ativo" && localAtualDoLote(lote, dados) === cocho.local_id);
  const historico = dados.abastecimentos.filter((item) => item.cocho_id === cocho.id);

  async function abastecer() {
    if (!produto.trim() || !quantidade || Number(quantidade) <= 0) return setMensagem("Informe produto e quantidade.");
    if (lotesLocal.length > 1 && !loteId) return setMensagem("Há mais de um lote neste pasto. Selecione qual foi atendido.");
    setSalvando(true);
    try {
      await dados.registrarAbastecimento(cocho, {
        produto: produto.trim(),
        quantidade,
        unidade,
        lote_id: loteId || null,
        data_abastecimento: new Date().toISOString(),
        observacoes,
      });
      setProduto("");
      setQuantidade("");
      setObservacoes("");
      setMensagem("Abastecimento salvo. Sem internet, ficará aguardando sincronização.");
    } catch (err) {
      setMensagem(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <BackHeader title={cocho.nome} onBack={onVoltar} />
      <div style={{ ...styles.card, padding: 16, marginBottom: 12 }}>
        <div style={styles.listItemTitle}>{local?.nome}</div>
        <div style={styles.listItemSub}>{cocho.latitude ? `GPS ${Number(cocho.latitude).toFixed(6)}, ${Number(cocho.longitude).toFixed(6)}` : "GPS ainda não registrado"}</div>
        {cocho.latitude && (
          <a href={`https://www.google.com/maps/search/?api=1&query=${cocho.latitude},${cocho.longitude}`} target="_blank" rel="noreferrer" style={{ ...styles.linkBtn, display: "inline-flex", width: "auto", alignItems: "center", gap: 5 }}>
            <Navigation size={14} /> Abrir rota até o cocho
          </a>
        )}
      </div>
      <div style={styles.sectionTitle}>Registrar abastecimento</div>
      <div style={styles.card}>
        <InputField label="Produto" value={produto} onChange={setProduto} placeholder="Ex: Sal proteinado 0,3%" />
        <InputField label="Quantidade" type="number" value={quantidade} onChange={setQuantidade} placeholder="Ex: 50" />
        <SelectField label="Unidade" value={unidade} onChange={setUnidade} options={[{ value: "kg", label: "kg" }, { value: "saco", label: "saco" }, { value: "litro", label: "litro" }, { value: "unidade", label: "unidade" }]} />
        <SelectField label="Lote atendido" value={loteId} onChange={setLoteId} options={[{ value: "", label: lotesLocal.length <= 1 ? "Detectar automaticamente" : "Selecione o lote" }, ...lotesLocal.map((lote) => ({ value: lote.id, label: lote.nome }))]} />
        <InputField label="Observações" value={observacoes} onChange={setObservacoes} placeholder="Opcional" />
      </div>
      {mensagem && <div style={styles.errorBox}>{mensagem}</div>}
      <PrimaryButton onClick={abastecer} disabled={salvando}>{salvando ? "Salvando..." : "Salvar abastecimento"}</PrimaryButton>
      <div style={styles.sectionTitle}>Histórico e consumo estimado</div>
      {historico.length === 0 && <EmptyHint text="Nenhum abastecimento registrado." />}
      {historico.map((item) => (
        <div key={item.id || item.client_uuid} style={styles.rowCard}>
          <div style={{ flex: 1 }}>
            <div style={styles.listItemTitle}>{item.produto} · {item.quantidade} {item.unidade}</div>
            <div style={styles.listItemSub}>{new Date(item.data_abastecimento).toLocaleString("pt-BR")} · {item.quantidade_animais} animal(is)</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={styles.tableCellStrong}>{item.consumo_estimado_animal != null ? `${Number(item.consumo_estimado_animal).toFixed(3)} ${item.unidade}/animal` : "—"}</div>
            <div style={styles.listItemSub}>{item.sincronizado === false ? "Pendente" : "Sincronizado"}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

const mapStyles = {
  fazenda: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, background: "#D8C9A8", padding: 10, borderRadius: 18, border: "3px solid #B59B70" },
  pasto: { minHeight: 165, borderRadius: 15, border: "2px solid #8DA276", padding: 12, cursor: "pointer", display: "flex", flexDirection: "column", transition: "outline .15s" },
  pastoTopo: { display: "flex", justifyContent: "space-between", gap: 8 },
  pastoNome: { fontWeight: 800, fontSize: 15, color: "#29483B" },
  pastoTipo: { fontSize: 11.5, color: "#6B7B67", marginTop: 2 },
  lotesArea: { display: "flex", flexWrap: "wrap", gap: 7, marginTop: 16, flex: 1, alignContent: "flex-start" },
  lote: { border: "1px solid #1F4D45", background: "#fff", color: "#1F4D45", borderRadius: 20, padding: "7px 10px", fontSize: 12, fontWeight: 700, cursor: "grab", display: "inline-flex", alignItems: "center", gap: 5 },
  loteSelecionado: { background: "#D2883F", color: "#fff", borderColor: "#D2883F", boxShadow: "0 0 0 3px rgba(210,136,63,.2)" },
  cochos: { borderTop: "1px dashed #A9B896", paddingTop: 8, display: "flex", flexWrap: "wrap", gap: 5 },
  cocho: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "#7A572C", background: "#FFF7E5", padding: "4px 7px", borderRadius: 8 },
};

function ListaLocais({ dados, onNovo, onEditar }) {
  const [excluindoId, setExcluindoId] = useState(null);

  async function handleExcluir(local, qtd) {
    const lotesVinculados = dados.lotes.filter((lote) => lote.local_id === local.id).length;
    const detalhe = ` ${qtd} animal(is) e ${lotesVinculados} lote(s) serão preservados e ficarão sem local.`;
    if (!window.confirm(`Excluir o local "${local.nome}"?${detalhe}`)) return;
    setExcluindoId(local.id);
    try {
      await dados.excluirLocal(local.id);
    } catch (err) {
      window.alert(err.message || "Não foi possível excluir o local.");
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <div>
      <ListHeader title="Locais" actionLabel="Novo local" onAction={onNovo} />
      {dados.locais.length === 0 && <EmptyHint text="Nenhum pasto, curral ou baia cadastrado ainda." />}
      {dados.locais.map((l) => {
        const qtd = dados.animais.filter((a) => a.local_atual_id === l.id && a.situacao === "ativo").length;
        return (
          <div key={l.id} style={styles.rowCard}>
            <div style={styles.avatar}><MapPin size={17} /></div>
            <div style={{ flex: 1 }}>
              <div style={styles.listItemTitle}>{l.nome}</div>
              <div style={styles.listItemSub}>{TIPOS_LOCAL[l.tipo] || l.tipo}{l.capacidade ? ` · capacidade ${l.capacidade}` : ""}</div>
            </div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{qtd}</div>
            <button type="button" onClick={() => onEditar(l)} aria-label={`Editar local ${l.nome}`} title="Editar local" style={styles.iconEditBtn}>
              <Pencil size={15} />
            </button>
            <button
              type="button"
              onClick={() => handleExcluir(l, qtd)}
              disabled={excluindoId === l.id}
              aria-label={`Excluir local ${l.nome}`}
              title="Excluir local"
              style={{ ...styles.iconDangerBtn, opacity: excluindoId === l.id ? 0.5 : 1 }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function FormLocal({ onSalvar, onCancelar, inicial }) {
  const [nome, setNome] = useState(inicial?.nome || "");
  const [tipo, setTipo] = useState(inicial?.tipo || "pasto");
  const [capacidade, setCapacidade] = useState(inicial?.capacidade ?? "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function handleSalvar() {
    if (!nome.trim()) { setErro("Informe o nome do local."); return; }
    setSalvando(true);
    try {
      await onSalvar({ nome: nome.trim(), tipo, capacidade: capacidade === "" ? null : Number(capacidade) });
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <BackHeader title={inicial ? "Editar local" : "Novo local"} onBack={onCancelar} />
      <div style={styles.card}>
        <InputField label="Nome" value={nome} onChange={setNome} placeholder="Ex: Piquete 3" />
        <SelectField label="Tipo" value={tipo} onChange={setTipo} options={Object.entries(TIPOS_LOCAL).map(([value, label]) => ({ value, label }))} />
        <InputField label="Capacidade (opcional)" type="number" value={capacidade} onChange={setCapacidade} placeholder="Nº de cabeças" />
      </div>
      {erro && <div style={styles.errorBox}>{erro}</div>}
      <PrimaryButton onClick={handleSalvar} disabled={salvando}>{salvando ? "Salvando..." : inicial ? "Salvar alterações" : "Salvar local"}</PrimaryButton>
    </div>
  );
}

function ListaLotes({ dados, onNovo, onEditar }) {
  const [excluindoId, setExcluindoId] = useState(null);
  const [erro, setErro] = useState("");

  async function handleExcluir(lote, qtd) {
    const detalhe = qtd > 0
      ? ` Os ${qtd} animais deste lote continuarão cadastrados e ficarão sem lote.`
      : "";
    if (!window.confirm(`Excluir o lote "${lote.nome}"?${detalhe}`)) return;
    setExcluindoId(lote.id);
    setErro("");
    try {
      await dados.excluirLote(lote.id);
    } catch (err) {
      setErro(err.message || "Não foi possível excluir o lote.");
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <div>
      <ListHeader title="Lotes" actionLabel="Novo lote" onAction={onNovo} />
      {erro && <div style={{ ...styles.errorBox, marginBottom: 10 }}>{erro}</div>}
      {dados.lotes.length === 0 && <EmptyHint text="Nenhum lote cadastrado ainda." />}
      {dados.lotes.map((l) => {
        const qtd = dados.animais.filter((a) => a.lote_atual_id === l.id && a.situacao === "ativo").length;
        const local = dados.locais.find((loc) => loc.id === l.local_id);
        return (
          <div key={l.id} style={styles.rowCard}>
            <div style={styles.avatar}><Layers size={17} /></div>
            <div style={{ flex: 1 }}>
              <div style={styles.listItemTitle}>{l.nome}</div>
              <div style={styles.listItemSub}>{local ? local.nome : "Sem local"} · {l.situacao === "ativo" ? "Ativo" : "Encerrado"}</div>
            </div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{qtd}</div>
            <button type="button" onClick={() => onEditar(l)} aria-label={`Editar lote ${l.nome}`} title="Editar lote" style={styles.iconEditBtn}>
              <Pencil size={15} />
            </button>
            <button
              type="button"
              onClick={() => handleExcluir(l, qtd)}
              disabled={excluindoId === l.id}
              aria-label={`Excluir lote ${l.nome}`}
              title="Excluir lote"
              style={{ ...styles.iconDangerBtn, opacity: excluindoId === l.id ? 0.5 : 1 }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function FormLote({ dados, onSalvar, onCancelar, inicial }) {
  const [nome, setNome] = useState(inicial?.nome || "");
  const [localId, setLocalId] = useState(inicial?.local_id || "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function handleSalvar() {
    if (!nome.trim()) { setErro("Informe o nome do lote."); return; }
    setSalvando(true);
    try {
      await onSalvar({ nome: nome.trim(), local_id: localId || null });
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <BackHeader title={inicial ? "Editar lote" : "Novo lote"} onBack={onCancelar} />
      <div style={styles.card}>
        <InputField label="Nome" value={nome} onChange={setNome} placeholder="Ex: Lote Recria 01" />
        <SelectField
          label="Local"
          value={localId}
          onChange={setLocalId}
          options={[{ value: "", label: "Sem local definido" }, ...dados.locais.map((l) => ({ value: l.id, label: l.nome }))]}
        />
      </div>
      {erro && <div style={styles.errorBox}>{erro}</div>}
      <PrimaryButton onClick={handleSalvar} disabled={salvando}>{salvando ? "Salvando..." : inicial ? "Salvar alterações" : "Salvar lote"}</PrimaryButton>
    </div>
  );
}
