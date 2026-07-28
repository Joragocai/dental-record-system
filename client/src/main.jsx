import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { RuntimeStatusProvider } from "./context/RuntimeStatusContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RuntimeStatusProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </RuntimeStatusProvider>
  </React.StrictMode>
);
