"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { styles } from "@/lib/styles";
import { useDadosRebanho } from "@/lib/useDadosRebanho";
import { useConexao } from "@/lib/useConexao";
import { LogOut, Wifi, WifiOff, RefreshCw, LayoutDashboard, Tag as TagIcon, MapPin, Scale, Stethoscope, ArrowLeftRight, FileSpreadsheet } from "lucide-react";
import PainelTab from "@/components/PainelTab";
import AnimaisTab from "@/components/AnimaisTab";
import LocaisLotesTab from "@/components/LocaisLotesTab";
import MovimentacoesTab from "@/components/MovimentacoesTab";
import PesagensTab from "@/components/PesagensTab";
import SanidadeTab from "@/components/SanidadeTab";
import ImportExportTab from "@/components/ImportExportTab";

// Mesmo UID do consultor usado no Consultoria-main e no
// Confinamento-main (é a mesma pessoa logada nos três apps). O
// consultor enxerga todas as fazendas; um operador de campo só
// enxerga a fazenda em que foi vinculado via código de convite.
const CONSULTOR_UID = "0db4e2fd-9cef-4e3f-9fb7-f974d4d22e02";

export default function App() {
  const [sessao, setSessao] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => setSessao(session));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (sessao === undefined) return <div style={styles.loadingScreen}>Carregando...</div>;
  if (!sessao) return <TelaLogin />;
  if (sessao.user.id === CONSULTOR_UID) return <SeletorFazendaConsultor sessao={sessao} />;
  return <ResolveAcessoOperador sessao={sessao} />;
}

// ---------- Login ----------
function TelaLogin() {
  const [modo, setModo] = useState("login");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      if (modo === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password: senha });
        if (error) throw error;
        setErro("Conta criada! Verifique seu e-mail para confirmar o acesso e depois entre novamente.");
      }
    } catch (err) {
      setErro(traduzErro(err.message));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div style={styles.loginScreen}>
      <div style={styles.loginCard}>
        <div style={styles.loginBrand}>Rebanho</div>
        <div style={styles.loginSub}>{modo === "login" ? "Acompanhamento individual do rebanho" : "Crie sua conta de acesso"}</div>
        <form onSubmit={handleSubmit}>
          <label style={styles.field}>
            <div style={styles.fieldLabel}>E-mail</div>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={styles.input} placeholder="voce@email.com" />
          </label>
          <label style={styles.field}>
            <div style={styles.fieldLabel}>Senha</div>
            <input type="password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} style={styles.input} placeholder="••••••••" />
          </label>
          {erro && <div style={styles.errorBox}>{erro}</div>}
          <button type="submit" disabled={carregando} style={styles.primaryBtn}>
            {carregando ? "Aguarde..." : modo === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>
        <button onClick={() => setModo(modo === "login" ? "cadastro" : "login")} style={styles.linkBtn}>
          {modo === "login" ? "Recebeu um código do seu consultor? Criar conta" : "Já tem conta? Entrar"}
        </button>
      </div>
    </div>
  );
}

function traduzErro(msg) {
  if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("already registered")) return "Este e-mail já está cadastrado.";
  return msg;
}

