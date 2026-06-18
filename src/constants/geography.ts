/**
 * Geography Constants
 *
 * This file contains the shared country, state, and region option lists used by
 * compose, mapping, and filtering workflows.
 *
 * It is responsible for:
 * - keeping the canonical geography selection lists in one place
 * - defining the relationship between countries, states, and regions
 *
 * What this file does not do:
 * - it does not infer geography from alerts
 * - it does not validate user selections beyond the shared options
 */
export interface GeographySelection {
  countries: string[]
  states: string[]
  regions: string[]
}

export const COUNTRY_OPTIONS: string[] = [
  'Afghanistan',
  'Albania',
  'Algeria',
  'Andorra',
  'Angola',
  'Antigua and Barbuda',
  'Argentina',
  'Armenia',
  'Australia',
  'Austria',
  'Azerbaijan',
  'Bahamas',
  'Bahrain',
  'Bangladesh',
  'Barbados',
  'Belarus',
  'Belgium',
  'Belize',
  'Benin',
  'Bhutan',
  'Bolivia',
  'Bosnia and Herzegovina',
  'Botswana',
  'Brazil',
  'Brunei',
  'Bulgaria',
  'Burkina Faso',
  'Burundi',
  'Cabo Verde',
  'Cambodia',
  'Cameroon',
  'Canada',
  'Central African Republic',
  'Chad',
  'Chile',
  'China',
  'Colombia',
  'Comoros',
  'Congo (Congo-Brazzaville)',
  'Costa Rica',
  'Croatia',
  'Cuba',
  'Cyprus',
  'Czechia',
  'Democratic Republic of the Congo',
  'Denmark',
  'Djibouti',
  'Dominica',
  'Dominican Republic',
  'Ecuador',
  'Egypt',
  'El Salvador',
  'Equatorial Guinea',
  'Eritrea',
  'Estonia',
  'Eswatini',
  'Ethiopia',
  'Fiji',
  'Finland',
  'France',
  'Gabon',
  'Gambia',
  'Georgia',
  'Germany',
  'Ghana',
  'Greece',
  'Grenada',
  'Guatemala',
  'Guinea',
  'Guinea-Bissau',
  'Guyana',
  'Haiti',
  'Honduras',
  'Hungary',
  'Iceland',
  'India',
  'Indonesia',
  'Iran',
  'Iraq',
  'Ireland',
  'Israel',
  'Italy',
  'Jamaica',
  'Japan',
  'Jordan',
  'Kazakhstan',
  'Kenya',
  'Kiribati',
  'Kuwait',
  'Kyrgyzstan',
  'Laos',
  'Latvia',
  'Lebanon',
  'Lesotho',
  'Liberia',
  'Libya',
  'Liechtenstein',
  'Lithuania',
  'Luxembourg',
  'Madagascar',
  'Malawi',
  'Malaysia',
  'Maldives',
  'Mali',
  'Malta',
  'Marshall Islands',
  'Mauritania',
  'Mauritius',
  'Mexico',
  'Micronesia',
  'Moldova',
  'Monaco',
  'Mongolia',
  'Montenegro',
  'Morocco',
  'Mozambique',
  'Myanmar',
  'Namibia',
  'Nauru',
  'Nepal',
  'Netherlands',
  'New Zealand',
  'Nicaragua',
  'Niger',
  'Nigeria',
  'North Korea',
  'North Macedonia',
  'Norway',
  'Oman',
  'Pakistan',
  'Palau',
  'Palestine',
  'Panama',
  'Papua New Guinea',
  'Paraguay',
  'Peru',
  'Philippines',
  'Poland',
  'Portugal',
  'Qatar',
  'Romania',
  'Russia',
  'Rwanda',
  'Saint Kitts and Nevis',
  'Saint Lucia',
  'Saint Vincent and the Grenadines',
  'Samoa',
  'San Marino',
  'Sao Tome and Principe',
  'Saudi Arabia',
  'Senegal',
  'Serbia',
  'Seychelles',
  'Sierra Leone',
  'Singapore',
  'Slovakia',
  'Slovenia',
  'Solomon Islands',
  'Somalia',
  'South Africa',
  'South Korea',
  'South Sudan',
  'Spain',
  'Sri Lanka',
  'Sudan',
  'Suriname',
  'Sweden',
  'Switzerland',
  'Syria',
  'Taiwan',
  'Tajikistan',
  'Tanzania',
  'Thailand',
  'Timor-Leste',
  'Togo',
  'Tonga',
  'Trinidad and Tobago',
  'Tunisia',
  'Turkey',
  'Turkmenistan',
  'Tuvalu',
  'Uganda',
  'Ukraine',
  'United Arab Emirates',
  'United Kingdom',
  'United States',
  'Uruguay',
  'Uzbekistan',
  'Vanuatu',
  'Vatican City',
  'Venezuela',
  'Vietnam',
  'Yemen',
  'Zambia',
  'Zimbabwe',
]

