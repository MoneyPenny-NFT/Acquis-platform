export const STYLES = `
  .acquis-widget {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 16px;
    padding: 24px;
    color: #f1f5f9;
    max-width: 380px;
    box-sizing: border-box;
  }
  .acquis-widget * { box-sizing: border-box; }
  .acquis-title {
    font-size: 11px;
    letter-spacing: 0.1em;
    color: #94a3b8;
    text-transform: uppercase;
    margin: 0 0 16px;
  }
  .acquis-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 12px;
  }
  .acquis-label {
    font-size: 11px;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .acquis-input {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    color: #f1f5f9;
    font-size: 14px;
    padding: 10px 12px;
    outline: none;
    width: 100%;
    transition: border-color 0.15s;
  }
  .acquis-input:focus { border-color: #38bdf8; }
  .acquis-btn {
    width: 100%;
    padding: 14px;
    background: #38bdf8;
    color: #0f172a;
    border: none;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    margin-top: 8px;
    transition: opacity 0.15s, transform 0.1s;
  }
  .acquis-btn:hover { opacity: 0.9; }
  .acquis-btn:active { transform: scale(0.98); }
  .acquis-btn:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }
  .acquis-status {
    margin-top: 12px;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    display: none;
  }
  .acquis-status.visible { display: block; }
  .acquis-status.success { background: rgba(74,222,128,0.12); border: 1px solid #166534; color: #4ade80; }
  .acquis-status.error   { background: rgba(248,113,113,0.12); border: 1px solid #7f1d1d; color: #f87171; }
`;
