"use client";

import { useEffect, useRef, useState } from "react";
import { kml } from "@tmcw/togeojson";
import { strFromU8, unzipSync } from "fflate";
import { FileUp, LocateFixed, Map as MapIcon, MapPin, Move, Search } from "lucide-react";
import { styles } from "@/lib/styles";
import { InputField, SelectField, PrimaryButton } from "@/components/UI";

const TIPOS_LOCAL = { pasto: "Pasto", curral: "Curral", baia: "Baia", outro: "Outro" };

function normalizar(texto) {
  return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

async function lerArquivoGeografico(arquivo) {
  if (arquivo.size > 15 * 1024 * 1024) throw new Error("O arquivo deve ter no máximo 15 MB.");
  const extensao = arquivo.name.split(".").pop()?.toLowerCase();
  let texto;
  if (extensao === "kmz") {
    const arquivos = unzipSync(new Uint8Array(await arquivo.arrayBuffer()));
    const nomeKml = Object.keys(arquivos).find((nome) => nome.toLowerCase().endsWith(".kml"));
    if (!nomeKml) throw new Error("Este KMZ não contém um arquivo KML.");
    texto = strFromU8(arquivos[nomeKml]);
  } else if (extensao === "kml") {
    texto = await arquivo.text();
  } else {
    throw new Error("Selecione um arquivo KML ou KMZ.");
  }
  const xml = new DOMParser().parseFromString(texto, "text/xml");
  if (xml.querySelector("parsererror")) throw new Error("Não foi possível interpretar o KML.");
  const geojson = kml(xml);
  const areas = geojson.features.filter((feature) => ["Polygon", "MultiPolygon"].includes(feature.geometry?.type));
  if (!areas.length) throw new Error("Nenhum limite ou polígono de pasto foi encontrado.");
  const pontos = JSON.stringify(areas).match(/-?\d+\.\d+/g)?.length || 0;
  if (pontos > 200000) throw new Error("O mapa possui detalhes demais. Simplifique o KML antes de importar.");
  return { type: "FeatureCollection", features: areas };
}

function localAtualDoLote(lote, dados) {
  const animal = dados.animais.find((item) => item.situacao === "ativo" && item.lote_atual_id === lote.id && item.local_atual_id);
  return animal?.local_atual_id || lote.local_id || null;
}

export default function MapaFazenda({ dados }) {
  const elementoRef = useRef(null);
  const mapaRef = useRef(null);
  const leafletRef = useRef(null);
  const camadasRef = useRef([]);
  const grupoDadosRef = useRef(null);
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState([]);
  const [mensagem, setMensagem] = useState("");
  const [processando, setProcessando] = useState(false);
  const [loteSelecionadoId, setLoteSelecionadoId] = useState(null);
  const [mapaPronto, setMapaPronto] = useState(false);
  const [criandoLocal, setCriandoLocal] = useState(false);
  const [nomeNovoLocal, setNomeNovoLocal] = useState("");
  const [tipoNovoLocal, setTipoNovoLocal] = useState("pasto");
  const [erroNovoLocal, setErroNovoLocal] = useState("");
  const [salvandoLocal, setSalvandoLocal] = useState(false);

  useEffect(() => {
    let ativo = true;
    import("leaflet").then((modulo) => {
      if (!ativo || mapaRef.current || !elementoRef.current) return;
      const L = modulo.default || modulo;
      leafletRef.current = L;
      const mapa = L.map(elementoRef.current, { zoomControl: true }).setView([-18.5, -49.5], 5);
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19,
        attribution: "Esri, Maxar, Earthstar Geographics e comunidade GIS",
      }).addTo(mapa);
      grupoDadosRef.current = L.layerGroup().addTo(mapa);
      mapaRef.current = mapa;
      setMapaPronto(true);
      setTimeout(() => mapa.invalidateSize(), 0);
    });
    return () => {
      ativo = false;
      mapaRef.current?.remove();
      mapaRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const mapa = mapaRef.current;
    const grupo = grupoDadosRef.current;
    if (!L || !mapa || !grupo) return;
    grupo.clearLayers();
    camadasRef.current = [];

    const geojson = dados.mapaFazenda?.geojson;
    if (geojson?.features?.length) {
      const camadaGeo = L.geoJSON(geojson, {
        style: { color: "#1F4D45", weight: 2, fillColor: "#90B77D", fillOpacity: 0.34 },
        onEachFeature(feature, layer) {
          const nome = feature.properties?.name || "Área da fazenda";
          const elemento = document.createElement("span");
          elemento.textContent = nome;
          layer.bindTooltip(elemento, { sticky: true });
          const localId = feature.properties?.local_id;
          layer.on("click", () => {
            if (loteSelecionadoId && localId) transferirLote(loteSelecionadoId, localId);
          });
          camadasRef.current.push({ layer, localId });
        },
      }).addTo(grupo);
      if (camadaGeo.getBounds().isValid()) mapa.fitBounds(camadaGeo.getBounds(), { padding: [20, 20] });
    }

    for (const cocho of dados.cochos) {
      const area = camadasRef.current.find((item) => item.localId === cocho.local_id);
      const posicao = cocho.latitude && cocho.longitude
        ? [Number(cocho.latitude), Number(cocho.longitude)]
        : area?.layer.getBounds().getCenter();
      if (!posicao) continue;
      L.marker(posicao, {
        icon: L.divIcon({
          className: "rastro-map-icon",
          html: '<span class="rastro-cocho-pin"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 9h22l-3 10H8L5 9Z"/><path d="M10 19 8 26M22 19l2 7M4 9h24"/></svg></span>',
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        }),
      }).bindTooltip(cocho.latitude ? cocho.nome : `${cocho.nome} · posição aproximada`).addTo(grupo);
    }

    for (const lote of dados.lotes.filter((item) => item.situacao === "ativo")) {
      const localId = localAtualDoLote(lote, dados);
      const area = camadasRef.current.find((item) => item.localId === localId);
      if (!area) continue;
      const quantidade = dados.animais.filter((animal) => animal.situacao === "ativo" && animal.lote_atual_id === lote.id).length;
      const marcador = L.marker(area.layer.getBounds().getCenter(), {
        draggable: true,
        icon: L.divIcon({
          className: "rastro-map-icon",
          html: `<span class="rastro-lote-pin">${String(lote.nome).replace(/[<>&"']/g, "")} · ${quantidade}</span>`,
          iconSize: [120, 32],
          iconAnchor: [60, 16],
        }),
      }).addTo(grupo);
      marcador.on("click", () => setLoteSelecionadoId((atual) => atual === lote.id ? null : lote.id));
      marcador.on("dragend", () => {
        const destino = camadasRef.current.find((item) => item.localId && item.layer.getBounds().contains(marcador.getLatLng()));
        if (destino) transferirLote(lote.id, destino.localId);
        else marcador.setLatLng(area.layer.getBounds().getCenter());
      });
    }
  // A transferência usa a fotografia atual dos dados, redesenhando depois.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapaPronto, dados.mapaFazenda, dados.cochos, dados.lotes, dados.animais, loteSelecionadoId]);

  async function transferirLote(loteId, localDestinoId) {
    const lote = dados.lotes.find((item) => item.id === loteId);
    const origemId = localAtualDoLote(lote, dados);
    if (!lote || origemId === localDestinoId) return setLoteSelecionadoId(null);
    const destino = dados.locais.find((item) => item.id === localDestinoId);
    if (!destino) return;
    const animais = dados.animais.filter((animal) => animal.situacao === "ativo" && animal.lote_atual_id === lote.id);
    if (!window.confirm(`Transferir o ${lote.nome}, com ${animais.length} animal(is), para ${destino.nome}?`)) return;
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
    setLoteSelecionadoId(null);
    setMensagem(`Lote transferido para ${destino.nome}. A operação sincroniza automaticamente quando houver internet.`);
  }

  async function importarArquivo(event) {
    const arquivo = event.target.files?.[0];
    if (!arquivo) return;
    setProcessando(true);
    setMensagem("");
    try {
      const geojson = await lerArquivoGeografico(arquivo);
      const locaisPorNome = new Map(dados.locais.map((local) => [normalizar(local.nome), local]));
      const faltantes = [...new Set(geojson.features.map((feature, index) => feature.properties?.name || `Pasto ${index + 1}`))]
        .filter((nome) => !locaisPorNome.has(normalizar(nome)));
      if (faltantes.length && !window.confirm(`Foram encontradas ${faltantes.length} áreas sem local correspondente. Deseja cadastrá-las como pastos?`)) return;
      for (const nome of faltantes) {
        const criado = await dados.criarLocal({ nome, tipo: "pasto", capacidade: null });
        locaisPorNome.set(normalizar(nome), criado);
      }
      const vinculado = {
        ...geojson,
        features: geojson.features.map((feature, index) => {
          const nome = feature.properties?.name || `Pasto ${index + 1}`;
          return { ...feature, properties: { ...feature.properties, name: nome, local_id: locaisPorNome.get(normalizar(nome))?.id || null } };
        }),
      };
      const L = leafletRef.current;
      const limites = L?.geoJSON(vinculado).getBounds();
      const centro = limites?.isValid() ? limites.getCenter() : null;
      await dados.salvarMapaFazenda({
        geojson: vinculado,
        nomeArquivo: arquivo.name,
        origem: arquivo.name.toLowerCase().endsWith(".kmz") ? "kmz" : "kml",
        centroLat: centro?.lat || null,
        centroLng: centro?.lng || null,
      });
      setMensagem(`${vinculado.features.length} área(s) importada(s) de ${arquivo.name}.`);
    } catch (err) {
      setMensagem(err.message || "Não foi possível importar o arquivo.");
    } finally {
      setProcessando(false);
      event.target.value = "";
    }
  }

  async function procurar() {
    if (busca.trim().length < 3) return;
    setProcessando(true);
    try {
      const resposta = await fetch(`/api/geocodificar?q=${encodeURIComponent(busca.trim())}`);
      const json = await resposta.json();
      setResultados(json.resultados || []);
      if (!json.resultados?.length) setMensagem("Nenhum local encontrado. Tente município, estado e nome da fazenda.");
    } catch {
      setMensagem("A busca precisa de internet. Você ainda pode importar o KML.");
    } finally {
      setProcessando(false);
    }
  }

  async function salvarNovoLocal() {
    if (!nomeNovoLocal.trim()) { setErroNovoLocal("Informe o nome do local."); return; }
    setErroNovoLocal("");
    setSalvandoLocal(true);
    try {
      await dados.criarLocal({ nome: nomeNovoLocal.trim(), tipo: tipoNovoLocal, capacidade: null });
      setMensagem(`Local "${nomeNovoLocal.trim()}" criado. Já pode ser vinculado a lotes; pra aparecer desenhado no mapa, inclua a área correspondente num KML/KMZ.`);
      setNomeNovoLocal("");
      setTipoNovoLocal("pasto");
      setCriandoLocal(false);
    } catch (err) {
      setErroNovoLocal(err.message || "Não foi possível criar o local.");
    } finally {
      setSalvandoLocal(false);
    }
  }

  function usarGps() {
    navigator.geolocation?.getCurrentPosition(
      (posicao) => mapaRef.current?.setView([posicao.coords.latitude, posicao.coords.longitude], 16),
      () => setMensagem("Autorize a localização do navegador para usar o GPS."),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  return (
    <div>
      <div style={{ ...styles.offlineNotice, background: "#E4EFE9", color: "#1F4D45" }}>
        <MapIcon size={17} />
        <div><strong>Mapa geográfico da fazenda</strong><br />Importe o KML/KMZ para desenhar os pastos, ou toque em "Novo local" pra cadastrar um local sem desenhar área. As áreas importadas permanecem visíveis offline.</div>
      </div>
      <div style={{ ...styles.tableFiltersRow, padding: 0, border: 0, marginBottom: 10 }}>
        <div style={styles.tableSearchBox}>
          <Search size={15} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => e.key === "Enter" && procurar()} placeholder="Procurar fazenda, município e estado" style={styles.input} />
        </div>
        <button type="button" onClick={procurar} disabled={processando} style={styles.editLinkBtn}>Procurar</button>
        <button type="button" onClick={usarGps} style={styles.iconEditBtn} title="Minha localização"><LocateFixed size={16} /></button>
        <label style={{ ...styles.editLinkBtn, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <FileUp size={15} /> {processando ? "Processando..." : "Importar KML/KMZ"}
          <input type="file" accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz" onChange={importarArquivo} disabled={processando} hidden />
        </label>
        <button type="button" onClick={() => setCriandoLocal((atual) => !atual)} style={{ ...styles.editLinkBtn, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <MapPin size={15} /> Novo local
        </button>
      </div>
      {criandoLocal && (
        <div style={{ ...styles.card, marginBottom: 10 }}>
          <InputField label="Nome do local" value={nomeNovoLocal} onChange={setNomeNovoLocal} placeholder="Ex: Piquete 3" />
          <SelectField label="Tipo" value={tipoNovoLocal} onChange={setTipoNovoLocal} options={Object.entries(TIPOS_LOCAL).map(([value, label]) => ({ value, label }))} />
          <div style={{ ...styles.tableCellSub, marginBottom: 8 }}>
            Isso cadastra o local (pra usar em lotes e animais) sem depender de importar KML — a área desenhada no mapa continua vindo só do KML/KMZ.
          </div>
          {erroNovoLocal && <div style={styles.errorBox}>{erroNovoLocal}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <PrimaryButton onClick={salvarNovoLocal} disabled={salvandoLocal}>{salvandoLocal ? "Salvando..." : "Salvar local"}</PrimaryButton>
            <button type="button" onClick={() => { setCriandoLocal(false); setErroNovoLocal(""); }} style={styles.linkBtn}>Cancelar</button>
          </div>
        </div>
      )}
      {resultados.length > 0 && (
        <div style={{ ...styles.card, padding: 8, marginBottom: 10 }}>
          {resultados.map((resultado) => (
            <button key={`${resultado.latitude}-${resultado.longitude}`} type="button" style={{ ...styles.listItem, marginBottom: 5 }} onClick={() => {
              mapaRef.current?.setView([resultado.latitude, resultado.longitude], 15);
              setResultados([]);
            }}>
              <div style={{ flex: 1, fontSize: 12.5 }}>{resultado.nome}</div>
            </button>
          ))}
        </div>
      )}
      {mensagem && <div style={styles.errorBox}>{mensagem}</div>}
      <div ref={elementoRef} style={{ height: "min(68vh, 650px)", minHeight: 430, borderRadius: 16, overflow: "hidden", border: "1px solid #D8D6CD", background: "#E7E4DC" }} />
      <div style={styles.hardwareHint}>
        <Move size={12} style={{ verticalAlign: "middle" }} /> Toque num lote e depois no pasto, ou arraste no computador. Os quadrantes já visualizados ficam no cache do aparelho.
      </div>
    </div>
  );
}
