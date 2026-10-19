import { ViewTransition } from "react";

// Same page transition as the rest of the app, for moving between maintainer pages.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      {children}
    </ViewTransition>
  );
}
