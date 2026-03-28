import { useReducer, useEffect } from 'react'
import AppHeader from '../../components/AppHeader'
import styles from './GolfApp.module.css'

const STORAGE_KEY = 'benapps.golf.v1'

const NAMES = [
  'Aldric', 'Bramble', 'Corvus', 'Draven', 'Ember',
  'Fawkes', 'Grimble', 'Huxley', 'Isolde', 'Jasper',
  'Kael', 'Lyric', 'Mireille', 'Nox', 'Orin',
  'Pyre', 'Quinn', 'Rook', 'Sage', 'Thane',
  'Urko', 'Vex', 'Wren', 'Xan', 'Yari',
  'Zed', 'Brom', 'Caelum', 'Dusk', 'Flint',
  'Gorm', 'Hex', 'Jax', 'Kira', 'Lorn',
  'Mist', 'Nara', 'Oken', 'Pell', 'Sable',
]

function pickName(used: string[]): string {
  const pool = NAMES.filter(n => !used.includes(n))
  const src = pool.length > 0 ? pool : NAMES
  return src[Math.floor(Math.random() * src.length)]
}

type Phase = 'setup' | 'play' | 'done'
type Player = { id: string; name: string; scores: (number | null)[] }

type State = {
  phase: Phase
  holeCount: 9 | 18
  pars: number[]
  players: Player[]
  activeCell: { playerId: string; hole: number } | null
}

type Action =
  | { type: 'SET_HOLES'; count: 9 | 18 }
  | { type: 'ADD_PLAYER' }
  | { type: 'REMOVE_PLAYER'; id: string }
  | { type: 'RENAME_PLAYER'; id: string; name: string }
  | { type: 'CYCLE_PAR'; hole: number }
  | { type: 'START' }
  | { type: 'SET_ACTIVE'; playerId: string; hole: number }
  | { type: 'CLEAR_ACTIVE' }
  | { type: 'SET_SCORE'; playerId: string; hole: number; score: number | null }
  | { type: 'FINISH' }
  | { type: 'NEW_ROUND' }
  | { type: 'RESET' }

const initial: State = {
  phase: 'setup',
  holeCount: 18,
  pars: Array(18).fill(4),
  players: [],
  activeCell: null,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_HOLES':
      return {
        ...state,
        holeCount: action.count,
        pars: Array(action.count).fill(4),
        players: state.players.map(p => ({ ...p, scores: Array(action.count).fill(null) })),
      }
    case 'ADD_PLAYER': {
      const name = pickName(state.players.map(p => p.name))
      return {
        ...state,
        players: [...state.players, {
          id: crypto.randomUUID(),
          name,
          scores: Array(state.holeCount).fill(null),
        }],
      }
    }
    case 'REMOVE_PLAYER':
      return { ...state, players: state.players.filter(p => p.id !== action.id) }
    case 'RENAME_PLAYER':
      return {
        ...state,
        players: state.players.map(p => p.id === action.id ? { ...p, name: action.name } : p),
      }
    case 'CYCLE_PAR':
      return {
        ...state,
        pars: state.pars.map((p, i) => i === action.hole ? (p >= 6 ? 2 : p + 1) : p),
      }
    case 'START':
      if (state.players.length === 0) return state
      return {
        ...state,
        phase: 'play',
        players: state.players.map(p => ({ ...p, scores: Array(state.holeCount).fill(null) })),
      }
    case 'SET_ACTIVE':
      return { ...state, activeCell: { playerId: action.playerId, hole: action.hole } }
    case 'CLEAR_ACTIVE':
      return { ...state, activeCell: null }
    case 'SET_SCORE':
      return {
        ...state,
        players: state.players.map(p =>
          p.id !== action.playerId ? p : {
            ...p,
            scores: p.scores.map((s, i) => i === action.hole ? action.score : s),
          }
        ),
      }
    case 'FINISH':
      return { ...state, phase: 'done', activeCell: null }
    case 'NEW_ROUND':
      return {
        ...state,
        phase: 'setup',
        activeCell: null,
        players: state.players.map(p => ({ ...p, scores: [] })),
      }
    case 'RESET':
      return { ...initial }
    default:
      return state
  }
}

