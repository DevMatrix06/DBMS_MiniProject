import { ViewTransition } from "react";

// The root template (app/template.tsx) only re-mounts when the top-level section changes. This one
// re-mounts when moving between contributor pages (feed, search, applications, profile).
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      {children}
    </ViewTransition>
  );
}
