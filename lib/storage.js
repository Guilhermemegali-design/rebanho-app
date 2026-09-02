import { supabase } from "./supabaseClient";
import { salvarDocumentoPendenteLocal } from "./db";

// Envia um arquivo (nota fiscal, por enquanto) para o bucket
// documentos-rebanho, na pasta do usuário logado, e retorna a URL
// pública. Sem conexão, guarda o arquivo no IndexedDB e devolve um
// marcador que a fila troca pela URL definitiva ao sincronizar.
export async function enviarDocumentoRebanho(file) {
  const { data: sessao } = await supabase.auth.getSession();
  const userId = sessao?.session?.user?.id;
  if (!userId) throw new Error("Sessão expirada — faça login novamente antes de anexar o arquivo.");

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const id = await salvarDocumentoPendenteLocal(file, userId);
    return `rastro-pendente://${id}`;
  }

  try {
    const nomeSeguro = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const caminho = `${userId}/${Date.now()}-${nomeSeguro}`;
    const { error } = await supabase.storage
      .from("documentos-rebanho")
      .upload(caminho, file, { contentType: file.type || "application/octet-stream" });
    if (error) throw error;
    const { data } = supabase.storage.from("documentos-rebanho").getPublicUrl(caminho);
    return data.publicUrl;
  } catch {
    const id = await salvarDocumentoPendenteLocal(file, userId);
    return `rastro-pendente://${id}`;
  }
}
