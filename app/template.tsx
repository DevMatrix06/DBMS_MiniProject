import { ViewTransition } from "react";

// A template re-mounts on every navigation (unlike a layout), so the page enters and exits with the
// "page-in" / "page-out" animations defined in globals.css. Browsers without View Transitions just swap pages.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      {children}
    </ViewTransition>
  );
}
