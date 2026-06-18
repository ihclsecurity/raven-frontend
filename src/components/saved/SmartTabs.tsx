/**
 * Module: Smarttabs
 * Purpose: Core module responsible for Smarttabs concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

interface SmartTabsProps {
  active: string
  onChange: (value: string) => void
}

const tabs = [
  { id: 'today', label: 'Today' },
  { id: 'awaiting_approval', label: 'Awaiting Approval' },
  { id: 'ready', label: 'Ready to Send' },
  { id: 'sent', label: 'Sent' },
  { id: 'all', label: 'All' },
]

export function SmartTabs({ active, onChange }: SmartTabsProps) {
  return (
    <div className="saved-smart-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`saved-smart-tab${active === tab.id ? ' is-active' : ''}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

