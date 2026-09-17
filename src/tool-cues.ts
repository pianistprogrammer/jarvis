export function toolProgressCue(name: string) {
  if (name === 'browser_open') return "Let’s open that page."
  if (name === 'browser_snapshot') return "Let me take a look."
  if (name === 'browser_click') return "Let’s try this."
  if (name === 'browser_type') return "I’ll type that in."
  if (name.startsWith('browser_')) return "Just checking a few things."
  return "I’m on it."
}
