"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { styles } from "@/lib/styles";
import { useDadosRebanho } from "@/lib/useDadosRebanho";
import { useConexao } from "@/lib/useConexao";
import { calcularAlertas } from "@/lib/alerts";
import { Wifi, WifiOff, RefreshCw, Menu } from "lucide-react";
import Sidebar, { ABAS_SIDEBAR } from "@/components/Sidebar";
import PainelTab from "@/components/PainelTab";
import AnimaisTab from "@/components/AnimaisTab";
import LocaisLotesTab from "@/components/LocaisLotesTab";
import MovimentacoesTab from "@/components/MovimentacoesTab";
import PesagensTab from "@/components/PesagensTab";
import SanidadeTab from "@/components/SanidadeTab";
import AlertasTab from "@/components/AlertasTab";
import ConfiguracoesTab from "@/components/ConfiguracoesTab";

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
        <img src="/rastro-logo.png?v=2" alt="" style={{ width: 72, height: 72, borderRadius: 18, marginBottom: 12 }} />
        <div style={styles.loginBrand}>RASTRO</div>
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
      .select("cliente_id, clientes(id, nome, consultor_id)")
      .eq("auth_user_id", sessao.user.id);
    setVinculos(data || []);
  }, [sessao.user.id]);

  useEffect(() => {
    carregarVinculos();
  }, [carregarVinculos]);

  if (vinculos === undefined) return <div style={styles.loadingScreen}>Carregando...</div>;
  if (vinculos.length === 0) return <TelaVincularConvite onVinculado={carregarVinculos} />;

  if (fazendaEscolhida) {
    return <AppPrincipal consultorId={fazendaEscolhida.consultor_id || CONSULTOR_UID} usuarioEmail={sessao.user.email} clienteId={fazendaEscolhida.id} clienteNome={fazendaEscolhida.nome} isConsultor={false} />;
  }

  if (vinculos.length === 1) {
    const c = vinculos[0].clientes;
    return <AppPrincipal consultorId={c.consultor_id || CONSULTOR_UID} usuarioEmail={sessao.user.email} clienteId={c.id} clienteNome={c.nome} isConsultor={false} />;
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
        usuarioEmail={sessao.user.email}
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
        <img src="/rastro-logo.png?v=2" alt="" style={{ width: 72, height: 72, borderRadius: 18, marginBottom: 12 }} />
        <div style={styles.loginBrand}>RASTRO</div>
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

const DATA_FORMATTER = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

// ---------- App principal (depois de resolvido o acesso) ----------
function AppPrincipal({ consultorId, usuarioEmail, clienteId, clienteNome, isConsultor, onTrocarFazenda }) {
  const [tab, setTab] = useState("painel");
  const [menuAberto, setMenuAberto] = useState(false);
  const dados = useDadosRebanho(consultorId, clienteId);
  const { online, sincronizando, pendentes, sincronizar } = useConexao(consultorId);

  const totalAlertas = useMemo(() => (dados.carregando ? 0 : calcularAlertas(dados).length), [dados]);
  const tituloAba = ABAS_SIDEBAR.find((a) => a.id === tab)?.label || (tab === "configuracoes" ? "Configurações" : "");
  const dataHoje = DATA_FORMATTER.format(new Date()).toUpperCase();

  function selecionarTab(id) {
    setTab(id);
    setMenuAberto(false);
  }

  return (
    <div className="app-shell" style={styles.appShell}>
      <Sidebar
        tab={tab}
        onSelecionarTab={selecionarTab}
        clienteNome={clienteNome}
        isConsultor={isConsultor}
        onTrocarFazenda={onTrocarFazenda}
        totalAlertas={totalAlertas}
        usuarioEmail={usuarioEmail}
        isMobileAberta={menuAberto}
        onFechar={() => setMenuAberto(false)}
        onSair={() => supabase.auth.signOut()}
      />

      <div style={styles.mainArea}>
        {/* Barra do celular: hamburguer + nome da fazenda + status */}
        <div className="hide-desktop" style={styles.topbar}>
          <div style={styles.topbarRow}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={() => setMenuAberto(true)} style={styles.iconBtn} title="Menu">
                <Menu size={18} />
              </button>
              <div>
                <div style={styles.brand}>{clienteNome}</div>
                <div style={styles.brandSub}>{tituloAba}</div>
              </div>
            </div>
            <div style={{ ...styles.statusPill, ...(online ? styles.statusOn : styles.statusOff) }}>
              {online ? <Wifi size={13} /> : <WifiOff size={13} />}
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

        {/* Barra fina do desktop: data + status + sincronizar */}
        <div className="show-desktop" style={styles.slimTopbar}>
          <div style={styles.slimTopbarDate}>{dataHoje}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {pendentes > 0 && (
              <button onClick={sincronizar} disabled={sincronizando || !online} style={styles.syncBtn}>
                <RefreshCw size={12} className={sincronizando ? "spin" : ""} /> {sincronizando ? "Enviando..." : `${pendentes} pendente(s) — enviar agora`}
              </button>
            )}
            <div style={{ ...styles.statusPill, ...(online ? styles.statusOn : styles.statusOff) }}>
              {online ? <Wifi size={13} /> : <WifiOff size={13} />}
              {online ? "Online" : "Offline"}{pendentes === 0 && online ? " · Tudo sincronizado" : ""}
            </div>
          </div>
        </div>

        <div className="content-area" style={styles.content}>
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
              {tab === "alertas" && <AlertasTab dados={dados} />}
              {tab === "configuracoes" && <ConfiguracoesTab dados={dados} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