// ---------- Vincular convite (operador de campo) ----------
function TelaVincularConvite({ onVinculado }) {
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function handleVincular(e) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const userId = sessao.session.user.id;
      const userEmail = sessao.session.user.email;
      const { data: clienteEncontrado, error: erroBusca } = await supabase
        .from("clientes")
        .select("id, consultor_id")
        .eq("codigo_convite", codigo.trim())
        .maybeSingle();
      if (erroBusca) throw erroBusca;
      if (!clienteEncontrado) {
        setErro("Código inválido. Confira com seu consultor.");
        return;
      }
      const { error: erroVinculo } = await supabase.from("clientes_usuarios").insert({
        cliente_id: clienteEncontrado.id,
        consultor_id: clienteEncontrado.consultor_id,
        auth_user_id: userId,
        email: userEmail,
      });
      if (erroVinculo) {
        if (erroVinculo.code === "23505") {
          setErro("Você já tem acesso a essa fazenda.");
          return;
        }
        throw erroVinculo;
      }
      onVinculado();
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div style={styles.loginScreen}>
      <div style={styles.loginCard}>
        <div style={styles.loginBrand}>Quase lá!</div>
        <div style={styles.loginSub}>Digite o código que seu consultor te enviou para liberar seu acesso</div>
        <form onSubmit={handleVincular}>
          <label style={styles.field}>
            <div style={styles.fieldLabel}>Código de acesso</div>
            <input
              type="text"
              required
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              style={{ ...styles.input, textTransform: "uppercase", letterSpacing: 2, fontWeight: 700, fontSize: 18 }}
              placeholder="EX: A1B2C3D4"
            />
          </label>
          {erro && <div style={styles.errorBox}>{erro}</div>}
          <button type="submit" disabled={carregando} style={styles.primaryBtn}>
            {carregando ? "Verificando..." : "Confirmar código"}
          </button>
        </form>
        <button onClick={() => supabase.auth.signOut()} style={styles.linkBtn}>Sair</button>
      </div>
    </div>
  );
}

// ---------- Operador de campo: resolve a fazenda vinculada ----------
function ResolveAcessoOperador({ sessao }) {
  const [vinculos, setVinculos] = useState(undefined);
  const [fazendaEscolhida, setFazendaEscolhida] = useState(null);

  const carregarVinculos = useCallback(async () => {
    const { data } = await supabase
      .from("clientes_usuarios")
      .select("cliente_id, clientes(id, nome)")
      .eq("auth_user_id", sessao.user.id);
    setVinculos(data || []);
  }, [sessao.user.id]);

  useEffect(() => {
    carregarVinculos();
  }, [carregarVinculos]);

  if (vinculos === undefined) return <div style={styles.loadingScreen}>Carregando...</div>;
  if (vinculos.length === 0) return <TelaVincularConvite onVinculado={carregarVinculos} />;

  if (fazendaEscolhida) {
    return <AppPrincipal consultorId={sessao.user.id} clienteId={fazendaEscolhida.id} clienteNome={fazendaEscolhida.nome} isConsultor={false} />;
  }

  if (vinculos.length === 1) {
    const c = vinculos[0].clientes;
    return <AppPrincipal consultorId={sessao.user.id} clienteId={c.id} clienteNome={c.nome} isConsultor={false} />;
  }

  return (
    <div style={styles.loginScreen}>
      <div style={styles.loginCard}>
        <div style={styles.loginBrand}>Escolha a fazenda</div>
        <div style={{ marginTop: 14 }}>
          {vinculos.map((v) => (
            <button key={v.cliente_id} style={styles.listItem} onClick={() => setFazendaEscolhida(v.clientes)}>
              <div style={styles.listItemTitle}>{v.clientes.nome}</div>
            </button>
          ))}
        </div>
        <button onClick={() => supabase.auth.signOut()} style={styles.linkBtn}>Sair</button>
      </div>
    </div>
  );
}

// ---------- Consultor: escolhe qual fazenda quer ver ----------
function SeletorFazendaConsultor({ sessao }) {
  const [clientes, setClientes] = useState(undefined);
  const [fazendaEscolhida, setFazendaEscolhida] = useState(null);

  useEffect(() => {
    supabase
      .from("clientes")
      .select("id, nome")
      .eq("consultor_id", sessao.user.id)
      .order("nome")
      .then(({ data }) => setClientes(data || []));
  }, [sessao.user.id]);

  if (fazendaEscolhida) {
    return (
      <AppPrincipal
        consultorId={sessao.user.id}
        clienteId={fazendaEscolhida.id}
        clienteNome={fazendaEscolhida.nome}
        isConsultor
        onTrocarFazenda={() => setFazendaEscolhida(null)}
      />
    );
  }

  if (clientes === undefined) return <div style={styles.loadingScreen}>Carregando...</div>;

  return (
    <div style={styles.loginScreen}>
      <div style={styles.loginCard}>
        <div style={styles.loginBrand}>Rebanho</div>
        <div style={styles.loginSub}>Escolha a fazenda</div>
        {clientes.length === 0 && <div style={styles.emptyHint}>Nenhum cliente cadastrado ainda.</div>}
        <div style={{ marginTop: 8, maxHeight: "50vh", overflowY: "auto" }}>
          {clientes.map((c) => (
            <button key={c.id} style={styles.listItem} onClick={() => setFazendaEscolhida(c)}>
              <div style={styles.listItemTitle}>{c.nome}</div>
            </button>
          ))}
        </div>
        <button onClick={() => supabase.auth.signOut()} style={styles.linkBtn}>Sair</button>
      </div>
    </div>
  );
}

