/**
 * Module: AccuWeatherWindow
 * Purpose: Standalone weather intelligence panel for forecast-led risk awareness.
 * Context: Dashboard side panel for operational use, independent from regional charts.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Cloud, CloudRain, ExternalLink } from 'lucide-react'
import { formatAppDate } from '../../utils/dateTime'

type GeocodeResult = {
  name: string
  country?: string
  admin1?: string
  latitude: number
  longitude: number
}

type GeocodeResponse = {
  results?: GeocodeResult[]
}

type ForecastResponse = {
  current?: {
    time: string
    temperature_2m: number
    apparent_temperature: number
    relative_humidity_2m: number
    weathercode: number
    windspeed_10m: number
    windgusts_10m: number
    winddirection_10m: number
    is_day: number
  }
  daily?: {
    time: string[]
    weathercode: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_probability_max: number[]
    uv_index_max: number[]
  }
}

type WeatherAlertLevel = 'red' | 'orange' | 'yellow'

type WeatherAlert = {
  level: WeatherAlertLevel
  title: string
  window: string
}

function weatherLabel(code: number | null | undefined): string {
  const value = Number(code)
  if ([95, 96, 99].includes(value)) return 'Thunderstorm'
  if ([80, 81, 82].includes(value)) return 'Rain showers'
  if ([61, 63, 65, 66, 67].includes(value)) return 'Rain'
  if ([45, 48].includes(value)) return 'Foggy'
  if ([2, 3].includes(value)) return 'Cloudy'
  if (value === 1) return 'Mostly clear'
  if (value === 0) return 'Clear'
  return 'Mixed weather'
}

function formatDirection(degrees: number | null | undefined): string {
  const value = Number(degrees)
  if (!Number.isFinite(value)) return 'N/A'
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  const idx = Math.round(((value % 360) / 22.5)) % 16
  return dirs[idx]
}

function buildAlerts(data: ForecastResponse | null | undefined): WeatherAlert[] {
  const output: WeatherAlert[] = []
  const current = data?.current
  const daily = data?.daily
  const todayWeatherCode = daily?.weathercode?.[0]
  const todayRainProb = Number(daily?.precipitation_probability_max?.[0] || 0)
  const todayUv = Number(daily?.uv_index_max?.[0] || 0)
  const gust = Number(current?.windgusts_10m || 0)
  const wind = Number(current?.windspeed_10m || 0)
  const thunder = [95, 96, 99].includes(Number(todayWeatherCode || 0)) || [95, 96, 99].includes(Number(current?.weathercode || 0))

  if (thunder) {
    output.push({ level: 'red', title: 'Red Warning for Thunderstorm Risk', window: 'Next 6-12 hours' })
  }
  if (gust >= 70) {
    output.push({ level: 'red', title: 'Red Warning for Cyclonic Wind', window: 'Current conditions' })
  }
  if (todayRainProb >= 75) {
    output.push({ level: 'orange', title: 'Orange Alert for Heavy Rain', window: 'Today' })
  }
  if (wind >= 45 || gust >= 55) {
    output.push({ level: 'orange', title: 'Orange Alert for High Wind', window: 'Next 12 hours' })
  }
  if (todayUv >= 9) {
    output.push({ level: 'yellow', title: 'UV Stress Advisory', window: 'Daytime peak' })
  }

  if (!output.length) {
    output.push({ level: 'yellow', title: 'No Major Severe Weather Signal', window: 'Next 24 hours' })
  }

  return output.slice(0, 4)
}

function levelLabel(level: WeatherAlertLevel): string {
  if (level === 'red') return 'Red Warning'
  if (level === 'orange') return 'Orange Alert'
  return 'Yellow Advisory'
}

function placeLabel(place: GeocodeResult): string {
  return `${place.name}${place.admin1 ? `, ${place.admin1}` : ''}${place.country ? `, ${place.country}` : ''}`
}

function geocodeSearchName(value: string): string {
  return value.split(',')[0]?.trim() || value.trim()
}

type AccuWeatherWindowProps = {
  defaultLocation?: string
}

export function AccuWeatherWindow({ defaultLocation = '' }: AccuWeatherWindowProps) {
  const normalizedDefaultLocation = defaultLocation.trim()
  const hasManualLocationRef = useRef(false)
  const [query, setQuery] = useState(normalizedDefaultLocation)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [selectedPlace, setSelectedPlace] = useState<GeocodeResult | null>(null)
  const geocodeName = geocodeSearchName(query)

  useEffect(() => {
    if (!normalizedDefaultLocation || hasManualLocationRef.current) return
    setQuery(normalizedDefaultLocation)
    setSelectedPlace(null)
  }, [normalizedDefaultLocation])

  const geocodeQuery = useQuery({
    queryKey: ['accuweather-panel-geocode', geocodeName],
    enabled: geocodeName.length > 1,
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(geocodeName)}&count=8&language=en&format=json`,
        { signal },
      )
      if (!response.ok) throw new Error('Failed to resolve place')
      return (await response.json()) as GeocodeResponse
    },
    staleTime: 10 * 60 * 1000,
  })

  const placeSuggestions = useMemo(() => geocodeQuery.data?.results || [], [geocodeQuery.data?.results])

  useEffect(() => {
    if (!normalizedDefaultLocation || hasManualLocationRef.current || selectedPlace) return
    if (query.trim().toLowerCase() !== normalizedDefaultLocation.toLowerCase()) return
    const firstPlace = placeSuggestions[0]
    if (!firstPlace) return
    setSelectedPlace(firstPlace)
    setQuery(placeLabel(firstPlace))
  }, [normalizedDefaultLocation, placeSuggestions, query, selectedPlace])

  const forecastQuery = useQuery({
    queryKey: ['accuweather-panel-forecast', selectedPlace?.latitude, selectedPlace?.longitude],
    enabled: Boolean(selectedPlace),
    queryFn: async ({ signal }) => {
      if (!selectedPlace) return null
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${selectedPlace.latitude}&longitude=${selectedPlace.longitude}&timezone=auto&forecast_days=5&current=temperature_2m,apparent_temperature,relative_humidity_2m,weathercode,windspeed_10m,windgusts_10m,winddirection_10m,is_day&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max`,
        { signal },
      )
      if (!response.ok) throw new Error('Failed to load forecast')
      return (await response.json()) as ForecastResponse
    },
    staleTime: 10 * 60 * 1000,
  })

  const data = forecastQuery.data
  const alerts = useMemo(() => buildAlerts(data), [data])
  const topAlert = alerts[0]
  const severeCount = alerts.filter((item) => item.level !== 'yellow').length
  const current = data?.current
  const daily = data?.daily
  const todaySummary = weatherLabel(daily?.weathercode?.[0] ?? current?.weathercode)
  const tonightSummary = weatherLabel(daily?.weathercode?.[1] ?? current?.weathercode)
  const locationLabel = selectedPlace ? placeLabel(selectedPlace) : 'Select a location from dropdown'

  const todayDateLabel = useMemo(() => {
    return formatAppDate(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  }, [])

  const isLoading = forecastQuery.isLoading
  const hasError = forecastQuery.isError
  const accuweatherHref = `https://www.accuweather.com/en/search-locations?query=${encodeURIComponent(
    selectedPlace ? locationLabel : query.trim(),
  )}`

  return (
    <article className="dashboard-panel dashboard-panel--weather dashboard-accuweather-card">
      <div className="dashboard-panel-head">
        <h3>Weather</h3>
        <span>{todayDateLabel.toUpperCase()}</span>
      </div>

      <div
        className="dashboard-weather-autocomplete-wrap"
        onBlur={() => {
          setTimeout(() => setIsDropdownOpen(false), 120)
        }}
      >
        <div className="dashboard-weather-search dashboard-weather-search--full">
          <input
            type="text"
            value={query}
            onFocus={() => setIsDropdownOpen(true)}
            onChange={(event) => {
              hasManualLocationRef.current = true
              setQuery(event.target.value)
              setSelectedPlace(null)
              setIsDropdownOpen(true)
            }}
            placeholder="Search city / district / region"
            aria-label="Search weather location"
          />
          <a
            className="dashboard-weather-search-link"
            href={accuweatherHref}
            target="_blank"
            rel="noreferrer"
            title="Open in AccuWeather"
            aria-label="Open in AccuWeather"
          >
            <ExternalLink size={14} />
          </a>
        </div>

        {isDropdownOpen && geocodeName.length > 1 ? (
          <div className="dashboard-weather-search-dropdown">
            {geocodeQuery.isLoading ? <div className="dashboard-weather-search-empty">Searching...</div> : null}
            {!geocodeQuery.isLoading && !placeSuggestions.length ? (
              <div className="dashboard-weather-search-empty">No matching places found.</div>
            ) : null}
            {placeSuggestions.map((place) => (
              <button
                key={`${place.latitude}-${place.longitude}-${place.name}`}
                type="button"
                className="dashboard-weather-search-item"
                onMouseDown={(event) => {
                  event.preventDefault()
                  hasManualLocationRef.current = true
                  setSelectedPlace(place)
                  setQuery(placeLabel(place))
                  setIsDropdownOpen(false)
                }}
              >
                {placeLabel(place)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {isLoading ? <div className="dashboard-weather-empty">Loading weather window...</div> : null}
      {hasError ? <div className="dashboard-weather-empty">Unable to fetch weather details right now.</div> : null}
      {!isLoading && !hasError && !selectedPlace ? (
        <div className="dashboard-weather-empty">Type and select a location from dropdown to load forecast.</div>
      ) : null}

      {!isLoading && !hasError && selectedPlace && current && daily ? (
        <>
          <div className={`dashboard-weather-alert-banner dashboard-weather-alert-banner--${topAlert.level}`}>
            <span className="dashboard-weather-alert-count">
              <AlertTriangle size={14} />
              {severeCount}
            </span>
            <strong>{topAlert.title}</strong>
          </div>

          <div className="dashboard-weather-summary">
            <div className="dashboard-weather-summary-main">
              <div className="dashboard-weather-temp-main">{Math.round(current.temperature_2m)}&deg;</div>
              <div className="dashboard-weather-temp-sub">RealFeel {Math.round(current.apparent_temperature)}&deg;</div>
              <div className="dashboard-weather-summary-type">{todaySummary}</div>
            </div>
            <div className="dashboard-weather-summary-side">
              <div className="dashboard-weather-kv-row">
                <span>Today</span>
                <strong>
                  Hi {Math.round(daily.temperature_2m_max?.[0] || 0)}&deg; / Lo {Math.round(daily.temperature_2m_min?.[0] || 0)}&deg;
                </strong>
              </div>
              <div className="dashboard-weather-kv-row">
                <span>Tonight</span>
                <strong>{tonightSummary}</strong>
              </div>
              <div className="dashboard-weather-kv-row">
                <span>Wind</span>
                <strong>
                  {formatDirection(current.winddirection_10m)} {Math.round(current.windspeed_10m || 0)} km/h
                </strong>
              </div>
              <div className="dashboard-weather-kv-row">
                <span>Wind Gusts</span>
                <strong>{Math.round(current.windgusts_10m || 0)} km/h</strong>
              </div>
            </div>
          </div>

          <div className="dashboard-weather-inline-metrics">
            <div className="dashboard-weather-inline-item">
              <Cloud size={14} />
              <span>Humidity</span>
              <strong>{Math.round(current.relative_humidity_2m || 0)}%</strong>
            </div>
            <div className="dashboard-weather-inline-item">
              <AlertTriangle size={14} />
              <span>Max UV</span>
              <strong>{Math.round(daily.uv_index_max?.[0] || 0)}</strong>
            </div>
            <div className="dashboard-weather-inline-item">
              <CloudRain size={14} />
              <span>Precipitation Risk</span>
              <strong>{Math.round(daily.precipitation_probability_max?.[0] || 0)}%</strong>
            </div>
          </div>

          <section className="dashboard-weather-alert-rows">
            {alerts.map((alert, index) => (
              <article key={`${alert.title}-${index}`} className="dashboard-weather-alert-row">
                <div className="dashboard-weather-alert-row-main">
                  <span className={`dashboard-weather-alert-chip dashboard-weather-alert-chip--${alert.level}`}>
                    <AlertTriangle size={12} />
                    {levelLabel(alert.level)}
                  </span>
                  <h4>{alert.title}</h4>
                </div>
                <div className="dashboard-weather-alert-row-meta">{alert.window}</div>
              </article>
            ))}
          </section>
        </>
      ) : null}
    </article>
  )
}
