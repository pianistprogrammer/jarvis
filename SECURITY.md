# Security model

This is a local development agent, not a hardened multi-user service.

- The HTTP server binds to `127.0.0.1` only.
- File tools resolve every path beneath `AGENT_WORKSPACE`.
- The shell tool blocks a small set of obviously destructive commands, but it is still powerful. Run the process as an ordinary user and dedicate its workspace.
- The browser has a separate persistent profile under `data/browser-profile`. Do not sign it into sensitive accounts unless you accept that the model can act as you.
- Set `BROWSER_ALLOWLIST` to restrict navigation for higher-risk use.
- Do not expose ports 4100, 8000, or 8080 to the public internet.

Prompt injection from web pages is an unsolved risk. Watch tool cards and use an isolated browser profile.
