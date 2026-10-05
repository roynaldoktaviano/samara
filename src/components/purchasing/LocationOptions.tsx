// Shared <select> option renderer for StockLocation pickers across the app. Groups
// locations under their parent (StockLocation.parentId) via native <optgroup> so a
// vessel's sub-locations (Bar, Galley, …) show nested under the vessel instead of
// cluttering the top-level list as separate flat entries like "Otium - Bar".
export interface LocationOptionLike {
  id: string
  name: string
  parentId?: string | null
}

export function renderLocationOptions<T extends LocationOptionLike>(
  locations: T[],
  opts?: { excludeIds?: Set<string>; renderLabel?: (l: T) => string; topLevelOnly?: boolean },
) {
  const excludeIds = opts?.excludeIds
  const renderLabel = opts?.renderLabel ?? ((l: T) => l.name)

  const byParent = new Map<string, T[]>()
  const topLevel: T[] = []
  locations.forEach(l => {
    if (l.parentId) {
      const arr = byParent.get(l.parentId) ?? []
      arr.push(l)
      byParent.set(l.parentId, arr)
    } else {
      topLevel.push(l)
    }
  })

  // Sub-locations (Bar, Galley, …) don't apply to every picker — a "Delivery Location"
  // or "Where does this person work" field means the vessel/site itself, not one of its
  // internal storage areas, so this skips children and optgroups entirely.
  if (opts?.topLevelOnly) {
    return topLevel.filter(l => !excludeIds?.has(l.id)).map(l => <option key={l.id} value={l.id}>{renderLabel(l)}</option>)
  }

  // A child whose parent isn't in this list (e.g. filtered out by role/type, like
  // "Bali Cold Storage" under a SITE parent for a Warehouse account) would otherwise
  // never render — and a controlled <select> whose value has no matching option
  // silently *displays* the first option while still submitting the hidden one.
  const topLevelIds = new Set(topLevel.map(l => l.id))
  const orphans = [...byParent.entries()]
    .filter(([parentId]) => !topLevelIds.has(parentId))
    .flatMap(([, children]) => children)
    .filter(c => !excludeIds?.has(c.id))

  const grouped = topLevel.map(loc => {
    const children = (byParent.get(loc.id) ?? []).filter(c => !excludeIds?.has(c.id))
    const parentVisible = !excludeIds?.has(loc.id)

    if (children.length === 0) {
      return parentVisible ? <option key={loc.id} value={loc.id}>{renderLabel(loc)}</option> : null
    }
    return (
      <optgroup key={loc.id} label={loc.name}>
        {parentVisible && <option value={loc.id}>{loc.name}</option>}
        {children.map(c => <option key={c.id} value={c.id}>{renderLabel(c)}</option>)}
      </optgroup>
    )
  })
  return [...grouped, ...orphans.map(l => <option key={l.id} value={l.id}>{renderLabel(l)}</option>)]
}
