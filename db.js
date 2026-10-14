// Project storage on Node's built-in SQLite. Each project is one row; its contents
// (kerf, sheet goods, panels) are stored as a JSON document.
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'cutlist.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    data       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  )
`);

const toProject = (row) => row && {
  id: row.id,
  name: row.name,
  data: JSON.parse(row.data),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
};

const statements = {
  list: db.prepare('SELECT id, name, updated_at FROM projects ORDER BY name COLLATE NOCASE'),
  get: db.prepare('SELECT * FROM projects WHERE id = ?'),
  create: db.prepare('INSERT INTO projects (name, data) VALUES (?, ?) RETURNING *'),
  update: db.prepare(`UPDATE projects SET name = ?, data = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                      WHERE id = ? RETURNING *`),
  remove: db.prepare('DELETE FROM projects WHERE id = ?'),
};

module.exports = {
  DB_PATH,
  listProjects: () => statements.list.all().map((r) => ({ id: r.id, name: r.name, updatedAt: r.updated_at })),
  getProject: (id) => toProject(statements.get.get(id)),
  createProject: (name, data) => toProject(statements.create.get(name, JSON.stringify(data))),
  updateProject: (id, name, data) => toProject(statements.update.get(name, JSON.stringify(data), id)),
  deleteProject: (id) => statements.remove.run(id).changes > 0,
};