function playerStats(player: Player, pars: number[]) {
  let strokes = 0, parSum = 0, played = 0
  player.scores.forEach((s, i) => {
    if (s !== null) { strokes += s; parSum += pars[i]; played++ }
  })
  return { strokes, vsPar: strokes - parSum, played }
}

function vsParLabel(n: number): string {
  if (n === 0) return 'E'
  return n > 0 ? `+${n}` : String(n)
}

function scoreClass(score: number, par: number): string {
  const d = score - par
  if (d <= -2) return styles.eagle
  if (d === -1) return styles.birdie
  if (d === 0) return styles.par
  if (d === 1) return styles.bogey
  return styles.dbl
}

function loadState(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initial
    const parsed = JSON.parse(raw)
    if (parsed?.v !== 1 || !parsed.state) return initial
    return parsed.state as State
  } catch {
    return initial
  }
}

export default function GolfApp() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState)
  const { phase, holeCount, pars, players, activeCell } = state

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, state }))
  }, [state])

  const activePlayer = activeCell ? (players.find(p => p.id === activeCell.playerId) ?? null) : null
  const activeScore = activeCell && activePlayer ? (activePlayer.scores[activeCell.hole] ?? null) : null
  const activePar = activeCell ? pars[activeCell.hole] : null

  // ── Setup ───────────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className={styles.app}>
        <AppHeader
          title="golf"
          about={
            <>
              <p>Track scores for multiple players across 9 or 18 holes.</p>
              <ul>
                <li>Players are assigned a random character name — tap to rename</li>
                <li>Tap a par value in the scorecard header to cycle between 3, 4, and 5</li>
                <li>Tap any score cell to enter or edit a score for that hole</li>
              </ul>
            </>
          }
        />

        <div className={styles.section}>
          <div className={styles.label}>holes</div>
          <div className={styles.toggle}>
            {([9, 18] as const).map(n => (
              <button
                key={n}
                className={[styles.toggleBtn, holeCount === n ? styles.toggleBtnOn : ''].filter(Boolean).join(' ')}
                onClick={() => dispatch({ type: 'SET_HOLES', count: n })}
              >{n}</button>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.label}>players</div>
          <div className={styles.playerList}>
            {players.map(p => (
              <div key={p.id} className={styles.playerRow}>
                <input
                  className={styles.nameInput}
                  value={p.name}
                  onChange={e => dispatch({ type: 'RENAME_PLAYER', id: p.id, name: e.target.value })}
                  autoCapitalize="none"
                  spellCheck={false}
                />
                <button
                  className={styles.removeBtn}
                  onClick={() => dispatch({ type: 'REMOVE_PLAYER', id: p.id })}
                  aria-label="Remove player"
                >×</button>
              </div>
            ))}
          </div>
          {players.length < 8 && (
            <button className={styles.addPlayerBtn} onClick={() => dispatch({ type: 'ADD_PLAYER' })}>
              + add player
            </button>
          )}
        </div>

        <button
          className={styles.startBtn}
          onClick={() => dispatch({ type: 'START' })}
          disabled={players.length === 0}
        >start round</button>
      </div>
    )
  }

  // ── Done ────────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    const parTotal = pars.reduce((s, p) => s + p, 0)
    const ranked = [...players].sort((a, b) =>
      playerStats(a, pars).vsPar - playerStats(b, pars).vsPar
    )

    return (
      <div className={styles.app}>
        <AppHeader title="golf" />

        <div className={styles.doneIntro}>
          <span className={styles.label}>{holeCount} holes · par {parTotal}</span>
        </div>

        <div className={styles.leaderboard}>
          {ranked.map((p, i) => {
            const { strokes, vsPar } = playerStats(p, pars)
            return (
              <div key={p.id} className={styles.leaderRow}>
                <span className={styles.rank}>{i + 1}</span>
                <span className={styles.leaderName}>{p.name}</span>
                <span className={styles.leaderStrokes}>{strokes}</span>
                <span className={[
                  styles.leaderVsPar,
                  vsPar < 0 ? styles.under : vsPar > 0 ? styles.over : styles.even,
                ].join(' ')}>{vsParLabel(vsPar)}</span>
              </div>
            )
          })}
        </div>

        <div className={styles.doneActions}>
          <button className={styles.newRoundBtn} onClick={() => dispatch({ type: 'NEW_ROUND' })}>new round</button>
          <button className={styles.resetBtn} onClick={() => dispatch({ type: 'RESET' })}>reset</button>
        </div>
      </div>
    )
  }

  // ── Play ────────────────────────────────────────────────────────────────────
  const parTotal = pars.reduce((s, p) => s + p, 0)
  const holes = Array.from({ length: holeCount }, (_, i) => i)

  return (
    <div className={styles.app}>
      <AppHeader
        title="golf"
        meta={<span className={styles.metaLabel}>{holeCount} holes · par {parTotal}</span>}
      />

      <div className={styles.scorecardWrap}>
        <table className={styles.scorecard}>
          <thead>
            <tr>
              <th className={[styles.cell, styles.nameCell, styles.headCell].join(' ')} />
              {holes.map(h => (
                <th key={h} className={[styles.cell, styles.holeCell, styles.headCell].join(' ')}>
                  <span className={styles.holeNum}>{h + 1}</span>
                  <button
                    className={styles.parBtn}
                    onClick={() => dispatch({ type: 'CYCLE_PAR', hole: h })}
                    title="Tap to change par"
                  >{pars[h]}</button>
                </th>
              ))}
              <th className={[styles.cell, styles.totCell, styles.headCell].join(' ')}>
                <span className={styles.label}>tot</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {players.map(p => {
              const { strokes, vsPar, played } = playerStats(p, pars)
              return (
                <tr key={p.id}>
                  <td className={[styles.cell, styles.nameCell].join(' ')}>
                    <span className={styles.playerName}>{p.name}</span>
                  </td>
                  {holes.map(h => {
                    const score = p.scores[h]
                    const isActive = activeCell?.playerId === p.id && activeCell?.hole === h
                    return (
                      <td
                        key={h}
                        className={[
                          styles.cell,
                          styles.holeCell,
                          styles.scoreCell,
                          isActive ? styles.activeCell : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => dispatch({ type: 'SET_ACTIVE', playerId: p.id, hole: h })}
                      >
                        {score !== null
                          ? <span className={[styles.scoreVal, scoreClass(score, pars[h])].join(' ')}>{score}</span>
                          : <span className={styles.emptyScore}>—</span>
                        }
                      </td>
                    )
                  })}
                  <td className={[styles.cell, styles.totCell].join(' ')}>
                    {played > 0 ? (
                      <div className={styles.totContent}>
                        <span className={styles.totStrokes}>{strokes}</span>
                        <span className={[
                          styles.totVsPar,
                          vsPar < 0 ? styles.under : vsPar > 0 ? styles.over : styles.even,
                        ].join(' ')}>{vsParLabel(vsPar)}</span>
                      </div>
                    ) : <span className={styles.emptyScore}>—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <button className={styles.finishBtn} onClick={() => dispatch({ type: 'FINISH' })}>
        finish round
      </button>

      {activeCell && activePlayer && (
        <>
          <div className={styles.pickerBackdrop} onClick={() => dispatch({ type: 'CLEAR_ACTIVE' })} />
          <div className={styles.picker}>
            <div className={styles.pickerInfo}>
              <span>{activePlayer.name}</span>
              <span className={styles.pickerDot}>·</span>
              <span>hole {activeCell.hole + 1}</span>
              <span className={styles.pickerDot}>·</span>
              <span>par {activePar}</span>
            </div>
            <div className={styles.pickerGrid}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(s => (
                <button
                  key={s}
                  className={[styles.pickBtn, activeScore === s ? styles.pickBtnOn : ''].filter(Boolean).join(' ')}
                  onClick={() => {
                    dispatch({ type: 'SET_SCORE', playerId: activeCell.playerId, hole: activeCell.hole, score: s })
                    dispatch({ type: 'CLEAR_ACTIVE' })
                  }}
                >{s}</button>
              ))}
            </div>
            {activeScore !== null && (
              <button
                className={styles.clearBtn}
                onClick={() => {
                  dispatch({ type: 'SET_SCORE', playerId: activeCell.playerId, hole: activeCell.hole, score: null })
                  dispatch({ type: 'CLEAR_ACTIVE' })
                }}
              >clear</button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
