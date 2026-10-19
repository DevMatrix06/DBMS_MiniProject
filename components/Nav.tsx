import Link from "next/link";
import { getSession } from "@/lib/auth";
import LogoutButton from "@/app/dashboard/LogoutButton";
import NavLink from "./NavLink";
import { Logo } from "./Icons";

export default async function Nav() {
  const session = await getSession();

  return (
    <header className="nav">
      <nav className="nav-inner">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Logo size={17} />
          </span>
          DevMatch
        </Link>
        {session ? (
          <>
            {session.role === "contributor" && (
              <>
                <NavLink href="/contributor/feed">For you</NavLink>
                <NavLink href="/contributor/search">Search</NavLink>
                <NavLink href="/contributor/applications">Applications</NavLink>
                <NavLink href="/contributor/profile">Profile</NavLink>
              </>
            )}
            {session.role === "maintainer" && <NavLink href="/maintainer">Repositories</NavLink>}
            {session.role === "admin" && <NavLink href="/admin">Admin</NavLink>}
            <NavLink href="/dashboard">Dashboard</NavLink>
            <LogoutButton />
          </>
        ) : (
          <>
            <NavLink href="/login">Log in</NavLink>
            <Link href="/signup" className="btn btn-primary btn-sm" style={{ marginLeft: "0.4rem" }}>
              Sign up
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
