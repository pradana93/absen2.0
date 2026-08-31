import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

/* production PWA: installable + offline shell.
   BASE_URL keeps this working on GitHub Pages subpaths (user.github.io/repo/). */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* SW unavailable (e.g. non-secure context) — app still works online */
    });
  });
}
