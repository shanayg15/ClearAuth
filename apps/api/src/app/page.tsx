export default function ApiStatus() {
  return (
    <div style={{ fontFamily: "monospace", padding: "2rem", maxWidth: "640px", margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 0.5rem" }}>HealthFlow API</h1>
      <p style={{ color: "#666", margin: "0 0 1.5rem" }}>Multi-agent healthcare pipeline backend — v1</p>
      <hr style={{ margin: "0 0 1.5rem", border: "1px solid #eee" }} />
      <h2 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>Endpoints</h2>
      <ul style={{ lineHeight: 2, paddingLeft: "1.2rem" }}>
        <li><code>POST /api/voice/transcribe</code> — ElevenLabs Scribe v1 STT</li>
        <li><code>POST /api/agents/draft</code> — Run full 9-agent LangChain pipeline</li>
        <li><code>POST /api/agents/commit</code> — Physician approval + EHR commit</li>
        <li><code>GET  /api/encounters</code> — List all encounters</li>
        <li><code>GET  /api/encounters/[id]</code> — Get encounter by ID</li>
        <li><code>GET  /api/auth/users</code> — Demo users + tokens</li>
      </ul>
      <hr style={{ margin: "1.5rem 0", border: "1px solid #eee" }} />
      <p style={{ color: "#888", fontSize: "0.85rem", margin: 0 }}>
        Status: <span style={{ color: "green", fontWeight: "bold" }}>online</span>
        {" · "}Engine: LangChain + Claude Sonnet
        {" · "}Auth: Scalekit demo tokens
      </p>
    </div>
  );
}
