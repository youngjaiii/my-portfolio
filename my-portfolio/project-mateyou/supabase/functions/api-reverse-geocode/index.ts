import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const nominatimHeaders = {
  'User-Agent': 'MateYou/1.0 (https://mateyou.me)',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const lat = url.searchParams.get('lat')
    const lng = url.searchParams.get('lng')
    const query = url.searchParams.get('q')

    // 검색 모드: q 파라미터가 있으면 정방향 geocoding
    if (query) {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&accept-language=ko&addressdetails=1&limit=5&countrycodes=kr`,
        { headers: nominatimHeaders }
      )

      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.status}`)
      }

      const data = await response.json()
      const results = data.map((item: any) => ({
        address: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        type: item.type,
        name: item.name,
      }))

      return new Response(
        JSON.stringify({ results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 역방향 geocoding: lat, lng 필요
    if (!lat || !lng) {
      return new Response(
        JSON.stringify({ error: 'lat and lng are required, or use q for search' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ko&addressdetails=1&zoom=18&namedetails=1`,
      { headers: nominatimHeaders }
    )

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`)
    }

    const data = await response.json()
    
    let address = ''
    let placeName = ''
    
    if (data.name && /[가-힣]/.test(data.name)) {
      placeName = data.name
    } else if (data.namedetails?.name && /[가-힣]/.test(data.namedetails.name)) {
      placeName = data.namedetails.name
    }
    
    if (data.address) {
      const addr = data.address
      const parts: string[] = []
      
      if (addr.state) parts.push(addr.state)
      if (addr.city) parts.push(addr.city)
      else if (addr.county) parts.push(addr.county)
      if (addr.borough) parts.push(addr.borough)
      if (addr.district && addr.district !== addr.city && addr.district !== addr.borough) {
        parts.push(addr.district)
      }
      if (addr.suburb) parts.push(addr.suburb)
      else if (addr.quarter) parts.push(addr.quarter)
      else if (addr.neighbourhood) parts.push(addr.neighbourhood)
      else if (addr.town) parts.push(addr.town)
      else if (addr.village) parts.push(addr.village)
      
      if (addr.road) {
        let roadPart = addr.road
        if (addr.house_number) {
          roadPart += ` ${addr.house_number}`
        }
        parts.push(roadPart)
      }
      
      address = parts.join(' ')
      
      const buildingName = addr.amenity || addr.building || addr.shop || addr.office || 
                          addr.leisure || addr.tourism || addr.commercial
      if (buildingName && /[가-힣]/.test(buildingName) && buildingName !== placeName) {
        placeName = placeName || buildingName
      }
    }
    
    if (!address && data.display_name) {
      const displayParts = data.display_name.split(', ')
      const koreanParts = displayParts.filter((p: string) => /[가-힣]/.test(p)).reverse()
      address = koreanParts.join(' ')
    }

    const fullAddress = placeName ? `${address} (${placeName})` : address

    return new Response(
      JSON.stringify({ address: fullAddress || null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Reverse geocode error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to reverse geocode', address: null }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
