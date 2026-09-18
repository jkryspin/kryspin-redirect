import React, { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import copyText from './copy'

const STORE_KEY = 'kryspin-redirect.admin'

function readStoredPassword() {
    try {
        return window.sessionStorage.getItem(STORE_KEY) || ''
    } catch (err) {
        return ''
    }
}

function storePassword(value) {
    try {
        if (value) window.sessionStorage.setItem(STORE_KEY, value)
        else window.sessionStorage.removeItem(STORE_KEY)
    } catch (err) { /* private browsing: the session just will not be remembered */ }
}

function hostOf(url) {
    try {
        return new URL(url).host
    } catch (err) {
        return url
    }
}

function formatDate(value) {
    if (!value) return '—'
    const date = new Date(value)
    if (isNaN(date.getTime())) return '—'
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function Gate(props) {
    const [value, setValue] = useState('')
    const [checking, setChecking] = useState(false)
    const [error, setError] = useState('')

    async function submit(event) {
        event.preventDefault()
        if (!value || checking) return
        setChecking(true)
        setError('')
        try {
            await axios.post('/api/admin/login', { password: value })
            props.onUnlock(value)
        } catch (err) {
            setError('That password does not match')
            setValue('')
        }
        setChecking(false)
    }

    return (
        <div className="gate">
            <h1 className="display display--sm">Every link<br />in one place.</h1>
            <form className="board board--gate" onSubmit={submit}>
                <label className="field-label" htmlFor="password">Password</label>
                <input
                    id="password"
                    className="input"
                    type="password"
                    autoFocus
                    autoComplete="current-password"
                    value={value}
                    onChange={function (e) { setValue(e.target.value) }}
                />
                {error && <p className="hint hint--bad">{error}</p>}
                <div className="board__actions">
                    <button type="submit" className="btn btn--primary" disabled={!value || checking}>
                        {checking ? 'Checking…' : 'Show links'}
                    </button>
                </div>
            </form>
        </div>
    )
}

function Row(props) {
    const route = props.route
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(route.redirect_to)
    const [confirming, setConfirming] = useState(false)
    const [copied, setCopied] = useState(false)
    const shortUrl = window.location.origin + '/' + route.path

    function copy() {
        copyText(shortUrl).then(function () {
            setCopied(true)
            props.notify('Copied ' + shortUrl, 'ok')
            setTimeout(function () { setCopied(false) }, 2000)
        }).catch(function () {
            props.notify('Copying is blocked in this browser', 'bad')
        })
    }

    return (
        <li className="route">
            <div className="route__path">
                <a className="route__link" href={'/' + route.path}>/{route.path}</a>
                <span className="route__meta">Added {formatDate(route.created_at)}</span>
            </div>

            <div className="route__target">
                {editing ? (
                    <div className="route__edit">
                        <input
                            className="input input--inline"
                            type="url"
                            value={draft}
                            autoFocus
                            onChange={function (e) { setDraft(e.target.value) }}
                        />
                        <button type="button" className="btn btn--solid btn--sm" onClick={function () {
                            props.onUpdate(route.id, draft.trim()).then(function (ok) { if (ok) setEditing(false) })
                        }}>Save</button>
                        <button type="button" className="btn btn--ghost btn--sm" onClick={function () {
                            setDraft(route.redirect_to)
                            setEditing(false)
                        }}>Cancel</button>
                    </div>
                ) : (
                    <a className="route__dest" href={route.redirect_to} title={route.redirect_to}
                        target="_blank" rel="noopener noreferrer">
                        {hostOf(route.redirect_to)}
                        <span className="route__destpath">{route.redirect_to}</span>
                    </a>
                )}
            </div>

            <div className="route__hits" title={route.last_hit ? 'Last used ' + formatDate(route.last_hit) : 'Never used'}>
                <span className="route__count">{route.hits || 0}</span>
                <span className="route__meta">{(route.hits === 1) ? 'visit' : 'visits'}</span>
            </div>

            <div className="route__actions">
                {confirming ? (
                    <React.Fragment>
                        <span className="route__confirm">Delete /{route.path}?</span>
                        <button type="button" className="btn btn--danger btn--sm" onClick={function () {
                            props.onDelete(route.id)
                        }}>Delete</button>
                        <button type="button" className="btn btn--ghost btn--sm" onClick={function () {
                            setConfirming(false)
                        }}>Keep</button>
                    </React.Fragment>
                ) : (
                    <React.Fragment>
                        <button type="button" className="btn btn--ghost btn--sm" onClick={copy}>
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                        {!editing && (
                            <button type="button" className="btn btn--ghost btn--sm" onClick={function () {
                                setEditing(true)
                            }}>Edit</button>
                        )}
                        <button type="button" className="btn btn--ghost btn--sm" onClick={function () {
                            setConfirming(true)
                        }}>Delete</button>
                    </React.Fragment>
                )}
            </div>
        </li>
    )
}

function Admin(props) {
    const notify = props.notify
    const [password, setPassword] = useState(readStoredPassword)
    const [routes, setRoutes] = useState(null)
    const [query, setQuery] = useState('')
    const [loading, setLoading] = useState(false)

    const load = useCallback(async function (secret) {
        setLoading(true)
        try {
            const res = await axios.post('/api/admin/routes', { password: secret })
            setRoutes(res.data.routes)
        } catch (err) {
            if (err.response && err.response.status === 401) {
                storePassword('')
                setPassword('')
                setRoutes(null)
                notify('Session expired, sign in again', 'bad')
            } else {
                notify('Could not load links', 'bad')
            }
        }
        setLoading(false)
    }, [notify])

    useEffect(function () {
        if (password) load(password)
    }, [password, load])

    function unlock(secret) {
        storePassword(secret)
        setPassword(secret)
    }

    function lock() {
        storePassword('')
        setPassword('')
        setRoutes(null)
    }

    async function update(id, redirect_to) {
        try {
            const res = await axios.post('/api/admin/update', { password: password, id: id, redirect_to: redirect_to })
            if (res.data && res.data.err) {
                notify(res.data.msg, 'bad')
                return false
            }
            notify('Destination updated', 'ok')
            await load(password)
            return true
        } catch (err) {
            notify('Could not save the change', 'bad')
            return false
        }
    }

    async function remove(id) {
        try {
            const res = await axios.post('/api/admin/delete', { password: password, id: id })
            if (res.data && res.data.err) {
                notify(res.data.msg, 'bad')
                return
            }
            notify(res.data.msg, 'ok')
            await load(password)
        } catch (err) {
            notify('Could not delete the link', 'bad')
        }
    }

    if (!password) return <Gate onUnlock={unlock} />

    const list = routes || []
    const needle = query.trim().toLowerCase()
    const shown = needle
        ? list.filter(function (r) {
            return r.path.indexOf(needle) !== -1 || r.redirect_to.toLowerCase().indexOf(needle) !== -1
        })
        : list
    const totalHits = list.reduce(function (sum, r) { return sum + (r.hits || 0) }, 0)

    return (
        <div className="admin">
            <div className="admin__head">
                <h1 className="display display--sm">Links</h1>
                <dl className="figures">
                    <div className="figure">
                        <dt>Links</dt>
                        <dd>{list.length}</dd>
                    </div>
                    <div className="figure">
                        <dt>Redirects served</dt>
                        <dd>{totalHits}</dd>
                    </div>
                </dl>
            </div>

            <div className="admin__tools">
                <input
                    className="input input--search"
                    type="search"
                    placeholder="Search a path or destination"
                    value={query}
                    onChange={function (e) { setQuery(e.target.value) }}
                />
                <button type="button" className="btn btn--ghost" onClick={function () { load(password) }} disabled={loading}>
                    {loading ? 'Refreshing…' : 'Refresh'}
                </button>
                <button type="button" className="btn btn--ghost" onClick={lock}>Lock</button>
            </div>

            {routes === null ? (
                <p className="empty">Loading links…</p>
            ) : shown.length === 0 ? (
                <p className="empty">
                    {list.length === 0
                        ? 'No links yet. Create the first one from the home page.'
                        : 'Nothing matches "' + query + '".'}
                </p>
            ) : (
                <ul className="routes">
                    {shown.map(function (route) {
                        return <Row key={route.id} route={route} notify={notify} onUpdate={update} onDelete={remove} />
                    })}
                </ul>
            )}
        </div>
    )
}

export default Admin
