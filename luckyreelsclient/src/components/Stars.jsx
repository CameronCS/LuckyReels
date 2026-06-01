import { useMemo } from 'react'

export default function Stars({ count = 80 }) {
  const stars = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const sz  = Math.random() * 2 + 1
      const d   = 2 + Math.random() * 5
      const o   = 0.15 + Math.random() * 0.5
      const del = Math.random() * 5
      return (
        <div key={i} className="star" style={{
          width: sz, height: sz,
          left: `${Math.random() * 100}%`,
          top:  `${Math.random() * 100}%`,
          '--d': `${d}s`, '--o': o,
          animationDelay: `${del}s`,
        }} />
      )
    })
  }, [count])

  return <div className="stars">{stars}</div>
}
