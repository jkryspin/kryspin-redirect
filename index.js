const path = require('path')
const crypto = require('crypto')
const express = require('express')
const bodyParser = require('body-parser')
const isUrl = require('is-url')
const pgconn = require('./pgconn')

const app = express()
const PORT = process.env.PORT || 8080
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '7Psychos!'

// Paths that belong to the app itself and can never be used as a redirect key.
const RESERVED = [
    'admin', 'api', 'static', 'index.html', 'favicon.ico', 'manifest.json',
    'robots.txt', 'logo192.png', 'logo512.png', 'asset-manifest.json',
    'service-worker.js', 'precache-manifest'
]
const PATH_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/

let client

app.use(bodyParser.json())

// ---------------------------------------------------------------- helpers

function normalizePath(value) {
    return String(value || '').trim().toLowerCase().replace(/^\/+|\/+$/g, '')
}

function validatePath(value) {
    if (!value) return 'Give the link a path'
    if (!PATH_RE.test(value)) return 'Use letters, numbers, dots, dashes or underscores only'
    if (RESERVED.indexOf(value) !== -1) return `"${value}" is reserved by the app`
    return null
}

function validateTarget(value) {
    const target = String(value || '').trim()
    if (!target) return 'Give the link a destination'
    if (!isUrl(target)) return 'That does not look like a valid URL'
    return null
}

function passwordMatches(supplied) {
    if (typeof supplied !== 'string') return false
    const a = Buffer.from(supplied)
    const b = Buffer.from(ADMIN_PASSWORD)
    // Length check first: timingSafeEqual throws on a length mismatch.
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
}

function requireAdmin(req, res, next) {
    const supplied = (req.body && req.body.password) || req.get('x-admin-password')
    if (!passwordMatches(supplied)) {
        return res.status(401).json({ err: true, msg: 'Incorrect password' })
    }
    next()
}

// Wraps an async handler so a rejected promise becomes a 500 instead of an
// unhandled rejection (express 4 does not await handlers).
function wrap(handler) {
    return function (req, res) {
        Promise.resolve(handler(req, res)).catch(function (err) {
            console.error(err)
            if (!res.headersSent) res.status(500).json({ err: true, msg: 'Something went wrong' })
        })
    }
}

// ---------------------------------------------------------------- public api

app.get('/api/mostRecent', wrap(async function (req, res) {
    const result = await client.query(
        'SELECT path, redirect_to, last_update FROM redirects ORDER BY last_update DESC NULLS LAST, id DESC LIMIT 1'
    )
    if (result.rows.length > 0) return res.json(result.rows[0])
    res.json({})
}))

app.get('/api/stats', wrap(async function (req, res) {
    const result = await client.query('SELECT COUNT(*)::int AS links, COALESCE(SUM(hits),0)::int AS hits FROM redirects')
    res.json(result.rows[0])
}))

app.post('/api/savePath', wrap(async function (req, res) {
    const key = normalizePath(req.body && req.body.path)
    const target = String((req.body && req.body.redirect_to) || '').trim()

    const pathError = validatePath(key)
    if (pathError) return res.json({ err: true, msg: pathError })

    const targetError = validateTarget(target)
    if (targetError) return res.json({ err: true, msg: targetError })

    const existing = await client.query('SELECT 1 FROM redirects WHERE path = $1', [key])
    if (existing.rowCount > 0) {
        return res.json({ err: true, msg: `/${key} is already taken` })
    }

    await client.query(
        'INSERT INTO redirects(path, redirect_to, last_update, created_at) VALUES ($1, $2, now(), now())',
        [key, target]
    )
    res.json({ status: 'OK', msg: 'Saved', path: key })
}))

// ---------------------------------------------------------------- admin api

app.post('/api/admin/login', requireAdmin, function (req, res) {
    res.json({ ok: true })
})

app.post('/api/admin/routes', requireAdmin, wrap(async function (req, res) {
    const result = await client.query(
        'SELECT id, path, redirect_to, created_at, last_update, last_hit, hits FROM redirects ORDER BY id DESC'
    )
    res.json({ routes: result.rows })
}))

app.post('/api/admin/update', requireAdmin, wrap(async function (req, res) {
    const id = parseInt(req.body && req.body.id, 10)
    const target = String((req.body && req.body.redirect_to) || '').trim()
    if (!id) return res.json({ err: true, msg: 'Missing id' })

    const targetError = validateTarget(target)
    if (targetError) return res.json({ err: true, msg: targetError })

    const result = await client.query(
        'UPDATE redirects SET redirect_to = $1, last_update = now() WHERE id = $2 RETURNING id',
        [target, id]
    )
    if (result.rowCount === 0) return res.json({ err: true, msg: 'No such link' })
    res.json({ status: 'OK', msg: 'Updated' })
}))

app.post('/api/admin/delete', requireAdmin, wrap(async function (req, res) {
    const id = parseInt(req.body && req.body.id, 10)
    if (!id) return res.json({ err: true, msg: 'Missing id' })
    const result = await client.query('DELETE FROM redirects WHERE id = $1 RETURNING path', [id])
    if (result.rowCount === 0) return res.json({ err: true, msg: 'No such link' })
    res.json({ status: 'OK', msg: `Deleted /${result.rows[0].path}` })
}))

// ---------------------------------------------------------------- app shell

if (process.env.NODE_ENV === 'production') {
    const buildDir = path.join(__dirname, 'client', 'build')
    // Registered before the catch-all so bundle assets never hit the database.
    app.use(express.static(buildDir))
    const sendShell = function (req, res) { res.sendFile(path.join(buildDir, 'index.html')) }
    app.get('/', sendShell)
    app.get('/admin', sendShell)
}

// ---------------------------------------------------------------- redirect

app.get('/:redirect_to', wrap(async function (req, res) {
    const key = normalizePath(req.params.redirect_to)
    const result = await client.query('SELECT id, redirect_to FROM redirects WHERE path = $1', [key])

    if (result.rows.length === 0) {
        return res.status(404).json({ err: true, msg: `No redirect found for /${key}` })
    }

    const row = result.rows[0]
    res.redirect(row.redirect_to)

    // Fire and forget: a failed counter update must not break the redirect.
    client.query('UPDATE redirects SET hits = COALESCE(hits,0) + 1, last_hit = now() WHERE id = $1', [row.id])
        .catch(function (err) { console.error('hit counter failed', err) })
}))

// ---------------------------------------------------------------- bootstrap

async function migrate() {
    await client.query(`CREATE TABLE IF NOT EXISTS redirects (
        id SERIAL PRIMARY KEY,
        path TEXT UNIQUE NOT NULL,
        redirect_to TEXT NOT NULL,
        last_update TIMESTAMPTZ
    )`)
    await client.query('ALTER TABLE redirects ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()')
    await client.query('ALTER TABLE redirects ADD COLUMN IF NOT EXISTS hits INTEGER NOT NULL DEFAULT 0')
    await client.query('ALTER TABLE redirects ADD COLUMN IF NOT EXISTS last_hit TIMESTAMPTZ')
}

async function start() {
    await pgconn.connectToServer()
    client = pgconn.getClient()
    await migrate()
    app.listen(PORT, function () { console.log(`kryspin-redirect listening on ${PORT}`) })
}

start().catch(function (err) {
    console.error('failed to start', err)
    process.exit(1)
})
