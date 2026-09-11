"use client";

import { styles } from "@/lib/styles";
import {
  LayoutDashboard,
  Tag as TagIcon,
  MapPin,
  Scale,
  Stethoscope,
  ArrowLeftRight,
  AlertTriangle,
  TrendingUp,
  Settings,
  LogOut,
  X,
} from "lucide-react";

// Vaca (grande) + bezerro (pequeno) — não existe no lucide-react, então é
// um ícone próprio: cabeças de frente, no mesmo espírito do logo do app
// (rastro-logo.png, também cabeça bovina de frente), não um corpo de
// lado — fica mais reconhecível no tamanho pequeno do menu.
// stroke="currentColor" herda a cor ativa/inativa igual aos ícones lucide.
function IconeVacaBezerro({ size = 17, strokeWidth = 1.9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2.5c-2 0-3.6 1.6-3.6 3.7v2.6c0 2.4 1.6 4.2 3.6 4.2s3.6-1.8 3.6-4.2V6.2c0-2.1-1.6-3.7-3.6-3.7z" />
      <path d="M6 4.4c-1.5-.5-3.1-.5-4.5.5.5 1.3 1.8 2.3 3.3 2.7M13 4.4c1.5-.5 3.1-.5 4.5.5-.5 1.3-1.8 2.3-3.3 2.7" />
      <circle cx="7.9" cy="8" r=".45" fill="currentColor" stroke="none" />
      <circle cx="11.1" cy="8" r=".45" fill="currentColor" stroke="none" />
      <path d="M17.5 12c-1.5 0-2.7 1.2-2.7 2.8v2c0 1.8 1.2 3.1 2.7 3.1s2.7-1.3 2.7-3.1v-2c0-1.6-1.2-2.8-2.7-2.8z" />
      <path d="M15 13.4c-1.1-.4-2.3-.4-3.3.4.4 1 1.3 1.7 2.4 2M20 13.4c1.1-.4 2.3-.4 3.3.4-.4 1-1.3 1.7-2.4 2" />
    </svg>
  );
}

export const ABAS_SIDEBAR = [
  { id: "painel", label: "Painel", icon: LayoutDashboard },
  { id: "animais", label: "Animais", icon: TagIcon },
  { id: "cria", label: "Cria", icon: IconeVacaBezerro },
  { id: "locais", label: "Lotes e locais", icon: MapPin },
  { id: "pesagens", label: "Pesagens", icon: Scale },
  { id: "sanidade", label: "Sanidade", icon: Stethoscope },
  { id: "movimentacoes", label: "Movimentações", icon: ArrowLeftRight },
  { id: "gmd-abatidos", label: "GMD de abatidos", icon: TrendingUp },
  { id: "alertas", label: "Alertas", icon: AlertTriangle },
];

export default function Sidebar({ tab, onSelecionarTab, clienteNome, fazendaNome, isConsultor, onTrocarCliente, totalAlertas, usuarioEmail, isMobileAberta, onFechar, onSair }) {
  return (
    <>
      {isMobileAberta && <div className="sidebar-drawer-backdrop hide-desktop" onClick={onFechar} />}
      <aside className={`sidebar-shell ${isMobileAberta ? "aberta" : ""}`} style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <img src="/rastro-logo.png?v=2" alt="RASTRO" style={styles.sidebarLogoBox} />
          <div style={{ flex: 1 }}>
            <div style={styles.sidebarBrand}>RASTRO</div>
            <div style={styles.sidebarBrandSub}>Gestão individual do rebanho</div>
          </div>
          <button className="hide-desktop" onClick={onFechar} style={{ background: "transparent", border: "none", color: "#CFE3DC", cursor: "pointer", display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        <button
          style={styles.sidebarFazendaBox}
          onClick={isConsultor ? onTrocarCliente : undefined}
          title={isConsultor ? "Trocar cliente" : undefined}
        >
          <div>
            <div style={styles.sidebarFazendaLabel}>{clienteNome}</div>
            <div style={styles.sidebarFazendaNome}>{fazendaNome}</div>
          </div>
          {isConsultor && <ArrowLeftRight size={14} color="#9FC2B7" />}
        </button>

        <nav style={styles.sidebarNav}>
          {ABAS_SIDEBAR.map(({ id, label, icon: Icon }) => {
            const ativo = tab === id;
            const badge = id === "alertas" && totalAlertas > 0 ? totalAlertas : null;
            return (
              <button
                key={id}
                onClick={() => onSelecionarTab(id)}
                style={{ ...styles.sidebarNavBtn, ...(ativo ? styles.sidebarNavBtnActive : {}) }}
              >
                <Icon size={17} strokeWidth={ativo ? 2.4 : 1.9} />
                {label}
                {badge != null && <span style={styles.sidebarNavBadge}>{badge}</span>}
              </button>
            );
          })}
        </nav>

        <div style={styles.sidebarFooter}>
          <button
            onClick={() => onSelecionarTab("configuracoes")}
            style={{ ...styles.sidebarNavBtn, ...(tab === "configuracoes" ? styles.sidebarNavBtnActive : {}), marginBottom: 8 }}
          >
            <Settings size={17} strokeWidth={tab === "configuracoes" ? 2.4 : 1.9} />
            Configurações
          </button>
          <div style={styles.sidebarUserRow}>
            <div style={styles.sidebarUserAvatar}>{iniciais(usuarioEmail)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={styles.sidebarUserNome}>{usuarioEmail}</div>
              <div style={styles.sidebarUserPapel}>{isConsultor ? "Consultor" : "Operador"}</div>
            </div>
            <button onClick={onSair} style={styles.sidebarSairBtn} title="Sair">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function iniciais(email) {
  if (!email) return "?";
  return email.slice(0, 2).toUpperCase();
}
