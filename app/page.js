"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { styles } from "@/lib/styles";
import { useDadosRebanho } from "@/lib/useDadosRebanho";
import { useConexao } from "@/lib/useConexao";
import { calcularAlertas } from "@/lib/alerts";
import { Wifi, WifiOff, RefreshCw, Menu, Plus, X } from "lucide-react";
import Sidebar, { ABAS_SIDEBAR } from "@/components/Sidebar";
import PainelTab from "@/components/PainelTab";
import AnimaisTab from "@/components/AnimaisTab";
import LocaisLotesTab from "@/components/LocaisLotesTab";
import MovimentacoesTab from "@/components/MovimentacoesTab";
import PesagensTab from "@/components/PesagensTab";
import SanidadeTab from "@/components/SanidadeTab";
import AlertasTab from "@/components/AlertasTab";
import GmdAbatidosTab from "@/components/GmdAbatidosTab";
import ConfiguracoesTab from "@/components/ConfiguracoesTab";

// Mesmo UID do consultor usado no Consultoria-main e no
// Confinamento-main (é a mesma pessoa logada nos três apps). O
// consultor enxerga todas as fazendas; um operador de campo só
// enxerga a fazenda em que foi vinculado via código de convite.
const CONSULTOR_UID = "0db4e2fd-9cef-4e3f-9fb7-f974d4d22e02";

