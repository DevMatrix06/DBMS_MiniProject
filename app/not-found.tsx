import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container">
      <h1>Page not found</h1>
      <p className="muted">That page does not exist, or you may not have access to it.</p>
      <div className="row">
        <Link href="/" className="btn btn-primary">
          Go home
        </Link>
        <Link href="/dashboard" className="btn">
          Dashboard
        </Link>
      </div>
    </main>
  );
}
