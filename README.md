# 🎁 Amigo Secreto

Sistema seguro e sem spoilers para organizar sorteios de Amigo Secreto. Deploy na **Vercel** com armazenamento persistente no **Upstash Redis**.

## Funcionalidades

- ✅ Sorteio justo com **algoritmo de Sattolo** (ciclo único, sem pontos fixos)
- 🔒 Códigos individuais com hash SHA-256 + pepper — texto puro nunca é salvo
- 🛡️ Rate limiting por IP no endpoint público
- 📱 Links prontos para WhatsApp para distribuir os códigos
- 🎨 Interface responsiva, acessível e com animação de revelação
- 🔑 Autenticação do admin via chave secreta comparada em tempo constante

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5 + CSS3 + JavaScript (ES Modules) |
| Backend | Node.js — Vercel Serverless Functions |
| Banco | Upstash Redis (REST) |
| Hospedagem | Vercel |

---

## Rodando Localmente

### 1. Pré-requisitos

- [Node.js](https://nodejs.org/) 18+ instalado

### 2. Instalar dependências

```bash
cd amigo-secreto
npm install
```

### 3. Iniciar o servidor de desenvolvimento

```bash
npm run dev
```

Isso inicia um servidor local em `http://localhost:3000` com:
- Redis em memória (dados perdidos ao reiniciar)
- `ADMIN_KEY` = `admin123`
- `CODE_PEPPER` = `dev-pepper-secret`

### 4. Acessar

- **Página do participante:** http://localhost:3000
- **Painel do admin:** http://localhost:3000/admin.html (chave: `admin123`)

---

## Deploy na Vercel

### 1. Criar um banco Upstash Redis

1. Acesse [console.upstash.com](https://console.upstash.com/)
2. Crie um novo banco Redis
3. Copie a **REST URL** e o **REST Token**

> ⚠️ **IMPORTANTE:** Configure o banco SEM política de expiração/eviction. Os dados são persistentes, não são cache. Use a política `noeviction` para garantir que nenhum dado seja removido automaticamente.

### 2. Configurar variáveis de ambiente na Vercel

No painel da Vercel, adicione estas variáveis:

| Variável | Descrição | Exemplo |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | URL REST do seu banco Upstash | `https://xyz.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Token REST do Upstash | `AXyz123...` |
| `ADMIN_KEY` | Chave secreta do administrador | Gere uma senha forte |
| `CODE_PEPPER` | Pepper para hash dos códigos | Gere uma string aleatória |

### 3. Deploy

```bash
npx vercel --prod
```

Ou conecte o repositório GitHub ao Vercel para deploy automático.

---

## Fluxo de Uso

### Admin (organizador)

1. Acesse `/admin.html`
2. Informe a chave de administrador
3. Cadastre os nomes dos participantes (um por linha)
4. Clique em "Salvar participantes"
5. Clique em "Gerar sorteio e códigos" (com confirmação)
6. **Copie ou baixe os códigos imediatamente!** A lista não é exibida novamente
7. Envie cada código individual pelo WhatsApp (links prontos disponíveis)

### Participante

1. Acesse a página principal do site
2. **Tela 1**: Informe o código recebido (formato `XXXX-XXXX`)
3. **Tela 2**: Digite seu nome exatamente como veio no convite do WhatsApp
4. **Tela 3**: Confirme sua identidade ("Você é **Nome**? Essa escolha é definitiva.")
5. **Tela 4**: Veja quem você tirou! 🎉
6. Pode revisitar a qualquer momento digitando apenas o mesmo código — o resultado é sempre o mesmo

---

## Arquitetura de Segurança

| Aspecto | Implementação |
|---|---|
| Aleatoriedade | `crypto.randomBytes` / `crypto.randomInt` (CSPRNG) |
| Códigos | Nunca salvos em texto puro; apenas SHA-256(pepper + código) |
| Admin | Header `x-admin-key` com `crypto.timingSafeEqual` |
| Rate limit por IP | 10 tentativas por IP a cada 10 min (Redis INCR + EXPIRE) |
| Rate limit por código | 5 erros de nome por código bloqueiam o código por 15 min |
| Normalização | NFD + remoção de diacríticos + minúsculas + colapso de espaços |
| Claim Atômico | Script Lua / SET NX no Redis impedindo corrida de reivindicação |
| Sanitização | Uso exclusivo de `textContent` no DOM (zero innerHTML dinâmico) |
| Headers | CSP, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` |
| Atomicidade | `SET ... NX` em `draw:status` para prevenir sorteio duplo |

---

## Endpoints da API

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `POST` | `/api/admin/participants` | Admin | Cadastra lista de nomes e valida colisões |
| `GET` | `/api/admin/participants` | Admin | Lista nomes cadastrados |
| `GET` | `/api/admin/status` | Admin | Retorna status do sorteio |
| `POST` | `/api/admin/generate` | Admin | Gera códigos + sorteio (1x) |
| `POST` | `/api/admin/reset` | Admin | Reseta sorteio para testes |
| `POST` | `/api/draw` | Pública | Passo 1 ({ code }) e Passo 2 ({ code, name }) com claim atômico |

---

## Testes

Execute os testes unitários e de simulação:

```bash
npm test
```

Execute os testes ponta a ponta (E2E):

```bash
node test/e2e.js
```

---

## Modelo de Dados (Redis)

| Chave | Tipo | Conteúdo |
|---|---|---|
| `participants` | JSON array | `[{"id":"p_1","name":"Ana","normalized":"ana"}, ...]` |
| `draw:status` | String | `"pending"` ou `"done"` |
| `result:<sha256>` | JSON object | `{ "giver": "Ana", "receiver": "Bruno", "claimed": true }` |
| `nameindex:<norm>` | String | `participantId` (ex.: `"p_1"`) |
| `claimed:participant:<id>` | String | `"1"` (marcador de claim atômico) |
| `ratelimit:draw:<ip>` | Integer + TTL | Contagem de tentativas por IP |
| `ratelimit:code:<cod>` | Integer + TTL | Contagem de erros por código (5 max / 15 min) |

| Chave | Tipo | Conteúdo |
|---|---|---|
| `participants` | JSON array | `["Ana", "Bruno", "Carlos"]` |
| `draw:status` | String | `"pending"` ou `"done"` |
| `result:<sha256>` | JSON object | `{ "giver": "Ana", "receiver": "Bruno" }` |
| `ratelimit:draw:<ip>` | Integer + TTL | Contagem de tentativas |

---

## Licença

MIT
