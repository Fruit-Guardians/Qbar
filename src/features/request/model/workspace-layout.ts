export type WorkspaceLayout = 'auto' | 'side' | 'stacked'
export type WorkspacePreference = { layout: WorkspaceLayout; ratio: number }
export const clampSplit = (value: number) =>
  Math.min(80, Math.max(20, Number.isFinite(value) ? value : 50))
export function readWorkspacePreference(value: unknown): WorkspacePreference {
  const saved = value as Partial<WorkspacePreference> | null
  return {
    layout:
      saved && ['auto', 'side', 'stacked'].includes(saved.layout || '')
        ? (saved.layout as WorkspaceLayout)
        : 'auto',
    ratio: clampSplit(typeof saved?.ratio === 'number' ? saved.ratio : 50),
  }
}
export function workspaceDirection(layout: WorkspaceLayout, width: number) {
  return width < 700 || layout === 'stacked' ? 'stacked' : 'side'
}
export function splitFromPointer(
  position: number,
  start: number,
  size: number,
) {
  return size > 0 ? clampSplit(((position - start) / size) * 100) : 50
}