export const INDIAN_STATE_OPTIONS: string[] = [
  'Country-wide',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
]

export const REGION_OPTIONS: string[] = [
  'North & East',
  'West',
  'South & International',
  'Corporate Office',
]

export const DEFAULT_GEOGRAPHY: GeographySelection = {
  countries: ['India'],
  states: ['Country-wide'],
  regions: [],
}

function normalizeRegionToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

const REGION_ALIASES: Record<string, string> = {
  [normalizeRegionToken('North & East')]: 'North & East',
  [normalizeRegionToken('Region - North & East')]: 'North & East',
  [normalizeRegionToken('north and east')]: 'North & East',
  [normalizeRegionToken('West')]: 'West',
  [normalizeRegionToken('South & International')]: 'South & International',
  [normalizeRegionToken('south and international')]: 'South & International',
  [normalizeRegionToken('South')]: 'South & International',
  [normalizeRegionToken('International')]: 'South & International',
  [normalizeRegionToken('Enterprise')]: 'Corporate Office',
  [normalizeRegionToken('Corporate Offices')]: 'Corporate Office',
  [normalizeRegionToken('Corporate Office')]: 'Corporate Office',
}

export function normalizeRegionOption(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) {
    return null
  }
  const normalized = normalizeRegionToken(text)
  if (!normalized) {
    return null
  }
  if (REGION_ALIASES[normalized]) {
    return REGION_ALIASES[normalized]
  }
  return REGION_OPTIONS.find((option) => normalizeRegionToken(option) === normalized) || null
}

export function parseGeographyJson(value: unknown): GeographySelection {
  if (!value || typeof value !== 'string') {
    return DEFAULT_GEOGRAPHY
  }

  try {
    const parsed = JSON.parse(value) as Partial<GeographySelection> & { state?: string; locations?: string[]; areas?: string[] }
    
    // Handle new LLM extraction format (countries, states, regions)
    const countries = Array.isArray(parsed.countries) 
      ? parsed.countries.filter(Boolean) 
      : DEFAULT_GEOGRAPHY.countries
    
    const parsedStates = Array.isArray(parsed.states)
      ? parsed.states.filter(Boolean)
      : (typeof parsed.state === 'string' && parsed.state.trim() ? [parsed.state.trim()] : DEFAULT_GEOGRAPHY.states)

    // Handle regions: use from parsed or fallback to legacy areas if regions empty
    let regions = Array.isArray(parsed.regions) 
      ? parsed.regions.filter(Boolean) 
      : []
    
    // Backward compatibility: if regions are empty but areas exist from LLM extraction, use areas as regions
    if (regions.length === 0 && Array.isArray(parsed.areas)) {
      regions = parsed.areas.filter(Boolean)
    }

    const normalizedRegions = Array.from(
      new Set(
        regions
          .map((region) => normalizeRegionOption(region))
          .filter((region): region is string => Boolean(region)),
      ),
    )

    return {
      countries: countries.length ? countries : DEFAULT_GEOGRAPHY.countries,
      states: parsedStates.length ? parsedStates : DEFAULT_GEOGRAPHY.states,
      regions: normalizedRegions,
    }
  } catch {
    const legacyCountries = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    return {
      countries: legacyCountries.length ? legacyCountries : DEFAULT_GEOGRAPHY.countries,
      states: DEFAULT_GEOGRAPHY.states,
      regions: [],
    }
  }
}

export function stringifyGeography(selection: GeographySelection): string {
  const normalizedStates = selection.states.length ? selection.states : ['Country-wide']
  return JSON.stringify({
    countries: selection.countries,
    states: normalizedStates,
    regions: selection.regions,
  })
}
