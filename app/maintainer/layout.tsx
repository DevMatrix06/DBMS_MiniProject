import Link from "next/link";
import styles from "./maintainer.module.css";

// Shared navigation for all maintainer pages. Each page (and every API route) checks the role itself.
export default function MaintainerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className={styles.nav}>
        <Link href="/maintainer">My repositories</Link>
        <Link href="/maintainer/repos/new">New repository</Link>
        <Link href="/dashboard">Dashboard</Link>
      </nav>
      <main className={styles.main}>{children}</main>
    </>
  );
}
