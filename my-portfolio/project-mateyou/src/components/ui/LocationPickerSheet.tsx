import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin, Loader2, X, Navigation2, Search } from 'lucide-react'
import { Button } from './Button'
import { Input } from './Input'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export interface LocationResult {
  address: string
  lat: number
  lng: number
}

interface SearchResult {
  address: string
  lat: number
  lng: number
  type: string
  name: string
}

interface LocationPickerSheetProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (result: LocationResult) => void
  initialAddress?: string
}

interface Position {
  lat: number
  lng: number
}

function MapCenterTracker({ onCenterChange }: { onCenterChange: (pos: Position) => void }) {
  const map = useMap()
  const timeoutRef = useRef<number | null>(null)

  useMapEvents({
    moveend() {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = window.setTimeout(() => {
        const center = map.getCenter()
        onCenterChange({ lat: center.lat, lng: center.lng })
      }, 500)
    },
  })

  useEffect(() => {
    const center = map.getCenter()
    onCenterChange({ lat: center.lat, lng: center.lng })
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return null
}

export function LocationPickerSheet({ isOpen, onClose, onConfirm }: LocationPickerSheetProps) {
  const [currentPosition, setCurrentPosition] = useState<Position | null>(null)
  const [baseAddress, setBaseAddress] = useState('')
  const [detailAddress, setDetailAddress] = useState('')
  const [isLoadingAddress, setIsLoadingAddress] = useState(false)
  const [isLoadingLocation, setIsLoadingLocation] = useState(true)
  const [isVisible, setIsVisible] = useState(false)
  const [mapKey, setMapKey] = useState(0)
  const [initialCenter, setInitialCenter] = useState<[number, number] | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const searchTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (isOpen) {
      setMapKey((k) => k + 1)
      setBaseAddress('')
      setDetailAddress('')
      setInitialCenter(null)
      setCurrentPosition(null)
      setIsLoadingLocation(true)
      setSearchQuery('')
      setSearchResults([])
      setShowSearchResults(false)
      requestAnimationFrame(() => setIsVisible(true))
      
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setInitialCenter([pos.coords.latitude, pos.coords.longitude])
            setIsLoadingLocation(false)
          },
          () => {
            setInitialCenter([37.5665, 126.978])
            setIsLoadingLocation(false)
          },
          { enableHighAccuracy: true, timeout: 5000 }
        )
      } else {
        setInitialCenter([37.5665, 126.978])
        setIsLoadingLocation(false)
      }
    } else {
      setIsVisible(false)
    }
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [isOpen])

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()
    
    setIsLoadingAddress(true)
    
    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/api-reverse-geocode?lat=${lat}&lng=${lng}`,
        {
          signal: abortControllerRef.current.signal,
          headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY,
          },
        }
      )
      const data = await res.json()
      
      if (data.address) {
        setBaseAddress(data.address)
      } else {
        setBaseAddress('주소를 찾을 수 없습니다')
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setBaseAddress('주소를 찾을 수 없습니다')
      }
    } finally {
      setIsLoadingAddress(false)
    }
  }, [])

  const handleCenterChange = useCallback((newPos: Position) => {
    setCurrentPosition(newPos)
    reverseGeocode(newPos.lat, newPos.lng)
  }, [reverseGeocode])

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      setShowSearchResults(false)
      return
    }

    setIsSearching(true)
    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/api-reverse-geocode?q=${encodeURIComponent(query)}`,
        {
          headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY,
          },
        }
      )
      const data = await res.json()
      if (data.results) {
        setSearchResults(data.results)
        setShowSearchResults(true)
      }
    } catch (e) {
      console.error('Search error:', e)
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleSearchInputChange = useCallback((value: string) => {
    setSearchQuery(value)
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    searchTimeoutRef.current = window.setTimeout(() => {
      handleSearch(value)
    }, 300)
  }, [handleSearch])

  const handleSelectSearchResult = useCallback((result: SearchResult) => {
    setInitialCenter([result.lat, result.lng])
    setMapKey((k) => k + 1)
    setSearchResults([])
    setShowSearchResults(false)
    setSearchQuery('')
  }, [])

  const handleGetCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) return
    setIsLoadingLocation(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setInitialCenter([pos.coords.latitude, pos.coords.longitude])
        setMapKey((k) => k + 1)
        setIsLoadingLocation(false)
      },
      () => {
        setIsLoadingLocation(false)
      },
      { enableHighAccuracy: true, timeout: 5000 }
    )
  }, [])

  const handleConfirm = () => {
    if (!currentPosition) return
    const fullAddress = detailAddress ? `${baseAddress} ${detailAddress}` : baseAddress
    onConfirm({
      address: fullAddress,
      lat: currentPosition.lat,
      lng: currentPosition.lng,
    })
    onClose()
  }

  if (!isOpen) return null

  const content = (
    <div
      className="fixed inset-0 z-[140] flex flex-col items-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mt-auto flex w-full max-w-[720px] flex-col rounded-t-3xl bg-white shadow-2xl"
        style={{
          height: '85vh',
          maxHeight: 'calc(85vh - env(safe-area-inset-top, 0px))',
          transform: isVisible ? 'translateY(0)' : 'translateY(110%)',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <button onClick={onClose} className="p-1">
            <X className="w-5 h-5 text-gray-600" />
          </button>
          <span className="font-semibold text-gray-900">위치 선택</span>
          <div className="w-7" />
        </div>

        <div className="relative px-4 py-2 border-b bg-white">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchInputChange(e.target.value)}
              placeholder="주소 또는 장소 검색"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
            )}
          </div>
          {showSearchResults && searchResults.length > 0 && (
            <div className="absolute left-4 right-4 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-[1001] max-h-48 overflow-y-auto">
              {searchResults.map((result, index) => (
                <button
                  key={index}
                  onClick={() => handleSelectSearchResult(result)}
                  className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b last:border-b-0"
                >
                  <p className="text-sm text-gray-900 font-medium truncate">{result.name || result.address.split(',')[0]}</p>
                  <p className="text-xs text-gray-500 truncate">{result.address}</p>
                </button>
              ))}
            </div>
          )}
          {showSearchResults && searchResults.length === 0 && !isSearching && searchQuery && (
            <div className="absolute left-4 right-4 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-[1001] px-3 py-2">
              <p className="text-sm text-gray-500">검색 결과가 없습니다</p>
            </div>
          )}
        </div>

        <div className="relative flex-1 min-h-0">
          {isLoadingLocation || !initialCenter ? (
            <div className="flex items-center justify-center h-full bg-gray-100">
              <Loader2 className="w-8 h-8 text-[#FE3A8F] animate-spin" />
            </div>
          ) : (
            <MapContainer
              key={mapKey}
              center={initialCenter}
              zoom={16}
              style={{ height: '100%', width: '100%' }}
              zoomControl={false}
              attributionControl={false}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <MapCenterTracker onCenterChange={handleCenterChange} />
            </MapContainer>
          )}

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1000]">
            <div className="relative -mt-8">
              <MapPin className="w-10 h-10 text-[#FE3A8F] drop-shadow-lg" fill="#FE3A8F" />
            </div>
          </div>

          <button
            onClick={handleGetCurrentLocation}
            disabled={isLoadingLocation}
            className="absolute bottom-4 right-4 z-[1000] bg-white rounded-full p-3 shadow-lg border hover:bg-gray-50 active:bg-gray-100"
          >
            {isLoadingLocation ? (
              <Loader2 className="w-5 h-5 text-[#FE3A8F] animate-spin" />
            ) : (
              <Navigation2 className="w-5 h-5 text-[#FE3A8F]" />
            )}
          </button>
        </div>

        <div className="p-4 space-y-3 border-t bg-white" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
          <div className="flex items-start gap-2">
            <MapPin className="w-5 h-5 text-[#FE3A8F] mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              {isLoadingAddress ? (
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">주소 검색 중...</span>
                </div>
              ) : (
                <p className="text-sm text-gray-900 font-medium break-words">{baseAddress || '지도를 움직여 위치를 선택하세요'}</p>
              )}
            </div>
          </div>
          
          <Input
            type="text"
            value={detailAddress}
            onChange={(e) => setDetailAddress(e.target.value)}
            placeholder="상세주소 입력 (선택)"
            className="w-full"
          />

          <Button
            onClick={handleConfirm}
            disabled={!baseAddress || baseAddress === '주소를 찾을 수 없습니다' || isLoadingAddress || !currentPosition}
            className="w-full !bg-[#FE3A8F] hover:!bg-[#e8357f] !text-white"
          >
            확인
          </Button>
        </div>
      </div>
    </div>
  )

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body)
  }
  return content
}

export default LocationPickerSheet
