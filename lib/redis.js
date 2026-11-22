// C:\Users\lucas\Desktop\amigo_secreto\lib\redis.js
import { Redis } from '@upstash/redis';

let redisInstance = null;

/**
 * Cria um cliente compatível com @upstash/redis em memória para testes locais
 * caso as variáveis de ambiente UPSTASH_REDIS_REST_URL e TOKEN ainda não estejam definidas.
 */
function createMemoryStore() {
  const store = new Map();
  const ttls = new Map();

  const isExpired = (key) => {
    const expireAt = ttls.get(key);
    if (expireAt && Date.now() > expireAt) {
      store.delete(key);
      ttls.delete(key);
      return true;
    }
    return false;
  };

  const client = {
    async get(key) {
      if (isExpired(key)) return null;
      if (!store.has(key)) return null;
      const value = store.get(key);
      try {
        return JSON.parse(JSON.stringify(value));
      } catch {
        return value;
      }
    },

    async set(key, value, options = {}) {
      if (options.nx) {
        if (!isExpired(key) && store.has(key)) {
          return null;
        }
      }

      store.set(key, value);

      if (options.ex) {
        ttls.set(key, Date.now() + options.ex * 1000);
      } else {
        ttls.delete(key);
      }

      return 'OK';
    },

    async incr(key) {
      if (isExpired(key)) {
        store.delete(key);
      }
      const current = Number(store.get(key) || 0) + 1;
      store.set(key, current);
      return current;
    },

    async expire(key, seconds) {
      if (!store.has(key) || isExpired(key)) return 0;
      ttls.set(key, Date.now() + seconds * 1000);
      return 1;
    },

    async del(...keys) {
      for (const key of keys) {
        store.delete(key);
        ttls.delete(key);
      }
      return keys.length;
    },

    async flushdb() {
      store.clear();
      ttls.clear();
      return 'OK';
    },

    async scan(cursor, options = {}) {
      const match = options.match || '*';
      const count = options.count || 100;
      const regex = new RegExp('^' + match.replace(/\*/g, '.*') + '$');
      const keys = [];
      for (const key of store.keys()) {
        if (!isExpired(key) && regex.test(key)) {
          keys.push(key);
        }
      }
      return [0, keys];
    },

    pipeline() {
      const ops = [];
      const pipe = {
        set(k, v, opts) {
          ops.push(() => client.set(k, v, opts));
          return pipe;
        },
        get(k) {
          ops.push(() => client.get(k));
          return pipe;
        },
        incr(k) {
          ops.push(() => client.incr(k));
          return pipe;
        },
        del(...keys) {
          ops.push(() => client.del(...keys));
          return pipe;
        },
        async exec() {
          const results = [];
          for (const op of ops) {
            results.push(await op());
          }
          return results;
        }
      };
      return pipe;
    }
  };

  return client;
}

/**
 * Retorna o cliente Upstash Redis configurado.
 * Em produção, conecta via REST com UPSTASH_REDIS_REST_URL e TOKEN.
 * Em desenvolvimento local sem credenciais, utiliza fallback em memória.
 *
 * @returns {Redis | ReturnType<typeof createMemoryStore>}
 */
export function getRedisClient() {
  if (redisInstance) {
    return redisInstance;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    redisInstance = new Redis({ url, token });
    return redisInstance;
  }

  console.warn(
    '[Redis] UPSTASH_REDIS_REST_URL ou UPSTASH_REDIS_REST_TOKEN não configurados. ' +
    'Utilizando armazenamento em memória para testes locais.'
  );

  redisInstance = createMemoryStore();
  return redisInstance;
}
