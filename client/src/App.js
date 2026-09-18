import React, { useCallback, useEffect, useState } from 'react'
import './App.css'
import Home from './Home'
import Admin from './Admin'

function currentRoute() {
    return window.location.pathname === '/admin' ? 'admin' : 'home'
}

function App() {
    const [route, setRoute] = useState(currentRoute)
    const [toast, setToast] = useState(null)

    useEffect(function () {
        function onPop() { setRoute(currentRoute()) }
        window.addEventListener('popstate', onPop)
        return function () { window.removeEventListener('popstate', onPop) }
    }, [])

    useEffect(function () {
        document.title = route === 'admin' ? 'Links — r.kryspin.dev' : 'r.kryspin.dev'
    }, [route])

    useEffect(function () {
        if (!toast) return undefined
        const timer = setTimeout(function () { setToast(null) }, 4000)
        return function () { clearTimeout(timer) }
    }, [toast])

    const navigate = useCallback(function (to) {
        window.history.pushState({}, '', to)
        setRoute(currentRoute())
        window.scrollTo(0, 0)
    }, [])

    const notify = useCallback(function (message, tone) {
        setToast({ message: message, tone: tone || 'ok', key: Date.now() })
    }, [])

    return (
        <div className="page">
            <header className="topbar">
                <button type="button" className="wordmark" onClick={function () { navigate('/') }}>
                    r.kryspin.dev
                </button>
                {route === 'home' ? (
                    <button type="button" className="btn btn--ghost" onClick={function () { navigate('/admin') }}>
                        Manage links
                    </button>
                ) : (
                    <button type="button" className="btn btn--ghost" onClick={function () { navigate('/') }}>
                        Create a link
                    </button>
                )}
            </header>

            <main className="main">
                {route === 'home'
                    ? <Home notify={notify} />
                    : <Admin notify={notify} />}
            </main>

            {toast && (
                <div key={toast.key} className={'toast toast--' + toast.tone} role="status">
                    {toast.message}
                </div>
            )}
        </div>
    )
}

export default App
