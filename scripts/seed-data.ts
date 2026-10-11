// Demo data. Repositories are fictional so nothing here claims to be a real project.

export const maintainer = { email: "maintainer@devmatch.dev" };

export const repos = [
  { name: "acme/ledger-api", language: "Python", stars: 1240, description: "REST API for double-entry bookkeeping built on Django and PostgreSQL." },
  { name: "acme/pixel-ui", language: "TypeScript", stars: 3100, description: "Accessible React component library with a Next.js documentation site." },
  { name: "acme/pipeline-kit", language: "Go", stars: 870, description: "CLI and library for composing data pipelines, with Docker-based runners." },
  { name: "acme/trailmap", language: "Rust", stars: 540, description: "Fast GPX parser and route planner exposed through a small web service." },
  { name: "acme/insight-ml", language: "Python", stars: 2050, description: "Lightweight toolkit for training and evaluating tabular ML models." },
  { name: "acme/notes-sync", language: "JavaScript", stars: 410, description: "Offline-first note taking app that syncs through MongoDB." },
];

export const issues: {
  repo: string; title: string; body: string; difficulty: "easy" | "medium" | "hard"; skills: string[];
}[] = [
  { repo: "acme/ledger-api", title: "Add pagination to the transactions endpoint", body: "GET /transactions returns every row. Add limit and cursor parameters in the Django REST view and keep the query using the existing index on posted_at.", difficulty: "easy", skills: ["Python", "Django", "PostgreSQL"] },
  { repo: "acme/ledger-api", title: "Race condition when two transfers hit the same account", body: "Concurrent transfers can overdraw an account. Use row-level locking or SELECT FOR UPDATE inside a transaction and add a regression test with threads.", difficulty: "hard", skills: ["PostgreSQL", "Python", "Testing"] },
  { repo: "acme/ledger-api", title: "Document the authentication flow", body: "The README does not explain token issuing and refresh. Write a short guide with request examples and a sequence diagram.", difficulty: "easy", skills: ["Documentation"] },
  { repo: "acme/ledger-api", title: "Speed up monthly report query", body: "The monthly balance report takes 8 seconds on 5M rows. Profile with EXPLAIN ANALYZE, add a suitable composite index or materialized view.", difficulty: "medium", skills: ["PostgreSQL", "Python"] },
  { repo: "acme/pixel-ui", title: "Dropdown menu is not keyboard accessible", body: "Arrow keys and Escape do not work in the Menu component. Implement proper focus management and ARIA roles, then add tests.", difficulty: "medium", skills: ["React", "TypeScript", "Testing"] },
  { repo: "acme/pixel-ui", title: "Dark mode flicker on first page load in docs site", body: "The Next.js docs site flashes the light theme before applying dark mode. Move theme detection before hydration.", difficulty: "medium", skills: ["Next.js", "React", "JavaScript"] },
  { repo: "acme/pixel-ui", title: "Add Storybook story for the DatePicker", body: "DatePicker has no stories. Add stories for default, disabled and range modes with controls.", difficulty: "easy", skills: ["React", "TypeScript"] },
  { repo: "acme/pixel-ui", title: "Reduce bundle size by splitting icon exports", body: "Importing one icon pulls in the whole icon set. Restructure exports to be tree-shakeable and verify with a bundle analyzer.", difficulty: "hard", skills: ["TypeScript", "JavaScript", "CI/CD"] },
  { repo: "acme/pipeline-kit", title: "Add retry with backoff to HTTP source", body: "The HTTP source fails the whole run on a transient 503. Implement configurable exponential backoff with jitter in Go.", difficulty: "medium", skills: ["Go"] },
  { repo: "acme/pipeline-kit", title: "Provide a minimal Dockerfile for the runner", body: "Create a multi-stage Dockerfile producing a small static image of the runner, and document how to build and run it.", difficulty: "easy", skills: ["Docker", "Go"] },
  { repo: "acme/pipeline-kit", title: "GitHub Actions workflow for release builds", body: "Automate cross-platform binaries and checksums on tagged releases using a CI workflow.", difficulty: "medium", skills: ["CI/CD", "Go"] },
  { repo: "acme/pipeline-kit", title: "Fix goroutine leak when a pipeline is cancelled", body: "Cancelling a pipeline leaves worker goroutines blocked on channels. Propagate context cancellation and add a leak test.", difficulty: "hard", skills: ["Go", "Testing"] },
  { repo: "acme/trailmap", title: "GPX parser panics on missing elevation tags", body: "Files without <ele> elements crash the parser. Return Option values and add test fixtures from real-world files.", difficulty: "easy", skills: ["Rust", "Testing"] },
  { repo: "acme/trailmap", title: "Implement A* routing with elevation penalty", body: "Routing ignores climbs. Add a configurable elevation cost to the A* heuristic and benchmark on the sample dataset.", difficulty: "hard", skills: ["Rust", "Machine Learning"] },
  { repo: "acme/trailmap", title: "Expose route search through a JSON endpoint", body: "Wrap the planner in a small HTTP service returning GeoJSON, with request validation and error codes.", difficulty: "medium", skills: ["Rust", "Docker"] },
  { repo: "acme/insight-ml", title: "Add cross-validation helper with stratified folds", body: "Users write their own CV loops. Provide a helper that supports stratified k-fold and returns per-fold metrics.", difficulty: "medium", skills: ["Python", "Machine Learning"] },
  { repo: "acme/insight-ml", title: "Handle missing values in the preprocessing pipeline", body: "Pipeline raises on NaN input. Add configurable imputation strategies (mean, median, constant) with unit tests.", difficulty: "easy", skills: ["Python", "Machine Learning", "Testing"] },
  { repo: "acme/insight-ml", title: "Write a tutorial notebook for churn prediction", body: "Create an end to end tutorial: load data, train, evaluate and interpret feature importance, in a clean notebook.", difficulty: "easy", skills: ["Python", "Documentation", "Machine Learning"] },
  { repo: "acme/insight-ml", title: "Model registry: store trained models in PostgreSQL", body: "Persist model metadata and artifacts in PostgreSQL with versioning, and add load and list commands.", difficulty: "hard", skills: ["Python", "PostgreSQL", "Machine Learning"] },
  { repo: "acme/notes-sync", title: "Conflict resolution when two devices edit offline", body: "Edits made offline on two devices overwrite each other on sync. Implement last-writer-wins with a vector clock and show a conflict banner.", difficulty: "hard", skills: ["JavaScript", "MongoDB"] },
  { repo: "acme/notes-sync", title: "Add MongoDB index for note search by tag", body: "Tag queries scan the collection. Add a compound index and an aggregation pipeline that counts notes per tag.", difficulty: "easy", skills: ["MongoDB", "JavaScript"] },
  { repo: "acme/notes-sync", title: "Migrate the editor component to React hooks", body: "The editor is a class component. Convert it to hooks without changing behaviour and keep existing tests green.", difficulty: "medium", skills: ["React", "JavaScript", "Testing"] },
  { repo: "acme/notes-sync", title: "Document how to self-host with Docker Compose", body: "Add a compose file with the app and MongoDB, plus a guide covering environment variables and backups.", difficulty: "easy", skills: ["Docker", "Documentation", "MongoDB"] },
];

