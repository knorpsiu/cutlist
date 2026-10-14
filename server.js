// Minimal web server for cutlist (no dependencies): static files from public/ plus a JSON API for projects.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const projects = require('./db');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request body too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

function validateProject(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) throw new HttpError(400, 'Project name is required');
  const data = body.data;
  if (!data || typeof data !== 'object' || !Array.isArray(data.materials) || !Array.isArray(data.panels)) {
    throw new HttpError(400, 'Project data must include materials and panels arrays');
  }
  return { name, data };
}

// Turn SQLite's unique-name violation into a readable 409.
function withNameCheck(fn) {
  try {
    return fn();
  } catch (err) {
    if (/UNIQUE constraint failed/.test(err.message)) throw new HttpError(409, 'A project with that name already exists');
    throw err;
  }
}

async function handleApi(req, res, urlPath) {
  const match = urlPath.match(/^\/api\/projects(?:\/(\d+))?\/?$/);
  if (!match) throw new HttpError(404, 'Not found');
  const id = match[1] && Number(match[1]);

  if (!id) {
    if (req.method === 'GET') return sendJson(res, 200, projects.listProjects());
    if (req.method === 'POST') {
      const { name, data } = validateProject(await readJson(req));
      return sendJson(res, 201, withNameCheck(() => projects.createProject(name, data)));
    }
  } else {
    if (req.method === 'GET') {
      const project = projects.getProject(id);
      if (!project) throw new HttpError(404, 'Project not found');
      return sendJson(res, 200, project);
    }
    if (req.method === 'PUT') {
      const { name, data } = validateProject(await readJson(req));
      const project = withNameCheck(() => projects.updateProject(id, name, data));
      if (!project) throw new HttpError(404, 'Project not found');
      return sendJson(res, 200, project);
    }
    if (req.method === 'DELETE') {
      if (!projects.deleteProject(id)) throw new HttpError(404, 'Project not found');
      return sendJson(res, 204);
    }
  }
  throw new HttpError(405, 'Method not allowed');
}

async function serveStatic(req, res, urlPath) {
  const filePath = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await fs.readFile(filePath);
    // No caching, so edits show up on reload while developing.
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') res.writeHead(404).end('Not found');
    else throw err;
  }
}

const server = http.createServer(async (req, res) => {
  const start = Date.now();
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (urlPath.startsWith('/api/')) await handleApi(req, res, urlPath);
    else await serveStatic(req, res, urlPath);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) sendJson(res, status, { error: status === 500 ? 'Server error' : err.message });
  }
  console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`);
});

server.listen(PORT, () => {
  console.log(`cutlist running at http://localhost:${PORT}`);
  console.log(`projects stored in ${projects.DB_PATH}`);
});
