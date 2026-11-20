import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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