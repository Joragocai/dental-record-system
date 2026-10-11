import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import { RuntimeStatusProvider } from "./context/RuntimeStatusContext";
import "./index.css";

const router = createBrowserRouter([{ path: "*", element: <App /> }]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RuntimeStatusProvider>
      <RouterProvider router={router} />
    </RuntimeStatusProvider>
  </React.StrictMode>
);
