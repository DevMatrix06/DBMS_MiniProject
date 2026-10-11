import Link from "next/link";
import { getSession } from "@/lib/auth";
import LogoutButton from "@/app/dashboard/LogoutButton";

export default async function Nav() {
  const session = await getSession();

  return (
    <header className="nav">
      <nav className="nav-inner">
        <Link href="/" className="brand">
          DevMatch
        </Link>
        {session ? (
          <>
            {session.role === "contributor" && (
              <>
                <Link href="/contributor/feed">For you</Link>
                <Link href="/contributor/search">Search</Link>
                <Link href="/contributor/profile">Profile</Link>
              </>
            )}
            <Link href="/dashboard">Dashboard</Link>
            <LogoutButton />
          </>
        ) : (
          <>
            <Link href="/login">Log in</Link>
            <Link href="/signup" className="btn btn-primary">
              Sign up
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
