import { lazy, Suspense } from "react";
import { HashRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { Architecture } from "./pages/Architecture";
import { Configure } from "./pages/Configure";
import { Features } from "./pages/Features";
import { GettingStarted } from "./pages/GettingStarted";
import { Hardware } from "./pages/Hardware";
import { Home } from "./pages/Home";
import { Install } from "./pages/Install";

/** React Router v7 behaviour, opted into now. */
export const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

// The demo brings xterm.js: load it only when someone opens the demo.
const Demo = lazy(() => import("./pages/Demo").then((m) => ({ default: m.Demo })));

export const PAGES = [
  { path: "/", label: "aember", element: <Home /> },
  { path: "/architecture", label: "Architecture", element: <Architecture /> },
  { path: "/features", label: "Features", element: <Features /> },
  { path: "/hardware", label: "Hardware", element: <Hardware /> },
  { path: "/getting-started", label: "Get started", element: <GettingStarted /> },
  { path: "/install", label: "Install", element: <Install /> },
  { path: "/configure", label: "Configure", element: <Configure /> },
  { path: "/demo", label: "Demo", element: <Demo /> },
];

export function AppRoutes() {
  return (
    <div className="layout">
      <header>
        <nav aria-label="Main">
          {PAGES.map((p) => (
            <NavLink key={p.path} to={p.path} end className={p.path === "/" ? "brand" : ""}>
              {p.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main>
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <Routes>
          {PAGES.map((p) => (
            <Route key={p.path} path={p.path} element={p.element} />
          ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <footer>
        <span>aember: PID 1 for container appliances.</span>{" "}
        <a href="https://github.com/ajdariarian94/aember">Source on GitHub</a>
      </footer>
    </div>
  );
}

/** Hash routing: works on any static host, no server rewrites needed. */
export default function App() {
  return (
    <HashRouter future={ROUTER_FUTURE}>
      <AppRoutes />
    </HashRouter>
  );
}
