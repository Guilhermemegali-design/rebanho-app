# App de Controle de Rebanho — Acompanhamento Individual

App para acompanhamento individual do rebanho: cadastro de animais,
locais, lotes, movimentações, pesagens e sanidade — com leitura de
brinco via bastão RFID e leitura opcional de balança Bluetooth.

Roda no **mesmo projeto Supabase** do Consultoria-main e do
Confinamento-main (mesma fazenda/cliente já cadastrado nos outros apps).

---

## Como funciona a leitura do bastão RFID (Animal Tag / Allflex / Tru-Test)

Esses bastões, depois de pareados, funcionam como um **teclado Bluetooth**:
ao ler um brinco, "digitam" o número na tela, como se alguém tivesse
digitado rápido. Antes de usar o app:

1. Ligue o bastão e coloque em modo de pareamento (veja o manual do
   fabricante — geralmente é segurar um botão).
2. No celular/tablet/notebook, vá em **Configurações → Bluetooth** e
   pareie o bastão como faria com um teclado ou fone comum.
3. Abra o app, vá em Animais/Pesagens/Movimentações/Sanidade e aponte
   o bastão para o brinco — o número preenche sozinho.

Isso funciona igual em Android, iPhone, iPad, Windows e Mac.

## Como funciona a balança Bluetooth (Coimma / Tru-Test / outras)

- **Android, Windows, Mac (Chrome ou Edge)**: na tela de Pesagens
  aparece um botão "Conectar balança Bluetooth" — toque nele, escolha
  a balança na lista e o peso é lido automaticamente.
- **iPhone/iPad**: nenhum navegador do iPhone consegue se conectar
  direto a dispositivos Bluetooth (é uma limitação da Apple, não do
  app) — nesses aparelhos, digite o peso mostrado no visor da balança.
- Cada marca de balança tem um protocolo próprio. O app tenta primeiro
  o padrão do Bluetooth ("Weight Scale Service") — se a sua balança não
  seguir esse padrão, ela simplesmente não vai conectar automaticamente,
  e o campo de peso manual continua funcionando normalmente.

---

## Passo 1 — Configurar o projeto

1. Copie `.env.local.example` para `.env.local`.
2. Preencha com a mesma **Project URL** e **anon public key** usadas no
   Consultoria-main e no Confinamento-main (Supabase → Settings → API).
3. Instale as dependências:

```bash
npm install
```

4. Teste localmente:

```bash
npm run dev
```

Abra `http://localhost:3000`.

O banco de dados (tabelas `rebanho_*`) já foi criado no projeto Supabase
compartilhado — não precisa rodar `supabase/schema.sql` de novo (ele
fica neste repositório como referência/histórico).

---

## Passo 2 — Publicar (GitHub + Vercel)

1. Crie um repositório novo no GitHub (ex: `rebanho-app`) e suba este
   projeto.
2. No [vercel.com](https://vercel.com), **Add New → Project**, selecione
   o repositório.
3. Antes de clicar em "Deploy", em **Environment Variables**, adicione:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
4. Clique em **Deploy**.

## Passo 3 — Instalar no celular (sem loja de aplicativos)

Como é um PWA, qualquer pessoa instala direto do link:

**iPhone (Safari):** abra o link → ícone de compartilhar → "Adicionar
à Tela de Início".

**Android (Chrome):** abra o link → menu (⋮) → "Adicionar à tela
inicial" (ou o próprio Chrome sugere instalar).

---

## Como um operador de campo entra pela primeira vez

1. No app, toque em "Recebeu um código do seu consultor? Criar conta".
2. Cria conta com e-mail/senha e confirma o e-mail.
3. Faz login e digita o **código de convite** da fazenda (o mesmo
   código usado nos outros apps — Configurações do cliente no
   Consultoria-main).
