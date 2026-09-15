export function toolProgressCue(name: string) {
  if (name === 'browser_open') return 'I am opening that page and reading it now.'
  if (name === 'browser_snapshot') return 'I am reading the page now.'
  if (name === 'browser_click' || name === 'browser_type') return 'I am interacting with the page now.'
  if (name.startsWith('browser_')) return 'I am working in the browser now.'
  return 'I am working on that now.'
}
