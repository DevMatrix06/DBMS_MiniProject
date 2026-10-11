import Link from "next/link";

export default function Home() {
  return (
    <main className="container">
      <section className="hero">
        <h1>Find the open-source issue that fits your skills</h1>
        <p className="muted">
          DevMatch reads issue descriptions and contributor profiles, turns both into embeddings, and
          ranks open issues by how closely they match what you can actually do.
        </p>
        <div className="row">
          <Link href="/signup" className="btn btn-primary">
            Get started
          </Link>
          <Link href="/login" className="btn">
            Log in
          </Link>
        </div>
      </section>

      <section className="card">
        <h2>Semantic search, not just keywords</h2>
        <p className="muted">
          Search for “make queries faster” and find the issue about speeding up a report query, even
          when the words differ.
        </p>
      </section>
      <section className="card">
        <h2>Matched to your profile</h2>
        <p className="muted">
          Add your skills and a short bio. Your “For you” feed ranks open issues by similarity and
          shows which of your skills each one uses.
        </p>
      </section>
    </main>
  );
}
