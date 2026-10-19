"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="container">
      <h1>Something went wrong</h1>
      <p className="muted">
        The page could not be loaded. If this keeps happening, check that the database is running.
      </p>
      <button type="button" className="btn-primary" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
