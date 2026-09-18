import React, { useEffect, useState } from 'react'
import axios from 'axios'
import copyText from './copy'

const PATH_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/
const RESERVED = ['admin', 'api', 'static', 'index.html', 'favicon.ico', 'manifest.json', 'robots.txt']

function hostOf(url) {
    try {
        return new URL(url).host
    } catch (err) {
        return url
    }
}

function Home(props) {
    const notify = props.notify
    const [path, setPath] = useState('')
    const [target, setTarget] = useState('')
    const [saving, setSaving] = useState(false)
    const [created, setCreated] = useState(null)
    const [copied, setCopied] = useState(false)
    const [recent, setRecent] = useState(null)
    const host = window.location.host

    useEffect(function () {
        let live = true
        axios.get('/api/mostRecent').then(function (res) {
            if (live && res.data && res.data.path) setRecent(res.data)
        }).catch(function () { /* the panel simply stays empty */ })
        return function () { live = false }
    }, [created])

    const cleanPath = path.trim().toLowerCase()
    let pathHint = null
    if (cleanPath && !PATH_RE.test(cleanPath)) {
        pathHint = 'Letters, numbers, dots, dashes and underscores only'
    } else if (RESERVED.indexOf(cleanPath) !== -1) {
        pathHint = 'That path belongs to the app itself'
    }
    const ready = cleanPath && target.trim() && !pathHint && !saving

    async function save(event) {
        event.preventDefault()
        if (!ready) return
        setSaving(true)
        setCopied(false)
        try {
            const res = await axios.post('/api/savePath', { path: cleanPath, redirect_to: target.trim() })
            if (res.data && res.data.err) {
                notify(res.data.msg, 'bad')
            } else {
                setCreated({ path: res.data.path, url: window.location.origin + '/' + res.data.path })
                setPath('')
                setTarget('')
                notify('Link created', 'ok')
            }
        } catch (err) {
            notify('Could not reach the server', 'bad')
        }
        setSaving(false)
    }

    function copyCreated() {
        copyText(created.url).then(function () {
            setCopied(true)
            notify('Copied to clipboard', 'ok')
            setTimeout(function () { setCopied(false) }, 2500)
        }).catch(function () {
            notify('Copying is blocked in this browser', 'bad')
        })
    }

    return (
        <div className="home">
            <h1 className="display">
                Point a short link<br />anywhere you like.
            </h1>

            <form className="board" onSubmit={save}>
                <div className="board__row">
                    <label className="field-label" htmlFor="path">Short link</label>
                    <div className="linkline">
                        <span className="linkline__host">{host}/</span>
                        <input
                            id="path"
                            className="linkline__input"
                            type="text"
                            autoComplete="off"
                            autoCapitalize="off"
                            spellCheck="false"
                            placeholder="eggs"
                            value={path}
                            onChange={function (e) { setPath(e.target.value) }}
                        />
                    </div>
                    {pathHint && <p className="hint hint--bad">{pathHint}</p>}
                </div>

                <div className="board__row">
                    <label className="field-label" htmlFor="target">Destination</label>
                    <input
                        id="target"
                        className="input"
                        type="url"
                        autoComplete="off"
                        spellCheck="false"
                        placeholder="https://reddit.com/r/mildlyinteresting"
                        value={target}
                        onChange={function (e) { setTarget(e.target.value) }}
                    />
                    <p className="hint">Paste the long URL this link should open.</p>
                </div>

                <div className="board__actions">
                    <button type="submit" className="btn btn--primary" disabled={!ready}>
                        {saving ? 'Creating…' : 'Create link'}
                    </button>
                </div>
            </form>

            {created && (
                <div className="created" key={created.path}>
                    <div className="created__link">{created.url}</div>
                    <button type="button" className="btn btn--solid" onClick={copyCreated}>
                        {copied ? 'Copied' : 'Copy link'}
                    </button>
                </div>
            )}

            <div className="aside">
                {recent ? (
                    <p className="aside__line">
                        Most recent link{' '}
                        <a className="link" href={'/' + recent.path}>/{recent.path}</a>
                        {' '}opens {hostOf(recent.redirect_to)}
                    </p>
                ) : (
                    <p className="aside__line">No links yet. The one you create first will show up here.</p>
                )}
            </div>
        </div>
    )
}

export default Home
