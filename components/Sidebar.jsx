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
  Settings,
  LogOut,
  X,
} from "lucide-react";

export const ABAS_SIDEBAR = [
  { id: "painel", label: "Painel", icon: LayoutDashboard },
  { id: "animais", label: "Animais", icon: TagIcon },
  { id: "locais", label: "Lotes e locais", icon: MapPin },
  { id: "pesagens", label: "Pesagens", icon: Scale },
  { id: "sanidade", label: "Sanidade", icon: Stethoscope },
  { id: "movimentacoes", label: "Movimentações", icon: ArrowLeftRight },
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
