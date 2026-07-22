'use client'

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="dashboard-state">
      <h1>ZenUI could not load</h1>
      <p role="alert">An unexpected error occurred.</p>
      <button type="button" onClick={reset}>Try again</button>
    </main>
  )
}