// Domínio estável de produção — usado no link de redefinição de senha
// enviado por e-mail. Nunca usar window.location.origin aqui: URLs de
// deployment do Vercel (com hash) exigem login SSO do Vercel pra abrir,
// e o link cairia numa dessas se o consultor disparar a redefinição a
// partir de um preview.
const URL_PRODUCAO = "https://rebanho-app-omega.vercel.app";

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
      } else if (modo === "cadastro") {
        const { error } = await supabase.auth.signUp({ email, password: senha });
        if (error) throw error;
        setErro("Conta criada! Verifique seu e-mail para confirmar o acesso e depois entre novamente.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${URL_PRODUCAO}/redefinir-senha`,
        });
        if (error) throw error;
        setErro("Se esse e-mail estiver cadastrado, enviamos um link para redefinir a senha. Verifique também a caixa de spam.");
      }
    } catch (err) {
      setErro(traduzErro(err.message));
    } finally {
      setCarregando(false);
    }
  }

  const titulos = {
    login: "Acompanhamento individual do rebanho",
    cadastro: "Crie sua conta de acesso",
    recuperar: "Informe o e-mail da sua conta",
  };

  return (
    <div style={styles.loginScreen}>
      <div style={styles.loginCard}>
        <img src="/rastro-logo.png?v=2" alt="" style={{ width: 72, height: 72, borderRadius: 18, marginBottom: 12 }} />
        <div style={styles.loginBrand}>RASTRO</div>
        <div style={styles.loginSub}>{titulos[modo]}</div>
        <form onSubmit={handleSubmit}>
          <label style={styles.field}>
            <div style={styles.fieldLabel}>E-mail</div>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={styles.input} placeholder="voce@email.com" />
          </label>
          {modo !== "recuperar" && (
            <label style={styles.field}>
              <div style={styles.fieldLabel}>Senha</div>
              <input type="password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} style={styles.input} placeholder="••••••••" />
            </label>
          )}
          {erro && <div style={styles.errorBox}>{erro}</div>}
          <button type="submit" disabled={carregando} style={styles.primaryBtn}>
            {carregando ? "Aguarde..." : modo === "login" ? "Entrar" : modo === "cadastro" ? "Criar conta" : "Enviar link de redefinição"}
          </button>
        </form>
        {modo === "login" && (
          <>
            <button onClick={() => { setModo("cadastro"); setErro(""); }} style={styles.linkBtn}>
              Recebeu um código do seu consultor? Criar conta
            </button>
            <button onClick={() => { setModo("recuperar"); setErro(""); }} style={styles.linkBtn}>
              Esqueci minha senha
            </button>
          </>
        )}
        {modo !== "login" && (
          <button onClick={() => { setModo("login"); setErro(""); }} style={styles.linkBtn}>
            Já tem conta? Entrar
          </button>
        )}
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
      const { error: erroVinculo } = await supabase.rpc("resgatar_convite_rebanho", {
        p_codigo: codigo.trim(),
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
      .select("cliente_id, papel, fazenda_id, clientes(id, nome, consultor_id)")
      .eq("auth_user_id", sessao.user.id);
    setVinculos(data || []);
  }, [sessao.user.id]);

  useEffect(() => {
    carregarVinculos();
  }, [carregarVinculos]);

  if (vinculos === undefined) return <div style={styles.loadingScreen}>Carregando...</div>;
  if (vinculos.length === 0) return <TelaVincularConvite onVinculado={carregarVinculos} />;

  if (fazendaEscolhida) {
    const vinculo = vinculos.find((v) => v.cliente_id === fazendaEscolhida.id);
    return <AmbienteCliente consultorId={fazendaEscolhida.consultor_id || CONSULTOR_UID} usuarioEmail={sessao.user.email} clienteId={fazendaEscolhida.id} clienteNome={fazendaEscolhida.nome} isConsultor={false} papel={vinculo?.papel || "editor"} fazendaRestrita={vinculo?.fazenda_id || null} onTrocarCliente={() => setFazendaEscolhida(null)} />;
  }

  if (vinculos.length === 1) {
    const c = vinculos[0].clientes;
    return <AmbienteCliente consultorId={c.consultor_id || CONSULTOR_UID} usuarioEmail={sessao.user.email} clienteId={c.id} clienteNome={c.nome} isConsultor={false} papel={vinculos[0].papel || "editor"} fazendaRestrita={vinculos[0].fazenda_id || null} />;
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
      <AmbienteCliente
        consultorId={sessao.user.id}
        usuarioEmail={sessao.user.email}
        clienteId={fazendaEscolhida.id}
        clienteNome={fazendaEscolhida.nome}
        isConsultor
        onTrocarCliente={() => setFazendaEscolhida(null)}
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

function AmbienteCliente({ consultorId, usuarioEmail, clienteId, clienteNome, isConsultor, papel = "administrador", fazendaRestrita = null, onTrocarCliente }) {
  const [fazendas, setFazendas] = useState(undefined);
  const [fazendaId, setFazendaId] = useState(null);
  const [erro, setErro] = useState("");
  const [nomeNovaFazenda, setNomeNovaFazenda] = useState("");
  const [erroNovaFazenda, setErroNovaFazenda] = useState("");
  const [criandoFazenda, setCriandoFazenda] = useState(false);

  const carregarFazendas = useCallback(async (preferidaId) => {
    const { data, error } = await supabase
      .from("rebanho_fazendas")
      .select("id, nome, ativo")
      .eq("cliente_id", clienteId)
      .eq("ativo", true)
      .order("nome");
    if (error) {
      setErro(error.message);
      setFazendas([]);
      return;
    }
    const lista = data || [];
    setFazendas(lista);
    const salva = localStorage.getItem(`rastro-fazenda-${clienteId}`);
    const escolhida = fazendaRestrita || preferidaId || (lista.some((item) => item.id === salva) ? salva : lista[0]?.id);
    setFazendaId(escolhida || null);
  }, [clienteId, fazendaRestrita]);

  useEffect(() => {
    carregarFazendas();
  }, [carregarFazendas]);

  function selecionarFazenda(id) {
    setFazendaId(id);
    localStorage.setItem(`rastro-fazenda-${clienteId}`, id);
  }

  async function criarFazenda(nome) {
    const { data, error } = await supabase
      .from("rebanho_fazendas")
      .insert({ consultor_id: consultorId, cliente_id: clienteId, nome: nome.trim() })
      .select("id, nome, ativo")
      .single();
    if (error) throw error;
    await carregarFazendas(data.id);
    localStorage.setItem(`rastro-fazenda-${clienteId}`, data.id);
    return data;
  }

  async function criarPrimeiraFazenda(e) {
    e.preventDefault();
    if (!nomeNovaFazenda.trim()) return;
    setCriandoFazenda(true);
    setErroNovaFazenda("");
    try {
      await criarFazenda(nomeNovaFazenda);
      setNomeNovaFazenda("");
    } catch (err) {
      setErroNovaFazenda(err.code === "23505" ? "Já existe uma fazenda com esse nome para este cliente." : err.message);
    } finally {
      setCriandoFazenda(false);
    }
  }

  async function atualizarFazenda(id, mudancas) {
    const { data, error } = await supabase
      .from("rebanho_fazendas")
      .update({ ...mudancas, atualizado_em: new Date().toISOString() })
      .eq("id", id)
      .eq("cliente_id", clienteId)
      .select("id, nome, ativo")
      .single();
    if (error) throw error;
    setFazendas((atuais) => atuais.map((item) => item.id === id ? data : item));
    return data;
  }

  if (fazendas === undefined) return <div style={styles.loadingScreen}>Carregando fazendas...</div>;
  if (erro || !fazendaId) {
    const podeCriar = !erro && (isConsultor || papel === "administrador" || papel === "editor");
    return (
      <div style={styles.loginScreen}>
        <div style={styles.loginCard}>
          <div style={styles.loginBrand}>Fazendas do cliente</div>
          <div style={styles.errorBox}>
            {erro || (podeCriar ? "Este cliente ainda não tem nenhuma fazenda cadastrada. Crie a primeira abaixo." : "Nenhuma fazenda disponível. Peça ao seu consultor para cadastrar uma.")}
          </div>
          {podeCriar && (
            <form onSubmit={criarPrimeiraFazenda} style={{ marginTop: 4 }}>
              <label style={styles.field}>
                <div style={styles.fieldLabel}>Nome da fazenda</div>
                <input autoFocus value={nomeNovaFazenda} onChange={(e) => setNomeNovaFazenda(e.target.value)} style={styles.input} placeholder="Ex: Fazenda Santa Maria" />
              </label>
              {erroNovaFazenda && <div style={styles.errorBox}>{erroNovaFazenda}</div>}
              <button type="submit" disabled={criandoFazenda || !nomeNovaFazenda.trim()} style={styles.primaryBtn}>{criandoFazenda ? "Salvando..." : "Cadastrar fazenda"}</button>
            </form>
          )}
          {onTrocarCliente && <button onClick={onTrocarCliente} style={styles.linkBtn}>Voltar aos clientes</button>}
        </div>
      </div>
    );
  }

  const fazenda = fazendas.find((item) => item.id === fazendaId) || fazendas[0];
  return (
    <AppPrincipal
      consultorId={consultorId}
      usuarioEmail={usuarioEmail}
      clienteId={clienteId}
      clienteNome={clienteNome}
      fazenda={fazenda}
      fazendas={fazendas}
      onSelecionarFazenda={selecionarFazenda}
      onCriarFazenda={criarFazenda}
      onAtualizarFazenda={atualizarFazenda}
      isConsultor={isConsultor}
      papel={papel}
      fazendaRestrita={!!fazendaRestrita}
      onTrocarCliente={onTrocarCliente}
    />
  );
}

// ---------- App principal (depois de resolvido o acesso) ----------
function AppPrincipal({ consultorId, usuarioEmail, clienteId, clienteNome, fazenda, fazendas, onSelecionarFazenda, onCriarFazenda, onAtualizarFazenda, isConsultor, papel = "administrador", fazendaRestrita = false, onTrocarCliente }) {
  const [tab, setTab] = useState("painel");
  const [menuAberto, setMenuAberto] = useState(false);
  const [animalAbrirId, setAnimalAbrirId] = useState(null);
  const [modalFazenda, setModalFazenda] = useState(false);
  const [nomeNovaFazenda, setNomeNovaFazenda] = useState("");
  const [erroFazenda, setErroFazenda] = useState("");
  const [salvandoFazenda, setSalvandoFazenda] = useState(false);
  const dados = useDadosRebanho(consultorId, clienteId, fazenda.id);
  const { online, sincronizando, pendentes, sincronizar } = useConexao(consultorId);
  const podeEditar = isConsultor || papel === "administrador" || papel === "editor";
  const podeTrocarFazenda = !fazendaRestrita;

  const totalAlertas = useMemo(() => (dados.carregando ? 0 : calcularAlertas(dados).length), [dados]);
  const tituloAba = ABAS_SIDEBAR.find((a) => a.id === tab)?.label || (tab === "configuracoes" ? "Configurações" : "");
  const dataHoje = DATA_FORMATTER.format(new Date()).toUpperCase();

  function selecionarTab(id) {
    setTab(id);
    setMenuAberto(false);
  }

  async function salvarNovaFazenda(e) {
    e.preventDefault();
    if (!nomeNovaFazenda.trim()) return;
    setSalvandoFazenda(true);
    setErroFazenda("");
    try {
      await onCriarFazenda(nomeNovaFazenda);
      setNomeNovaFazenda("");
      setModalFazenda(false);
      setTab("painel");
    } catch (err) {
      setErroFazenda(err.code === "23505" ? "Já existe uma fazenda com esse nome para este cliente." : err.message);
    } finally {
      setSalvandoFazenda(false);
    }
  }

  return (
    <div className="app-shell" style={styles.appShell}>
      <Sidebar
        tab={tab}
        onSelecionarTab={selecionarTab}
        clienteNome={clienteNome}
        fazendaNome={fazenda.nome}
        isConsultor={isConsultor}
        onTrocarCliente={onTrocarCliente}
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
                <div style={styles.brandSub}>{fazenda.nome} · {tituloAba}</div>
              </div>
            </div>
            <div style={{ ...styles.statusPill, ...(online ? styles.statusOn : styles.statusOff) }}>
              {online ? <Wifi size={13} /> : <WifiOff size={13} />}
            </div>
          </div>
          <div style={{ display: "flex", gap: 7, marginTop: 9 }}>
            {podeTrocarFazenda ? (
              <select value={fazenda.id} onChange={(e) => { onSelecionarFazenda(e.target.value); setTab("painel"); }} style={{ ...styles.input, flex: 1, padding: "9px 34px 9px 10px" }} aria-label="Fazenda ativa">
                {fazendas.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
              </select>
            ) : (
              <div style={{ ...styles.input, flex: 1, display: "flex", alignItems: "center" }}>{fazenda.nome}</div>
            )}
            {podeEditar && podeTrocarFazenda && <button type="button" onClick={() => setModalFazenda(true)} style={styles.iconBtn} title="Cadastrar outra fazenda" aria-label="Cadastrar outra fazenda"><Plus size={17} /></button>}
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
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {podeTrocarFazenda ? (
              <select value={fazenda.id} onChange={(e) => { onSelecionarFazenda(e.target.value); setTab("painel"); }} style={{ ...styles.input, width: "auto", minWidth: 190, padding: "8px 34px 8px 10px" }}>
                {fazendas.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
              </select>
            ) : (
              <div style={{ ...styles.input, width: "auto", minWidth: 190, display: "flex", alignItems: "center" }}>{fazenda.nome}</div>
            )}
            {podeEditar && podeTrocarFazenda && <button type="button" onClick={() => setModalFazenda(true)} style={styles.iconBtn} title="Cadastrar outra fazenda"><Plus size={17} /></button>}
            <div style={styles.slimTopbarDate}>{dataHoje}</div>
          </div>
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
              {tab === "painel" && (
                <PainelTab
                  dados={dados}
                  onAbrirAnimal={(animalId) => {
                    setAnimalAbrirId(animalId);
                    setTab("animais");
                  }}
                  onAbrirGmdAbatidos={() => setTab("gmd-abatidos")}
                />
              )}
              {tab === "animais" && (
                <AnimaisTab
                  dados={dados}
                  animalInicialId={animalAbrirId}
                  onAnimalInicialConsumido={() => setAnimalAbrirId(null)}
                />
              )}
              {tab === "locais" && <LocaisLotesTab dados={dados} />}
              {tab === "movimentacoes" && <MovimentacoesTab dados={dados} />}
              {tab === "pesagens" && <PesagensTab dados={dados} />}
              {tab === "sanidade" && <SanidadeTab dados={dados} />}
              {tab === "gmd-abatidos" && (
                <GmdAbatidosTab
                  dados={dados}
                  onAbrirAnimal={(animalId) => {
                    setAnimalAbrirId(animalId);
                    setTab("animais");
                  }}
                />
              )}
              {tab === "alertas" && <AlertasTab dados={dados} />}
              {tab === "configuracoes" && (
                <ConfiguracoesTab
                  dados={dados}
                  clienteId={clienteId}
                  consultorId={consultorId}
                  fazenda={fazenda}
                  fazendas={fazendas}
                  onAtualizarFazenda={onAtualizarFazenda}
                  isConsultor={isConsultor}
                  papelAtual={papel}
                />
              )}
            </>
          )}
        </div>
      </div>
      {modalFazenda && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(15,35,31,.55)", display: "grid", placeItems: "center", padding: 18 }}>
          <form onSubmit={salvarNovaFazenda} style={{ ...styles.card, width: "100%", maxWidth: 420, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={styles.listItemTitle}>Cadastrar nova fazenda</div>
                <div style={styles.listItemSub}>Os dados ficarão separados das outras fazendas.</div>
              </div>
              <button type="button" onClick={() => setModalFazenda(false)} style={styles.iconBtn}><X size={17} /></button>
            </div>
            <label style={styles.field}>
              <div style={styles.fieldLabel}>Nome da fazenda</div>
              <input autoFocus value={nomeNovaFazenda} onChange={(e) => setNomeNovaFazenda(e.target.value)} style={styles.input} placeholder="Ex: Fazenda Santa Maria" />
            </label>
            {erroFazenda && <div style={styles.errorBox}>{erroFazenda}</div>}
            <button type="submit" disabled={salvandoFazenda || !nomeNovaFazenda.trim()} style={styles.primaryBtn}>{salvandoFazenda ? "Salvando..." : "Cadastrar fazenda"}</button>
          </form>
        </div>
      )}
    </div>
  );
}
