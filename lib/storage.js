import { supabase } from "./supabaseClient";

// Envia um arquivo (nota fiscal, por enquanto) para o bucket
// documentos-rebanho, na pasta do usuário logado, e retorna a URL
// pública. Usado só em fluxos que já exigem conexão (cadastro de
// animal não é offline-first).
export async function enviarDocumentoRebanho(file) {
  const { data: sessao } = await supabase.auth.getSession();
  const userId = sessao?.session?.user?.id;
  if (!userId) throw new Error("Sessão expirada — faça login novamente antes de anexar o arquivo.");

  const nomeSeguro = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const caminho = `${userId}/${Date.now()}-${nomeSeguro}`;

  const { error } = await supabase.storage
    .from("documentos-rebanho")
    .upload(caminho, file, { contentType: file.type || "application/octet-stream" });
  if (error) throw error;

  const { data } = supabase.storage.from("documentos-rebanho").getPublicUrl(caminho);
  return data.publicUrl;
}
