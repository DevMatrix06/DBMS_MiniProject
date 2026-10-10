export default function Home() {
  return (
    <main style={{ padding: "2rem", maxWidth: 720, margin: "0 auto" }}>
      <h1>DevMatch</h1>
      <p>Semantic matching of open-source issues to contributor skills.</p>
      <p>
        Database status: <a href="/api/health">/api/health</a>
      </p>
    </main>
  );
}
