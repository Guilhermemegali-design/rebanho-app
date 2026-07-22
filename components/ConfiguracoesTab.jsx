"use client";

import { PageHeader } from "@/components/UI";
import ImportExportTab from "@/components/ImportExportTab";

export default function ConfiguracoesTab({ dados }) {
  return (
    <div>
      <PageHeader title="Configurações" subtitle="Importação e exportação de dados do rebanho." />
      <ImportExportTab dados={dados} />
    </div>
  );
}
