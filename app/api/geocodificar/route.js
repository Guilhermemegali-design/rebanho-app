import { NextResponse } from "next/server";

let ultimaConsulta = 0;

export async function GET(request) {
  const termo = new URL(request.url).searchParams.get("q")?.trim();
  if (!termo || termo.length < 3 || termo.length > 160) {
    return NextResponse.json({ resultados: [] }, { status: 400 });
  }

  // Respeita o limite da instância pública do Nominatim: no máximo uma
  // consulta por segundo por instância. A busca só acontece ao tocar no botão.
  const espera = Math.max(0, 1100 - (Date.now() - ultimaConsulta));
  if (espera) await new Promise((resolve) => setTimeout(resolve, espera));
  ultimaConsulta = Date.now();

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", termo);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");

  const resposta = await fetch(url, {
    headers: {
      "User-Agent": "RASTRO/1.0 (https://rebanho-app-omega.vercel.app)",
      "Accept-Language": "pt-BR,pt;q=0.9",
    },
    next: { revalidate: 86400 },
  });
  if (!resposta.ok) return NextResponse.json({ resultados: [] }, { status: 502 });

  const dados = await resposta.json();
  return NextResponse.json({
    resultados: dados.map((item) => ({
      nome: item.display_name,
      latitude: Number(item.lat),
      longitude: Number(item.lon),
      caixa: item.boundingbox?.map(Number) || null,
    })),
  });
}
