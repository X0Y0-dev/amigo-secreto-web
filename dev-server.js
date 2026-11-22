// C:\Users\lucas\Desktop\amigo_secreto\dev-server.js
//
// Servidor de desenvolvimento local que simula a Vercel:
//   - Serve arquivos estáticos (index.html, admin.html, src/*)
//   - Roteia /api/* para os handlers Vercel Functions
//   - Não requer Vercel CLI nem credenciais Upstash (usa fallback em memória)
//
// Uso: node dev-server.js
//      Abre em http://localhost:3000
//

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

// MIME types para servir estáticos
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Mapeamento de rotas da API → módulo do handler
const API_ROUTES = {
  '/api/admin/participants': './api/admin/participants.js',
  '/api/admin/generate': './api/admin/generate.js',
  '/api/admin/status': './api/admin/status.js',
  '/api/admin/reset': './api/admin/reset.js',
  '/api/draw': './api/draw.js',
};

// Cache de módulos importados
const handlerCache = new Map();

async function getHandler(routePath) {
  if (handlerCache.has(routePath)) {
    return handlerCache.get(routePath);
  }
  const modulePath = API_ROUTES[routePath];
  if (!modulePath) return null;

  const fullPath = path.resolve(__dirname, modulePath);
  const mod = await import(`file://${fullPath.replace(/\\/g, '/')}`);
  const handler = mod.default;
  handlerCache.set(routePath, handler);
  return handler;
}

/**
 * Lê o body da requisição como string.
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

/**
 * Adaptador de resposta para simular a API de Vercel Functions (res.status().json()).
 */
function adaptResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
  };
  return res;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // 1. Rotas da API
  if (pathname.startsWith('/api/')) {
    const handler = await getHandler(pathname);
    if (!handler) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Rota não encontrada.' }));
      return;
    }

    // Parse do body para POST
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      try {
        const rawBody = await readBody(req);
        try {
          req.body = JSON.parse(rawBody);
        } catch {
          req.body = rawBody;
        }
      } catch {
        req.body = null;
      }
    }

    adaptResponse(res);

    try {
      await handler(req, res);
    } catch (error) {
      console.error(`[DevServer] Erro no handler ${pathname}:`, error);
      if (!res.writableEnded) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Erro interno do servidor.' }));
      }
    }
    return;
  }

  // 2. Arquivos estáticos
  let filePath;
  if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(__dirname, 'index.html');
  } else if (pathname === '/admin.html' || pathname === '/admin') {
    filePath = path.join(__dirname, 'admin.html');
  } else {
    filePath = path.join(__dirname, pathname);
  }

  // Segurança: impede travessia de diretório
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(__dirname))) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  try {
    const stat = fs.statSync(resolved);
    if (stat.isFile()) {
      const ext = path.extname(resolved).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', mime);
      fs.createReadStream(resolved).pipe(res);
    } else {
      res.statusCode = 404;
      res.end('Not Found');
    }
  } catch {
    res.statusCode = 404;
    res.end('Not Found');
  }
});

// Configura variáveis de ambiente padrão para desenvolvimento
if (!process.env.ADMIN_KEY) {
  process.env.ADMIN_KEY = 'admin123';
  console.log('[DevServer] ADMIN_KEY definida como "admin123" para desenvolvimento local.');
}

if (!process.env.CODE_PEPPER) {
  process.env.CODE_PEPPER = 'dev-pepper-secret';
  console.log('[DevServer] CODE_PEPPER definida como "dev-pepper-secret" para desenvolvimento local.');
}

server.listen(PORT, () => {
  console.log('');
  console.log('='.repeat(55));
  console.log('  🎁 Amigo Secreto — Servidor de Desenvolvimento');
  console.log('='.repeat(55));
  console.log(`  🌐 Página principal:  http://localhost:${PORT}`);
  console.log(`  ⚙️  Painel admin:      http://localhost:${PORT}/admin.html`);
  console.log(`  🔑 Chave admin:       ${process.env.ADMIN_KEY}`);
  console.log('');
  console.log('  ⚠️  Redis em memória (dados perdidos ao reiniciar).');
  console.log('  Pressione Ctrl+C para parar.');
  console.log('='.repeat(55));
  console.log('');
});
