/**
 * Email Groups
 *
 * What this page does
 * -------------------
 * This page manages recipient groups and the property mappings attached to
 * each member. It is the admin-facing screen for building reusable email
 * routing groups that later drive advisory delivery and approval workflows.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Start with the data-loading queries, then read the member editing helpers,
 * and finally follow the save flow in the JSX. The important behavior here is
 * not the visual layout itself, but how members, properties, and primary
 * property selection stay consistent.
 *
 * When to change this file
 * ------------------------
 * Update this page when group creation, member/property editing, validation,
 * or admin-only access rules change.
 *
 * What this file does not do
 * --------------------------
 * It does not send email directly or decide advisory content. It only
 * maintains the group data that other parts of the application consume.
 */

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { authApi } from '../api/auth'
import { emailGroupsApi } from '../api/emailGroups'
import { Check, MapPinned, Save, Trash2, UserPlus, X } from 'lucide-react'
import type { EmailGroup, EmailGroupInput, EmailGroupMemberInput } from '../types/emailGroups'
import type { AuthUser } from '../types/auth'
import { hasFullAccess } from '../utils/authRoles'

type EditableMember = {
  row_key: string
  email: string
  display_name: string
  properties: string[]
  primary_property: string
  active: boolean
}

// Each member row gets a stable client-side key so edits, inserts, and deletes
// can be tracked without depending on backend ids before the row is saved.
function createMemberRowKey(): string {
  return `member-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

// Prefer the user's real name when available, but fall back to email so the
// UI always has a readable label for the person.
function userDisplayName(appUser: AuthUser): string {
  return [appUser.first_name, appUser.last_name].filter(Boolean).join(' ').trim() || appUser.email
}

// Show a compact location string for search and selection lists.
function userLocation(appUser: AuthUser): string {
  return [appUser.city, appUser.state, appUser.country].filter(Boolean).join(', ')
}

// Convert a persisted email group into the editable client-side shape used by
// the form. This keeps the editing UI isolated from backend storage details.
function toEditableMembers(group: EmailGroup | null): EditableMember[] {
  if (!group) return []
  return (group.members || []).map((item) => ({
    row_key: `existing-${item.id}`,
    email: item.email || '',
    display_name: item.display_name || '',
    properties: item.properties || [],
    primary_property: item.primary_property || '',
    active: item.active,
  }))
}

export default function EmailGroupsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = hasFullAccess(user)

  // Load the group catalog, property catalog, and searchable user list. The
  // user list is admin-only because it exposes account details used for group
  // assembly.
  const { data: groups = [] } = useQuery({
    queryKey: ['email-groups'],
    queryFn: () => emailGroupsApi.list(false),
  })
  const { data: propertyOptions = [] } = useQuery({
    queryKey: ['email-group-properties'],
    queryFn: emailGroupsApi.listProperties,
  })
  const { data: appUsers = [] } = useQuery({
    queryKey: ['auth-users'],
    queryFn: authApi.listUsers,
    enabled: isAdmin,
  })

  const [selectedGroupId, setSelectedGroupId] = useState<number | 'new'>('new')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [active, setActive] = useState(true)
  const [members, setMembers] = useState<EditableMember[]>([])
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [editingMemberKey, setEditingMemberKey] = useState<string | null>(null)
  const [profileMemberKey, setProfileMemberKey] = useState<string | null>(null)
  const [profileEditMode, setProfileEditMode] = useState(false)
  const [propertySearch, setPropertySearch] = useState('')
  const [focusedProperty, setFocusedProperty] = useState<string | null>(null)
  const [profilePropertySearch, setProfilePropertySearch] = useState('')

  // The selected group is the single source of truth for the right-hand edit
  // pane. When it changes, the form is rehydrated from backend data or reset
  // for a new group.
  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) || null,
    [groups, selectedGroupId],
  )

  // Rebuild the form state whenever the selected group changes. The reset path
  // for a brand-new group is kept separate so stale member rows never leak in.
  useEffect(() => {
    if (selectedGroupId === 'new') {
      setName('')
      setDescription('')
      setActive(true)
      setMembers([])
      return
    }
    setName(selectedGroup?.name || '')
    setDescription(selectedGroup?.description || '')
    setActive(Boolean(selectedGroup?.active))
    setMembers(toEditableMembers(selectedGroup))
  }, [selectedGroup, selectedGroupId])

  const propertyNames = useMemo(
    () => propertyOptions.map((item) => item.name).filter(Boolean),
    [propertyOptions],
  )
  const propertyByName = useMemo(
    () => new Map(propertyOptions.map((item) => [item.name, item])),
    [propertyOptions],
  )

  // Email validation happens client-side so users see row-level issues before
  // they try to save the group.
  const invalidEmailKeys = useMemo(() => {
    const regex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i
    return new Set(
      members
        .filter((member) => member.email.trim() && !regex.test(member.email.trim()))
        .map((member) => member.row_key),
    )
  }, [members])

  const editingMember = useMemo(
    () => members.find((member) => member.row_key === editingMemberKey) || null,
    [editingMemberKey, members],
  )
  const profileMember = useMemo(
    () => members.find((member) => member.row_key === profileMemberKey) || null,
    [members, profileMemberKey],
  )
  const profileOtherProperties = useMemo(() => {
    if (!profileMember) return []
    return profileMember.properties.filter((propertyName) => propertyName !== profileMember.primary_property)
  }, [profileMember])

  // Keep property search and dropdown ordering stable so the same input always
  // leads to the same visible list.
  const filteredProperties = useMemo(() => {
    const query = propertySearch.trim().toLowerCase()
    const matching = !query ? propertyNames : propertyNames.filter((property) => property.toLowerCase().includes(query))
    return [...matching].sort((left, right) => left.localeCompare(right))
  }, [propertyNames, propertySearch])
  const profileFilteredProperties = useMemo(() => {
    const sourceProperties = Array.from(new Set([...propertyNames, ...(profileMember?.properties || [])]))
    const query = profilePropertySearch.trim().toLowerCase()
    const matching = !query ? sourceProperties : sourceProperties.filter((property) => property.toLowerCase().includes(query))
    return [...matching].sort((left, right) => left.localeCompare(right))
  }, [profileMember?.properties, propertyNames, profilePropertySearch])
  const memberEmails = useMemo(
    () => new Set(members.map((member) => member.email.trim().toLowerCase()).filter(Boolean)),
    [members],
  )
  const appUserByEmail = useMemo(
    () => new Map(appUsers.map((appUser) => [appUser.email.trim().toLowerCase(), appUser])),
    [appUsers],
  )
  const filteredAppUsers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase()
    return appUsers
      .filter((appUser) => appUser.active)
      .filter((appUser) => {
        if (!query) return true
        return [
          appUser.email,
          userDisplayName(appUser),
          appUser.designation,
          appUser.property_name,
          appUser.city,
          appUser.state,
          appUser.region,
          appUser.country,
          appUser.phone_number,
          appUser.whatsapp_number,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query))
      })
      .sort((left, right) => userDisplayName(left).localeCompare(userDisplayName(right)))
  }, [appUsers, memberSearch])

  const openProfile = (rowKey: string) => {
    setProfileMemberKey(rowKey)
    setProfileEditMode(false)
    setProfilePropertySearch('')
  }

  const closeProfile = () => {
    setProfileMemberKey(null)
    setProfileEditMode(false)
    setProfilePropertySearch('')
  }

  const updateMember = (rowKey: string, patch: Partial<EditableMember>) => {
    // Preserve the invariant that every member has a valid primary property if
    // they have at least one mapped property.
    setMembers((prev) =>
      prev.map((row) => {
        if (row.row_key !== rowKey) return row
        const next = { ...row, ...patch }
        if (next.primary_property && !next.properties.includes(next.primary_property)) {
          next.properties = [next.primary_property, ...next.properties]
        }
        if (!next.primary_property && next.properties.length > 0) {
          next.primary_property = next.properties[0]
        }
        return next
      }),
    )
  }

  const removeMember = (rowKey: string) => {
    setMembers((prev) => prev.filter((row) => row.row_key !== rowKey))
    if (editingMemberKey === rowKey) {
      setEditingMemberKey(null)
    }
    if (profileMemberKey === rowKey) {
      setProfileMemberKey(null)
    }
  }

  const addProperty = (rowKey: string, propertyName: string) => {
    // Adding a property should also backfill the primary property when the row
    // does not yet have one.
    setMembers((prev) =>
      prev.map((row) => {
        if (row.row_key !== rowKey || row.properties.includes(propertyName)) return row
        return {
          ...row,
          properties: [...row.properties, propertyName],
          primary_property: row.primary_property || propertyName,
        }
      }),
    )
    setFocusedProperty(propertyName)
  }

  const removeProperty = (rowKey: string, propertyName: string) => {
    setMembers((prev) =>
      prev.map((row) => {
        if (row.row_key !== rowKey) return row
        const properties = row.properties.filter((item) => item !== propertyName)
        const primary = row.primary_property === propertyName ? properties[0] || '' : row.primary_property
        return { ...row, properties, primary_property: primary }
      }),
    )
    setFocusedProperty((current) => (current === propertyName ? null : current))
  }

  const addMemberFromUser = (appUser: AuthUser) => {
    if (memberEmails.has(appUser.email.trim().toLowerCase())) return
    const property = appUser.property_name?.trim() || ''
    setMembers((prev) => [
      ...prev,
      {
        row_key: createMemberRowKey(),
        email: appUser.email.trim(),
        display_name: userDisplayName(appUser),
        properties: property ? [property] : [],
        primary_property: property,
        active: true,
      },
    ])
    setMemberSearch('')
  }

  const toggleProperty = (rowKey: string, propertyName: string) => {
    setMembers((prev) =>
      prev.map((row) => {
        if (row.row_key !== rowKey) return row
        const exists = row.properties.includes(propertyName)
        const properties = exists
          ? row.properties.filter((item) => item !== propertyName)
          : [...row.properties, propertyName]
        let primary = row.primary_property
        if (!properties.includes(primary)) {
          primary = properties[0] || ''
        }
        return { ...row, properties, primary_property: primary }
      }),
    )
  }

  const saveGroup = async () => {
    setStatus('')
    setError('')
    if (!isAdmin) {
      setError('Only admin users can create or edit email groups.')
      return
    }
    if (!name.trim()) {
      setError('Group name is required.')
      return
    }
    const payload: EmailGroupInput = {
      name: name.trim(),
      description: description.trim() || null,
      active,
      members: members
        .filter((member) => member.email.trim())
        .map((member): EmailGroupMemberInput => ({
          email: member.email.trim(),
          display_name: member.display_name.trim() || null,
          properties: member.properties,
          primary_property: member.primary_property || null,
          active: member.active,
        })),
    }
    try {
      if (selectedGroupId === 'new') {
        const created = await emailGroupsApi.create(payload)
        setSelectedGroupId(created.id)
        setStatus('Email group created.')
      } else {
        await emailGroupsApi.update(selectedGroupId, payload)
        setStatus('Email group updated.')
      }
      await queryClient.invalidateQueries({ queryKey: ['email-groups'] })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save group.')
    }
  }

  return (
    <section className="settings-page email-groups-page">
      <div className="email-groups-topline"><div><span className="email-groups-kicker">Workspace</span><h2>Email Groups</h2></div></div>

      <div className="email-groups-command-band"><div className="email-groups-panel email-groups-editor">
        <div className="email-groups-form-grid">
          <label>
            Group
            <select
              value={selectedGroupId}
              onChange={(event) => {
                const token = event.target.value
                setSelectedGroupId(token === 'new' ? 'new' : Number(token))
                setStatus('')
                setError('')
              }}
            >
              <option value="new">+ New Email Group</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Group Name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          <label>
            Description
            <input value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
        </div>
        <label className="email-groups-active-toggle"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span>{active ? 'Active' : 'Inactive'}</span></label></div></div><div className="email-groups-panel email-groups-members">
        <div className="email-groups-members-head">
          <p className="field-card-title">Group Members</p>
          <span>{members.length} members</span>
        </div>

        <div className="email-groups-add-row">
          <button className="btn-primary email-groups-add-btn" onClick={() => setIsAddMemberOpen(true)} disabled={!isAdmin}>
            <UserPlus size={15} />Add member
          </button>
        </div>

        <div className="email-group-members-table">
          <div className="email-group-members-header">
            <div>Email</div>
            <div>Name</div>
            <div>Properties</div>
            <div>Primary</div>
            <div>Actions</div>
          </div>
          <div className="email-group-members-body">
            {members.map((member) => {
              const linkedUser = appUserByEmail.get(member.email.trim().toLowerCase())
              return (
                <div
                  key={member.row_key}
                  role="button"
                  tabIndex={0}
                  className="email-group-members-row"
                  onClick={() => openProfile(member.row_key)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openProfile(member.row_key)
                    }
                  }}
                >
                  <div>
                    <div>{member.email || '-'}</div>
                    {linkedUser?.phone_number || linkedUser?.whatsapp_number ? (
                      <small>{linkedUser.phone_number || linkedUser.whatsapp_number}</small>
                    ) : null}
                    {invalidEmailKeys.has(member.row_key) ? (
                      <div className="email-group-member-warning">Invalid format (saved with warning)</div>
                    ) : null}
                  </div>
                  <div>
                    <div>{member.display_name || '-'}</div>
                    {linkedUser?.designation ? <small>{linkedUser.designation}</small> : null}
                  </div>
                  <div>{member.properties.length}</div>
                  <div>
                    <div>{member.primary_property || linkedUser?.property_name || '-'}</div>
                    {linkedUser && userLocation(linkedUser) ? <small>{userLocation(linkedUser)}</small> : null}
                  </div>
                  <div className="email-group-member-actions">
                    <button
                      className="email-group-icon-action"
                      onClick={(event) => {
                        event.stopPropagation()
                        setEditingMemberKey(member.row_key)
                        setPropertySearch('')
                      }}
                      disabled={!isAdmin}
                    title="Map properties" aria-label="Map properties"><MapPinned size={16} /></button>
                    <button
                      className="email-group-icon-action is-danger btn-danger-action"
                      onClick={(event) => {
                        event.stopPropagation()
                        removeMember(member.row_key)
                      }}
                      disabled={!isAdmin}
                    title="Remove member" aria-label="Remove member"><Trash2 size={16} /></button>
                  </div>
                </div>
              )
            })}
            {members.length === 0 ? (
              <div className="email-group-members-empty">No members yet.</div>
            ) : null}
          </div>
        </div>
      </div>

      {isAddMemberOpen ? (
        <div className="email-group-profile-backdrop" onClick={() => setIsAddMemberOpen(false)}>
          <article className="email-group-user-picker-modal" onClick={(event) => event.stopPropagation()}>
            <div className="email-group-profile-head">
              <div>
                <span className="email-group-profile-kicker">Add Member</span>
                <h3>Select User</h3>
              </div>
              <button className="email-group-icon-action btn-danger-action" onClick={() => setIsAddMemberOpen(false)} title="Close" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <input
              className="email-group-user-picker-search"
              value={memberSearch}
              onChange={(event) => setMemberSearch(event.target.value)}
              placeholder="Search by name, email, designation, property, city..."
            />
            <div className="email-group-user-picker-list">
              {filteredAppUsers.map((appUser) => {
                const alreadyAdded = memberEmails.has(appUser.email.trim().toLowerCase())
                return (
                  <button
                    type="button"
                    key={appUser.id}
                    className={`email-group-user-picker-row${alreadyAdded ? ' is-added' : ''}`}
                    onClick={() => addMemberFromUser(appUser)}
                    disabled={alreadyAdded}
                  >
                    <div>
                      <strong>{userDisplayName(appUser)}</strong>
                      <span>{appUser.email}</span>
                    </div>
                    <div>
                      <strong>{appUser.designation || appUser.role}</strong>
                      <span>{appUser.property_name || 'No property assigned'}</span>
                    </div>
                    <div>
                      <strong>{userLocation(appUser) || 'Location not set'}</strong>
                      <span>{appUser.phone_number || appUser.whatsapp_number || 'No contact number'}</span>
                    </div>
                    <small>{alreadyAdded ? 'Added' : 'Add'}</small>
                  </button>
                )
              })}
              {filteredAppUsers.length === 0 ? (
                <div className="email-group-members-empty">No matching users.</div>
              ) : null}
            </div>
          </article>
        </div>
      ) : null}

      {profileMember ? (
        <div
          className="email-group-profile-backdrop"
          onClick={closeProfile}
        >
          <article
            className={`email-group-profile-modal${profileEditMode ? ' is-editing' : ''}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="email-group-profile-head">
              <div>
                <span className="email-group-profile-kicker">Member Profile</span>
                <h3>{profileMember.display_name || profileMember.email || 'Unnamed member'}</h3>
              </div>
              <div className="email-group-profile-actions">
                {isAdmin ? (
                  <button
                    className={`email-group-profile-action${profileEditMode ? ' btn-success-action is-active' : ''}`}
                    onClick={() => setProfileEditMode((current) => !current)}
                  >
                    {profileEditMode ? <Check size={15} /> : null}{profileEditMode ? 'Done' : 'Edit'}
                  </button>
                ) : null}
                <button className="email-group-icon-action btn-danger-action" onClick={closeProfile} title="Close" aria-label="Close"><X size={16} /></button>
              </div>
            </div>

            {profileEditMode ? (
              <div className="email-group-profile-edit">
                <div className="email-group-profile-edit-grid">
                  <label>
                    Name
                    <input
                      value={profileMember.display_name}
                      onChange={(event) => updateMember(profileMember.row_key, { display_name: event.target.value })}
                      placeholder="Display name"
                    />
                  </label>
                  <label>
                    Email ID
                    <input
                      value={profileMember.email}
                      onChange={(event) => updateMember(profileMember.row_key, { email: event.target.value })}
                      placeholder="Email address"
                    />
                  </label>
                  <label>
                    Primary Property
                    <select
                      value={profileMember.primary_property}
                      onChange={(event) => updateMember(profileMember.row_key, { primary_property: event.target.value })}
                    >
                      <option value="">Select primary property</option>
                      {profileMember.properties.map((propertyName) => (
                        <option key={`${profileMember.row_key}-profile-primary-${propertyName}`} value={propertyName}>
                          {propertyName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="email-group-profile-active">
                    <input
                      type="checkbox"
                      checked={profileMember.active}
                      onChange={(event) => updateMember(profileMember.row_key, { active: event.target.checked })}
                    />
                    Active member
                  </label>
                </div>

                {invalidEmailKeys.has(profileMember.row_key) ? (
                  <div className="email-group-profile-warning">
                    Email format looks invalid. You can still save, but delivery may fail for this member.
                  </div>
                ) : null}

                <section className="email-group-profile-section">
                  <div className="email-group-profile-section-head">
                    <span>Mapped Properties</span>
                    <strong>{profileMember.properties.length}</strong>
                  </div>
                  {profileMember.properties.length ? (
                    <div className="email-group-profile-mapped-window">
                      {profileMember.properties.map((propertyName) => (
                        <div
                          key={`${profileMember.row_key}-mapped-window-${propertyName}`}
                          className={`email-group-profile-property-tile is-selected is-display-only${profileMember.primary_property === propertyName ? ' is-primary' : ''}`}
                        >
                          <span>{propertyName}</span>
                          <strong>{profileMember.primary_property === propertyName ? 'Primary' : 'Mapped'}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="email-group-profile-empty">No mapped properties yet.</p>
                  )}
                </section>

                <section className="email-group-profile-section">
                  <div className="email-group-profile-section-head">
                    <span>Property List</span>
                    <strong>{profileFilteredProperties.length}</strong>
                  </div>
                  <input
                    className="email-group-profile-search"
                    value={profilePropertySearch}
                    onChange={(event) => setProfilePropertySearch(event.target.value)}
                    placeholder="Search properties..."
                  />
                  <div className="email-group-profile-map-list">
                    {profileFilteredProperties.map((propertyName) => (
                      <button
                        type="button"
                        key={`${profileMember.row_key}-profile-map-${propertyName}`}
                        className={`email-group-profile-property-tile${profileMember.properties.includes(propertyName) ? ' is-selected' : ''}${profileMember.primary_property === propertyName ? ' is-primary' : ''}`}
                        onClick={() => toggleProperty(profileMember.row_key, propertyName)}
                      >
                        <span>{propertyName}</span>
                        {profileMember.properties.includes(propertyName) ? (
                          <strong>{profileMember.primary_property === propertyName ? 'Primary' : 'Mapped'}</strong>
                        ) : null}
                      </button>
                    ))}
                    {profileFilteredProperties.length === 0 ? (
                      <p>No matching properties.</p>
                    ) : null}
                  </div>
                </section>

                <p className="email-group-profile-save-note">
                  Changes are staged here. Click Save Email Group to persist them.
                </p>
              </div>
            ) : (
              <>
                <div className="email-group-profile-grid">
                  <div>
                    <span>Name</span>
                    <strong>{profileMember.display_name || 'Not Available'}</strong>
                  </div>
                  <div>
                    <span>Email ID</span>
                    <strong>{profileMember.email || 'Not Available'}</strong>
                  </div>
                  <div>
                    <span>Primary Property</span>
                    <strong>{profileMember.primary_property || 'Not Available'}</strong>
                  </div>
                  <div>
                    <span>Total Properties</span>
                    <strong>{profileMember.properties.length}</strong>
                  </div>
                </div>

                <section className="email-group-profile-section">
                  <div className="email-group-profile-section-head">
                    <span>Other Mapped Properties</span>
                    <strong>{profileOtherProperties.length}</strong>
                  </div>
                  {profileOtherProperties.length ? (
                    <div className="email-group-profile-property-list">
                      {profileOtherProperties.map((propertyName) => (
                        <span key={`${profileMember.row_key}-profile-${propertyName}`}>
                          {propertyName}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p>No other properties mapped.</p>
                  )}
                </section>
              </>
            )}
          </article>
        </div>
      ) : null}

      {editingMember ? (
        <div
          className="email-group-map-backdrop"
          onClick={() => {
            setEditingMemberKey(null)
            setFocusedProperty(null)
          }}
        >
          <div
            className="email-group-map-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="email-group-map-head">
              <div>
                <p className="field-card-title">Map Properties</p>
                <span>{editingMember.email}</span>
              </div>
              <button
                className="btn-secondary btn-success-action"
                onClick={() => {
                  setEditingMemberKey(null)
                  setFocusedProperty(null)
                }}
              >
                <Check size={15} />
                Done
              </button>
            </div>

            <input
              className="email-group-map-search"
              value={propertySearch}
              onChange={(event) => setPropertySearch(event.target.value)}
              placeholder="Search properties..."
            />

            <section className="email-group-map-selected">
              <div className="email-group-map-section-head">
                <span>Mapped Properties</span>
                <strong>{editingMember.properties.length}</strong>
              </div>
              {editingMember.properties.length ? (
                <div className="email-group-map-selected-list">
                  {editingMember.properties.map((propertyName) => (
                    <div
                      key={`${editingMember.row_key}-selected-${propertyName}`}
                      className={`email-group-mapped-row${focusedProperty === propertyName ? ' is-focused' : ''}${editingMember.primary_property === propertyName ? ' is-primary' : ''}`}
                    >
                      <button
                        type="button"
                        className="email-group-mapped-main"
                        onClick={() => setFocusedProperty(propertyName)}
                      >
                        <span>{propertyName}</span>
                        {editingMember.primary_property === propertyName ? <strong>Primary</strong> : null}
                      </button>
                      <button
                        type="button"
                        className="email-group-map-icon-btn btn-danger-action"
                        onClick={() => removeProperty(editingMember.row_key, propertyName)}
                        title="Remove property"
                        aria-label={`Remove ${propertyName}`}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="email-group-map-empty">No properties mapped yet.</div>
              )}
            </section>

            {focusedProperty ? (
              <section className="email-group-map-detail">
                <div>
                  <span>Selected Property</span>
                  <strong>{focusedProperty}</strong>
                </div>
                <dl>
                  <div>
                    <dt>City</dt>
                    <dd>{propertyByName.get(focusedProperty)?.city || 'NA'}</dd>
                  </div>
                  <div>
                    <dt>State</dt>
                    <dd>{propertyByName.get(focusedProperty)?.state || 'NA'}</dd>
                  </div>
                  <div>
                    <dt>Region</dt>
                    <dd>{propertyByName.get(focusedProperty)?.region || 'NA'}</dd>
                  </div>
                  <div>
                    <dt>Country</dt>
                    <dd>{propertyByName.get(focusedProperty)?.country || 'NA'}</dd>
                  </div>
                </dl>
              </section>
            ) : null}

            <section className="email-group-map-picker">
              <div className="email-group-map-section-head">
                <span>Property List</span>
                <strong>{filteredProperties.length}</strong>
              </div>
              <div className="email-group-map-list">
              {filteredProperties.map((propertyName) => {
                const isMapped = editingMember.properties.includes(propertyName)
                return (
                  <button
                    type="button"
                    key={`${editingMember.row_key}-${propertyName}`}
                    className={`email-group-property-row${isMapped ? ' is-selected' : ''}${editingMember.primary_property === propertyName ? ' is-primary' : ''}`}
                    onClick={() => {
                      if (isMapped) {
                        setFocusedProperty(propertyName)
                      } else {
                        addProperty(editingMember.row_key, propertyName)
                      }
                    }}
                  >
                    <span>{propertyName}</span>
                    <small>
                      {[propertyByName.get(propertyName)?.city, propertyByName.get(propertyName)?.state]
                        .filter(Boolean)
                        .join(', ') || 'Property'}
                    </small>
                    {isMapped ? <strong>{editingMember.primary_property === propertyName ? 'Primary' : 'Mapped'}</strong> : null}
                  </button>
                )
              })}
              {filteredProperties.length === 0 ? (
                <div className="email-group-map-empty">No matching properties.</div>
              ) : null}
              </div>
            </section>

            <label className="email-group-map-primary">
              Primary Property
              <select
                value={editingMember.primary_property}
                onChange={(event) => updateMember(editingMember.row_key, { primary_property: event.target.value })}
              >
                <option value="">Select primary property</option>
                {editingMember.properties.map((propertyName) => (
                  <option key={`${editingMember.row_key}-primary-${propertyName}`} value={propertyName}>
                    {propertyName}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      ) : null}

      <div className="email-groups-save-row"><button className="btn-primary email-groups-save-btn" onClick={() => { void saveGroup() }} disabled={!isAdmin}><Save size={15} />Save Email Group</button>{!isAdmin ? <span className="email-groups-access-note">Full access required</span> : null}</div>{status ? <div className="email-groups-status is-success">{status}</div> : null}{error ? <div className="email-groups-status is-error">{error}</div> : null}
    </section>
  )
}
