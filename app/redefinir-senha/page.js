"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { styles } from "@/lib/styles";

// O link enviado por e-mail (resetPasswordForEmail) traz um token na URL
// que o supabase-js já detecta e transforma numa sessão de recuperação
// automaticamente (detectSessionInUrl, ligado por padrão) — não precisa
// ler o hash manualmente aqui, só esperar o evento chegar.
export default function RedefinirSenha() {
  const [pronto, setPronto] = useState(false);
  const [sessaoValida, setSessaoValida] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((evento, session) => {
      if (evento === "PASSWORD_RECOVERY" || (evento === "SIGNED_IN" && session)) {
        setSessaoValida(true);
        setPronto(true);
      }
    });
    // Se o evento já tiver disparado antes deste efeito montar, a sessão
    // de recuperação já existe — confere direto pra não travar em "Carregando".
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSessaoValida(true);
      setPronto(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSalvar(e) {
    e.preventDefault();
    if (senha.length < 6) { setErro("A senha precisa ter pelo menos 6 caracteres."); return; }
    if (senha !== confirmarSenha) { setErro("As senhas não coincidem."); return; }
    setErro("");
    setSalvando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw error;
      setSucesso(true);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  if (!pronto) return <div style={styles.loadingScreen}>Carregando...</div>;

  return (
    <div style={styles.loginScreen}>
      <div style={styles.loginCard}>
        <img src="/rastro-logo.png?v=2" alt="" style={{ width: 72, height: 72, borderRadius: 18, marginBottom: 12 }} />
        <div style={styles.loginBrand}>RASTRO</div>

        {!sessaoValida ? (
          <>
            <div style={styles.loginSub}>Link inválido ou expirado</div>
            <div style={styles.errorBox}>Peça um novo link de redefinição na tela de login.</div>
            <a href="/" style={styles.linkBtn}>Voltar ao login</a>
          </>
        ) : sucesso ? (
          <>
            <div style={styles.loginSub}>Senha alterada!</div>
            <a href="/" style={styles.primaryBtn}>Entrar no app</a>
          </>
        ) : (
          <>
            <div style={styles.loginSub}>Defina sua nova senha</div>
            <form onSubmit={handleSalvar}>
              <label style={styles.field}>
                <div style={styles.fieldLabel}>Nova senha</div>
                <input type="password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} style={styles.input} placeholder="••••••••" />
              </label>
              <label style={styles.field}>
                <div style={styles.fieldLabel}>Confirmar nova senha</div>
                <input type="password" required minLength={6} value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)} style={styles.input} placeholder="••••••••" />
              </label>
              {erro && <div style={styles.errorBox}>{erro}</div>}
              <button type="submit" disabled={salvando} style={styles.primaryBtn}>
                {salvando ? "Salvando..." : "Salvar nova senha"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
