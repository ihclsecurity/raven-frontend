import type { EmailGroup } from '../types/emailGroups'

export const CORPORATE_SS_GROUP_NAME = 'Corporate S&S'
export const CORPORATE_SS_DATABASE_GROUP_NAME = 'S&S Leadership'

// Corporate S&S uses the existing S&S Leadership group in the database.
export function findCorporateSsGroup(groups: EmailGroup[]): EmailGroup | null {
  const matches = groups.filter((group) => (
    group.active && group.name.trim().replace(/\s+/g, ' ').toLowerCase() === CORPORATE_SS_DATABASE_GROUP_NAME.toLowerCase()
  ))
  return matches.length === 1 ? matches[0] : null
}

export function hasCorporateSsRecipients(group: EmailGroup | null): boolean {
  return Boolean(group?.members.some((member) => (
    member.active && /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(member.email.trim())
  )))
}
