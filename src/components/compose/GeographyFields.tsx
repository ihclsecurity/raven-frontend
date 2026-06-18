/**
 * Module: Geographyfields
 * Purpose: Core module responsible for Geographyfields concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

import { SearchableMultiSelect } from './SearchableMultiSelect'
import { COUNTRY_OPTIONS, INDIAN_STATE_OPTIONS, REGION_OPTIONS, type GeographySelection } from '../../constants/geography'

interface GeographyFieldsProps {
  value: GeographySelection
  onChange: (next: GeographySelection) => void
}

export function GeographyFields({ value, onChange }: GeographyFieldsProps) {
  const indiaSelected = value.countries.includes('India')
  const regionOptions = REGION_OPTIONS
  const allIndianStates = INDIAN_STATE_OPTIONS.filter((state) => state !== 'Country-wide')

  const handleCountryChange = (countries: string[]) => {
    const nextIndiaSelected = countries.includes('India')
    const nextStates = nextIndiaSelected
      ? (value.states.length ? value.states : ['Country-wide'])
      : []

    onChange({
      ...value,
      countries,
      states: nextStates,
    })
  }

  const handleStatesChange = (states: string[]) => {
    let nextStates = states

    if (nextStates.includes('Country-wide')) {
      nextStates = [...allIndianStates]
    }

    // If nothing selected, keep the national fallback.
    if (!nextStates.length) {
      nextStates = ['Country-wide']
    }

    onChange({ ...value, states: nextStates })
  }

  return (
    <div className="compose-form-stack compose-geography-grid">
      <label className="compose-geography-country">
        Country
        <SearchableMultiSelect
          options={COUNTRY_OPTIONS}
          selected={value.countries}
          placeholder="Search countries"
          onChange={handleCountryChange}
        />
      </label>

      <label>
        State / UT
        <SearchableMultiSelect
          options={indiaSelected ? INDIAN_STATE_OPTIONS : []}
          selected={indiaSelected ? value.states : []}
          placeholder={indiaSelected ? 'Search states / UTs' : 'Select India in Country first'}
          disabled={!indiaSelected}
          emptyMessage={indiaSelected ? 'No matches' : 'Select India in Country first'}
          onChange={handleStatesChange}
        />
      </label>

      <label>
        Region
        <SearchableMultiSelect
          options={regionOptions}
          selected={value.regions}
          placeholder="Search regions"
          onChange={(regions) => onChange({ ...value, regions })}
        />
      </label>
    </div>
  )
}

