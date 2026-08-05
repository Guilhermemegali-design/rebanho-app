# Rebanho — Handoff

Última atualização: 2026-08-05

## O que é

App de acompanhamento **individual** do rebanho (cadastro, locais, lotes,
movimentações, pesagens, sanidade) pro mesmo consultor/zootecnista dono do
Consultoria-main e do Confinamento-main. Diferença de granularidade em
relação ao Confinamento-main: lá o controle é por LOTE de confinamento; aqui
é por ANIMAL individual (brinco/RFID), pensado pra recria/pasto.

Diferencial pedido explicitamente pelo usuário (e por isso construído já na
primeira versão, ao contrário do MVP original que deixava isso pra depois):
leitura de brinco via **bastão RFID** e leitura opcional de **balança
Bluetooth**, com entrada manual sempre garantida (essencial no iPhone/iPad,
que não suportam Web Bluetooth em nenhum navegador).

Tela única de entrada (`/`) que resolve o acesso pela sessão:

- **Consultor** (mesmo `CONSULTOR_UID` hardcoded em `app/page.js`, igual aos
  outros dois apps): escolhe a fazenda numa lista, com botão pra trocar.
- **Operador de campo**: entra com código de convite (mesmo mecanismo do
  Confinamento-main, tabela `clientes_usuarios`) — **o código em si é
  gerenciado no Consultoria-main** (tela do cliente → card "Acesso do
  cliente"), o Rebanho não tem UI própria pra gerar/mostrar esse código.

Produção: **https://rebanho-app-omega.vercel.app**. Repositório:
`github.com/Guilhermemegali-design/rebanho-app` (branch `main`, deploy
automático no Vercel a cada push — mesmo modelo do Confinamento-main).

## Stack

- Next.js 14.2.35 (App Router), sem TypeScript, sem Tailwind — estilos em
  objeto JS (`lib/styles.js`), ícones `lucide-react`. (Fixado em 14.2.35 em
  vez do 14.2.5 inicial por causa de uma vulnerabilidade crítica do Next.js
  corrigida nessa versão.)
- Supabase (Postgres + Auth + Storage + RLS) — **mesmo projeto** do
  Consultoria-main/Confinamento-main, `vvukwhxlsymjsjajzeyl`. Reaproveita
  `clientes` (= fazenda) e `clientes_usuarios` (login de operador) já
  existentes; todas as tabelas novas usam prefixo `rebanho_` pra não colidir
  com as tabelas `*_confinamento`/`*_lote` do app irmão.
- Deploy: **git real** (diferente do Consultoria-main, que ainda é manual
  via zip). Push para `main` dispara automaticamente a produção na Vercel.
  Este ambiente já conseguiu commitar, enviar `HEAD:main` e acompanhar o
  deployment do projeto `rebanho-app` até o estado `READY`.
- Offline-first (mesmo padrão do Consultoria-main, `idb`) só para
  **pesagens, movimentações e procedimentos sanitários** — cadastro de
  animal/local/lote/fornecedor exige conexão (evita o problema de
  sincronizar uma pesagem referenciando um animal que ainda não existe no
  servidor).
- PWA: `manifest.json` + `public/sw.js` (cache simples, sem sync de dados,
  igual ao Confinamento-main). Ícones ainda são os do Consultoria-main
  (placeholder — nunca foi pedido um ícone próprio).

## Layout (duas versões, um único breakpoint CSS)

Depois de ver uma referência visual do usuário, o app foi redesenhado de
"lista de cards mobile" pra um layout de dashboard de verdade:

- **Desktop (≥880px)**: barra lateral fixa (`components/Sidebar.jsx`) com
  logo, seletor de fazenda, navegação com ícones e badge de alertas,
  usuário logado no rodapé. Lista de Animais vira **tabela**
  (Identificação/Lote-Local/Categoria/Último peso/GMD/Status).
- **Celular (<880px)**: a mesma `Sidebar` vira uma **gaveta** deslizante
  (hambúrguer no topo abre, com fundo escurecido). Lista de Animais volta a
  ser cartões.
- O breakpoint é só CSS (`app/globals.css`, classes `.hide-desktop` /
  `.show-desktop` / `.table-view` / `.card-view` / `.sidebar-shell.aberta`)
  — o React não sabe em qual dos dois modos está, ambos os markups sempre
  existem no DOM e a classe decide o que aparece. Evita duplicar lógica.

## Arquivos-chave

- `lib/rfid.js` — `useRfidScanner(onScan)`: escuta o teclado da página
  inteira e diferencia leitura do bastão (muito rápida, <60ms entre teclas)
  de digitação humana. `encontrarAnimalPorTag()` busca por brinco visual OU
  RFID, pra funcionar em fazenda que usa só um dos dois.
- `lib/bluetoothScale.js` — `useBluetoothScale()`: Web Bluetooth com o
  serviço padrão do Bluetooth SIG (`0x181D`/`0x2A9D`) como primeira
  tentativa; nunca testado com balança física real (nenhuma disponível
  neste ambiente) — ver pendências.
- `lib/useDadosRebanho.js` — hook central de dados (mesmo espírito do
  `useDadosConfinamento.js` do Confinamento-main).
- `lib/alerts.js` — `calcularAlertas()` (pesagem atrasada, carência ativa) e
  `statusAnimal()` (badge Ativo/Carência/Atenção por GMD) — compartilhado
  entre Painel, aba Alertas e a tabela de Animais.
- `lib/storage.js` — upload pro bucket `documentos-rebanho` (nota fiscal de
  compra do animal).
- `lib/format.js` — inclui `calcularValorPorArroba()` — **arroba = 30kg
  neste app**, por definição explícita do usuário (não confundir com a
  arroba de carcaça, 15kg, usada em outros contextos).
- `components/Sidebar.jsx` — navegação (fonte única, usada como sidebar
  fixa e como gaveta).
- `components/AnimaisTab.jsx` — o maior componente: lista+tabela, ficha
  individual (timeline), cadastro individual (com RFID, fornecedor
  inline, preço por arroba, seleção de lote, nota fiscal) e **cadastro em
  lote** (`FormAnimaisEmLote`, ver seção própria abaixo).
- `components/PainelTab.jsx` — dois níveis: geral da fazenda e, ao clicar
  num lote em "Distribuição por lote", o mesmo painel filtrado só pra esse
  lote (estado local `loteSelecionadoId`, sem rota própria).
- `supabase/schema.sql` — schema de referência (mantido manualmente
  sincronizado com o que já foi aplicado via MCP do Supabase — não roda
  sozinho).

## Cadastro em lote (`FormAnimaisEmLote` dentro de `AnimaisTab.jsx`)

Fluxo contínuo para o curral, mas mantendo cada animal individual. A tela
repete todos os campos do cadastro individual: brinco visual/RFID, peso,
sexo, raça, categoria, origem, fornecedor, lote, data, valor/preço da
arroba, observações e nota fiscal. Depois de salvar, o formulário permanece
aberto com os dados do grupo preenchidos; identificadores, peso, valor
total e documento são limpos, e o foco volta para o brinco.

Os animais cadastrados na sequência aparecem logo abaixo do formulário
com botão **Editar**. A ficha completa do animal volta ao formulário para
correção na própria tela, sem retornar à lista geral.

`useDadosRebanho.carregarTudo()` só ativa o estado global de carregamento
na primeira carga. Recarregamentos após sincronização acontecem em segundo
plano para não desmontar o `AnimaisTab` nem fechar o cadastro contínuo.

Há também um botão **Excluir** ao lado de **Editar**, tanto nessa sequência
quanto na ficha individual. A exclusão exige confirmação e remove o animal
e seu histórico relacionado; a policy `cliente_exclui_animais` limita o
operador aos animais da própria fazenda.

## Fluxo de cadastro e venda no curral

- No cadastro individual, a raça é escolhida entre Nelore, Nelorado,
  F1 Angus, Cruzado, Guzera e Guzeratado.
- A categoria é escolhida entre Boi, Vaca, Novilha e Bezerro, tanto no
  cadastro individual quanto no cadastro contínuo.
- O seletor de lote contém a opção `+ Criar novo lote`, permitindo criar
  e já vincular o lote sem sair da tela do animal.
- Em Movimentações → Venda é possível selecionar ou ler por RFID vários
  animais em sequência. O peso de saída é individual; preço da arroba e
  rendimento de carcaça são informados uma vez e aplicados ao grupo.
- Mesmo numa venda em grupo, o app grava uma movimentação individual por
  animal e mantém o fluxo offline-first.
- O operador recebe o `consultor_id` da fazenda pelo relacionamento
  `clientes_usuarios → clientes`; nunca usa o próprio `auth.uid()` como
  dono dos registros. Isso garante que o consultor enxergue imediatamente
  os cadastros feitos pelo cliente após atualizar os dados.
- A lista geral de animais oferece exclusão direta ao lado do status, sem
  precisar abrir a ficha. A tela de lotes também permite excluir; os
  animais vinculados são preservados e ficam sem lote.
- Na pesagem, digitar o brinco visual ou RFID mostra a data e o peso
  anteriores; ao informar o novo peso, o GMD aparece antes da confirmação.
- A identificação da pesagem usa um único campo para procurar parcialmente,
  digitar o número completo ou receber a leitura do bastão RFID.
- O GMD ignora lançamentos feitos no mesmo dia como referência anterior e
  usa a última data anterior disponível, incluindo o peso de entrada.
- A mesma regra é usada na lista geral e na ficha do animal, evitando GMD
  vazio quando existem duas pesagens registradas na mesma data.
- Cada pesagem pode ser excluída diretamente pela lista. Registros ainda
  offline também saem da fila local para não reaparecerem na sincronização.
- A ficha do animal permite excluir diretamente cada item da linha do
  tempo: pesagem, movimentação ou manejo sanitário.
- A ficha mostra também o GMD acumulado desde a entrada até o dia em que
  foi aberta, usando o último peso conhecido como referência.
- O quadro de Sanidade permite excluir manejos individuais. Lançamentos
  coletivos recebem um identificador de grupo e podem ser apagados do lote
  inteiro com uma única confirmação.
- O quadro de Movimentações permite excluir transferências de lote ou
  local; ao apagar a transferência mais recente, o animal volta ao lote ou
  local de origem.
- Locais e lotes podem ser editados diretamente nas listas. Locais também
  podem ser excluídos sem apagar animais ou lotes vinculados.
- O botão de editar acompanha o botão de excluir em animais, pesagens,
  sanidade, transferências e itens da linha do tempo. Registros offline
  são atualizados na fila local e manejos coletivos são editados em grupo.
- A marca do produto é **RASTRO**, com cabeça bovina, brinco RFID e
  marcador de localização. Ícones PWA e cache receberam versão nova para
  atualizar também instalações existentes sem novo cadastro.
- Em Sanidade, o mesmo manejo pode ser lançado para todos os animais
  ativos de um lote, mantendo um registro individual em cada ficha.
- Configurações agora permite ao consultor/administrador cadastrar acessos
  por e-mail, gerar um código individual, copiar/cancelar convites e alterar
  ou remover usuários. Os papéis são administrador, operador (`editor`) e
  somente leitura (`leitor`).
- No Painel, ao abrir um lote, aparece logo abaixo dos indicadores a lista
  dos animais ativos com categoria, peso atual, data de referência e GMD
  individual. A linha/cartão é clicável e abre a ficha completa do animal na
  aba Animais.
- Lotes e locais ganhou um mapa operacional offline. No desktop o lote pode
  ser arrastado entre pastos; no celular, seleciona-se o lote e depois o
  destino. A confirmação cria movimentação para cada animal, atualiza o mapa
  localmente e sincroniza depois.
- O mapa operacional agora usa mapa geográfico do OpenStreetMap. A fazenda
  pode ser localizada por nome/endereço ou GPS e o usuário pode importar
  arquivos KML e KMZ (até 15 MB). Os polígonos importados são vinculados aos
  locais pelo nome; nomes ainda inexistentes podem ser criados como pastos.
  A geometria é salva em `rebanho_mapas_fazenda`, fica em cache no IndexedDB
  e os trechos do mapa já visualizados ficam disponíveis no cache do PWA.
  A busca de endereço exige internet.
- Cochos podem ser cadastrados por pasto com coordenadas do GPS do celular.
  Cada abastecimento registra produto, quantidade, unidade, usuário, lote e
  uma fotografia dos IDs dos animais atendidos, calculando o consumo
  estimado por animal. Abastecimentos usam a mesma fila IndexedDB das
  operações de curral e funcionam sem sinal.
- Cochos podem ser editados diretamente na lista. No mapa, cochos com GPS
  aparecem na coordenada exata; sem GPS, aparecem no centro do polígono do
  pasto selecionado, identificados como posição aproximada.
- Um mesmo cliente pode ter várias fazendas. `rebanho_fazendas` guarda as
  unidades e todas as tabelas operacionais possuem `fazenda_id`. O seletor
  fica no topo no celular e no desktop, com botão `+` para criar outra
  fazenda. Animais, locais, lotes, fornecedores, medicamentos, cochos,
  abastecimentos, mapa, pesagens, movimentações e sanidade são filtrados
  pela fazenda ativa. A migração criou uma `Fazenda principal` para cada
  cliente e vinculou nela todos os dados anteriores sem apagá-los.
- Um usuário pode ser restrito a **apenas um retiro** do cliente (ex: Belmont
  tem "Fazenda Ponte" e outra, e dá pra convidar alguém só para a Ponte).
  Em Configurações → Usuários e acessos, o campo "Acesso a" (só aparece
  quando o cliente já tem mais de uma fazenda) define isso no convite; para
  usuários já vinculados há um segundo seletor ao lado do nível de acesso.
  `fazenda_id` nulo em `clientes_usuarios`/`rebanho_convites_usuarios`
  continua significando acesso a todas as fazendas do cliente (padrão
  anterior, preservado). Um operador restrito não vê o seletor de fazenda
  nem o botão de criar nova fazenda — fica travado na sua. A restrição é
  reforçada no banco (não só na tela): `private.rebanho_fazenda_permitida` e
  `private.rebanho_pode_editar_fazenda` (migração
  `add_restricao_fazenda_usuario.sql`) substituíram as checagens antigas
  baseadas só em `cliente_id` nas policies de todas as tabelas com
  `fazenda_id`, então mesmo chamando a API direto o operador restrito não
  enxerga nem grava dado da outra fazenda. Criar uma fazenda nova exige
  acesso a todas as fazendas do cliente (`private.rebanho_tem_acesso_total`)
  — um usuário restrito a um retiro não pode criar um terceiro.
- Configurações possui o card **Fazenda atual**, no qual consultor ou
  administrador pode renomear a unidade sem alterar seus dados. O nome é
  atualizado imediatamente no topo e na barra lateral.
- Fazendas com muitos animais são carregadas por paginação de 750 registros,
  com ordenação determinística. Pesagens, movimentações e sanidade são
  consultadas diretamente por `fazenda_id`; a atualização do cache offline
  ocorre em segundo plano e não bloqueia mais a abertura da tela.
- No painel geral, os lotes ficam imediatamente abaixo dos indicadores e
  antes dos alertas. Cada lote é um botão com quantidade de animais e abre
  seu painel individual. O cartão “Lotes ativos” leva até essa lista e o
  painel geral resume apenas cinco alertas.

## Dados reais importados — Belmont Agropecuaria

Cliente Supabase: `96f20df8-37b9-452b-9f62-98a54cf8e3c7`.

- **Fazenda Olhos D'Água** (`4a01a37c-ab39-443e-a023-88ba4f84ec0c`):
  1.888 animais, 14 lotes, 2.512 pesagens e 1.888 entradas. Todos os animais
  e lotes estão vinculados ao local `Fazenda Olhos D agua`; 32 animais não
  tinham RFID na planilha original.
- **Fazenda Ponte** (`2123a638-9313-4c31-bcdc-ce306b7a5ee2`): 1.217 animais,
  13 lotes, 2.318 pesagens, 1.217 entradas e 1.217 participações de lote
  ativas. Todos estão vinculados ao local `Fazenda Ponte`; 70 animais não
  tinham RFID na planilha original.
- As duas cargas são idempotentes pelo brinco visual dentro da fazenda e
  usam `client_uuid` determinístico nas pesagens e entradas para impedir
  duplicação em uma eventual repetição.

## Hardware testado e decisão sobre aplicativo nativo

- O teste real foi feito com **Allflex RS420**, **Tru-Test S3** e **iPhone**.
  A integração direta não funcionou por limitação da versão web, não por
  erro do operador.
- O RS420 usa Bluetooth Classic SPP/iAP. No iPhone, um site/PWA não recebe
  esse protocolo. A versão iOS exigirá `ExternalAccessory`, protocolo iAP
  informado/autorizado pela Allflex/Datamars e um plugin nativo em Swift.
- O S3 usa Bluetooth Low Energy e expõe o perfil padrão de balança
  (`0x181D`/`0x2A9D`), mas o acesso direto no iPhone também exige aplicativo
  nativo com Core Bluetooth.
- Caminho escolhido para quando os equipamentos estiverem novamente
  disponíveis: iniciar primeiro uma versão **Android nativa** aproveitando
  a interface React por Capacitor. Um plugin Kotlin conectará o RS420 por
  RFCOMM/SPP e o S3 por BLE/GATT; eventos `rfidRead`, `weightChanged` e
  `stableWeight` alimentarão a tela atual de pesagem.
- A versão Android terá SQLite/fila local, operação integral sem sinal e
  sincronização com o mesmo Supabase. O primeiro artefato será um APK para
  teste no curral; publicação na Play Store vem depois da validação física.
- Não iniciar a implementação definitiva dos protocolos sem ter um Android,
  o RS420 e o S3 juntos para testar conexão, formato das mensagens,
  estabilidade do peso e reconexão.
- Card **Testar leitor RFID e balança** em Configurações
  (`components/TesteEquipamentos.jsx`) dá pra testar os dois pela PWA no
  Chrome do Android antes de partir pro app nativo: pro bastão, usa o mesmo
  `useRfidScanner` da produção (só funciona se o bastão estiver em modo
  teclado/HID — não vai detectar o RS420 enquanto ele estiver em SPP/iAP,
  isso é esperado); pra balança, usa uma busca Bluetooth própria de
  diagnóstico (`lib/bluetoothDiagnostico.js`, `acceptAllDevices: true`, não
  usada na tela real de pesagem) que mostra qualquer aparelho por perto e
  quais serviços GATT ele expõe, útil mesmo se a balança não falar o
  protocolo padrão de peso. Depois foi adicionado o mesmo botão de busca
  também pro bastão (achando que só teria SPP), e o teste real no Android
  trouxe um dado novo importante:
- **Teste real em Android (Chrome) com o RS420**: na primeira tentativa, o
  RS420 **apareceu** na lista de busca BLE do Chrome (ele emite BLE, não só
  Bluetooth Classic como o teste com iPhone sugeria) e foi selecionável, mas
  a conexão GATT falhou com "Connection attempt failed" (erro comum de pilha
  Bluetooth do Android, geralmente resolve tentando de novo). Depois de
  desligar/religar o aparelho e esquecer o pareamento no Android, ele **parou
  de aparecer** na busca. Hipótese mais provável: o RS420 só anuncia BLE por
  uma janela curta logo depois de ligar (ou só em um "modo de configuração"
  específico, ativado por um botão/combinação no próprio leitor) e depois
  disso opera só em Bluetooth Classic/SPP para uso normal — o que reforça
  que o caminho durável continua sendo o app Android nativo com RFCOMM/SPP
  já planejado, não a busca BLE pelo navegador. Se for testar de novo,
  tentar buscar **imediatamente** após ligar o aparelho, e procurar no
  manual/menu do RS420 por um "modo de pareamento" ou "modo de configuração"
  específico que talvez precise ser ativado antes de ele anunciar por BLE.

## App Android nativo (Capacitor) — iniciado

Criado `android/` na raiz do repo via `npx cap add android` (Capacitor
8.5.0). **Decisão importante**: não é uma reescrita nativa da UI (ao
contrário do app irmão Rastro Trato Certo, que é Kotlin/Compose puro) — é
um WebView que carrega `https://rebanho-app-omega.vercel.app`
(`capacitor.config.json` → `server.url`), preservando 100% das telas e da
lógica já existentes. `webDir` aponta pra `public` só porque o Capacitor
exige algum valor; como o server é remoto, esse diretório não é
efetivamente usado (o app não roda offline hoje — se isso vier a importar,
seria um projeto à parte de cache/service worker dentro do WebView).

- **Plugin nativo**: `RebanhoHardwarePlugin.kt`
  (`android/app/src/main/java/br/com/rastro/rebanho/`), registrado em
  `MainActivity.java` via `registerPlugin(...)`. Métodos
  `buscarBalanca()`/`buscarBastao()`/`conectar({tipo, endereco})`/
  `desconectar()`; eventos `bluetoothStatus`, `bluetoothFrame` (payload
  em base64) e `bluetoothDevices`.
- **Núcleo Bluetooth**: `BluetoothHardwareManager.kt`, cópia adaptada de
  `ScaleConnectionManager.kt` do app irmão **Rastro Trato Certo**
  (`~/Documents/App Balanca Trato Vagao/android-native/`), que já passou
  pela mesma lição em produção: Bluetooth Classic SPP puro pra balanças
  falhava (`read failed, socket might closed or timeout`); busca BLE
  direta no app (sem exigir pareamento prévio pelo Android) é o que
  funciona de verdade. Essa classe já tinha um `TipoEquipamento.BASTAO`
  parametrizado especificamente pra leitor RFID (nunca usado lá) — foi
  isso que tornou o reaproveitamento direto. Fallback `connectClassic()`
  (RFCOMM/SPP) existe pro RS420, mas o formato real do frame dele ainda
  não foi validado com o hardware físico.
- **Ponte JS**: `lib/capacitorNativo.js` (`nativoDisponivel()`,
  `rebanhoHardware()`) e `lib/bluetoothDiagnosticoNativo.js` (mesma forma
  externa de `lib/bluetoothDiagnostico.js`, mas via plugin nativo).
  `components/TesteEquipamentos.jsx` escolhe automaticamente qual usar
  (`nativoDisponivel()`), incluindo lista de aparelhos encontrados
  (a busca nativa não abre um seletor do sistema como o Web Bluetooth) e o
  último frame bruto recebido em hex, pra ajudar a descobrir o formato do
  RS420. **`lib/rfid.js` e `lib/bluetoothScale.js` (usados na produção,
  Pesagens/Cadastro) ainda NÃO foram ligados ao plugin nativo de
  propósito** — só depois de confirmar que a busca nativa realmente
  funciona com o S3/RS420 físicos é que vale integrar na tela real, pra
  não arriscar quebrar um fluxo que já funciona.
- **Toolchain de build confirmado neste ambiente**: Android Studio já
  vem com JBR (Java 21) e o SDK já está em `~/Library/Android/sdk` —
  `JAVA_HOME=/Applications/Android\ Studio.app/Contents/jbr/Contents/Home`
  + `ANDROID_HOME=~/Library/Android/sdk` + `./gradlew assembleDebug`
  (dentro de `android/`) compila normalmente. APK debug fica em
  `android/app/build/outputs/apk/debug/app-debug.apk` — não commitado
  (`.gitignore` já exclui `*.apk`), enviado direto pro usuário testar via
  `SendUserFile`/sideload.
- Pendências imediatas: confirmar que o app abre e loga igual ao Chrome
  (fase 1); testar a busca nativa da balança S3 (fase 2); descobrir o
  formato real do frame do RS420 com o hardware físico (fase 3, ver
  `lib/bluetoothDiagnosticoNativo.js` mostrando hex bruto).
- **Formato real do frame do bastão em modo teclado/HID (2026-08-05):
  confirmado com captura real de texto bruto** (via o novo debug em
  `components/TesteEquipamentos.jsx` que expõe o texto antes do parsing).
  Tudo vem grudado num único bloco de dígitos, sem separador: cabeçalho de
  tamanho variável + EID ISO de 15 dígitos (país + nacional) + data/hora de
  12 dígitos (AAMMDDHHMMSS, relógio interno do leitor, descartado).
  Exemplo real: `"1000000" + "999000000008651" + "201228235435"` — a EID
  bate exatamente com o número mostrado no visor do bastão. `lib/rfid.js`
  (`extrairTagRfid`) agora ancora a extração a partir do FINAL do bloco
  (tamanho total menos os 12 dígitos de data/hora, pegando os 15 dígitos
  anteriores a isso), então funciona não importa o tamanho do cabeçalho.
  Duas tentativas anteriores no mesmo dia erraram esse formato (uma
  ancorando do início do bloco, outra com deslocamento fixo pensado pra
  sufixo de 8 dígitos) — se aparecer leitura errada de novo, comparar
  contra esse formato confirmado antes de mudar a lógica de novo. Esse
  formato ainda não foi confirmado pro modo "Online"/nativo (`bluetoothFrame`
  em `lib/capacitorNativo.js`), que continua sem uso real validado — pode
  ser diferente.
- **`brinco_rfid` passou a gravar a EID ISO completa (15 dígitos), não só
  os últimos 8 (2026-08-05).** Pedido explícito do usuário, pra bater com
  o número mostrado no visor do bastão. Animais já cadastrados antes disso
  continuam com só os últimos 8 dígitos salvos (não foram migrados — não
  dá pra reconstruir os dígitos que já tinham sido descartados). Os dois
  formatos convivem: `encontrarAnimalPorTag` (`lib/rfid.js`) usa
  `normalizarTagParaComparacao` pra reduzir os dois lados aos últimos 8
  dígitos antes de comparar, então uma leitura nova com a EID completa
  ainda encontra um animal antigo cadastrado no formato curto.

## RLS (permissões)

Mesmo padrão dos outros dois apps: `auth.uid() = consultor_id` pro
consultor (acesso total), e `cliente_id in (select cliente_id from
clientes_usuarios where auth_user_id = auth.uid())` pro operador — mas nas
tabelas sem `cliente_id` direto (`rebanho_pesagens`, `rebanho_movimentacoes`,
`rebanho_procedimentos_sanitarios`, `rebanho_lote_participacoes`) a policy
sobe até `rebanho_animais` primeiro pra achar o `cliente_id`.

As gravações dessas tabelas também conferem o papel do vínculo: administrador
e editor gravam; leitor só consulta. Convites são resgatados pela RPC
`resgatar_convite_rebanho`, que valida autenticação, e-mail e aplica o papel
definido pelo gestor sem expor chave administrativa no navegador.

`rebanho_cochos` e `rebanho_abastecimentos_cochos` têm RLS por cliente e
respeitam os mesmos níveis de acesso. O papel `anon` não possui privilégios
nessas tabelas e `authenticated` recebe apenas SELECT/INSERT/UPDATE/DELETE
(sem TRUNCATE).

`rebanho_mapas_fazenda` segue o mesmo isolamento por cliente: consultor
gerencia, clientes vinculados consultam e apenas administrador/editor podem
gravar. O papel `anon` não tem acesso. A busca geográfica passa por
`/api/geocodificar`, com consulta iniciada pelo usuário, limite de resultados
e cache.

`rebanho_auditoria` (trigger em animais/pesagens/movimentações/
procedimentos) teve **dois problemas de segurança corrigidos ainda nesta
sessão**, antes de qualquer dado real existir: a policy de leitura original
tinha uma condição `or true = true` que anulava a proteção (reescrita pra
`auth.uid() = consultor_id`, com `consultor_id` gravado na própria linha de
auditoria), e a função da trigger era chamável direto via
`/rest/v1/rpc/...` (corrigido com `set search_path = ''` + `revoke execute
... from public, anon, authenticated`).

## Pendências / coisas para prestar atenção

- **Hardware foi testado com RS420 + S3 + iPhone e não conectou na PWA.**
  A causa e o plano nativo estão documentados na seção anterior. A entrada
  manual continua sendo o fallback seguro da versão web.
- **`rebanho_lote_participacoes`** existe no schema mas **nenhuma tela grava
  nela** — o "lote atual" e o histórico de onde cada animal passou já
  aparecem certinho via `rebanho_movimentacoes` + `lote_atual_id`, então
  isso é só uma tabela pronta pra uma futura melhoria (histórico de
  participação com sobreposição), não uma lacuna funcional hoje.
- **Ambiente de dev local ficou instável durante a sessão**: depois de
  vários restarts do `next dev` (via `preview_start`/`preview_stop`
  repetidos), os chunks `_next/static/...` começaram a dar 404 e a página
  parava de ficar interativa (cliques não faziam nada, sem erro no
  console) — resolvido apagando `.next/` e reiniciando o servidor. Se isso
  acontecer de novo: **não é bug do app**, é cache de build do Next
  dessincronizado; `rm -rf .next` + reiniciar resolve.
- Os ícones do PWA já usam a marca própria RASTRO; ao alterar novamente,
  incrementar a versão dos arquivos/cache para atualizar instalações antigas.
- **`.env.local` já teve um problema real de caractere inválido** ao ser
  colado no Vercel a partir do chat (erro "non ISO-8859-1 code point" no
  fetch, aparecendo como "Type error" truncado pela tradução automática do
  Safari) — resolvido copiando os valores direto do arquivo `.env.local`
  em vez de copiar do chat. Se o login voltar a falhar silenciosamente,
  suspeitar disso primeiro.
- Já existem dados reais de produção: Belmont Agropecuaria, nas fazendas
  Olhos D'Água e Ponte. Alterações de schema, exclusões e importações futuras
  precisam preservar rigorosamente o isolamento por `cliente_id` e
  `fazenda_id`.
