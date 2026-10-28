const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;

if (!JWT_SECRET || !DATABASE_URL) {
  console.error('Missing required environment variables: DATABASE_URL and JWT_SECRET');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '12kb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 180, standardHeaders: true, legacyHeaders: false }));
app.use(express.static(path.join(__dirname, 'public')));

const safeNumber = (n) => Number.isFinite(Number(n)) ? Number(n) : 0;
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(20) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      energy BIGINT NOT NULL DEFAULT 0 CHECK (energy >= 0),
      lifetime_energy BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_energy >= 0),
      click_level INTEGER NOT NULL DEFAULT 0 CHECK (click_level >= 0),
      auto_level INTEGER NOT NULL DEFAULT 0 CHECK (auto_level >= 0),
      rebirths INTEGER NOT NULL DEFAULT 0 CHECK (rebirths >= 0),
      last_tick TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS players_ranking_idx ON players (lifetime_energy DESC);
  `);
}

function makeToken(player) {
  return jwt.sign({ id: player.id, username: player.username }, JWT_SECRET, { expiresIn: '7d' });
}
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    if (!token) throw new Error('missing token');
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Faça login novamente.' });
  }
}
function publicPlayer(row) {
  const clickPower = (1 + Number(row.click_level) * 1) * (1 + Number(row.rebirths) * 0.25);
  const perSecond = Number(row.auto_level) * (1 + Number(row.rebirths) * 0.25);
  return {
    username: row.username,
    energy: safeNumber(row.energy),
    lifetimeEnergy: safeNumber(row.lifetime_energy),
    clickLevel: Number(row.click_level),
    autoLevel: Number(row.auto_level),
    rebirths: Number(row.rebirths),
    clickPower,
    perSecond,
    clickCost: Math.floor(25 * Math.pow(1.65, Number(row.click_level))),
    autoCost: Math.floor(100 * Math.pow(1.75, Number(row.auto_level))),
    rebirthCost: Math.floor(10000 * Math.pow(2, Number(row.rebirths)))
  };
}
async function getPlayer(id, lock = false, client = pool) {
  const result = await client.query('SELECT * FROM players WHERE id = $1' + (lock ? ' FOR UPDATE' : ''), [id]);
  return result.rows[0];
}
async function accrue(client, row) {
  const now = Date.now();
  const then = new Date(row.last_tick).getTime();
  const seconds = Math.min(3600, Math.max(0, (now - then) / 1000));
  const gain = Math.floor(seconds * Number(row.auto_level) * (1 + Number(row.rebirths) * 0.25));
  if (gain > 0) {
    await client.query('UPDATE players SET energy = energy + $1, lifetime_energy = lifetime_energy + $1, last_tick = NOW() WHERE id = $2', [gain, row.id]);
  } else {
    await client.query('UPDATE players SET last_tick = NOW() WHERE id = $1', [row.id]);
  }
}

app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, database: 'connected' }); }
  catch { res.status(503).json({ ok: false, database: 'unavailable' }); }
});

app.post('/api/auth/register', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return res.status(400).json({ error: 'Nome: use 3–20 letras, números ou _.' });
  if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'A senha precisa ter de 8 a 72 caracteres.' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query('INSERT INTO players (username, password_hash) VALUES ($1, $2) RETURNING *', [username, hash]);
    res.status(201).json({ token: makeToken(result.rows[0]), player: publicPlayer(result.rows[0]) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Esse nome já está em uso.' });
    console.error(e); res.status(500).json({ error: 'Não foi possível criar a conta.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  try {
    const result = await pool.query('SELECT * FROM players WHERE username = $1', [username]);
    const player = result.rows[0];
    if (!player || !(await bcrypt.compare(password, player.password_hash))) return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    await accrue(pool, player);
    const fresh = await getPlayer(player.id);
    res.json({ token: makeToken(fresh), player: publicPlayer(fresh) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Não foi possível entrar.' }); }
});

app.get('/api/game', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const player = await getPlayer(req.user.id, true, client);
    if (!player) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Conta não encontrada.' }); }
    await accrue(client, player);
    const fresh = await getPlayer(player.id, false, client);
    await client.query('COMMIT');
    res.json({ player: publicPlayer(fresh) });
  } catch (e) { await client.query('ROLLBACK'); console.error(e); res.status(500).json({ error: 'Erro ao carregar o jogo.' }); }
  finally { client.release(); }
});

app.post('/api/game/click', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const p = await getPlayer(req.user.id, true, client);
    if (!p) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Conta não encontrada.' }); }
    await accrue(client, p);
    const gain = Math.floor((1 + Number(p.click_level)) * (1 + Number(p.rebirths) * 0.25));
    await client.query('UPDATE players SET energy = energy + $1, lifetime_energy = lifetime_energy + $1, last_tick = NOW() WHERE id = $2', [gain, p.id]);
    const fresh = await getPlayer(p.id, false, client);
    await client.query('COMMIT');
    res.json({ player: publicPlayer(fresh), gained: gain });
  } catch (e) { await client.query('ROLLBACK'); console.error(e); res.status(500).json({ error: 'Falha no clique.' }); }
  finally { client.release(); }
});

app.post('/api/game/upgrade', auth, async (req, res) => {
  const kind = req.body.kind;
  if (!['click', 'auto'].includes(kind)) return res.status(400).json({ error: 'Melhoria inválida.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const p = await getPlayer(req.user.id, true, client);
    if (!p) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Conta não encontrada.' }); }
    await accrue(client, p);
    const level = kind === 'click' ? Number(p.click_level) : Number(p.auto_level);
    const cost = Math.floor((kind === 'click' ? 25 : 100) * Math.pow(kind === 'click' ? 1.65 : 1.75, level));
    if (Number(p.energy) < cost) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Energia insuficiente.' }); }
    const column = kind === 'click' ? 'click_level' : 'auto_level';
    await client.query(`UPDATE players SET energy = energy - $1, ${column} = ${column} + 1 WHERE id = $2`, [cost, p.id]);
    const fresh = await getPlayer(p.id, false, client);
    await client.query('COMMIT');
    res.json({ player: publicPlayer(fresh) });
  } catch (e) { await client.query('ROLLBACK'); console.error(e); res.status(500).json({ error: 'Falha na melhoria.' }); }
  finally { client.release(); }
});

app.post('/api/game/rebirth', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const p = await getPlayer(req.user.id, true, client);
    if (!p) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Conta não encontrada.' }); }
    await accrue(client, p);
    const cost = Math.floor(10000 * Math.pow(2, Number(p.rebirths)));
    if (Number(p.energy) < cost) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Você ainda não tem energia suficiente para renascer.' }); }
    await client.query('UPDATE players SET energy = 0, click_level = 0, auto_level = 0, rebirths = rebirths + 1, last_tick = NOW() WHERE id = $1', [p.id]);
    const fresh = await getPlayer(p.id, false, client);
    await client.query('COMMIT');
    res.json({ player: publicPlayer(fresh) });
  } catch (e) { await client.query('ROLLBACK'); console.error(e); res.status(500).json({ error: 'Falha no renascimento.' }); }
  finally { client.release(); }
});

app.get('/api/ranking', async (_req, res) => {
  try {
    const result = await pool.query('SELECT username, lifetime_energy, rebirths FROM players ORDER BY lifetime_energy DESC, rebirths DESC LIMIT 20');
    res.json({ ranking: result.rows.map((r, i) => ({ position: i + 1, username: r.username, lifetimeEnergy: safeNumber(r.lifetime_energy), rebirths: Number(r.rebirths) })) });
  } catch { res.status(500).json({ error: 'Ranking indisponível.' }); }
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log(`Infinity Clicker listening on ${PORT}`));
}).catch((err) => {
  console.error('Database initialization failed:', err.message);
  process.exit(1);
});

process.on('SIGTERM', async () => { await pool.end(); process.exit(0); });