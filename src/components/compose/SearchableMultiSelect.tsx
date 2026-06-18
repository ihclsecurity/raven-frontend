/**
 * Module: Searchablemultiselect
 * Purpose: Core module responsible for Searchablemultiselect concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

import { useEffect, useMemo, useState } from 'react'

interface SearchableMultiSelectProps {
  options: string[]
  selected: string[]
  placeholder: string
  onChange: (next: string[]) => void
  disabled?: boolean
  emptyMessage?: string
}

export function SearchableMultiSelect({
  options,
  selected,
  placeholder,
  onChange,
  disabled = false,
  emptyMessage,
}: SearchableMultiSelectProps) {
  const [query, setQuery] = useState('')
  const [showSelectedPopup, setShowSelectedPopup] = useState(false)

  const filteredOptions = useMemo(() => {
    if (disabled) return []
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((option) => option.toLowerCase().includes(q))
  }, [disabled, options, query])

  const toggleOption = (value: string) => {
    if (disabled) return
    if (selected.includes(value)) {
      onChange(selected.filter((item) => item !== value))
      return
    }
    onChange([...selected, value])
  }

  useEffect(() => {
    if (!selected.length) {
      setShowSelectedPopup(false)
    }
  }, [selected.length])

  useEffect(() => {
    if (!showSelectedPopup) return

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowSelectedPopup(false)
      }
    }

    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [showSelectedPopup])

  const selectedCount = selected.length
  const selectedSummary = `${selectedCount} selected`

  return (
    <div className={`search-multi${disabled ? ' is-disabled' : ''}`}>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        disabled={disabled}
      />

      <button
        type="button"
        className="search-multi-selected-link"
        onClick={() => setShowSelectedPopup(true)}
        disabled={disabled || selectedCount === 0}
        aria-haspopup="dialog"
        aria-expanded={showSelectedPopup}
        aria-label={`${selectedSummary}. Click to view selected options`}
      >
        {selectedSummary}
      </button>

      {showSelectedPopup && selectedCount > 0 ? (
        <div className="search-multi-selected-popup-backdrop" onClick={() => setShowSelectedPopup(false)}>
          <div
            className="search-multi-selected-popup"
            role="dialog"
            aria-modal="true"
            aria-label="Selected items"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="search-multi-selected-popup-head">
              <span>{selectedSummary}</span>
              <button
                type="button"
                className="search-multi-selected-popup-close"
                onClick={() => setShowSelectedPopup(false)}
              >
                close
              </button>
            </div>
            <div className="search-multi-selected-popup-list">
              {selected.map((item) => (
                <div key={item} className="search-multi-selected-popup-item">
                  <span className="search-multi-selected-popup-item-label">{item}</span>
                  <button
                    type="button"
                    className="search-multi-selected-popup-remove"
                    onClick={() => toggleOption(item)}
                    aria-label={`Remove ${item}`}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div
        role="listbox"
        aria-multiselectable="true"
        aria-disabled={disabled}
        className={`search-multi-listbox${disabled ? ' is-disabled' : ''}`}
      >
        {filteredOptions.map((option) => {
          const isSelected = selected.includes(option)
          return (
            <div
              key={option}
              role="option"
              aria-selected={isSelected}
              className={`search-multi-option${isSelected ? ' is-selected' : ''}`}
              onClick={() => toggleOption(option)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  toggleOption(option)
                }
              }}
              tabIndex={0}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleOption(option)}
                onClick={(event) => event.stopPropagation()}
                className="search-multi-checkbox"
                disabled={disabled}
              />
              <span className="search-multi-option-label">{option}</span>
            </div>
          )
        })}
        {filteredOptions.length === 0 ? (
          <div className="search-multi-empty">{emptyMessage || 'No matches'}</div>
        ) : null}
      </div>
    </div>
  )
}

