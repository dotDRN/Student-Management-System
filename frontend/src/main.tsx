import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// In Vite dev mode, the dev Service Worker activates after initial ESM modules have
// already been fetched. Warm those loaded dev assets once the SW takes control so
// offline reload works immediately without requiring an extra manual online reload.
if (import.meta.env.DEV && typeof window !== "undefined" && "serviceWorker" in navigator) {
  let warmed = false;
  const warmDevSwCache = async () => {
    if (warmed || !navigator.onLine || !navigator.serviceWorker.controller) return;
    warmed = true;
    try {
      const origin = window.location.origin;
      const urls = new Set<string>([
        `${origin}/manifest.webmanifest`,
        `${origin}/favicon.svg`,
        `${origin}/@vite/client`,
        `${origin}/@react-refresh`,
        `${origin}/src/main.tsx`,
        `${origin}/@vite-plugin-pwa/pwa-entry-point-loaded`,
      ]);
      for (const entry of performance.getEntriesByType("resource")) {
        const name = entry.name;
        if (
          name.startsWith(origin) &&
          !name.includes("/api/") &&
          !name.includes("/socket.io/") &&
          !name.includes("/health") &&
          !name.includes("/dev-sw.js")
        ) {
          urls.add(name);
        }
      }
      const list = Array.from(urls);
      for (let i = 0; i < list.length; i += 20) {
        if (!navigator.onLine) break;
        await Promise.allSettled(
          list.slice(i, i + 20).map((url) => fetch(url, { credentials: "same-origin" })),
        );
      }
    } catch {
      // Best-effort dev cache warmup
    }
  };

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    setTimeout(() => void warmDevSwCache(), 500);
  });
  window.addEventListener("load", () => {
    if (navigator.serviceWorker.controller) {
      setTimeout(() => void warmDevSwCache(), 800);
    }
  });
}

const root = document.getElementById("root");

if (root) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: "offlineFirst",
        retry: 1,
        staleTime: 30_000,
      },
      mutations: {
        networkMode: "offlineFirst",
      },
    },
  });
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>
  );
}