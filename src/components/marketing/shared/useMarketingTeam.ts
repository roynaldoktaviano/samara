'use client'

import { useState, useEffect } from 'react'

export interface MarketingTeamMember { id: string; name: string; role: string }

// Owner fields across Campaigns/Content Studio store a plain name string (not a user FK),
// so this just backs the picker dropdowns — it never becomes the source of truth for who owns what.
export function useMarketingTeam() {
  const [team, setTeam] = useState<MarketingTeamMember[]>([])

  useEffect(() => {
    fetch('/api/marketing/team').then(res => res.ok && res.json()).then(data => data && setTeam(data))
  }, [])

  return team
}

// Owner selects are plain <select> elements bound to a name string, not a user id — so a
// name entered before this picker existed (or typed as a one-off) still has to show up as
// a selectable option instead of silently getting wiped out when the dropdown renders.
export function ownerOptionNames(team: MarketingTeamMember[], current: string | null | undefined): string[] {
  const names = team.map(t => t.name)
  if (current && !names.includes(current)) return [current, ...names]
  return names
}
