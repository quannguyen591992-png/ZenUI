'use client'

export default function ProjectError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="dashboard-state">
      <h1>Project editor could not load</h1>
      <p role="alert">Your project was not changed.</p>
      <button type="button" onClick={reset}>Retry editor</button>
    </main>
  )
}
