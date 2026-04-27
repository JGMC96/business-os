import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { bootstrapSessionPersistence } from "./lib/sessionPersistence";

bootstrapSessionPersistence();

createRoot(document.getElementById("root")!).render(<App />);
