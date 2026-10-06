export type ThemeMode = 'dark' | 'light'
export type ThemeColor = 'orange' | 'yellow' | 'blue' | 'green' | 'purple' | 'red'

const MODE_KEY = 'ct-theme-mode'
const COLOR_KEY = 'ct-theme-color'

export function getThemeMode(): ThemeMode {
  return (localStorage.getItem(MODE_KEY) as ThemeMode) || 'dark'
}

export function getThemeColor(): ThemeColor {
  return (localStorage.getItem(COLOR_KEY) as ThemeColor) || 'yellow'
}

export function setThemeMode(mode: ThemeMode) {
  localStorage.setItem(MODE_KEY, mode)
  applyTheme(mode, getThemeColor())
}

export function setThemeColor(color: ThemeColor) {
  localStorage.setItem(COLOR_KEY, color)
  applyTheme(getThemeMode(), color)
}

export function applyTheme(mode: ThemeMode = getThemeMode(), color: ThemeColor = getThemeColor()) {
  const root = document.documentElement
  root.classList.remove('dark', 'light')
  root.classList.add(mode)
  root.setAttribute('data-color', color)
}