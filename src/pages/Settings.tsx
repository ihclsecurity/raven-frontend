/**
 * Module: Settings
 * Purpose: Core module responsible for Settings concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { authApi } from '../api/auth'
import { datasurfrApi } from '../api/datasurfr'
import { profileApi } from '../api/profile'
import { settingsApi } from '../api/settings'
import { directoryApi } from '../api/directory'
import type { ContactRole } from '../types/directory'
import type { AuthUser, AuthUserRole } from '../types/auth'
import { hasFullAccess, roleLabel } from '../utils/authRoles'
import { formatAppDateTime } from '../utils/dateTime'

type Tab = 'profile' | 'defaults' | 'directory' | 'models' | 'feeds' | 'users'

type ManagedUserForm = {
  first_name: string
  last_name: string
  designation: string
  property_name: string
  city: string
  state: string
  region: string
  country: string
  phone_number: string
  whatsapp_number: string
}

const EMPTY_MANAGED_USER_FORM: ManagedUserForm = {
  first_name: '',
  last_name: '',
  designation: '',
  property_name: '',
  city: '',
  state: '',
  region: '',
  country: '',
  phone_number: '',
  whatsapp_number: '',
}

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const { user: currentUser } = useAuth()
  const canManageApplication = hasFullAccess(currentUser)
  const canManageAllUsers = currentUser?.role === 'superadmin'
  const [tab, setTab] = useState<Tab>('users')
  const [showNewUserPassword, setShowNewUserPassword] = useState(false)
  const [showManagedUserPassword, setShowManagedUserPassword] = useState(false)

  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: profileApi.get })
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.getAll, enabled: canManageApplication })
  const { data: webhookInfo } = useQuery({
    queryKey: ['settings-webhook-info'],
    queryFn: settingsApi.getWebhookInfo,
    enabled: canManageApplication,
  })
  const { data: knowledgeBaseStatus } = useQuery({
    queryKey: ['settings-knowledge-base-status'],
    queryFn: settingsApi.getKnowledgeBaseStatus,
    enabled: canManageApplication,
  })
  const { data: contacts } = useQuery({
    queryKey: ['directory-contacts'],
    queryFn: () => directoryApi.listContacts(undefined, true),
    enabled: canManageApplication,
  })
  const { data: approvers } = useQuery({
    queryKey: ['directory-approvers'],
    queryFn: () => directoryApi.listContacts('approver', true),
    enabled: canManageApplication,
  })
  const { data: groups } = useQuery({
    queryKey: ['directory-groups'],
    queryFn: () => directoryApi.listGroups(true),
    enabled: canManageApplication,
  })
  const { data: defaultApprover } = useQuery({
    queryKey: ['directory-default-approver'],
    queryFn: directoryApi.getDefaultApprover,
    enabled: canManageApplication,
  })
  const { data: appUsers } = useQuery({
    queryKey: ['auth-users'],
    queryFn: authApi.listUsers,
    enabled: Boolean(currentUser),
  })
  const { data: mapProperties = [] } = useQuery({
    queryKey: ['settings-user-map-properties'],
    queryFn: datasurfrApi.listMapProperties,
    enabled: Boolean(currentUser),
  })

  const [profileForm, setProfileForm] = useState({ display_name: '', email: '', timezone: 'Asia/Kolkata' })
  const [defaultTone, setDefaultTone] = useState('Professional / Formal')
  const [autoSave, setAutoSave] = useState(30)
  const [newContactName, setNewContactName] = useState('')
  const [newContactEmail, setNewContactEmail] = useState('')
  const [newContactWhatsapp, setNewContactWhatsapp] = useState('')
  const [newContactRole, setNewContactRole] = useState<ContactRole>('recipient')
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDescription, setNewGroupDescription] = useState('')
  const [contactImportFile, setContactImportFile] = useState<File | null>(null)
  const [groupImportFile, setGroupImportFile] = useState<File | null>(null)
  const [importResult, setImportResult] = useState<string>('')
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null)
  const [editContactName, setEditContactName] = useState('')
  const [editContactEmail, setEditContactEmail] = useState('')
  const [editContactWhatsapp, setEditContactWhatsapp] = useState('')
  const [editContactRole, setEditContactRole] = useState<ContactRole>('recipient')
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([])
  const [editGroupName, setEditGroupName] = useState('')
  const [editGroupDescription, setEditGroupDescription] = useState('')
  const [emailTransportMode, setEmailTransportMode] = useState<'simulated' | 'smtp' | 'graph'>('simulated')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState(587)
  const [smtpUsername, setSmtpUsername] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [smtpPasswordMasked, setSmtpPasswordMasked] = useState('')
  const [smtpFromEmail, setSmtpFromEmail] = useState('')
  const [smtpFromName, setSmtpFromName] = useState('IHCL Security & Safety')
  const [smtpUseTls, setSmtpUseTls] = useState(true)
  const [smtpUseSsl, setSmtpUseSsl] = useState(false)
  const [testEmailDestination, setTestEmailDestination] = useState('')
  const [emailTransportTestResult, setEmailTransportTestResult] = useState<string>('')
  const [whatsappTransportMode, setWhatsappTransportMode] = useState<'simulated' | 'twilio'>('simulated')
  const [twilioAccountSid, setTwilioAccountSid] = useState('')
  const [twilioAuthToken, setTwilioAuthToken] = useState('')
  const [twilioAuthTokenMasked, setTwilioAuthTokenMasked] = useState('')
  const [twilioWhatsappFrom, setTwilioWhatsappFrom] = useState('')
  const [testWhatsappDestination, setTestWhatsappDestination] = useState('')
  const [whatsappTransportTestResult, setWhatsappTransportTestResult] = useState<string>('')
  const [llmProviderMode, setLlmProviderMode] = useState<'local_ollama' | 'openai_dynamic'>('local_ollama')
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('http://127.0.0.1:11434')
  const [ollamaModel, setOllamaModel] = useState('gpt-oss:120b-cloud')
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState('https://api.openai.com/v1')
  const [openaiModel, setOpenaiModel] = useState('gpt-4o-mini')
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [openaiApiKeyMasked, setOpenaiApiKeyMasked] = useState<string>('')
  const [useSessionOnlyOpenAiKey, setUseSessionOnlyOpenAiKey] = useState<boolean>(false)
  const [llmTestResult, setLlmTestResult] = useState<string>('')
  const [llmTestError, setLlmTestError] = useState<string>('')
  const [llmTesting, setLlmTesting] = useState(false)
  const [datasurfrBaseUrl, setDatasurfrBaseUrl] = useState('https://platform.datasurfr.ai')
  const [datasurfrUsername, setDatasurfrUsername] = useState('')
  const [datasurfrPassword, setDatasurfrPassword] = useState('')
  const [datasurfrPasswordMasked, setDatasurfrPasswordMasked] = useState('')
  const [ihclLogoPath, setIhclLogoPath] = useState('D:\\ihcl\\logo.png')
  const [datasurfrTestResult, setDatasurfrTestResult] = useState('')
  const [knowledgeBaseResult, setKnowledgeBaseResult] = useState('')
  const [knowledgeBaseBusy, setKnowledgeBaseBusy] = useState(false)
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserRole, setNewUserRole] = useState<AuthUserRole>('user')
  const [newUserDetails, setNewUserDetails] = useState<ManagedUserForm>(EMPTY_MANAGED_USER_FORM)
  const [isAddUserOpen, setIsAddUserOpen] = useState(false)
  const [isUserEditorOpen, setIsUserEditorOpen] = useState(false)
  const [selectedManagedUserId, setSelectedManagedUserId] = useState<number | null>(null)
  const [managedUserDetails, setManagedUserDetails] = useState<ManagedUserForm>(EMPTY_MANAGED_USER_FORM)
  const [managedUserPassword, setManagedUserPassword] = useState('')
  const [managedUserRole, setManagedUserRole] = useState<AuthUserRole>('user')
  const [managedUserActive, setManagedUserActive] = useState(true)
  const [userAdminNotice, setUserAdminNotice] = useState('')
  const [userAdminError, setUserAdminError] = useState('')
  const [profileNotice, setProfileNotice] = useState('')
  const [profileError, setProfileError] = useState('')

  const iconButtonStyle: CSSProperties = {
    minWidth: 34,
    height: 34,
    borderRadius: 8,
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    lineHeight: 1,
  }

  const parseMaskedSecretSetting = (rawValue: string | undefined): { masked: string; isSet: boolean } => {
    try {
      const parsed = JSON.parse(rawValue || 'null') as unknown
      if (parsed && typeof parsed === 'object' && 'is_set' in (parsed as Record<string, unknown>)) {
        const secretObj = parsed as { masked?: unknown; is_set?: unknown }
        return {
          masked: typeof secretObj.masked === 'string' ? secretObj.masked : '',
          isSet: Boolean(secretObj.is_set),
        }
      }
      if (typeof parsed === 'string' && parsed.trim()) {
        return { masked: '***', isSet: true }
      }
    } catch {
      return { masked: '', isSet: false }
    }
    return { masked: '', isSet: false }
  }

  const applyPropertyMetadata = (propertyName: string, current: ManagedUserForm): ManagedUserForm => {
    const cleanedProperty = propertyName.trim()
    const matched = mapProperties.find((item) => item.property_name.trim().toLowerCase() === cleanedProperty.toLowerCase())
    if (!matched) {
      return {
        ...current,
        property_name: propertyName,
        city: '',
        state: '',
        region: '',
        country: '',
      }
    }
    return {
      ...current,
      property_name: matched.property_name,
      city: matched.city || '',
      state: matched.state || '',
      region: matched.region || '',
      country: matched.country || '',
    }
  }

  const userToManagedDetails = (user: AuthUser | null): ManagedUserForm => ({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    designation: user?.designation || '',
    property_name: user?.property_name || '',
    city: user?.city || '',
    state: user?.state || '',
    region: user?.region || '',
    country: user?.country || '',
    phone_number: user?.phone_number || '',
    whatsapp_number: user?.whatsapp_number || '',
  })

  useEffect(() => {
    if (profile) {
      setProfileForm({
        display_name: profile.display_name || '',
        email: profile.email || '',
        timezone: profile.timezone || 'Asia/Kolkata',
      })
    }
  }, [profile])

  useEffect(() => {
    if (settings) {
      setDefaultTone(JSON.parse(settings.default_tone || '"Professional / Formal"'))
      setAutoSave(Number(settings.auto_save_interval_seconds || '30'))
      setEmailTransportMode(JSON.parse(settings.email_transport_mode || '"simulated"'))
      setSmtpHost(JSON.parse(settings.smtp_host || '""') || '')
      setSmtpPort(Number(JSON.parse(settings.smtp_port || '587') || 587))
      setSmtpUsername(JSON.parse(settings.smtp_username || '""') || '')
      const smtpSecret = parseMaskedSecretSetting(settings.smtp_password)
      setSmtpPasswordMasked(smtpSecret.isSet ? smtpSecret.masked || '***' : '')
      setSmtpPassword('')
      setSmtpFromEmail(JSON.parse(settings.smtp_from_email || '""') || '')
      setSmtpFromName(JSON.parse(settings.smtp_from_name || '"IHCL Security & Safety"') || 'IHCL Security & Safety')
      setSmtpUseTls(Boolean(JSON.parse(settings.smtp_use_tls || 'true')))
      setSmtpUseSsl(Boolean(JSON.parse(settings.smtp_use_ssl || 'false')))
      setWhatsappTransportMode(JSON.parse(settings.whatsapp_transport_mode || '"simulated"'))
      setTwilioAccountSid(JSON.parse(settings.twilio_account_sid || '""') || '')
      const twilioSecret = parseMaskedSecretSetting(settings.twilio_auth_token)
      setTwilioAuthTokenMasked(twilioSecret.isSet ? twilioSecret.masked || '***' : '')
      setTwilioAuthToken('')
      setTwilioWhatsappFrom(JSON.parse(settings.twilio_whatsapp_from || '""') || '')
      setLlmProviderMode(JSON.parse(settings.llm_provider_mode || '"local_ollama"'))
      setOllamaBaseUrl(JSON.parse(settings.ollama_base_url || '"http://127.0.0.1:11434"') || 'http://127.0.0.1:11434')
      setOllamaModel(JSON.parse(settings.ollama_model || '"gpt-oss:120b-cloud"') || 'gpt-oss:120b-cloud')
      setOpenaiBaseUrl(JSON.parse(settings.openai_base_url || '"https://api.openai.com/v1"') || 'https://api.openai.com/v1')
      setOpenaiModel(JSON.parse(settings.openai_model || '"gpt-4o-mini"') || 'gpt-4o-mini')
      const openAiKeySetting = JSON.parse(settings.openai_api_key || 'null') as { masked?: string; is_set?: boolean } | null
      setOpenaiApiKeyMasked(openAiKeySetting?.is_set ? (openAiKeySetting.masked || '***') : '')
      setOpenaiApiKey('')
      setDatasurfrBaseUrl(JSON.parse(settings.datasurfr_base_url || '"https://platform.datasurfr.ai"') || 'https://platform.datasurfr.ai')
      setDatasurfrUsername(JSON.parse(settings.datasurfr_username || '""') || '')
      const datasurfrSecret = parseMaskedSecretSetting(settings.datasurfr_password)
      setDatasurfrPasswordMasked(datasurfrSecret.isSet ? datasurfrSecret.masked || '***' : '')
      setDatasurfrPassword('')
      setIhclLogoPath(
        JSON.parse(settings.ihcl_logo_path || '"frontend\\\\public\\\\ihcl_logo_blue-removebg-preview.png"') ||
          'frontend\\public\\ihcl_logo_blue-removebg-preview.png',
      )
    }
  }, [settings])

  useEffect(() => {
    const savedSessionKey = sessionStorage.getItem('osint_openai_session_key') || ''
    const sessionOnly = sessionStorage.getItem('osint_openai_session_only') === '1'
    setUseSessionOnlyOpenAiKey(sessionOnly)
    if (sessionOnly && savedSessionKey) {
      setOpenaiApiKey(savedSessionKey)
    }
  }, [])

  useEffect(() => {
    if (!contacts?.length) {
      setSelectedContactId(null)
      return
    }
    if (!selectedContactId || !contacts.find((c) => c.id === selectedContactId)) {
      setSelectedContactId(contacts[0].id)
    }
  }, [contacts, selectedContactId])

  useEffect(() => {
    const selected = contacts?.find((item) => item.id === selectedContactId)
    if (!selected) return
    setEditContactName(selected.display_name)
    setEditContactEmail(selected.email)
    setEditContactWhatsapp(selected.whatsapp_number || '')
    setEditContactRole(selected.role)
  }, [contacts, selectedContactId])

  useEffect(() => {
    if (!groups?.length) {
      setSelectedGroupId(null)
      setSelectedMemberIds([])
      return
    }

    if (!selectedGroupId || !groups.find((g) => g.id === selectedGroupId)) {
      setSelectedGroupId(groups[0].id)
    }
  }, [groups, selectedGroupId])

  useEffect(() => {
    const selected = groups?.find((item) => item.id === selectedGroupId)
    if (!selected) return
    setEditGroupName(selected.name)
    setEditGroupDescription(selected.description || '')
  }, [groups, selectedGroupId])

  useEffect(() => {
    const loadGroupMembers = async () => {
      if (!selectedGroupId) {
        setSelectedMemberIds([])
        return
      }
      const members = await directoryApi.getGroupMembers(selectedGroupId)
      setSelectedMemberIds(members.contact_ids)
    }
    void loadGroupMembers()
  }, [selectedGroupId])

  useEffect(() => {
    if (!appUsers?.length) {
      setSelectedManagedUserId(null)
      setManagedUserDetails(EMPTY_MANAGED_USER_FORM)
      setManagedUserPassword('')
      return
    }
    if (!selectedManagedUserId || !appUsers.find((item) => item.id === selectedManagedUserId)) {
      setSelectedManagedUserId(appUsers[0].id)
    }
  }, [appUsers, selectedManagedUserId])

  useEffect(() => {
    if (!canManageApplication && tab !== 'profile' && tab !== 'users') {
      setTab('profile')
    }
  }, [canManageApplication, tab])

  useEffect(() => {
    const selectedUser = (appUsers || []).find((item) => item.id === selectedManagedUserId) || null
    setManagedUserDetails(userToManagedDetails(selectedUser))
    setManagedUserPassword('')
    setManagedUserRole(selectedUser?.role || 'user')
    setManagedUserActive(selectedUser?.active ?? true)
  }, [appUsers, selectedManagedUserId])

  const refreshDirectory = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['directory-contacts'] }),
      queryClient.invalidateQueries({ queryKey: ['directory-approvers'] }),
      queryClient.invalidateQueries({ queryKey: ['directory-groups'] }),
      queryClient.invalidateQueries({ queryKey: ['directory-default-approver'] }),
    ])
  }

  const selectedManagedUser = (appUsers || []).find((item) => item.id === selectedManagedUserId) || null
  const signedInManagedUser = (appUsers || []).find((item) => item.id === currentUser?.id) || selectedManagedUser || currentUser
  const displayUserName = (user: AuthUser) => [user.first_name, user.last_name].filter(Boolean).join(' ').trim()

  return (
    <section className="settings-page">
      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        <button className={`settings-tab${tab === 'users' ? ' is-active' : ''}`} onClick={() => setTab('users')}>
          {canManageAllUsers ? 'Users' : 'My Details'}
        </button>
        <button className={`settings-tab${tab === 'profile' ? ' is-active' : ''}`} onClick={() => setTab('profile')}>Profile</button>
        {canManageApplication ? <button className={`settings-tab${tab === 'defaults' ? ' is-active' : ''}`} onClick={() => setTab('defaults')}>App Defaults</button> : null}
        {canManageApplication ? <button className={`settings-tab${tab === 'directory' ? ' is-active' : ''}`} onClick={() => setTab('directory')}>Directory</button> : null}
        {canManageApplication ? <button className={`settings-tab${tab === 'models' ? ' is-active' : ''}`} onClick={() => setTab('models')}>Model Providers</button> : null}
        {canManageApplication ? <button className={`settings-tab${tab === 'feeds' ? ' is-active' : ''}`} onClick={() => setTab('feeds')}>External Feeds</button> : null}
      </div>

      {tab === 'profile' ? (
        <div className="settings-profile-layout">
          <div className="field-card settings-profile-card">
            <div>
              <p className="field-card-title">Account</p>
              <h2>{signedInManagedUser ? displayUserName(signedInManagedUser) || signedInManagedUser.email : profileForm.display_name || 'Profile'}</h2>
              <p>{currentUser?.email || profileForm.email}</p>
            </div>
            <div className="settings-profile-summary">
              <div>
                <span>Access</span>
                <strong>{roleLabel(currentUser?.role || 'user')}</strong>
              </div>
              <div>
                <span>Designation</span>
                <strong>{signedInManagedUser?.designation || 'Not set'}</strong>
              </div>
              <div>
                <span>Property / Office</span>
                <strong>{signedInManagedUser?.property_name || 'Not set'}</strong>
              </div>
              <div>
                <span>Location</span>
                <strong>{[signedInManagedUser?.city, signedInManagedUser?.state].filter(Boolean).join(', ') || 'Not set'}</strong>
              </div>
            </div>
            {signedInManagedUser ? (
              <button
                className="btn-secondary settings-profile-edit"
                onClick={() => {
                  setUserAdminNotice('')
                  setUserAdminError('')
                  setSelectedManagedUserId(signedInManagedUser.id)
                  setTab('users')
                  setIsUserEditorOpen(true)
                }}
              >
                Edit User Details
              </button>
            ) : null}
          </div>

          <div className="field-card settings-profile-card">
            <p className="field-card-title">Profile Preferences</p>
            <div className="settings-profile-form">
              <label>
                Display Name
                <input value={profileForm.display_name} onChange={(e) => setProfileForm((p) => ({ ...p, display_name: e.target.value }))} />
              </label>
              <label>
                Email
                <input value={profileForm.email} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} />
              </label>
              <label>
                Timezone
                <input value={profileForm.timezone} onChange={(e) => setProfileForm((p) => ({ ...p, timezone: e.target.value }))} />
              </label>
              <label>
                Analyst Role
                <input value={profile?.analyst_role || 'reviewer'} disabled />
              </label>
            </div>
            {profileNotice ? <div className="settings-users-notice">{profileNotice}</div> : null}
            {profileError ? <div className="settings-users-error">{profileError}</div> : null}
            <div className="settings-profile-actions">
              <button
                className="btn-primary"
                onClick={async () => {
                  setProfileNotice('')
                  setProfileError('')
                  try {
                    await profileApi.update(profileForm)
                    await queryClient.invalidateQueries({ queryKey: ['profile'] })
                    setProfileNotice('Profile preferences saved.')
                  } catch (error) {
                    setProfileError(error instanceof Error ? error.message : 'Unable to save profile.')
                  }
                }}
              >
                Save Profile
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'defaults' && canManageApplication ? (
        <div style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
          <label>
            Default Tone
            <input value={defaultTone} onChange={(e) => setDefaultTone(e.target.value)} style={{ width: '100%' }} />
          </label>
          <label>
            Auto-save Interval Seconds
            <input type="number" min={10} max={300} value={autoSave} onChange={(e) => setAutoSave(Number(e.target.value))} style={{ width: '100%' }} />
          </label>
          <button
            onClick={async () => {
              await settingsApi.set('default_tone', defaultTone)
              await settingsApi.set('auto_save_interval_seconds', autoSave)
              await queryClient.invalidateQueries({ queryKey: ['settings'] })
            }}
          >
            Save Defaults
          </button>
        </div>
      ) : null}

      {tab === 'directory' && canManageApplication ? (
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="field-card" style={{ maxWidth: 920, display: 'grid', gap: 12 }}>
            <p className="field-card-title">Default Approver</p>
            <label>
              Approver
              <select
                value={defaultApprover?.id || ''}
                onChange={async (e) => {
                  if (!e.target.value) return
                  await directoryApi.setDefaultApprover(Number(e.target.value))
                  await refreshDirectory()
                }}
              >
                <option value="">Select approver</option>
                {(approvers || []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.display_name} ({item.email})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="field-card" style={{ maxWidth: 920, display: 'grid', gap: 12 }}>
            <p className="field-card-title">Contacts</p>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>Manual add</div>
            </div>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr 1fr 180px auto' }}>
              <input value={newContactName} onChange={(e) => setNewContactName(e.target.value)} placeholder="Display name" />
              <input value={newContactEmail} onChange={(e) => setNewContactEmail(e.target.value)} placeholder="Email" />
              <input value={newContactWhatsapp} onChange={(e) => setNewContactWhatsapp(e.target.value)} placeholder="WhatsApp number" />
              <select value={newContactRole} onChange={(e) => setNewContactRole(e.target.value as ContactRole)}>
                <option value="recipient">recipient</option>
                <option value="approver">approver</option>
                <option value="both">both</option>
              </select>
              <button
                className="btn-primary"
                title="Add contact"
                onClick={async () => {
                  await directoryApi.createContact({
                    display_name: newContactName,
                    email: newContactEmail,
                    whatsapp_number: newContactWhatsapp || undefined,
                    role: newContactRole,
                  })
                  setNewContactName('')
                  setNewContactEmail('')
                  setNewContactWhatsapp('')
                  setNewContactRole('recipient')
                  await refreshDirectory()
                }}
              >
                <span aria-hidden="true">+</span>
              </button>
            </div>

            <div style={{ display: 'grid', gap: 8, padding: 10, border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>Import contacts CSV (headers: display_name,email,whatsapp_number,role,active)</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="file" accept=".csv" onChange={(e) => setContactImportFile(e.target.files?.[0] || null)} />
                <button
                  title="Import contacts CSV"
                  onClick={async () => {
                    if (!contactImportFile) return
                    const res = await directoryApi.importContactsCsv(contactImportFile)
                    setImportResult(`Contacts import: created ${res.created}, updated ${res.updated}${res.errors.length ? `, errors ${res.errors.length}` : ''}`)
                    await refreshDirectory()
                  }}
                >
                  <span aria-hidden="true">&#8682;</span>
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8, padding: 10, border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>Edit existing contact</div>
              <label>
                Contact
                <select value={selectedContactId || ''} onChange={(e) => setSelectedContactId(Number(e.target.value) || null)}>
                  <option value="">Select contact</option>
                  {(contacts || []).map((item) => (
                    <option key={item.id} value={item.id}>{item.display_name} ({item.email})</option>
                  ))}
                </select>
              </label>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr 1fr 180px auto' }}>
                <input value={editContactName} onChange={(e) => setEditContactName(e.target.value)} placeholder="Display name" />
                <input value={editContactEmail} onChange={(e) => setEditContactEmail(e.target.value)} placeholder="Email" />
                <input value={editContactWhatsapp} onChange={(e) => setEditContactWhatsapp(e.target.value)} placeholder="WhatsApp number" />
                <select value={editContactRole} onChange={(e) => setEditContactRole(e.target.value as ContactRole)}>
                  <option value="recipient">recipient</option>
                  <option value="approver">approver</option>
                  <option value="both">both</option>
                </select>
                <button
                  title="Save contact edits"
                  onClick={async () => {
                    if (!selectedContactId) return
                    await directoryApi.updateContact(selectedContactId, {
                      display_name: editContactName,
                      email: editContactEmail,
                      whatsapp_number: editContactWhatsapp || undefined,
                      role: editContactRole,
                    })
                    await refreshDirectory()
                  }}
                >
                  <span aria-hidden="true">&#9998;</span>
                </button>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>WhatsApp</th>
                  <th>Role</th>
                  <th>Default Approver</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(contacts || []).map((item) => (
                  <tr key={item.id}>
                    <td>{item.display_name}</td>
                    <td>{item.email}</td>
                    <td>{item.whatsapp_number || '-'}</td>
                    <td>{item.role}</td>
                    <td>{item.is_default_approver ? 'Yes' : 'No'}</td>
                    <td>{item.active ? 'Active' : 'Inactive'}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button
                        style={iconButtonStyle}
                        title="Edit contact"
                        onClick={() => setSelectedContactId(item.id)}
                      >
                        <span aria-hidden="true">&#9998;</span>
                      </button>
                      <button
                        style={iconButtonStyle}
                        title="Delete contact"
                        onClick={async () => {
                          if (!confirm(`Delete contact ${item.display_name}?`)) return
                          await directoryApi.deleteContact(item.id)
                          await refreshDirectory()
                        }}
                      >
                        <span aria-hidden="true">&#128465;</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="field-card" style={{ maxWidth: 920, display: 'grid', gap: 12 }}>
            <p className="field-card-title">Recipient Groups</p>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr auto' }}>
              <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="Group name" />
              <input value={newGroupDescription} onChange={(e) => setNewGroupDescription(e.target.value)} placeholder="Description" />
              <button
                className="btn-primary"
                title="Add group"
                onClick={async () => {
                  await directoryApi.createGroup({ name: newGroupName, description: newGroupDescription })
                  setNewGroupName('')
                  setNewGroupDescription('')
                  await refreshDirectory()
                }}
              >
                <span aria-hidden="true">+</span>
              </button>
            </div>

            <div style={{ display: 'grid', gap: 8, padding: 10, border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>Import groups CSV (headers: name,description,member_emails)</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="file" accept=".csv" onChange={(e) => setGroupImportFile(e.target.files?.[0] || null)} />
                <button
                  title="Import groups CSV"
                  onClick={async () => {
                    if (!groupImportFile) return
                    const res = await directoryApi.importGroupsCsv(groupImportFile)
                    setImportResult(`Groups import: created ${res.created}, updated ${res.updated}${res.errors.length ? `, errors ${res.errors.length}` : ''}`)
                    await refreshDirectory()
                  }}
                >
                  <span aria-hidden="true">&#8682;</span>
                </button>
              </div>
            </div>

            <label>
              Group
              <select value={selectedGroupId || ''} onChange={(e) => setSelectedGroupId(Number(e.target.value) || null)}>
                <option value="">Select group</option>
                {(groups || []).map((group) => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
            </label>

            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr auto' }}>
              <input value={editGroupName} onChange={(e) => setEditGroupName(e.target.value)} placeholder="Group name" />
              <input value={editGroupDescription} onChange={(e) => setEditGroupDescription(e.target.value)} placeholder="Description" />
              <button
                disabled={!selectedGroupId}
                title="Save group edits"
                onClick={async () => {
                  if (!selectedGroupId) return
                  await directoryApi.updateGroup(selectedGroupId, { name: editGroupName, description: editGroupDescription })
                  await refreshDirectory()
                }}
              >
                <span aria-hidden="true">&#9998;</span>
              </button>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(groups || []).map((group) => (
                  <tr key={group.id}>
                    <td>{group.name}</td>
                    <td>{group.description || '-'}</td>
                    <td>{group.active ? 'Active' : 'Inactive'}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button
                        style={iconButtonStyle}
                        title="Edit group"
                        onClick={() => setSelectedGroupId(group.id)}
                      >
                        <span aria-hidden="true">&#9998;</span>
                      </button>
                      <button
                        style={iconButtonStyle}
                        title="Delete group"
                        onClick={async () => {
                          if (!confirm(`Delete group ${group.name}?`)) return
                          await directoryApi.deleteGroup(group.id)
                          await refreshDirectory()
                        }}
                      >
                        <span aria-hidden="true">&#128465;</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {selectedGroupId ? (
              <label>
                Members
                <select
                  multiple
                  value={selectedMemberIds.map(String)}
                  onChange={(e) => {
                    const values = Array.from(e.target.selectedOptions).map((option) => Number(option.value))
                    setSelectedMemberIds(values)
                  }}
                  style={{ minHeight: 140 }}
                >
                  {(contacts || []).map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.display_name} ({contact.email})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div>
              <button
                className="btn-primary"
                disabled={!selectedGroupId}
                title="Save group members"
                onClick={async () => {
                  if (!selectedGroupId) return
                  await directoryApi.setGroupMembers(selectedGroupId, selectedMemberIds)
                  await refreshDirectory()
                }}
              >
                <span aria-hidden="true">&#128190;</span>
              </button>
            </div>

            {importResult ? <div style={{ fontSize: 12, color: '#64748b' }}>{importResult}</div> : null}
          </div>
        </div>
      ) : null}

      {tab === 'models' && canManageApplication ? (
        <div style={{ display: 'grid', gap: 16, maxWidth: 760 }}>
          <div className="field-card" style={{ display: 'grid', gap: 10 }}>
            <p className="field-card-title">LLM Connection</p>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
              <label>
                LLM Provider
                <select value={llmProviderMode} onChange={(e) => setLlmProviderMode(e.target.value as 'local_ollama' | 'openai_dynamic')}>
                  <option value="local_ollama">local_ollama (Ollama local/cloud via backend host)</option>
                  <option value="openai_dynamic">openai_dynamic (analyst key)</option>
                </select>
              </label>
              <div style={{ fontSize: 12, color: '#64748b', alignSelf: 'end' }}>
                Generate uses this provider.
              </div>
            </div>

            {llmProviderMode === 'local_ollama' ? (
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
                <label>
                  Ollama Base URL
                  <input value={ollamaBaseUrl} onChange={(e) => setOllamaBaseUrl(e.target.value)} placeholder="http://127.0.0.1:11434" />
                </label>
                <label>
                  Ollama Model
                  <input value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)} placeholder="gpt-oss:120b-cloud" />
                </label>
              </div>
            ) : null}

            {llmProviderMode === 'openai_dynamic' ? (
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
                <label>
                  OpenAI Base URL
                  <input value={openaiBaseUrl} onChange={(e) => setOpenaiBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" />
                </label>
                <label>
                  OpenAI Model
                  <input value={openaiModel} onChange={(e) => setOpenaiModel(e.target.value)} placeholder="gpt-4o-mini" />
                </label>
                <label style={{ gridColumn: '1 / -1' }}>
                  OpenAI API Key
                  <input
                    type="password"
                    value={openaiApiKey}
                    onChange={(e) => setOpenaiApiKey(e.target.value)}
                    placeholder={openaiApiKeyMasked ? `Saved: ${openaiApiKeyMasked} (enter to replace)` : 'sk-...'}
                  />
                </label>
                <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={useSessionOnlyOpenAiKey}
                    onChange={(e) => {
                      const enabled = e.target.checked
                      setUseSessionOnlyOpenAiKey(enabled)
                      sessionStorage.setItem('osint_openai_session_only', enabled ? '1' : '0')
                      if (!enabled) {
                        sessionStorage.removeItem('osint_openai_session_key')
                      }
                    }}
                  />
                  Session-only key (keep key in browser session, do not persist to backend settings)
                </label>
                {openaiApiKeyMasked ? (
                  <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#64748b' }}>
                    Persisted key on server: {openaiApiKeyMasked}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={async () => {
                  if (useSessionOnlyOpenAiKey) {
                    if (openaiApiKey.trim()) {
                      sessionStorage.setItem('osint_openai_session_key', openaiApiKey.trim())
                    }
                  }
                  await settingsApi.set('llm_provider_mode', llmProviderMode)
                  await settingsApi.set('ollama_base_url', ollamaBaseUrl)
                  await settingsApi.set('ollama_model', ollamaModel)
                  await settingsApi.set('openai_base_url', openaiBaseUrl)
                  await settingsApi.set('openai_model', openaiModel)
                  if (llmProviderMode === 'openai_dynamic' && !useSessionOnlyOpenAiKey && openaiApiKey.trim()) {
                    await settingsApi.set('openai_api_key', openaiApiKey.trim())
                  }
                  await queryClient.invalidateQueries({ queryKey: ['settings'] })
                  setOpenaiApiKey('')
                }}
              >
                Save LLM Settings
              </button>
              <button
                onClick={async () => {
                  await settingsApi.set('openai_api_key', null)
                  setOpenaiApiKey('')
                  setOpenaiApiKeyMasked('')
                  sessionStorage.removeItem('osint_openai_session_key')
                  await queryClient.invalidateQueries({ queryKey: ['settings'] })
                }}
              >
                Clear Saved OpenAI Key
              </button>
              <button
                onClick={async () => {
                  setLlmTestError('')
                  setLlmTesting(true)
                  try {
                    const sessionKey = useSessionOnlyOpenAiKey ? (openaiApiKey.trim() || sessionStorage.getItem('osint_openai_session_key') || '') : ''
                    if (useSessionOnlyOpenAiKey && sessionKey) {
                      sessionStorage.setItem('osint_openai_session_key', sessionKey)
                    }
                    const result = await settingsApi.testLlmConnection({
                      provider_mode: llmProviderMode,
                      ollama_base_url: ollamaBaseUrl,
                      ollama_model: ollamaModel,
                      openai_base_url: openaiBaseUrl,
                      openai_model: openaiModel,
                      openai_api_key: useSessionOnlyOpenAiKey ? (sessionKey || undefined) : (openaiApiKey || undefined),
                    })
                    const summary = `${result.ok ? 'Connected' : 'Failed'} · ${result.provider} · ${result.model} · ${result.detail}`
                    setLlmTestResult(summary)
                    if (!result.ok) {
                      setLlmTestError(`LLM connection test failed: ${result.detail}`)
                    }
                  } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unable to test LLM connection.'
                    setLlmTestError(`LLM connection test failed: ${message}`)
                    setLlmTestResult(`Failed · ${message}`)
                  } finally {
                    setLlmTesting(false)
                  }
                }}
                disabled={llmTesting}
              >
                {llmTesting ? 'Testing...' : 'Test LLM Connection'}
              </button>
              {llmTestResult ? <span style={{ fontSize: 12, color: '#64748b' }}>{llmTestResult}</span> : null}
              {llmTestError ? <span style={{ fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>{llmTestError}</span> : null}
            </div>
          </div>

          <div className="field-card">
            <p className="field-card-title">Email Transport</p>
            <label>
              Email Transport
              <select value={emailTransportMode} onChange={(e) => setEmailTransportMode(e.target.value as 'simulated' | 'smtp' | 'graph')}>
                <option value="simulated">simulated</option>
                <option value="smtp">smtp</option>
                <option value="graph">graph</option>
              </select>
            </label>
            <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
              Compose will use this transport when you press the Send Email button after generating content.
            </div>
          </div>

          {emailTransportMode === 'smtp' ? (
            <div className="field-card">
              <p className="field-card-title">SMTP Email</p>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
                <label>
                  SMTP Host
                  <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.office365.com" />
                </label>
                <label>
                  SMTP Port
                  <input type="number" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value) || 0)} placeholder="587" />
                </label>
                <label>
                  SMTP Username
                  <input value={smtpUsername} onChange={(e) => setSmtpUsername(e.target.value)} placeholder="alerts@example.com" />
                </label>
                <label>
                  SMTP Password
                  <input
                    type="password"
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    placeholder={smtpPasswordMasked ? `Saved: ${smtpPasswordMasked} (enter to replace)` : 'SMTP password'}
                  />
                </label>
                <label>
                  From Email
                  <input value={smtpFromEmail} onChange={(e) => setSmtpFromEmail(e.target.value)} placeholder="alerts@example.com" />
                </label>
                <label>
                  From Name
                  <input value={smtpFromName} onChange={(e) => setSmtpFromName(e.target.value)} placeholder="IHCL Security & Safety" />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={smtpUseTls} onChange={(e) => setSmtpUseTls(e.target.checked)} />
                  Use STARTTLS
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={smtpUseSsl} onChange={(e) => setSmtpUseSsl(e.target.checked)} />
                  Use SSL
                </label>
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                If SSL is enabled, it takes precedence over STARTTLS.
              </div>
              {smtpPasswordMasked ? <div style={{ fontSize: 12, color: '#64748b' }}>Persisted SMTP password: {smtpPasswordMasked}</div> : null}
              <div>
                <button
                  onClick={async () => {
                    await settingsApi.set('smtp_password', null)
                    setSmtpPassword('')
                    setSmtpPasswordMasked('')
                    await queryClient.invalidateQueries({ queryKey: ['settings'] })
                  }}
                >
                  Clear Saved SMTP Password
                </button>
              </div>
            </div>
          ) : null}

          {emailTransportMode === 'graph' ? (
            <div className="field-card">
              <p className="field-card-title">Microsoft Graph</p>
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
                Graph sending remains available for legacy setups. SMTP is the recommended option for the Compose send button.
              </div>
            </div>
          ) : null}

          <div className="field-card">
            <p className="field-card-title">WhatsApp Transport</p>
            <label>
              WhatsApp Transport
              <select value={whatsappTransportMode} onChange={(e) => setWhatsappTransportMode(e.target.value as 'simulated' | 'twilio')}>
                <option value="simulated">simulated</option>
                <option value="twilio">twilio</option>
              </select>
            </label>
          </div>

          {whatsappTransportMode === 'twilio' ? (
            <div className="field-card">
              <p className="field-card-title">Twilio WhatsApp</p>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
                <label>
                  Account SID
                  <input value={twilioAccountSid} onChange={(e) => setTwilioAccountSid(e.target.value)} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
                </label>
                <label>
                  Auth Token
                  <input
                    type="password"
                    value={twilioAuthToken}
                    onChange={(e) => setTwilioAuthToken(e.target.value)}
                    placeholder={twilioAuthTokenMasked ? `Saved: ${twilioAuthTokenMasked} (enter to replace)` : 'Twilio auth token'}
                  />
                </label>
                <label>
                  WhatsApp From
                  <input value={twilioWhatsappFrom} onChange={(e) => setTwilioWhatsappFrom(e.target.value)} placeholder="+14155238886" />
                </label>
              </div>
              {twilioAuthTokenMasked ? <div style={{ fontSize: 12, color: '#64748b' }}>Persisted Twilio token: {twilioAuthTokenMasked}</div> : null}
              <div>
                <button
                  onClick={async () => {
                    await settingsApi.set('twilio_auth_token', null)
                    setTwilioAuthToken('')
                    setTwilioAuthTokenMasked('')
                    await queryClient.invalidateQueries({ queryKey: ['settings'] })
                  }}
                >
                  Clear Saved Twilio Token
                </button>
              </div>
            </div>
          ) : null}

          <div>
            <button
              className="btn-primary"
              onClick={async () => {
                await settingsApi.set('email_transport_mode', emailTransportMode)
                await settingsApi.set('smtp_host', smtpHost || null)
                await settingsApi.set('smtp_port', smtpPort || null)
                await settingsApi.set('smtp_username', smtpUsername || null)
                if (smtpPassword.trim()) {
                  await settingsApi.set('smtp_password', smtpPassword.trim())
                }
                await settingsApi.set('smtp_from_email', smtpFromEmail || null)
                await settingsApi.set('smtp_from_name', smtpFromName || null)
                await settingsApi.set('smtp_use_tls', smtpUseTls)
                await settingsApi.set('smtp_use_ssl', smtpUseSsl)
                await settingsApi.set('whatsapp_transport_mode', whatsappTransportMode)
                await settingsApi.set('twilio_account_sid', twilioAccountSid || null)
                if (twilioAuthToken.trim()) {
                  await settingsApi.set('twilio_auth_token', twilioAuthToken.trim())
                }
                await settingsApi.set('twilio_whatsapp_from', twilioWhatsappFrom || null)
                await queryClient.invalidateQueries({ queryKey: ['settings'] })
                setSmtpPassword('')
                setTwilioAuthToken('')
              }}
            >
              Save Transport Settings
            </button>
          </div>

          <div className="field-card" style={{ display: 'grid', gap: 10 }}>
            <p className="field-card-title">Email Transport Test</p>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr auto' }}>
              <input
                value={testEmailDestination}
                onChange={(e) => setTestEmailDestination(e.target.value)}
                placeholder="Test email destination"
              />
              <button
                onClick={async () => {
                  try {
                    const result = await settingsApi.testTransportConnection({
                      channel: 'email',
                      destination: testEmailDestination,
                      subject: 'OSINT Transport Test',
                      message: 'This is a test email from the OSINT Platform SMTP transport.',
                    })
                    setEmailTransportTestResult(`${result.ok ? 'Connected' : 'Failed'} - ${result.channel} - ${result.provider} - ${result.status}${result.error_message ? ` - ${result.error_message}` : ''}`)
                  } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unable to test email transport.'
                    setEmailTransportTestResult(`Failed - email - ${message}`)
                  }
                }}
              >
                Test Email
              </button>
            </div>

            {emailTransportTestResult ? <span style={{ fontSize: 12, color: '#64748b' }}>{emailTransportTestResult}</span> : null}
          </div>

          <div className="field-card" style={{ display: 'grid', gap: 10 }}>
            <p className="field-card-title">WhatsApp Transport Test</p>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr auto' }}>
              <input
                value={testWhatsappDestination}
                onChange={(e) => setTestWhatsappDestination(e.target.value)}
                placeholder="Test WhatsApp destination (e.g. +15551234567)"
              />
              <button
                onClick={async () => {
                  try {
                    const result = await settingsApi.testTransportConnection({
                      channel: 'whatsapp',
                      destination: testWhatsappDestination,
                      message: 'This is a test WhatsApp message from the OSINT Platform transport adapter.',
                    })
                    setWhatsappTransportTestResult(`${result.ok ? 'Connected' : 'Failed'} - ${result.channel} - ${result.provider} - ${result.status}${result.error_message ? ` - ${result.error_message}` : ''}`)
                  } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unable to test WhatsApp transport.'
                    setWhatsappTransportTestResult(`Failed - whatsapp - ${message}`)
                  }
                }}
              >
                Test WhatsApp
              </button>
            </div>

            {whatsappTransportTestResult ? <span style={{ fontSize: 12, color: '#64748b' }}>{whatsappTransportTestResult}</span> : null}
          </div>

          <div className="field-card" style={{ display: 'grid', gap: 10 }}>
            <p className="field-card-title">Webhook Setup</p>
            <div style={{ display: 'grid', gap: 8 }}>
              <label>
                Graph Validation URL
                <input readOnly value={webhookInfo?.callback_urls.graph_validation || ''} />
              </label>
              <label>
                Graph Inbound URL
                <input readOnly value={webhookInfo?.callback_urls.graph_inbound || ''} />
              </label>
              <label>
                Twilio Inbound URL
                <input readOnly value={webhookInfo?.callback_urls.twilio_inbound || ''} />
              </label>
            </div>
            <div style={{ display: 'grid', gap: 6, fontSize: 12, color: '#64748b' }}>
              <div>Shared webhook token: {webhookInfo?.security.shared_webhook_token_set ? 'set' : 'not set'}</div>
              <div>Graph clientState: {webhookInfo?.security.graph_client_state_set ? 'set' : 'not set'}</div>
              <div>Twilio signature verification: {webhookInfo?.security.twilio_signature_verification_enabled ? 'enabled' : 'disabled (set Twilio auth token)'}</div>
              <div>Public webhook base URL: {webhookInfo?.security.public_base_url_configured ? 'configured' : 'derived from current request host'}</div>
              {webhookInfo?.diagnostics?.effective_base_url ? (
                <div>Effective webhook base URL: {webhookInfo.diagnostics.effective_base_url}</div>
              ) : null}
              {webhookInfo?.diagnostics?.warnings?.length ? (
                <div style={{ color: '#b91c1c', fontWeight: 600 }}>
                  {webhookInfo.diagnostics.warnings.join(' | ')}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'users' ? (
        <div className="settings-users-panel">
          <div className="field-card settings-users-card">
            <div className="settings-users-head">
              <p className="field-card-title">{canManageAllUsers ? 'Current Access' : 'My User Details'}</p>
              {canManageAllUsers ? (
                <button
                  className="btn-primary"
                  onClick={() => {
                    setUserAdminNotice('')
                    setUserAdminError('')
                    setNewUserEmail('')
                    setNewUserPassword('')
                    setNewUserRole('user')
                    setNewUserDetails(EMPTY_MANAGED_USER_FORM)
                    setIsAddUserOpen(true)
                  }}
                >
                  Add User
                </button>
              ) : null}
            </div>
            <datalist id="settings-user-property-options">
              {mapProperties.map((item) => (
                <option key={`${item.property_name}-${item.latitude}-${item.longitude}`} value={item.property_name} />
              ))}
            </datalist>
            <div className="settings-users-list">
              {(appUsers || []).map((item) => (
                <button
                  type="button"
                  className="settings-user-row"
                  key={item.id}
                  onClick={() => {
                    setUserAdminNotice('')
                    setUserAdminError('')
                    setSelectedManagedUserId(item.id)
                    setIsUserEditorOpen(true)
                  }}
                >
                  <div>
                    <strong>{displayUserName(item) || item.email}</strong>
                    <span>
                      {displayUserName(item) ? `${item.email} | ` : ''}
                      {roleLabel(item.role)} privileges
                      {item.designation ? ` | ${item.designation}` : ''}
                      {item.property_name ? ` | ${item.property_name}` : ''}
                    </span>
                  </div>
                  <span className="settings-user-row-action">Edit</span>
                </button>
              ))}
            </div>
            {userAdminNotice ? <div className="settings-users-notice">{userAdminNotice}</div> : null}
            {userAdminError ? <div className="settings-users-error">{userAdminError}</div> : null}
          </div>

          {isAddUserOpen ? (
            <div className="settings-modal-backdrop" role="presentation" onMouseDown={() => setIsAddUserOpen(false)}>
              <div className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-add-user-title" onMouseDown={(event) => event.stopPropagation()}>
                <div className="settings-modal-head">
                  <p className="field-card-title" id="settings-add-user-title">Add User</p>
                  <button className="btn-secondary settings-modal-close" onClick={() => setIsAddUserOpen(false)}>Close</button>
                </div>
                <div className="settings-users-add-grid">
                  <label>
                    Email
                    <input value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} placeholder="user@example.com" />
                  </label>
                  <label>
                    Password
                    <span className="settings-password-field">
                      <input
                        type={showNewUserPassword ? 'text' : 'password'}
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        placeholder="Temporary password"
                      />
                      <button
                        type="button"
                        className="settings-password-toggle"
                        onClick={() => setShowNewUserPassword((current) => !current)}
                        aria-label={showNewUserPassword ? 'Hide password' : 'Show password'}
                        title={showNewUserPassword ? 'Hide password' : 'Show password'}
                      >
                        {showNewUserPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </span>
                  </label>
                  <label>
                    Role
                    <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as AuthUserRole)}>
                      <option value="user">User - view only</option>
                      <option value="admin">Analyst / Admin - full access</option>
                      <option value="superadmin">Superadmin - full access</option>
                    </select>
                  </label>
                  <label>
                    First Name
                    <input
                      value={newUserDetails.first_name}
                      onChange={(e) => setNewUserDetails((current) => ({ ...current, first_name: e.target.value }))}
                      placeholder="First name"
                    />
                  </label>
                  <label>
                    Last Name
                    <input
                      value={newUserDetails.last_name}
                      onChange={(e) => setNewUserDetails((current) => ({ ...current, last_name: e.target.value }))}
                      placeholder="Last name"
                    />
                  </label>
                  <label>
                    Designation
                    <input
                      value={newUserDetails.designation}
                      onChange={(e) => setNewUserDetails((current) => ({ ...current, designation: e.target.value }))}
                      placeholder="Security Manager"
                    />
                  </label>
                  <label>
                    Property / Office
                    <input
                      list="settings-user-property-options"
                      value={newUserDetails.property_name}
                      onChange={(e) =>
                        setNewUserDetails((current) => applyPropertyMetadata(e.target.value, current))
                      }
                      placeholder="Select mapped property or office"
                    />
                  </label>
                  <label>
                    City
                    <input
                      value={newUserDetails.city}
                      onChange={(e) => setNewUserDetails((current) => ({ ...current, city: e.target.value }))}
                      placeholder="Auto-filled from property"
                    />
                  </label>
                  <label>
                    State
                    <input
                      value={newUserDetails.state}
                      onChange={(e) => setNewUserDetails((current) => ({ ...current, state: e.target.value }))}
                      placeholder="Auto-filled from property"
                    />
                  </label>
                  <label>
                    Region
                    <input
                      value={newUserDetails.region}
                      onChange={(e) => setNewUserDetails((current) => ({ ...current, region: e.target.value }))}
                      placeholder="Auto-filled from property"
                    />
                  </label>
                  <label>
                    Country
                    <input
                      value={newUserDetails.country}
                      onChange={(e) => setNewUserDetails((current) => ({ ...current, country: e.target.value }))}
                      placeholder="Auto-filled from property"
                    />
                  </label>
                  <label>
                    Phone Number
                    <input
                      value={newUserDetails.phone_number}
                      onChange={(e) => setNewUserDetails((current) => ({ ...current, phone_number: e.target.value }))}
                      placeholder="+91 98765 43210"
                    />
                  </label>
                  <label>
                    WhatsApp Number
                    <input
                      value={newUserDetails.whatsapp_number}
                      onChange={(e) => setNewUserDetails((current) => ({ ...current, whatsapp_number: e.target.value }))}
                      placeholder="+91 98765 43210"
                    />
                  </label>
                </div>
                <div className="settings-modal-actions">
                  <button
                    className="btn-primary"
                    onClick={async () => {
                      setUserAdminNotice('')
                      setUserAdminError('')
                      try {
                        await authApi.createUser({
                          email: newUserEmail,
                          password: newUserPassword,
                          role: newUserRole,
                          active: true,
                          first_name: newUserDetails.first_name || null,
                          last_name: newUserDetails.last_name || null,
                          designation: newUserDetails.designation || null,
                          property_name: newUserDetails.property_name || null,
                          city: newUserDetails.city || null,
                          state: newUserDetails.state || null,
                          region: newUserDetails.region || null,
                          country: newUserDetails.country || null,
                          phone_number: newUserDetails.phone_number || null,
                          whatsapp_number: newUserDetails.whatsapp_number || null,
                        })
                        setNewUserEmail('')
                        setNewUserPassword('')
                        setShowNewUserPassword(false)
                        setNewUserRole('user')
                        setNewUserDetails(EMPTY_MANAGED_USER_FORM)
                        setIsAddUserOpen(false)
                        setUserAdminNotice(`User added as ${roleLabel(newUserRole)}.`)
                        await queryClient.invalidateQueries({ queryKey: ['auth-users'] })
                      } catch (error) {
                        setUserAdminError(error instanceof Error ? error.message : 'Unable to add user.')
                      }
                    }}
                  >
                    Add User
                  </button>
                  <button className="btn-secondary" onClick={() => setIsAddUserOpen(false)}>Cancel</button>
                </div>
              </div>
            </div>
          ) : null}

          {isUserEditorOpen && selectedManagedUser ? (
            <div className="settings-modal-backdrop" role="presentation" onMouseDown={() => setIsUserEditorOpen(false)}>
              <div className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-edit-user-title" onMouseDown={(event) => event.stopPropagation()}>
                <div className="settings-modal-head">
                  <p className="field-card-title" id="settings-edit-user-title">{canManageAllUsers ? 'Edit User Details' : 'Edit My Details'}</p>
                  <button className="btn-secondary settings-modal-close" onClick={() => setIsUserEditorOpen(false)}>Close</button>
                </div>
                <div className="settings-users-add-grid">
                  <label>
                    Email
                    <input value={selectedManagedUser.email} disabled />
                  </label>
                  <label>
                    Change Password
                    <span className="settings-password-field">
                      <input
                        type={showManagedUserPassword ? 'text' : 'password'}
                        value={managedUserPassword}
                        onChange={(e) => setManagedUserPassword(e.target.value)}
                        placeholder="Leave blank to keep current password"
                      />
                      <button
                        type="button"
                        className="settings-password-toggle"
                        onClick={() => setShowManagedUserPassword((current) => !current)}
                        aria-label={showManagedUserPassword ? 'Hide password' : 'Show password'}
                        title={showManagedUserPassword ? 'Hide password' : 'Show password'}
                      >
                        {showManagedUserPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </span>
                  </label>
                  {canManageAllUsers ? (
                    <>
                      <label>
                        Role
                        <select
                          value={managedUserRole}
                          disabled={selectedManagedUser.id === currentUser?.id}
                          onChange={(e) => setManagedUserRole(e.target.value as AuthUserRole)}
                        >
                          <option value="user">User - view only</option>
                          <option value="admin">Analyst / Admin - full access</option>
                          <option value="superadmin">Superadmin - full access</option>
                        </select>
                      </label>
                      <label className="settings-user-toggle settings-user-toggle-modal">
                        <input
                          type="checkbox"
                          checked={managedUserActive}
                          disabled={selectedManagedUser.id === currentUser?.id}
                          onChange={(event) => setManagedUserActive(event.target.checked)}
                        />
                        Active
                      </label>
                    </>
                  ) : null}
                  <label>
                    First Name
                    <input
                      value={managedUserDetails.first_name}
                      onChange={(e) => setManagedUserDetails((current) => ({ ...current, first_name: e.target.value }))}
                    />
                  </label>
                  <label>
                    Last Name
                    <input
                      value={managedUserDetails.last_name}
                      onChange={(e) => setManagedUserDetails((current) => ({ ...current, last_name: e.target.value }))}
                    />
                  </label>
                  <label>
                    Designation
                    <input
                      value={managedUserDetails.designation}
                      onChange={(e) => setManagedUserDetails((current) => ({ ...current, designation: e.target.value }))}
                    />
                  </label>
                  <label>
                    Property / Office
                    <input
                      list="settings-user-property-options"
                      value={managedUserDetails.property_name}
                      onChange={(e) =>
                        setManagedUserDetails((current) => applyPropertyMetadata(e.target.value, current))
                      }
                    />
                  </label>
                  <label>
                    City
                    <input
                      value={managedUserDetails.city}
                      onChange={(e) => setManagedUserDetails((current) => ({ ...current, city: e.target.value }))}
                    />
                  </label>
                  <label>
                    State
                    <input
                      value={managedUserDetails.state}
                      onChange={(e) => setManagedUserDetails((current) => ({ ...current, state: e.target.value }))}
                    />
                  </label>
                  <label>
                    Region
                    <input
                      value={managedUserDetails.region}
                      onChange={(e) => setManagedUserDetails((current) => ({ ...current, region: e.target.value }))}
                    />
                  </label>
                  <label>
                    Country
                    <input
                      value={managedUserDetails.country}
                      onChange={(e) => setManagedUserDetails((current) => ({ ...current, country: e.target.value }))}
                    />
                  </label>
                  <label>
                    Phone Number
                    <input
                      value={managedUserDetails.phone_number}
                      onChange={(e) => setManagedUserDetails((current) => ({ ...current, phone_number: e.target.value }))}
                    />
                  </label>
                  <label>
                    WhatsApp Number
                    <input
                      value={managedUserDetails.whatsapp_number}
                      onChange={(e) => setManagedUserDetails((current) => ({ ...current, whatsapp_number: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="settings-modal-actions">
                  <button
                    className="btn-primary"
                    onClick={async () => {
                      setUserAdminNotice('')
                      setUserAdminError('')
                      try {
                        await authApi.updateUser(selectedManagedUser.id, {
                          first_name: managedUserDetails.first_name || null,
                          last_name: managedUserDetails.last_name || null,
                          designation: managedUserDetails.designation || null,
                          property_name: managedUserDetails.property_name || null,
                          city: managedUserDetails.city || null,
                          state: managedUserDetails.state || null,
                          region: managedUserDetails.region || null,
                          country: managedUserDetails.country || null,
                          phone_number: managedUserDetails.phone_number || null,
                          whatsapp_number: managedUserDetails.whatsapp_number || null,
                          password: managedUserPassword || undefined,
                          ...(canManageAllUsers && selectedManagedUser.id !== currentUser?.id
                            ? { role: managedUserRole, active: managedUserActive }
                            : {}),
                        })
                        setManagedUserPassword('')
                        setIsUserEditorOpen(false)
                        setUserAdminNotice(`Updated details for ${selectedManagedUser.email}.`)
                        await queryClient.invalidateQueries({ queryKey: ['auth-users'] })
                      } catch (error) {
                        setUserAdminError(error instanceof Error ? error.message : 'Unable to update user details.')
                      }
                    }}
                  >
                    Save User Details
                  </button>
                  {canManageAllUsers && selectedManagedUser.id !== currentUser?.id ? (
                    <button
                      className="btn-secondary settings-danger-button"
                      onClick={async () => {
                        if (!window.confirm(`Delete user ${selectedManagedUser.email}? This cannot be undone.`)) return
                        setUserAdminNotice('')
                        setUserAdminError('')
                        try {
                          await authApi.deleteUser(selectedManagedUser.id)
                          setIsUserEditorOpen(false)
                          setSelectedManagedUserId(null)
                          setUserAdminNotice(`Deleted user ${selectedManagedUser.email}.`)
                          await queryClient.invalidateQueries({ queryKey: ['auth-users'] })
                        } catch (error) {
                          setUserAdminError(error instanceof Error ? error.message : 'Unable to delete user.')
                        }
                      }}
                    >
                      Delete User
                    </button>
                  ) : null}
                  <button className="btn-secondary" onClick={() => setIsUserEditorOpen(false)}>Cancel</button>
                  {selectedManagedUser.last_login_at ? (
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      Last login: {formatAppDateTime(selectedManagedUser.last_login_at)}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: '#64748b' }}>No login recorded yet.</span>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'feeds' && canManageApplication ? (
        <div style={{ display: 'grid', gap: 16, maxWidth: 760 }}>
          <div className="field-card" style={{ display: 'grid', gap: 10 }}>
            <p className="field-card-title">Datasurfr Informative Alerts API</p>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              Datasurfr uses JWT authentication and the `informativealerts` endpoint to return the latest subscribed risk events. Imported alerts become draft notifications so the current extract and generate flow stays the same.
            </div>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
              <label>
                Base URL
                <input value={datasurfrBaseUrl} onChange={(e) => setDatasurfrBaseUrl(e.target.value)} placeholder="https://platform.datasurfr.ai" />
              </label>
              <label>
                Username
                <input value={datasurfrUsername} onChange={(e) => setDatasurfrUsername(e.target.value)} placeholder="Datasurfr username" />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                Password
                <input
                  type="password"
                  value={datasurfrPassword}
                  onChange={(e) => setDatasurfrPassword(e.target.value)}
                  placeholder={datasurfrPasswordMasked ? `Saved: ${datasurfrPasswordMasked} (enter to replace)` : 'Datasurfr password'}
                />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                IHCL Logo Path
                <input value={ihclLogoPath} onChange={(e) => setIhclLogoPath(e.target.value)} placeholder="D:\\ihcl\\logo.png" />
              </label>
            </div>
            {datasurfrPasswordMasked ? (
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Persisted Datasurfr password: {datasurfrPasswordMasked}
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={async () => {
                  await settingsApi.set('datasurfr_base_url', datasurfrBaseUrl || 'https://platform.datasurfr.ai')
                  await settingsApi.set('datasurfr_username', datasurfrUsername || null)
                  await settingsApi.set('ihcl_logo_path', ihclLogoPath || null)
                  if (datasurfrPassword.trim()) {
                    await settingsApi.set('datasurfr_password', datasurfrPassword.trim())
                  }
                  await queryClient.invalidateQueries({ queryKey: ['settings'] })
                  setDatasurfrPassword('')
                  setDatasurfrTestResult('Settings saved.')
                }}
              >
                Save Datasurfr Settings
              </button>
              <button
                onClick={async () => {
                  await settingsApi.set('datasurfr_password', null)
                  setDatasurfrPassword('')
                  setDatasurfrPasswordMasked('')
                  await queryClient.invalidateQueries({ queryKey: ['settings'] })
                }}
              >
                Clear Saved Datasurfr Password
              </button>
              <button
                onClick={async () => {
                  const result = await settingsApi.testDatasurfrConnection()
                  const prefix = `${result.ok ? 'Connected' : 'Failed'} · ${result.detail}`
                  const mappingDetail = result.property_mapping?.detail
                  setDatasurfrTestResult(mappingDetail ? `${prefix} · Mapping: ${mappingDetail}` : prefix)
                }}
              >
                Test Datasurfr Connection
              </button>
              {datasurfrTestResult ? <span style={{ fontSize: 12, color: '#64748b' }}>{datasurfrTestResult}</span> : null}
            </div>
          </div>
          {canManageApplication ? (
            <div className="field-card" style={{ display: 'grid', gap: 10 }}>
              <p className="field-card-title">Advisory Knowledge Base</p>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                This indexes the IHCL advisory PDF used by RAG so generation can retrieve hotel-specific response guidance before writing advisories.
              </div>
              <div style={{ display: 'grid', gap: 6, fontSize: 12, color: '#334155' }}>
                <div>Configured source: {knowledgeBaseStatus?.configured_source_path || '-'}</div>
                <div>Source file present: {knowledgeBaseStatus?.source_exists ? 'Yes' : 'No'}</div>
                <div>Indexed: {knowledgeBaseStatus?.indexed ? 'Yes' : 'No'}</div>
                <div>Index matches source file: {knowledgeBaseStatus?.indexed_matches_source ? 'Yes' : 'No'}</div>
                <div>Sections indexed: {knowledgeBaseStatus?.section_count ?? 0}</div>
                <div>Chunks indexed: {knowledgeBaseStatus?.chunk_count ?? 0}</div>
                <div>
                  Embeddings: {knowledgeBaseStatus?.embedding_provider || '-'}
                  {knowledgeBaseStatus?.embedding_model ? ` / ${knowledgeBaseStatus.embedding_model}` : ''}
                </div>
                <div>Last indexed: {knowledgeBaseStatus?.updated_at || '-'}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  disabled={knowledgeBaseBusy}
                  onClick={async () => {
                    setKnowledgeBaseBusy(true)
                    setKnowledgeBaseResult('')
                    try {
                      const result = await settingsApi.reindexKnowledgeBase()
                      setKnowledgeBaseResult(
                        `Indexed ${result.chunk_count} chunks from ${result.section_count} sections using ${result.embedding_provider}/${result.embedding_model}.`,
                      )
                      await queryClient.invalidateQueries({ queryKey: ['settings-knowledge-base-status'] })
                    } catch (error) {
                      setKnowledgeBaseResult(error instanceof Error ? error.message : 'Knowledge-base reindex failed.')
                    } finally {
                      setKnowledgeBaseBusy(false)
                    }
                  }}
                >
                  {knowledgeBaseBusy ? 'Reindexing...' : 'Reindex Advisory Knowledge Base'}
                </button>
                <button
                  disabled={knowledgeBaseBusy}
                  onClick={async () => {
                    await queryClient.invalidateQueries({ queryKey: ['settings-knowledge-base-status'] })
                    setKnowledgeBaseResult('Knowledge-base status refreshed.')
                  }}
                >
                  Refresh Status
                </button>
                {knowledgeBaseResult ? <span style={{ fontSize: 12, color: '#64748b' }}>{knowledgeBaseResult}</span> : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

