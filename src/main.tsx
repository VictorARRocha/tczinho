import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ThemeProvider } from "./components/ThemeProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <ErrorBoundary area="o dashboard">
      <App />
    </ErrorBoundary>
  </ThemeProvider>
);