export const contributors = [
  { email: "asha@devmatch.dev", name: "Asha Rao", github: "asha-rao", level: "intermediate", bio: "Backend developer who enjoys database performance tuning and API design. Currently learning about concurrency and transactions.", skills: [["Python", 4], ["Django", 4], ["PostgreSQL", 4], ["Testing", 3]] },
  { email: "karthik@devmatch.dev", name: "Karthik Nair", github: "karthik-n", level: "advanced", bio: "Frontend engineer focused on accessibility and design systems. Writes component libraries and cares about developer experience.", skills: [["React", 5], ["TypeScript", 5], ["Next.js", 4], ["Testing", 4]] },
  { email: "meera@devmatch.dev", name: "Meera Iyer", github: "meera-iyer", level: "beginner", bio: "Second year student interested in machine learning and data science. Likes writing tutorials and notebooks to explain what she learns.", skills: [["Python", 3], ["Machine Learning", 2], ["Documentation", 3]] },
  { email: "rohan@devmatch.dev", name: "Rohan Das", github: "rohan-das", level: "intermediate", bio: "Systems programmer working in Go and Rust. Interested in CLI tools, concurrency and build automation.", skills: [["Go", 4], ["Rust", 3], ["Docker", 3], ["CI/CD", 3]] },
  { email: "sneha@devmatch.dev", name: "Sneha Pillai", github: "sneha-pillai", level: "beginner", bio: "Self-taught web developer building small full-stack apps with JavaScript and MongoDB. Wants to start with documentation and small fixes.", skills: [["JavaScript", 3], ["MongoDB", 2], ["React", 2], ["Documentation", 3]] },
  { email: "vikram@devmatch.dev", name: "Vikram Shetty", github: "vikram-s", level: "advanced", bio: "DevOps engineer who automates deployments, containers and pipelines. Comfortable with release engineering and monitoring.", skills: [["Docker", 5], ["CI/CD", 5], ["Go", 3], ["Python", 3]] },
] as const;

export const DEMO_PASSWORD = "password123";
