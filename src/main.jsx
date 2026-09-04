import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { UseLoginPrompt } from "./UseLoginPrompt.jsx";
import "./styles.css";

class BrizoErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[brizo-render-error]", error, info?.componentStack || "");
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main style={{
        width: "100vw",
        height: "100vh",
        padding: "40px",
        display: "grid",
        placeItems: "center",
        borderRadius: "22px",
        background: "#f1e7e1",
        color: "#343a35",
        overflow: "hidden",
      }}>
        <section style={{ maxWidth: "600px", textAlign: "center" }} role="alert">
          <h1 style={{ margin: "0 0 12px", fontSize: "20px", fontWeight: 500 }}>Brizo 界面需要恢复</h1>
          <p style={{ margin: "0 0 12px", color: "#6f756f", fontSize: "13px", lineHeight: 1.7 }}>
            当前页面状态出现异常。窗口仍保持可见，重新载入即可恢复。
          </p>
          {this.state.error && (
            <pre style={{
              margin: "0 0 16px",
              padding: "12px",
              background: "rgba(0,0,0,0.05)",
              borderRadius: "8px",
              fontSize: "11px",
              color: "#c23",
              textAlign: "left",
              maxHeight: "180px",
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}>
              {String(this.state.error.stack || this.state.error.message || this.state.error)}
            </pre>
          )}
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem("bean:open-tabs");
              } catch {}
              window.location.reload();
            }}
            style={{
              height: "34px",
              padding: "0 16px",
              border: 0,
              borderRadius: "999px",
              background: "#343a35",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            重置并重新载入 Brizo
          </button>
        </section>
      </main>
    );
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrizoErrorBoundary>
      {window.useLoginPrompt ? <UseLoginPrompt /> : <App />}
    </BrizoErrorBoundary>
  </React.StrictMode>,
);
