import { useEffect, useRef } from 'react'
import { createBrowserRouter, RouterProvider, Outlet, useLocation } from 'react-router-dom'
import Landing from './pages/Landing'
import ListApp from './pages/ListApp'
import CountApp from './pages/CountApp'
import TextApp from './pages/TextApp'
import ImageApp from './pages/ImageApp'
import AudioApp from './pages/AudioApp'
import DecibelsApp from './pages/DecibelsApp'
import LocationApp from './pages/LocationApp'
import TimerApp from './pages/TimerApp'
import TunerApp from './pages/TunerApp'
import MetronomeApp from './pages/MetronomeApp'
import ColorApp from './pages/ColorApp'
import DiceApp from './pages/DiceApp'
import DrawApp from './pages/DrawApp'
import ErrorBoundary, { RouteErrorFallback } from './components/ErrorBoundary'
import NotFound from './pages/NotFound'
import ThemeToggle from './components/ThemeToggle'
import BackLink from './components/BackLink'
import AboutPanel from './components/AboutPanel'
import { AboutProvider, useAbout } from './contexts/AboutContext'
import styles from './App.module.css'

function Layout() {
  const { pathname } = useLocation()
  const { content, isOpen, setIsOpen } = useAbout()
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { window.scrollTo(0, 0) }, [pathname])

  return (
    <>
      <div className={styles.topBar}>
        {pathname !== '/' ? <BackLink /> : <span />}
        <div className={styles.topRight}>
          <ThemeToggle />
          {content && (
            <button
              ref={triggerRef}
              className={styles.aboutBtn}
              onClick={() => setIsOpen(!isOpen)}
              aria-label={isOpen ? 'Close' : 'About this app'}
              aria-expanded={isOpen}
            >
              {isOpen ? '×' : '?'}
            </button>
          )}
        </div>
      </div>
      <Outlet />
      {content && isOpen && (
        <AboutPanel onClose={() => setIsOpen(false)} triggerRef={triggerRef}>
          {content}
        </AboutPanel>
      )}
    </>
  )
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: <RouteErrorFallback />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/list', element: <ListApp /> },
      { path: '/count', element: <CountApp /> },
      { path: '/text', element: <TextApp /> },
      { path: '/image', element: <ImageApp /> },
      { path: '/audio', element: <AudioApp /> },
      { path: '/decibels', element: <DecibelsApp /> },
      { path: '/location', element: <LocationApp /> },
      { path: '/timer', element: <TimerApp /> },
      { path: '/tuner', element: <TunerApp /> },
      { path: '/metronome', element: <MetronomeApp /> },
      { path: '/color', element: <ColorApp /> },
      { path: '/dice', element: <DiceApp /> },
      { path: '/draw', element: <DrawApp /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])

export default function App() {
  return (
    <ErrorBoundary>
      <AboutProvider>
        <RouterProvider router={router} />
      </AboutProvider>
    </ErrorBoundary>
  )
}
