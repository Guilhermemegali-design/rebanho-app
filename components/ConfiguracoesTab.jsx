"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, MapPinned, Save, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { PageHeader, SelectField } from "@/components/UI";
import ImportExportTab from "@/components/ImportExportTab";
import TesteEquipamentos from "@/components/TesteEquipamentos";
import { supabase } from "@/lib/supabaseClient";
import { styles } from "@/lib/styles";

const PAPEIS = [
  { value: "administrador", label: "Administrador" },
  { value: "editor", label: "Operador" },
  { value: "leitor", label: "Somente leitura" },
];

const LINK_ACESSO_CLIENTE = "https://rebanho-app-omega.vercel.app/";

const rotuloPapel = (papel) => PAPEIS.find((item) => item.value === papel)?.label || "Operador";

function gerarCodigo() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join("");
}

export default function ConfiguracoesTab({ dados, clienteId, consultorId, fazenda, onAtualizarFazenda, isConsultor, papelAtual, fazendas = [] }) {
  const podeGerenciar = isConsultor || papelAtual === "administrador";
  const temMaisDeUmaFazenda = fazendas.length > 1;
  const rotuloFazenda = (fazendaId) => fazendas.find((f) => f.id === fazendaId)?.nome || "Todas as fazendas";
  const [usuarios, setUsuarios] = useState([]);
  const [convites, setConvites] = useState([]);
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState("editor");
  const [fazendaConvite, setFazendaConvite] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [nomeFazenda, setNomeFazenda] = useState(fazenda?.nome || "");
  const [salvandoFazenda, setSalvandoFazenda] = useState(false);
  const [mensagemFazenda, setMensagemFazenda] = useState("");
  const [mensagemLink, setMensagemLink] = useState("");

  useEffect(() => {
    setNomeFazenda(fazenda?.nome || "");
    setMensagemFazenda("");
  }, [fazenda?.id, fazenda?.nome]);

  const carregarAcessos = useCallback(async () => {
    if (!podeGerenciar) return;
    const [{ data: listaUsuarios, error: erroUsuarios }, { data: listaConvites, error: erroConvites }] = await Promise.all([
      supabase.from("clientes_usuarios").select("id, auth_user_id, email, papel, fazenda_id, criado_em").eq("cliente_id", clienteId).order("criado_em"),
      supabase.from("rebanho_convites_usuarios").select("*").eq("cliente_id", clienteId).order("criado_em", { ascending: false }),
    ]);
    if (erroUsuarios || erroConvites) {
      setMensagem(erroUsuarios?.message || erroConvites?.message);
      return;
    }
    setUsuarios(listaUsuarios || []);
    setConvites(listaConvites || []);
  }, [clienteId, podeGerenciar]);

  useEffect(() => {
    carregarAcessos();
  }, [carregarAcessos]);

  async function criarConvite(e) {
    e.preventDefault();
    setCarregando(true);
    setMensagem("");
    try {
      const codigo = gerarCodigo();
      const { error } = await supabase.from("rebanho_convites_usuarios").insert({
        cliente_id: clienteId,
        consultor_id: consultorId,
        email: email.trim().toLowerCase() || null,
        papel,
        fazenda_id: fazendaConvite || null,
        codigo,
      });
      if (error) throw error;
      setEmail("");
      setFazendaConvite("");
      setMensagem(`Acesso criado. Envie o código ${codigo} para o usuário.`);
      await carregarAcessos();
    } catch (err) {
      setMensagem(err.message);
    } finally {
      setCarregando(false);
    }
  }

  async function alterarPapel(usuario, novoPapel) {
    const { error } = await supabase.from("clientes_usuarios").update({ papel: novoPapel }).eq("id", usuario.id);
    setMensagem(error ? error.message : "Nível de acesso atualizado.");
    if (!error) carregarAcessos();
  }

  async function alterarFazendaUsuario(usuario, novaFazendaId) {
    const { error } = await supabase.from("clientes_usuarios").update({ fazenda_id: novaFazendaId || null }).eq("id", usuario.id);
    setMensagem(error ? error.message : "Acesso à fazenda atualizado.");
    if (!error) carregarAcessos();
  }

  async function removerUsuario(usuario) {
    if (!window.confirm(`Remover o acesso de ${usuario.email || "este usuário"}?`)) return;
    const { error } = await supabase.from("clientes_usuarios").delete().eq("id", usuario.id);
    setMensagem(error ? error.message : "Acesso removido.");
    if (!error) carregarAcessos();
  }

  async function cancelarConvite(convite) {
    const { error } = await supabase.from("rebanho_convites_usuarios").update({ status: "cancelado" }).eq("id", convite.id);
    setMensagem(error ? error.message : "Convite cancelado.");
    if (!error) carregarAcessos();
  }

  async function salvarFazenda(e) {
    e.preventDefault();
    const nome = nomeFazenda.trim();
    if (!nome || !fazenda?.id || !onAtualizarFazenda) return;
    setSalvandoFazenda(true);
    setMensagemFazenda("");
    try {
      await onAtualizarFazenda(fazenda.id, { nome });
      setMensagemFazenda("Nome da fazenda atualizado.");
    } catch (err) {
      setMensagemFazenda(err.code === "23505" ? "Já existe uma fazenda com esse nome para este cliente." : err.message);
    } finally {
      setSalvandoFazenda(false);
    }
  }

  async function copiarLinkCliente() {
    try {
      await navigator.clipboard.writeText(LINK_ACESSO_CLIENTE);
      setMensagemLink("Link copiado. Agora é só enviar ao cliente.");
    } catch {
      setMensagemLink("Não foi possível copiar automaticamente. Selecione o link acima e copie.");
    }
  }

  return (
    <div>
      <PageHeader title="Configurações" subtitle="Usuários, níveis de acesso e cópia de segurança." />

      <div style={{ ...styles.card, padding: 18, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
          <MapPinned size={19} color="#1F4D45" />
          <strong>Fazenda atual</strong>
        </div>
        {!podeGerenciar ? (
          <div style={styles.emptyHint}>Somente administradores podem editar a fazenda.</div>
        ) : (
          <form onSubmit={salvarFazenda} style={{ marginTop: 10 }}>
            <label style={styles.field}>
              <div style={styles.fieldLabel}>Nome da fazenda</div>
              <input
                type="text"
                required
                value={nomeFazenda}
                onChange={(e) => setNomeFazenda(e.target.value)}
                placeholder="Ex.: Fazenda Olhos D’Água"
                style={styles.input}
              />
            </label>
            <button
              type="submit"
              disabled={salvandoFazenda || !nomeFazenda.trim() || nomeFazenda.trim() === fazenda?.nome}
              style={{ ...styles.primaryBtn, marginTop: 12 }}
            >
              <Save size={16} style={{ verticalAlign: "middle", marginRight: 7 }} />
              {salvandoFazenda ? "Salvando..." : "Salvar fazenda"}
            </button>
            {mensagemFazenda && <div style={styles.errorBox}>{mensagemFazenda}</div>}
          </form>
        )}
      </div>

      <div style={{ ...styles.card, padding: 18, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
          <Link2 size={19} color="#1F4D45" />
          <strong>Link de acesso do cliente</strong>
        </div>
        <div style={{ fontSize: 13, color: "#6F6F6B", lineHeight: 1.5, marginBottom: 10 }}>
          Envie este endereço ao cliente. No primeiro acesso, ele cria a conta usando o código gerado em Usuários e acessos.
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "stretch", flexWrap: "wrap" }}>
          <input
            type="text"
            readOnly
            value={LINK_ACESSO_CLIENTE}
            onFocus={(e) => e.target.select()}
            aria-label="Link de acesso do cliente"
            style={{ ...styles.input, flex: "1 1 280px", minWidth: 0 }}
          />
          <button type="button" onClick={copiarLinkCliente} style={styles.primaryBtn}>
            <Copy size={16} style={{ verticalAlign: "middle", marginRight: 7 }} />
            Copiar link
          </button>
        </div>
        {mensagemLink && <div style={{ ...styles.emptyHint, marginTop: 10 }}>{mensagemLink}</div>}
      </div>

      <TesteEquipamentos />

      <div style={{ ...styles.card, padding: 18, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
          <ShieldCheck size={19} color="#1F4D45" />
          <strong>Usuários e acessos</strong>
        </div>
        {!podeGerenciar ? (
          <div style={styles.emptyHint}>Somente administradores podem cadastrar e alterar usuários.</div>
        ) : (
          <>
            <form onSubmit={criarConvite} style={{ marginTop: 10 }}>
              <label style={styles.field}>
                <div style={styles.fieldLabel}>E-mail do usuário</div>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@exemplo.com" style={styles.input} />
              </label>
              <SelectField label="Nível de acesso" value={papel} onChange={setPapel} options={PAPEIS} />
              {temMaisDeUmaFazenda && (
                <SelectField
                  label="Acesso a"
                  value={fazendaConvite}
                  onChange={setFazendaConvite}
                  options={[{ value: "", label: "Todas as fazendas" }, ...fazendas.map((f) => ({ value: f.id, label: f.nome }))]}
                />
              )}
              <button type="submit" disabled={carregando} style={{ ...styles.primaryBtn, marginTop: 12 }}>
                <UserPlus size={16} style={{ verticalAlign: "middle", marginRight: 7 }} />
                {carregando ? "Criando..." : "Cadastrar acesso"}
              </button>
            </form>
            <div style={{ fontSize: 12, color: "#8A8A86", marginTop: 10, lineHeight: 1.45 }}>
              O usuário cria a própria conta e informa o código recebido. A senha nunca fica visível para o administrador.
            </div>
            {mensagem && <div style={styles.errorBox}>{mensagem}</div>}

            <div style={styles.sectionTitle}>Usuários ativos</div>
            {usuarios.length === 0 && <div style={styles.emptyHint}>Nenhum usuário vinculado.</div>}
            {usuarios.map((usuario) => (
              <div key={usuario.id} style={{ ...styles.rowCard, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                  <div style={styles.listItemTitle}>{usuario.email || "Usuário cadastrado"}</div>
                  <div style={styles.listItemSub}>{rotuloPapel(usuario.papel)}{temMaisDeUmaFazenda ? ` · ${rotuloFazenda(usuario.fazenda_id)}` : ""}</div>
                </div>
                <select value={usuario.papel} onChange={(e) => alterarPapel(usuario, e.target.value)} style={styles.tableFilterSelect}>
                  {PAPEIS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                {temMaisDeUmaFazenda && (
                  <select value={usuario.fazenda_id || ""} onChange={(e) => alterarFazendaUsuario(usuario, e.target.value)} style={styles.tableFilterSelect}>
                    <option value="">Todas as fazendas</option>
                    {fazendas.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                )}
                <button onClick={() => removerUsuario(usuario)} style={styles.iconDangerBtn} title="Remover acesso"><Trash2 size={15} /></button>
              </div>
            ))}

            <div style={styles.sectionTitle}>Convites</div>
            {convites.filter((item) => item.status === "pendente").length === 0 && <div style={styles.emptyHint}>Nenhum convite pendente.</div>}
            {convites.filter((item) => item.status === "pendente").map((convite) => (
              <div key={convite.id} style={{ ...styles.rowCard, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={styles.listItemTitle}>{convite.email}</div>
                  <div style={styles.listItemSub}>
                    {rotuloPapel(convite.papel)}{temMaisDeUmaFazenda ? ` · ${rotuloFazenda(convite.fazenda_id)}` : ""} · Código {convite.codigo}
                  </div>
                </div>
                <button onClick={() => navigator.clipboard.writeText(convite.codigo).then(() => setMensagem("Código copiado."))} style={styles.iconEditBtn} title="Copiar código"><Copy size={15} /></button>
                <button onClick={() => cancelarConvite(convite)} style={styles.iconDangerBtn} title="Cancelar convite"><Trash2 size={15} /></button>
              </div>
            ))}
          </>
        )}
      </div>
      <ImportExportTab dados={dados} />
    </div>
  );
}
