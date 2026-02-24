import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CssBaseline } from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import "./index.css";
import App from "./App.jsx";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#5f9dff" },
    secondary: { main: "#ff7aa2" },
    background: {
      default: "#f4f7ff",
      paper: "#ffffff",
    },
  },
  typography: {
    fontFamily: "\"Manrope\", system-ui, sans-serif",
    h1: { fontFamily: "\"Cormorant Garamond\", serif" },
    h2: { fontFamily: "\"Cormorant Garamond\", serif" },
    h3: { fontFamily: "\"Cormorant Garamond\", serif" },
  },
  shape: {
    borderRadius: 16,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          minHeight: "100vh",
          backgroundImage:
            "radial-gradient(circle at 15% 20%, rgba(95, 157, 255, 0.18), transparent 45%), radial-gradient(circle at 85% 10%, rgba(255, 122, 162, 0.25), transparent 40%), radial-gradient(circle at 50% 90%, rgba(167, 184, 255, 0.25), transparent 45%), linear-gradient(135deg, rgba(244, 247, 255, 0.95), rgba(255, 238, 244, 0.85))",
          backgroundAttachment: "fixed",
        },
        "*": {
          boxSizing: "border-box",
        },
      },
    },
  },
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>
);
