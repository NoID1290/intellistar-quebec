var api_key = 'e1f10a1e78da46f5b10a1e78da96f525';

var appearanceSettings = {
    "marqueeAd": [
    "Visitez notre site web pour vos prévisions météo locales complètes.",
    "Téléchargez l'application météo pour recevoir les alertes en direct."
],
    localWeatherID: "XXXXX", //Keep it at XXXXX to generate a random local weather ID. Otherwise, put a 5 digit number.
    iconSet: "2026", //Choices are 2007, 2010, or 2026 (Ultra-HD vector icon set).
    ldlType: 'observations', //what you want to see on ldl. 'observations' = only observations / 'both' = both / if anything else is put here, the sim will default to only observations
    ldlVisible: true, // Studio: show the lower display line during broadcast.
    smoothRadar: false, // Smooth frame interpolation for local Doppler and cloud animations
    startupTime: 4000, //How long you want to wait for it to start up.
    graphicsPackage: 2026, //the package for graphics: 2007, 2008, 2009, 2010, or 2026 (Modern HD broadcast remaster with sapphire glass and 1080p assets).
    units: "metric", // "auto" (metric for Canada, imperial for US), "metric", or "imperial"
    vocalLanguage: "fr",
    version: "1.2"
}

var slideSettings = {
    flavor: '120',
    bulletin: true,
    precip: true,
    auto: false,
    endAttribution: true, // Show source attribution at the end of each sequence.
    attributionDelay: 6000,
    order: [
        { function: "currentConditions", slideDelay: 8000 },
        { function: "regionalForecast", slides: 3, slideDelay: 8000 },
        { function: "localDoppler", slideDelay: 9000 },
        { function: "couvertureNuageuse", slideDelay: 8500 },
        { function: "quebecCities", slides: 4, slideDelay: 8000 },
        { function: "quebecWeekAhead", slides: 8, slideDelay: 8000 },
        { function: "localDoppler2", slideDelay: 9000 },
        { function: "couvertureNuageuse2", slideDelay: 8500 },
        { function: "mapCurrent", slideDelay: 8000 },
        { function: "localDoppler3", slideDelay: 9000 },
        { function: "couvertureNuageuse3", slideDelay: 8500 },
        { function: "canadaForecast", slides: 3, slideDelay: 8000 },
        { function: "localDoppler10", slideDelay: 9000 },
        { function: "couvertureNuageuse10", slideDelay: 8500 },
        { function: "localDoppler4", slideDelay: 9000 },
        { function: "couvertureNuageuse4", slideDelay: 8500 },
        { function: "resortForecast", slides: 2, slideDelay: 8000 },
        { function: "localDoppler5", slideDelay: 9000 },
        { function: "couvertureNuageuse5", slideDelay: 8500 },
        { function: "localDoppler6", slideDelay: 9000 },
        { function: "couvertureNuageuse6", slideDelay: 8500 },
        { function: "localDoppler7", slideDelay: 9000 },
        { function: "couvertureNuageuse7", slideDelay: 8500 },
        { function: "localDoppler8", slideDelay: 9000 },
        { function: "couvertureNuageuse8", slideDelay: 8500 },
        { function: "localDoppler9", slideDelay: 9000 },
        { function: "couvertureNuageuse9", slideDelay: 8500 },
        { function: "localDoppler11", slideDelay: 9000 },
        { function: "couvertureNuageuse11", slideDelay: 8500 },
        { function: "localDoppler12", slideDelay: 9000 },
        { function: "couvertureNuageuse12", slideDelay: 8500 },
        { function: "radarDoppler", slideDelay: 8000 },
        { function: "daypartForecast", slideDelay: 8000 },
        { function: "mapForecast", slides: 2, slideDelay: 7000 },
        { function: "localForecast", slides: 4, slideDelay: 7500 },
        { function: "almanac", slideDelay: 8000 },
        { function: "airQuality", slideDelay: 8000 },
        { function: "outdoorActivity", slideDelay: 8000 }
    ]
}

var audioSettings = {
    source: "local", // "local" or "spotify"
    enableMusic: true, //Self-explanatory. Default is true.
    shuffle: true, //Self-explanatory. Default is true.
    randomStart: true, //Also should be self-explanatory. Default is true.
    narrations: true, //Also should be self-explanatory. Default is true.
    vocallocal: true, //Only affects local forecast vocal local, changes the phrase from naming the exact date to just "your local forecast"
    vocalLanguage: "fr", // Vocal narration language: "fr" or "en"
    musicVolume: (typeof window !== 'undefined' && window.__iptvAudioConfig && window.__iptvAudioConfig.musicVolume !== undefined) ? window.__iptvAudioConfig.musicVolume : 0.8, // Music volume level (0.0 to 1.0+)
    vocalVolume: (typeof window !== 'undefined' && window.__iptvAudioConfig && window.__iptvAudioConfig.vocalVolume !== undefined) ? window.__iptvAudioConfig.vocalVolume : 1.0, // Vocal narration volume level (0.0 to 1.0+)
    musicDuckedVolume: (typeof window !== 'undefined' && window.__iptvAudioConfig && window.__iptvAudioConfig.musicDuckedVolume !== undefined) ? window.__iptvAudioConfig.musicDuckedVolume : 0.3, // Background music volume when vocal is active
    order: [
        "Track 1",
        "Track 2",
        "Track 3",
        "Track 4",
        "Track 5",
        "Track 6",
        "Track 7",
        "Track 8",
        "Track 9",
        "Track 10",
        "Track 11",
        "Track 12",
    ],
    offset: 0 //How far in you want the song to start. An offset of 10 will start the song 10 seconds in.
}

var spotifySettings = {
    enabled: false,
    mode: "sync", // "sync" (Live Sync from Spotify app) or "sdk" (In-browser SDK Player)
    clientId: "",
    accessToken: "",
    refreshToken: "",
    expiresAt: 0,
    playlistId: ""
}

var locationSettings = {
    fetchIntervalMinutes: 5,
    mainCity: {
        autoFind: false,
        displayname: "",
        extraname: "",
        type: "geocode",
        val: ""
    },
    eightCities: {
        autoFind: false,
        cities: []
    },
    mapCities: {
        leftPos: -3353,
        topPos: 1297,
        map: [],
        autoFind: false
    },
    radarCities: {
        local: [],
        regional: []
    },
    regionalForecasts: [],
    canadaCities: [],
    quebecCities: [],
    resortCities: [],
    localDopplers: []
}

var alertTestSettings = {
    enabled: false,
    mode: "off", // off | single | all | quebec
    disasterType: "tornado", // alias or full alert name when mode is "single"
    includeCrawl: true // when true, severe alerts trigger the crawl + tones
}