// ---------- App principal (depois de resolvido o acesso) ----------
function AppPrincipal({ consultorId, clienteId, clienteNome, isConsultor, onTrocarFazenda }) {
  const [tab, setTab] = useState("painel");
  const dados = useDadosRebanho(consultorId, clienteId);
  const { online, sincronizando, pendentes, sincronizar } = useConexao(consultorId);

  const abas = [
    { id: "painel", label: "Painel", icon: LayoutDashboard },
    { id: "animais", label: "Animais", icon: TagIcon },
    { id: "locais", label: "Locais/Lotes", icon: MapPin },
    { id: "movimentacoes", label: "Movim.", icon: ArrowLeftRight },
    { id: "pesagens", label: "Pesagens", icon: Scale },
    { id: "sanidade", label: "Sanidade", icon: Stethoscope },
  ];

  return (
    <div style={styles.app}>
      <div style={styles.topbar}>
        <div style={styles.topbarRow}>
          <div>
            <div style={styles.brand}>{clienteNome}</div>
            <div style={styles.brandSub}>{isConsultor ? "Visão do consultor" : "Controle de rebanho"}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {isConsultor && onTrocarFazenda && (
              <button onClick={onTrocarFazenda} style={styles.iconBtn} title="Trocar fazenda">
                <ArrowLeftRight size={16} />
              </button>
            )}
            <div style={{ ...styles.statusPill, ...(online ? styles.statusOn : styles.statusOff) }}>
              {online ? <Wifi size={13} /> : <WifiOff size={13} />}
              {online ? "Online" : "Offline"}
            </div>
            <button onClick={() => setTab("importexport")} style={styles.iconBtn} title="Importar/Exportar">
              <FileSpreadsheet size={16} />
            </button>
            <button onClick={() => supabase.auth.signOut()} style={styles.iconBtn} title="Sair">
              <LogOut size={16} />
            </button>
          </div>
        </div>
        {pendentes > 0 && (
          <div style={styles.syncBar}>
            <div style={styles.syncBarLeft}>{pendentes} registro(s) aguardando sincronizar</div>
            <button onClick={sincronizar} disabled={sincronizando || !online} style={styles.syncBtn}>
              <RefreshCw size={12} className={sincronizando ? "spin" : ""} /> {sincronizando ? "Enviando..." : "Enviar agora"}
            </button>
          </div>
        )}
      </div>

      <div style={styles.content}>
        {dados.carregando ? (
          <div style={styles.loadingScreen}>Carregando dados...</div>
        ) : (
          <>
            {tab === "painel" && <PainelTab dados={dados} />}
            {tab === "animais" && <AnimaisTab dados={dados} />}
            {tab === "locais" && <LocaisLotesTab dados={dados} />}
            {tab === "movimentacoes" && <MovimentacoesTab dados={dados} />}
            {tab === "pesagens" && <PesagensTab dados={dados} />}
            {tab === "sanidade" && <SanidadeTab dados={dados} />}
            {tab === "importexport" && <ImportExportTab dados={dados} onVoltar={() => setTab("painel")} />}
          </>
        )}
      </div>

      {tab !== "importexport" && (
      <div style={styles.bottomNav}>
        {abas.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} style={{ ...styles.navBtn, ...(tab === id ? styles.navBtnActive : {}) }}>
            <Icon size={19} strokeWidth={tab === id ? 2.4 : 1.8} />
            <span style={{ fontWeight: tab === id ? 600 : 500 }}>{label}</span>
          </button>
        ))}
      </div>
      )}
    </div>
  );
}
