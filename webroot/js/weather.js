var weatherInfo = {
    specialModes: {
        precip: false,
        bulletin: false
    },
    bulletin: {
        enabled: false,
        alerts: [],
        crawlAlert: {
            enabled: false,
            alert: undefined
        }
    },
    currentConditions: {
        humidity: "",
        pressure: { trend: "", val: "" },
        wind: "",
        dewpoint: "",
        gusts: "",
        icon: "",
        cond: "",
        temp: "",
        visibility: "",
        feelslike: { type: "", val: "" },
        noReport: false
    },
    eightCities: {
        noReport: false,
        cities: []
    },
    dayDesc: {
        noReport: false,
        days: []
    },
    weekAhead: {
        noReport: false,
        days: []
    },
    almanac: {
        noReport: false,
        stationname: "",
        days: [],
        yesterday: { high: "", low: "" },
        average: { high: "", low: "" },
        record: { high: "", recordYearHigh: "", low: "", recordYearLow: "" },
        moonphases: []
    },
    airQuality: {
        category: "",
        categoryIndex: 0,
        pollutants: []
    },
    outdoorActivity: {
        noReport: false,
        time: "",
        temp: "",
        cond: "",
        icon: "",
        wind: "",
        bg: 1,
        feelslike: {type:undefined,val:""}
    },
    daypartForecast: {
        noReport: false,
        times: []
    },
    map: {
        days: [],
        mapCities: [
            //{current: {}, forecast: {}}
        ],
    },
    radarUnavailable: false,
    monthlyPrecip: "",
    regionalForecasts: {
        noReport: false,
        regions: []
    },
    canadaCities: {
        noReport: false,
        cities: []
    },
    quebecCities: {
        noReport: false,
        cities: []
    },
    resortCities: {
        noReport: false,
        cities: []
    },
    quebecWeekAhead: {
        noReport: false,
        cities: []
    }
}

var dataRefreshState = {
    fetchIntervalMinutes: 5,
    lastFetchAttempt: 0,
    lastSuccessful: {
        forecast: null,
        alerts: null,
        radar: null
    }
};

function getFetchIntervalMs() {
    var configured = Number(locationSettings && locationSettings.fetchIntervalMinutes);
    if (!Number.isFinite(configured) || configured <= 0) {
        configured = 5;
    }
    dataRefreshState.fetchIntervalMinutes = configured;
    return Math.round(configured * 60 * 1000);
}

function formatTimestamp(ts) {
    if (!ts) return "--";
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function translateWindCardinal(cardinal) {
    if (!cardinal) return "";
    var c = String(cardinal).trim().toUpperCase();
    var map = {
        "CALM": "Calme",
        "VAR": "Variable",
        "VARIABLE": "Variable",
        "N": "N",
        "S": "S",
        "E": "E",
        "W": "O",
        "NE": "NE",
        "NW": "NO",
        "SE": "SE",
        "SW": "SO",
        "NNE": "NNE",
        "NNW": "NNO",
        "ENE": "ENE",
        "ESE": "ESE",
        "SSE": "SSE",
        "SSW": "SSO",
        "WNW": "ONO",
        "WSW": "OSO"
    };
    return map[c] !== undefined ? map[c] : c;
}

function updateLastUpdatedIndicator() {
    var forecastStamp = formatTimestamp(dataRefreshState.lastSuccessful.forecast);
    var alertsStamp = formatTimestamp(dataRefreshState.lastSuccessful.alerts);
    var radarStamp = formatTimestamp(dataRefreshState.lastSuccessful.radar);
    $(".data-updated")
        .text(`Mises à jour | Prévisions ${forecastStamp} | Alertes ${alertsStamp} | Radar ${radarStamp}`)
        .removeClass("error");
}

function markFeedSuccess(feedName) {
    dataRefreshState.lastSuccessful[feedName] = Date.now();
    updateLastUpdatedIndicator();
}

window.markFeedSuccess = markFeedSuccess;
window.translateWindCardinal = translateWindCardinal;

var alertTestRuntime = {
    enabled: false,
    mode: "off",
    disasterType: "",
    includeCrawl: true,
    initialized: false
};

var ALERT_TYPE_ALIASES = {
    amber: "AMBER Alert",
    tornado: "Tornado Warning",
    "severe-thunderstorm": "Severe Thunderstorm Warning",
    severe: "Severe Thunderstorm Warning",
    "flash-flood": "Flash Flood Warning",
    flood: "Flood Warning",
    hurricane: "Hurricane Warning",
    tsunami: "Tsunami Warning",
    blizzard: "Blizzard Warning",
    "winter-storm": "Winter Storm Warning",
    "ice-storm": "Ice Storm Warning",
    wind: "Wind Warning",
    heat: "Heat Warning",
    wildfire: "Fire Warning",
    fire: "Fire Warning",
    earthquake: "Earthquake Warning",
    volcano: "Volcano Warning",
    ashfall: "Ashfall Warning",
    smog: "Avertissement de smog",
    fog: "Dense Fog Advisory",
    rain: "Avertissement de pluie",
    special: "Special Weather Statement",
    statement: "Special Weather Statement",
    squall: "Squall Watch",
    "squall-watch": "Squall Watch",
    "squall-warning": "Squall Warning",
    "snow-squall": "Snow Squall Warning",
    rafale: "Veille de rafales",
    rafales: "Veille de rafales",
    "veille-de-rafales": "Veille de rafales",
    "avertissement-de-rafales": "Avertissement de rafales",
    bourrasque: "Veille de bourrasques",
    bourrasques: "Veille de bourrasques",
    "veille-de-bourrasques": "Veille de bourrasques",
    "avertissement-de-bourrasques": "Avertissement de bourrasques",
    gel: "Avis de gel",
    gelee: "Avis de gel",
    "avis-de-gel": "Avis de gel",
    "avis-de-gelee": "Avis de gel",
    frost: "Avis de gel",
    "frost-advisory": "Avis de gel",
    freeze: "Avis de gel",
    "freeze-warning": "Avis de gel",
    "freeze-watch": "Veille de gel"
};

var QUEBEC_ALERT_TYPES = [
    "Alerte AMBER",
    "AMBER Alert",
    "Alerte d'urgence civile",
    "Civil Emergency Message",
    "Evacuation Immediate",
    "Shelter In Place Warning",
    "911 Telephone Outage Emergency",
    "Alerte de tornade",
    "Alerte d'orage violent",
    "Avertissement de pluie verglacée",
    "Avertissement de tempête hivernale",
    "Avertissement de neige",
    "Avertissement de vent",
    "Avertissement de chaleur",
    "Avertissement de smog",
    "Bulletin météorologique spécial",
    "Avis de gel",
    "Avis de gelée",
    "Avis jaune - Gelée",
    "Avis jaune - Gel",
    "Yellow Advisory - Frost",
    "Veille de gel",
    "Veille de gel dur",
    "Frost Advisory",
    "Freeze Warning",
    "Freeze Watch",
    "Veille de rafales",
    "Avertissement de rafales",
    "Veille de bourrasques",
    "Avertissement de bourrasques",
    "Veille de bourrasques de neige",
    "Avertissement de bourrasques de neige",
    "Squall Watch",
    "Squall Warning",
    "Snow Squall Warning",
    "Snow Squall Watch"
];

var ALERT_NAME_FR_MAP = {
    "Squall Watch": "Veille de rafales",
    "Squall Warning": "Avertissement de rafales",
    "Snow Squall Watch": "Veille de bourrasques de neige",
    "Snow Squall Warning": "Avertissement de bourrasques de neige",
    "Tornado Warning": "Alerte de tornade",
    "Tornado Watch": "Veille de tornade",
    "Severe Thunderstorm Warning": "Alerte d'orage violent",
    "Severe Thunderstorm Watch": "Veille d'orage violent",
    "Flash Flood Warning": "Avertissement de crue soudaine",
    "Flash Flood Watch": "Veille de crue soudaine",
    "Flood Warning": "Avertissement d'inondation",
    "Flood Watch": "Veille d'inondation",
    "Winter Storm Warning": "Avertissement de tempête hivernale",
    "Winter Storm Watch": "Veille de tempête hivernale",
    "Blizzard Warning": "Avertissement de blizzard",
    "Blizzard Watch": "Veille de blizzard",
    "Freezing Rain Warning": "Avertissement de pluie verglacée",
    "Wind Warning": "Avertissement de vent",
    "High Wind Warning": "Avertissement de vent violent",
    "Rainfall Warning": "Avertissement de pluie",
    "Heat Warning": "Avertissement de chaleur",
    "Extreme Cold Warning": "Avertissement de froid extrême",
    "Special Weather Statement": "Bulletin météorologique spécial",
    "Dense Fog Advisory": "Avis de brouillard dense",
    "Freezing Fog Advisory": "Avis de brouillard givrant",
    "Smog Warning": "Avertissement de smog",
    "AMBER Alert": "Alerte AMBER",
    "Frost Advisory": "Avis de gel",
    "Freeze Warning": "Avis de gel",
    "Hard Freeze Warning": "Avis de gel dur",
    "Yellow Advisory - Frost": "Avis de gel",
    "Avis jaune - Gelée": "Avis de gel",
    "Avis jaune - Gel": "Avis de gel",
    "Avis de gelée": "Avis de gel",
    "Avis de gel": "Avis de gel",
    "Avertissement de gel": "Avis de gel",
    "Freeze Watch": "Veille de gel",
    "Hard Freeze Watch": "Veille de gel dur",
    "Frost Watch": "Veille de gel",
    "Ice Storm Warning": "Avertissement de tempête de verglas",
    "Hurricane Warning": "Avertissement d'ouragan",
    "Hurricane Watch": "Veille d'ouragan",
    "Tropical Storm Warning": "Avertissement de tempête tropicale",
    "Tropical Storm Watch": "Veille de tempête tropicale",
    "Tsunami Warning": "Avertissement de tsunami",
    "Wind Chill Warning": "Avertissement de refroidissement éolien",
    "Wind Chill Watch": "Veille de refroidissement éolien",
    "Extreme Heat Watch": "Veille de chaleur accablante",
    "Extreme Cold Watch": "Veille de froid extrême",
    "Air Quality Alert": "Alerte de qualité de l'air"
};

function getAlertDisplayNameFr(name) {
    if (!name) return "";
    var trimmed = String(name).trim();
    if (ALERT_NAME_FR_MAP[trimmed]) return ALERT_NAME_FR_MAP[trimmed];
    var lowered = trimmed.toLowerCase();
    var match = Object.keys(ALERT_NAME_FR_MAP).find(k => k.toLowerCase() === lowered);
    if (match) return ALERT_NAME_FR_MAP[match];

    if (lowered.includes("frost") || lowered.includes("gelée") || lowered.includes("gelee") || lowered.includes("gel") || lowered.includes("freeze")) {
        if (lowered.includes("watch") || lowered.includes("veille")) {
            return "Veille de gel";
        }
        return "Avis de gel";
    }
    return trimmed;
}

function translateAlertHeadline(text) {
    if (!text) return "";
    var fr = String(text);
    Object.keys(ALERT_NAME_FR_MAP).forEach(eng => {
        if (fr.toLowerCase().includes(eng.toLowerCase())) {
            var re = new RegExp(eng.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
            fr = fr.replace(re, ALERT_NAME_FR_MAP[eng]);
        }
    });

    fr = fr.replace(/\bAvis jaune\s*-\s*Gelée\b/gi, "Avis de gel")
           .replace(/\bAvis jaune\s*-\s*Gel\b/gi, "Avis de gel")
           .replace(/\bYellow Advisory\s*-\s*Frost\b/gi, "Avis de gel");

    fr = fr.replace(/\bfrom\b/gi, "de")
           .replace(/\buntil\b/gi, "à")
           .replace(/\bthrough\b/gi, "jusqu'à")
           .replace(/\bin effect\b/gi, "en vigueur")
           .replace(/\bMON\b/g, "LUN.")
           .replace(/\bTUE\b/g, "MAR.")
           .replace(/\bWED\b/g, "MER.")
           .replace(/\bTHU\b/g, "JEU.")
           .replace(/\bFRI\b/g, "VEN.")
           .replace(/\bSAT\b/g, "SAM.")
           .replace(/\bSUN\b/g, "DIM.")
           .replace(/\b(\d{1,2}):(\d{2})\s*PM\s*(EDT|EST|HAE|HNE)?\b/gi, (m, h, min, tz) => {
               var h24 = (parseInt(h, 10) % 12) + 12;
               return `${h24}h${min}${tz ? " " + (tz === "EDT" ? "HAE" : tz === "EST" ? "HNE" : tz) : ""}`;
           })
           .replace(/\b(\d{1,2}):(\d{2})\s*AM\s*(EDT|EST|HAE|HNE)?\b/gi, (m, h, min, tz) => {
               var h24 = parseInt(h, 10) % 12;
               return `${h24}h${min}${tz ? " " + (tz === "EDT" ? "HAE" : tz === "EST" ? "HNE" : tz) : ""}`;
           });
    return fr;
}

function formatAreaNameFr(area) {
    if (!area) return "";
    return String(area)
        .replace(/\bto\b/gi, "à")
        .replace(/\band\b/gi, "et")
        .replace(/\bthe\s+/gi, "")
        .replace(/\s+area\b/gi, "")
        .replace(/\s+vicinity\b/gi, "")
        .replace(/\s+county\b/gi, "")
        .trim();
}

function translateAlertText(text) {
    if (!text) return "";
    var t = String(text)
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
    if (!t) return "";

    // 1. Environment Canada & NWS boilerplate translations
    t = t.replace(/\bPlease continue to monitor alerts and forecasts issued by Environment Canada\b\.?/gi,
        "Veuillez continuer à surveiller les alertes et prévisions émises par Environnement Canada.");
    t = t.replace(/\bissued by Environment Canada\b/gi, "émises par Environnement Canada");
    t = t.replace(/\bissued by the National Weather Service\b/gi, "émises par le National Weather Service");
    t = t.replace(/\bTo report severe weather,\s*send an email to\s*([^\s]+)\s*or post reports on social media using\s*([#A-Za-z0-9_]+)\b\.?/gi,
        "Pour signaler du temps violent, envoyez un courriel à $1 ou publiez sur les réseaux sociaux avec $2.");
    t = t.replace(/\bTake preventative measures to protect cold-sensitive plants(?:,\s*trees,?\s*and\s*crops)?\b\.?/gi,
        "Prenez des mesures préventives pour protéger les plantes, arbres et cultures sensibles au froid.");
    t = t.replace(/\bCover up plants,\s*especially those in frost-prone areas\b\.?/gi,
        "Couvrez les plantes, particulièrement dans les zones propices au gel.");
    t = t.replace(/\bTake steps now to protect tender plants from the cold\b\.?/gi,
        "Prenez des mesures dès maintenant pour protéger les plantes délicates du froid.");
    t = t.replace(/\bDamage to plants,\s*trees,\s*and crops is possible\b\.?/gi,
        "Des dommages aux plantes, aux arbres et aux cultures sont possibles.");
    t = t.replace(/\bDamage to plants,\s*trees,\s*and crops is likely\b\.?/gi,
        "Des dommages aux plantes, aux arbres et aux cultures sont probables.");
    t = t.replace(/\bFrost and freeze conditions will kill crops,\s*other sensitive vegetation and possibly damage unprotected outdoor plumbing\b\.?/gi,
        "Les conditions de gel détruiront les cultures, la végétation sensible et pourraient endommager la tuyauterie extérieure non protégée.");
    t = t.replace(/\bwill kill crops and other sensitive vegetation\b/gi,
        "détruira les cultures et la végétation sensible");
    t = t.replace(/\bwill kill sensitive outdoor vegetation\b/gi,
        "détruira la végétation extérieure sensible");

    // 2. Frost and Freeze specific expressions
    t = t.replace(/\bTemperatures near or below zero with frost are forecast\b/gi, "Des températures près ou sous zéro avec du gel sont prévues");
    t = t.replace(/\bTemperatures near or below zero\b/gi, "Des températures près ou sous zéro");
    t = t.replace(/\bTemperatures near or below freezing\b/gi, "Des températures près ou sous le point de congélation");
    t = t.replace(/\bnear or below zero\b/gi, "près ou sous zéro");
    t = t.replace(/\bnear or below freezing\b/gi, "près ou sous le point de congélation");
    t = t.replace(/\bat or below zero\b/gi, "à ou sous zéro");
    t = t.replace(/\bat or below freezing\b/gi, "au point ou sous le point de congélation");
    t = t.replace(/\bwith frost are forecast\b/gi, "avec du gel sont prévues");
    t = t.replace(/\bwith frost is forecast\b/gi, "avec du gel est prévu");
    t = t.replace(/\bare forecast\b/gi, "sont prévues");
    t = t.replace(/\bis forecast\b/gi, "est prévu");
    t = t.replace(/\bare expected\b/gi, "sont prévues");
    t = t.replace(/\bis expected\b/gi, "est prévu");
    t = t.replace(/\bovernight tonight\b/gi, "la nuit prochaine");
    t = t.replace(/\bPatchy frost will return\b/gi, "Du gel par endroits sera de retour");
    t = t.replace(/\bPatchy frost may return\b/gi, "Du gel par endroits pourrait être de retour");
    t = t.replace(/\bPatchy frost is expected\b/gi, "Du gel par endroits est prévu");
    t = t.replace(/\bPatchy frost\b/gi, "Gel dispersé");
    t = t.replace(/\bFrost may return\b/gi, "Le gel pourrait être de retour");
    t = t.replace(/\bFrost will return\b/gi, "Le gel sera de retour");
    t = t.replace(/\bFrost is expected\b/gi, "Du gel est prévu");
    t = t.replace(/\bWidespread frost\b/gi, "Gel généralisé");
    t = t.replace(/\bKilling frost\b/gi, "Gel destructeur");
    t = t.replace(/\bHard freeze\b/gi, "Gel sévère");
    t = t.replace(/\bFreeze conditions\b/gi, "Conditions de gel");
    t = t.replace(/\bFrost conditions\b/gi, "Conditions de gel");
    t = t.replace(/\bFrost and freeze conditions\b/gi, "Conditions de gel");
    t = t.replace(/\bwill return\b/gi, "sera de retour");
    t = t.replace(/\bmay return\b/gi, "pourrait être de retour");
    t = t.replace(/\bto some areas\b/gi, "dans certains secteurs");
    t = t.replace(/\bin some areas\b/gi, "dans certains secteurs");
    t = t.replace(/\bacross the area\b/gi, "à travers la région");
    t = t.replace(/\bacross the region\b/gi, "à travers la région");
    t = t.replace(/\bin low-lying areas\b/gi, "dans les vallées et bas secteurs");
    t = t.replace(/\bcold-sensitive plants\b/gi, "plantes sensibles au froid");
    t = t.replace(/\btender plants\b/gi, "plantes délicates");
    t = t.replace(/\bfrost-prone areas\b/gi, "zones propices au gel");
    t = t.replace(/\bsensitive vegetation\b/gi, "végétation sensible");
    t = t.replace(/\bsub-freezing temperatures\b/gi, "températures sous le point de congélation");
    t = t.replace(/\bfreezing temperatures\b/gi, "températures sous le point de congélation");
    t = t.replace(/\bnear freezing temperatures\b/gi, "températures près du point de congélation");
    t = t.replace(/\bbelow freezing\b/gi, "sous le point de congélation");
    t = t.replace(/\bnear freezing\b/gi, "près du point de congélation");

    // 3. Days of week and time periods
    t = t.replace(/\bThursday morning\b/gi, "jeudi matin")
         .replace(/\bFriday morning\b/gi, "vendredi matin")
         .replace(/\bSaturday morning\b/gi, "samedi matin")
         .replace(/\bSunday morning\b/gi, "dimanche matin")
         .replace(/\bMonday morning\b/gi, "lundi matin")
         .replace(/\bTuesday morning\b/gi, "mardi matin")
         .replace(/\bWednesday morning\b/gi, "mercredi matin")
         .replace(/\bThursday night\b/gi, "jeudi soir")
         .replace(/\bFriday night\b/gi, "vendredi soir")
         .replace(/\bSaturday night\b/gi, "samedi soir")
         .replace(/\bSunday night\b/gi, "dimanche soir")
         .replace(/\bMonday night\b/gi, "lundi soir")
         .replace(/\bTuesday night\b/gi, "mardi soir")
         .replace(/\bWednesday night\b/gi, "mercredi soir")
         .replace(/\btonight\b/gi, "cette nuit")
         .replace(/\bovernight\b/gi, "durant la nuit")
         .replace(/\btomorrow morning\b/gi, "demain matin")
         .replace(/\bearly morning\b/gi, "tôt le matin")
         .replace(/\blate tonight\b/gi, "tard cette nuit");

    if (typeof translateWeatherNarrative === "function") {
        t = translateWeatherNarrative(t);
    }
    return t;
}

window.getAlertDisplayNameFr = getAlertDisplayNameFr;
window.translateAlertHeadline = translateAlertHeadline;
window.formatAreaNameFr = formatAreaNameFr;
window.translateAlertText = translateAlertText;

function normalizeDisasterAlertName(typeOrName) {
    if (!typeOrName) {
        return null;
    }

    var raw = String(typeOrName).trim();
    if (!raw) {
        return null;
    }

    if (warningSettings[raw]) {
        return raw;
    }

    var lowered = raw.toLowerCase();
    if (ALERT_TYPE_ALIASES[lowered]) {
        return ALERT_TYPE_ALIASES[lowered];
    }

    var allNames = Object.keys(warningSettings);
    for (let i = 0; i < allNames.length; i++) {
        if (allNames[i].toLowerCase() === lowered) {
            return allNames[i];
        }
    }

    return null;
}

function getDisasterAlertCatalog() {
    var names = Object.keys(warningSettings).filter((name) => {
        var rule = warningSettings[name];
        if (!rule || rule.included !== true) {
            return false;
        }
        return name.endsWith("Warning") || name.startsWith("Alerte") || name.startsWith("Avertissement") || name.startsWith("Veille") || name.endsWith("Advisory") || name.endsWith("Watch") || name.includes("Statement") || name.includes("spécial");
    });

    names.sort((a, b) => {
        var ap = warningSettings[a] ? warningSettings[a].priority : 999;
        var bp = warningSettings[b] ? warningSettings[b].priority : 999;
        return ap - bp;
    });
    return names;
}

function buildTestBulletinAlert(name, index, expiresAt) {
    var rule = warningSettings[name] || { priority: 125, severe: false };
    var frName = getAlertDisplayNameFr(name);
    var city = (locationConfig.mainCity && (locationConfig.mainCity.displayname || locationConfig.mainCity.name)) || "Montréal";
    return {
        name: frName,
        significance: "W",
        cityName: city,
        areas: [city],
        headline: `${frName} — En vigueur pour la région`,
        areaText: `Secteur : ${city} (Message de test)`,
        description: `CECI EST UN MESSAGE DE TEST pour ${frName.toUpperCase()}. Ceci est un exercice de simulation du système d'alerte météo IntelliSTAR pour la région de ${city}. Aucune mesure n'est nécessaire.`,
        desc: `${frName} — Message de test`,
        detailKey: `test-${name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${index}`,
        severity: rule.severe ? "Severe" : "Moderate",
        priority: rule.priority,
        color: rule.color || (rule.severe ? 'red' : 'yellow'),
        severe: !!rule.severe,
        expiresAt: expiresAt || null
    };
}

function buildTestCrawlAlert(name, expiresAt) {
    var rule = warningSettings[name] || { priority: 125, severe: false };
    var frName = getAlertDisplayNameFr(name);
    var city = (locationConfig.mainCity && (locationConfig.mainCity.displayname || locationConfig.mainCity.name)) || "Montréal";
    return {
        name: frName,
        code: "TEST",
        type: "Alert",
        significance: "W",
        cityName: city,
        areas: [city],
        areaText: `Secteur : ${city} (Message de test)`,
        description: `CECI EST UN MESSAGE DE TEST POUR ${frName.toUpperCase()}. CECI EST UN EXERCICE DE SIMULATION DU SYSTÈME D'ALERTE MÉTÉO INTELLISTAR POUR LA RÉGION DE ${city.toUpperCase()}. AUCUNE MESURE N'EST NÉCESSAIRE.`,
        severe: !!rule.severe,
        priority: rule.priority,
        detailKey: `crawl-test-${name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`,
        expiresAt: expiresAt || null
    };
}

function clearActiveAlerts() {
    if (weatherInfo && weatherInfo.bulletin) {
        weatherInfo.bulletin.alerts = [];
        weatherInfo.bulletin.enabled = false;
        if (weatherInfo.bulletin.crawlAlert) {
            weatherInfo.bulletin.crawlAlert.enabled = false;
            weatherInfo.bulletin.crawlAlert.alert = undefined;
        }
    }
    if (weatherInfo && weatherInfo.specialModes) {
        weatherInfo.specialModes.bulletin = false;
    }
    if (typeof endAlertCrawl === "function") {
        endAlertCrawl();
    }
    if (typeof refreshSlidesForAlertTest === "function") {
        refreshSlidesForAlertTest();
    }
}
window.clearActiveAlerts = clearActiveAlerts;

function applyAlertTestSet(alertNames, includeCrawl, expiresAt) {
    clearActiveAlerts();

    if (!Array.isArray(alertNames) || alertNames.length === 0) {
        return;
    }

    var selectedNames = alertNames.filter((name) => warningSettings[name]);
    if (selectedNames.length === 0) {
        return;
    }

    weatherInfo.bulletin.enabled = true;
    weatherInfo.specialModes.bulletin = true;

    var crawlName = null;
    if (includeCrawl) {
        crawlName = selectedNames.find((name) => warningSettings[name] && warningSettings[name].severe) || selectedNames[0];
        weatherInfo.bulletin.crawlAlert.enabled = true;
        weatherInfo.bulletin.crawlAlert.alert = buildTestCrawlAlert(crawlName, expiresAt);
        setTimeout(startAlertCrawl, 150);
    } else {
        endAlertCrawl();
    }

    var alerts = [];
    for (let i = 0; i < selectedNames.length; i++) {
        alerts.push(buildTestBulletinAlert(selectedNames[i], i, expiresAt));
    }

    weatherInfo.bulletin.alerts = alerts.sort((a, b) => a.priority - b.priority);
    markFeedSuccess("alerts");
}

function getRuntimeAlertTestState() {
    if (!alertTestRuntime.initialized) {
        var config = (typeof alertTestSettings === "object" && alertTestSettings) ? alertTestSettings : {};
        alertTestRuntime.enabled = !!config.enabled;
        alertTestRuntime.mode = (config.mode || "off").toLowerCase();
        alertTestRuntime.disasterType = config.disasterType || "";
        alertTestRuntime.includeCrawl = config.includeCrawl !== false;
        var duration = Number(config.duration || 0);
        alertTestRuntime.duration = duration;
        alertTestRuntime.expiresAt = (alertTestRuntime.enabled && duration > 0) ? (Date.now() + duration * 1000) : null;

        try {
            var params = new URLSearchParams(window.location.search || "");
            if (params.has("alertTest")) {
                var requested = (params.get("alertTest") || "").trim().toLowerCase();
                if (requested === "off") {
                    alertTestRuntime.enabled = false;
                    alertTestRuntime.mode = "off";
                } else if (requested === "all") {
                    alertTestRuntime.enabled = true;
                    alertTestRuntime.mode = "all";
                } else if (requested === "quebec" || requested === "quebec-en-alerte") {
                    alertTestRuntime.enabled = true;
                    alertTestRuntime.mode = "quebec";
                } else if (requested) {
                    alertTestRuntime.enabled = true;
                    alertTestRuntime.mode = "single";
                    alertTestRuntime.disasterType = requested;
                }
            }

            if (params.has("alertTestCrawl")) {
                var crawlRaw = (params.get("alertTestCrawl") || "").toLowerCase();
                alertTestRuntime.includeCrawl = crawlRaw !== "0" && crawlRaw !== "false" && crawlRaw !== "no";
            }

            if (params.has("alertTestDuration") || params.has("alertDuration") || params.has("duration")) {
                var dVal = Number(params.get("alertTestDuration") || params.get("alertDuration") || params.get("duration") || 0);
                if (dVal > 0) {
                    alertTestRuntime.duration = dVal;
                    alertTestRuntime.expiresAt = Date.now() + dVal * 1000;
                }
            }
        } catch (error) {
            console.warn("Failed to parse alert test URL params:", error);
        }

        alertTestRuntime.initialized = true;
    }

    return alertTestRuntime;
}

function applyAlertTestModeIfNeeded() {
    var state = getRuntimeAlertTestState();
    if (!state.enabled || state.mode === "off") {
        return false;
    }

    if (state.expiresAt && state.expiresAt <= Date.now()) {
        console.log('[Alerts] Test alert duration expired. Clearing alert test.');
        state.enabled = false;
        state.mode = "off";
        state.expiresAt = null;
        clearActiveAlerts();
        return false;
    }

    if (state.mode === "all") {
        applyAlertTestSet(getDisasterAlertCatalog(), state.includeCrawl, state.expiresAt);
        return true;
    }

    if (state.mode === "quebec") {
        applyAlertTestSet(QUEBEC_ALERT_TYPES, state.includeCrawl, state.expiresAt);
        return true;
    }

    if (state.mode === "single") {
        var normalized = normalizeDisasterAlertName(state.disasterType);
        if (!normalized) {
            console.warn(`Unknown alert test type '${state.disasterType}'. Falling back to live alerts.`);
            return false;
        }
        applyAlertTestSet([normalized], state.includeCrawl, state.expiresAt);
        return true;
    }

    return false;
}

function refreshSlidesForAlertTest() {
    if (typeof flavorPicker === "function") {
        slideFlavor = flavorPicker(slideSettings.flavor, {
            bulletin: weatherInfo.specialModes.bulletin,
            precip: weatherInfo.specialModes.precip
        });
        if (slideFlavor && Array.isArray(slideFlavor.order) && slideFlavor.order.length > 0) {
            if (typeof idx !== "undefined" && idx >= slideFlavor.order.length) {
                idx = 0;
                nidx = 1 % slideFlavor.order.length;
            }
        }
    }
}

function setAlertTestState(nextState) {
    var state = getRuntimeAlertTestState();
    state.enabled = !!nextState.enabled;
    state.mode = nextState.mode || "off";
    state.disasterType = nextState.disasterType || "";
    state.includeCrawl = nextState.includeCrawl !== false;
    var duration = Number(nextState.duration !== undefined ? nextState.duration : state.duration) || 0;
    state.duration = duration;
    state.expiresAt = (state.enabled && duration > 0) ? (Date.now() + duration * 1000) : null;
}

window.alertTest = {
    listTypes: function () {
        var catalog = getDisasterAlertCatalog();
        console.log("Available disaster alert test types:", catalog);
        return catalog;
    },
    trigger: async function (typeOrName, options) {
        var name = normalizeDisasterAlertName(typeOrName);
        if (!name) {
            console.warn(`Unknown alert type '${typeOrName}'. Use alertTest.listTypes() to see valid values.`);
            return false;
        }
        var duration = (options && options.duration) || 0;
        setAlertTestState({
            enabled: true,
            mode: "single",
            disasterType: name,
            includeCrawl: !(options && options.includeCrawl === false),
            duration: duration
        });
        await grabAlerts();
        refreshSlidesForAlertTest();
        return true;
    },
    triggerAll: async function (options) {
        var duration = (options && options.duration) || 0;
        setAlertTestState({
            enabled: true,
            mode: "all",
            includeCrawl: !(options && options.includeCrawl === false),
            duration: duration
        });
        await grabAlerts();
        refreshSlidesForAlertTest();
        return true;
    },
    triggerQuebec: async function (options) {
        var duration = (options && options.duration) || 0;
        setAlertTestState({
            enabled: true,
            mode: "quebec",
            includeCrawl: !(options && options.includeCrawl === false),
            duration: duration
        });
        await grabAlerts();
        refreshSlidesForAlertTest();
        return true;
    },
    clear: async function () {
        setAlertTestState({ enabled: false, mode: "off", disasterType: "", includeCrawl: true, duration: 0 });
        clearActiveAlerts();
        await grabAlerts();
        refreshSlidesForAlertTest();
        return true;
    },
    status: function () {
        return { ...getRuntimeAlertTestState() };
    },
    help: function () {
        console.log("alertTest.trigger('tornado', { duration: 60 })");
        console.log("alertTest.trigger('Alerte de tornade')");
        console.log("alertTest.triggerAll({ duration: 60 })");
        console.log("alertTest.triggerQuebec({ duration: 60 })");
        console.log("alertTest.clear()");
        console.log("URL params: ?alertTest=tornado | ?alertTest=all | ?alertTest=quebec | ?alertTestCrawl=false | ?duration=60");
    }
};

window.triggerAlertTest = window.alertTest.trigger;
window.triggerQuebecAlerteTest = window.alertTest.triggerQuebec;

function getAlertExpiryTimestamp(alert, detail) {
    var rawUtc = (alert && (alert.expireTimeUTC || alert.endTimeUTC)) ||
                 (detail && (detail.expireTimeUTC || detail.endTimeUTC));
    if (rawUtc !== undefined && rawUtc !== null && rawUtc !== "" && Number.isFinite(Number(rawUtc))) {
        var num = Number(rawUtc);
        return num > 1e11 ? num : num * 1000;
    }

    var rawLocal = (alert && (alert.expireTimeLocal || alert.endTimeLocal)) ||
                   (detail && (detail.expireTimeLocal || detail.endTimeLocal));
    if (rawLocal) {
        var parsed = Date.parse(rawLocal);
        if (!isNaN(parsed)) {
            return parsed;
        }
    }
    return null;
}

function isAlertExpired(alert, detail, referenceTime) {
    if (!alert) return true;
    var now = referenceTime || Date.now();

    var msgType = String((alert && alert.messageType) || (detail && detail.messageType) || "").toLowerCase();
    if (msgType === "cancel" || msgType === "cancellation") {
        return true;
    }
    var msgCode = (alert && alert.messageTypeCode) || (detail && detail.messageTypeCode);
    if (msgCode === 5) {
        return true;
    }

    var expiry = getAlertExpiryTimestamp(alert, detail);
    if (expiry !== null && expiry <= now) {
        return true;
    }

    var endUtc = (alert && alert.endTimeUTC) || (detail && detail.endTimeUTC);
    if (endUtc !== undefined && endUtc !== null && endUtc !== "" && Number.isFinite(Number(endUtc))) {
        var endMs = Number(endUtc) > 1e11 ? Number(endUtc) : Number(endUtc) * 1000;
        if (endMs <= now) {
            return true;
        }
    }

    return false;
}

let alertExpirationCheckInterval = null;
function checkAlertExpiration() {
    var now = Date.now();

    var testState = (typeof getRuntimeAlertTestState === "function") ? getRuntimeAlertTestState() : null;
    if (testState && testState.enabled && testState.expiresAt && testState.expiresAt <= now) {
        console.log('[Alerts] Test alert duration expired. Automatically clearing alert test.');
        testState.enabled = false;
        testState.mode = "off";
        testState.expiresAt = null;
        clearActiveAlerts();
        return;
    }

    if (!weatherInfo || !weatherInfo.bulletin) return;
    var alerts = weatherInfo.bulletin.alerts;

    if (Array.isArray(alerts) && alerts.length > 0) {
        var unexpired = alerts.filter(function(alert) {
            if (!alert.expiresAt) return true;
            return alert.expiresAt > now;
        });

        if (unexpired.length !== alerts.length) {
            console.log(`[Alerts] Expired alert detected! Pruning ${alerts.length - unexpired.length} expired alert(s). Remaining: ${unexpired.length}`);
            weatherInfo.bulletin.alerts = unexpired;

            if (unexpired.length === 0) {
                console.log('[Alerts] All weather alerts have expired. Clearing active alerts and ending crawl.');
                clearActiveAlerts();
            } else {
                var topAlert = unexpired[0];
                var currentCrawl = weatherInfo.bulletin.crawlAlert.alert;
                if (!currentCrawl || currentCrawl.detailKey !== topAlert.detailKey || (currentCrawl.expiresAt && currentCrawl.expiresAt <= now)) {
                    console.log(`[Alerts] Updating active crawl banner to next remaining alert: "${topAlert.name}"`);
                    weatherInfo.bulletin.crawlAlert.enabled = true;
                    weatherInfo.bulletin.crawlAlert.alert = {
                        name: topAlert.name,
                        code: topAlert.significance,
                        type: "Alert",
                        significance: topAlert.significance,
                        description: topAlert.description || topAlert.headline,
                        severe: topAlert.severe,
                        priority: topAlert.priority,
                        color: topAlert.color,
                        detailKey: topAlert.detailKey,
                        expiresAt: topAlert.expiresAt,
                        cityName: topAlert.cityName,
                        areas: topAlert.areas,
                        areaText: topAlert.areaText
                    };
                    startAlertCrawl();
                }
                if (typeof refreshSlidesForAlertTest === "function") {
                    refreshSlidesForAlertTest();
                }
            }
        }
    } else if (weatherInfo.bulletin.crawlAlert && weatherInfo.bulletin.crawlAlert.alert) {
        var crawlAlert = weatherInfo.bulletin.crawlAlert.alert;
        if (crawlAlert.expiresAt && crawlAlert.expiresAt <= now) {
            console.log(`[Alerts] Crawl alert "${crawlAlert.name}" expired. Ending crawl.`);
            clearActiveAlerts();
        }
    }
}

function startAlertExpirationMonitor() {
    if (window._alertExpirationMonitorStarted) return;
    window._alertExpirationMonitorStarted = true;
    if (alertExpirationCheckInterval) clearInterval(alertExpirationCheckInterval);
    alertExpirationCheckInterval = setInterval(checkAlertExpiration, 1000);
}

window.getAlertExpiryTimestamp = getAlertExpiryTimestamp;
window.isAlertExpired = isAlertExpired;
window.checkAlertExpiration = checkAlertExpiration;
window.startAlertExpirationMonitor = startAlertExpirationMonitor;

let lastProcessedAlertCommandId = 0;
function startAlertCommandListener() {
    if (window._alertCommandListenerStarted) return;
    window._alertCommandListenerStarted = true;
    setInterval(async () => {
        try {
            const res = await fetch('/api/alert');
            if (!res.ok) return;
            const data = await res.json();
            if (!data || !data.id || data.id === lastProcessedAlertCommandId) return;

            lastProcessedAlertCommandId = data.id;
            console.log(`[Alert API] Executing remote command: ${data.action} (${data.type || 'none'})`);

            if (data.action === 'trigger' && data.type) {
                await window.alertTest.trigger(data.type, { includeCrawl: data.includeCrawl, duration: data.duration });
            } else if (data.action === 'quebec') {
                await window.alertTest.triggerQuebec({ includeCrawl: data.includeCrawl, duration: data.duration });
            } else if (data.action === 'all') {
                await window.alertTest.triggerAll({ includeCrawl: data.includeCrawl, duration: data.duration });
            } else if (data.action === 'clear') {
                await window.alertTest.clear();
            }
        } catch (e) {}
    }, 2000);
}
startAlertCommandListener();
startAlertExpirationMonitor();

window.isWeatherDataReady = false;
let _resolveWeatherDataReady = null;
window.weatherDataReadyPromise = new Promise((resolve) => {
    _resolveWeatherDataReady = resolve;
});
function markWeatherDataReady() {
    window.isWeatherDataReady = true;
    if (_resolveWeatherDataReady) {
        _resolveWeatherDataReady(true);
        _resolveWeatherDataReady = null;
    }
}

var isDataGrabInProgress = false;
async function grabData() {
    if (isDataGrabInProgress) {
        return;
    }
    var fetchIntervalMs = getFetchIntervalMs();
    if (dataRefreshState.lastFetchAttempt && Date.now() - dataRefreshState.lastFetchAttempt < fetchIntervalMs) {
        return;
    }
    isDataGrabInProgress = true;
    dataRefreshState.lastFetchAttempt = Date.now();

    try {
        const isBooting = (typeof slidesRunning === 'undefined' || !slidesRunning);
        if (isBooting && typeof setBootStatus === 'function') {
            setBootStatus("Récupération des données météo pour le Québec...");
            $("#startbutton").css("opacity", "0.5");
            $("#startbutton").css("pointer-events", "none");
        }

        if (isBooting) {
            weatherInfo.specialModes.bulletin = false;
            weatherInfo.specialModes.precip = false;
        }
        var now = Date.now();
        const safeFetch = (fn, name) => Promise.resolve().then(() => fn()).catch((err) => console.warn(`[Weather] ${name} failed:`, err));
        await Promise.all([
            safeFetch(grabCC, "grabCC"),
            safeFetch(grabNearbyCC, "grabNearbyCC"),
            safeFetch(grabRegionalForecasts, "grabRegionalForecasts"),
            safeFetch(grabCanadaCities, "grabCanadaCities"),
            safeFetch(grabQuebecCities, "grabQuebecCities"),
            safeFetch(grabQuebecWeekAhead, "grabQuebecWeekAhead"),
            safeFetch(grabResortCities, "grabResortCities"),
            safeFetch(grabLocalForecast, "grabLocalForecast"),
            safeFetch(grabMonthlyPrecip, "grabMonthlyPrecip"),
            safeFetch(grabAirQuality, "grabAirQuality"),
            safeFetch(grabAlmanac, "grabAlmanac"),
            safeFetch(grabDaypartForecast, "grabDaypartForecast"),
            safeFetch(grabOutdoorActivityData, "grabOutdoorActivityData"),
            safeFetch(grabMapCityData, "grabMapCityData"),
            safeFetch(grabAlerts, "grabAlerts")
        ]);
        if (typeof window.refreshRadarFrames === "function") {
            if (isBooting) {
                if (typeof setBootStatus === 'function') {
                    setBootStatus("Préchauffage des cartes et radars Doppler...");
                }
                await window.refreshRadarFrames();
            } else {
                // Background refresh: execute quietly without stalling the active presentation
                window.refreshRadarFrames().catch((err) => console.warn('[Radar] Background refresh error:', err));
            }
        }
        console.log(`Weather grab done in ${Date.now() - now}ms`);
        console.log(weatherInfo);
        if (isBooting && typeof setBootStatus === 'function') {
            setBootStatus("Données prêtes. Initialisation de la présentation...");
        }
        markWeatherDataReady();
        
        slideFlavor = flavorPicker(slideSettings.flavor, {bulletin: weatherInfo.specialModes.bulletin, precip: weatherInfo.specialModes.precip});
        if (isBooting) {
            if (slideFlavor && Array.isArray(slideFlavor.order) && slideFlavor.order.length > 0) {
                if (typeof idx !== "undefined" && idx >= slideFlavor.order.length) {
                    idx = 0;
                    nidx = 1 % slideFlavor.order.length;
                }
            }
            setTimeout(() => {
                $("#startbutton").css("opacity", "");
                $("#startbutton").css("pointer-events", "");
            }, 100);
        }
    } catch (err) {
        console.error("[Weather] Error in grabData:", err);
        markWeatherDataReady();
    } finally {
        isDataGrabInProgress = false;
    }
}
async function grabCC() {
    return $.getJSON("https://api.weather.com/v3/wx/observations/current?geocode=" + locationConfig.mainCity.lat + "," + locationConfig.mainCity.lon + "&units=" + getUnits() + "&language=en-US&format=json&apiKey=" + api_key, function (data) {
        var rawCond = (data.wxPhraseLong || "").replace("Showers in the Vicinity", "Showers Nearby").replace("/Wind", ", Windy").replace("Thunder in the Vicinity", "Thunder");
        weatherInfo.currentConditions.cond = translateWeatherNarrative(rawCond);
        weatherInfo.currentConditions.gusts = ((data.windGust != null || data.windGust != undefined) ? data.windGust : "Aucune");
        weatherInfo.currentConditions.humidity = data.relativeHumidity + "%";
        weatherInfo.currentConditions.icon = data.iconCodeExtend;
        weatherInfo.currentConditions.pressure.trend = data.pressureTendencyTrend;
        weatherInfo.currentConditions.pressure.val = data.pressureAltimeter ? (isMetric() ? (data.pressureAltimeter > 500 ? (data.pressureAltimeter / 10).toFixed(1) : data.pressureAltimeter.toFixed(1)) : data.pressureAltimeter.toFixed(2)) : "";
        weatherInfo.currentConditions.temp = data.temperature;
        weatherInfo.currentConditions.dewpoint = data.temperatureDewPoint;
        weatherInfo.currentConditions.wind = ((data.windDirectionCardinal == "CALM" || data.windSpeed == 0 || data.windDirectionCardinal == undefined) ? "Calme" : translateWindCardinal(data.windDirectionCardinal) + " " + data.windSpeed);
        weatherInfo.currentConditions.visibility = data.visibility;
        weatherInfo.currentConditions.noReport = false;

        if (data.temperatureFeelsLike != null && data.temperatureFeelsLike !== undefined) {
            weatherInfo.currentConditions.feelslike.type = "Ressenti";
            weatherInfo.currentConditions.feelslike.val = data.temperatureFeelsLike;
        } else if (data.temperatureHeatIndex > data.temperature + 3) {
            weatherInfo.currentConditions.feelslike.type = "Indice humidex";
            weatherInfo.currentConditions.feelslike.val = data.temperatureHeatIndex;
        } else if (data.temperatureWindChill < data.temperature - 3) {
            weatherInfo.currentConditions.feelslike.type = "Refroid. éolien";
            weatherInfo.currentConditions.feelslike.val = data.temperatureWindChill;
        } else {
            weatherInfo.currentConditions.feelslike.type = "Ressenti";
            weatherInfo.currentConditions.feelslike.val = data.temperature;
        }
    }).fail(function () {
        weatherInfo.currentConditions.noReport = true;
    })
}

function extractAggWeatherItem(configItem, ajaxedLoc) {
    var obs = (ajaxedLoc && ajaxedLoc["v3-wx-observations-current"]) || {};
    var fcst = (ajaxedLoc && ajaxedLoc["v3-wx-forecast-daily-5day"]) || {};

    var high = (fcst.calendarDayTemperatureMax && fcst.calendarDayTemperatureMax[0] != null)
        ? fcst.calendarDayTemperatureMax[0]
        : ((fcst.temperatureMax && fcst.temperatureMax[0] != null)
            ? fcst.temperatureMax[0]
            : ((fcst.temperatureMax && fcst.temperatureMax[1] != null) ? fcst.temperatureMax[1] : ""));
    var low = (fcst.calendarDayTemperatureMin && fcst.calendarDayTemperatureMin[0] != null)
        ? fcst.calendarDayTemperatureMin[0]
        : ((fcst.temperatureMin && fcst.temperatureMin[0] != null) ? fcst.temperatureMin[0] : "");
    if (high === "" && fcst.daypart && fcst.daypart[0] && fcst.daypart[0].temperature) {
        high = fcst.daypart[0].temperature[0] != null ? fcst.daypart[0].temperature[0] : (fcst.daypart[0].temperature[2] != null ? fcst.daypart[0].temperature[2] : "");
    }
    if (low === "" && fcst.daypart && fcst.daypart[0] && fcst.daypart[0].temperature) {
        low = fcst.daypart[0].temperature[1] != null ? fcst.daypart[0].temperature[1] : (fcst.daypart[0].temperature[3] != null ? fcst.daypart[0].temperature[3] : "");
    }

    var rawObsCond = obs.wxPhraseLong ? obs.wxPhraseLong.replace("Showers in the Vicinity", "Showers Nearby").replace("/Wind", ", Windy").replace("Thunder in the Vicinity", "Thunder") : "";

    var windDir = (obs.windDirectionCardinal == "CALM" || obs.windSpeed === 0 || !obs.windDirectionCardinal) ? "Calme" : translateWindCardinal(obs.windDirectionCardinal);
    var windStr = (windDir === "Calme" || obs.windSpeed === 0 || obs.windSpeed == null) ? "Calme" : `${windDir} ${obs.windSpeed}`.trim();
    var feelsVal = obs.temperatureFeelsLike != null ? obs.temperatureFeelsLike : (obs.temperatureHeatIndex != null ? obs.temperatureHeatIndex : (obs.temperatureWindChill != null ? obs.temperatureWindChill : obs.temperature));
    var feelsType = "Ressenti";
    if (obs.temperatureHeatIndex != null && obs.temperature != null && obs.temperatureHeatIndex > obs.temperature + 2) {
        feelsType = "Indice humidex";
    } else if (obs.temperatureWindChill != null && obs.temperature != null && obs.temperatureWindChill < obs.temperature - 2) {
        feelsType = "Refroid. éolien";
    }
    var pressureVal = obs.pressureAltimeter ? (isMetric() ? (obs.pressureAltimeter > 500 ? (obs.pressureAltimeter / 10).toFixed(1) : obs.pressureAltimeter.toFixed(1)) : obs.pressureAltimeter.toFixed(2)) : "";

    return {
        name: configItem.name || "",
        province: configItem.province || "",
        region: configItem.region || configItem.province || "",
        city: configItem.city || configItem.name || "",
        temp: obs.temperature != null ? obs.temperature : "",
        high: high !== "" && high != null ? high : "",
        low: low !== "" && low != null ? low : "",
        icon: obs.iconCodeExtend != null ? obs.iconCodeExtend : (obs.iconCode != null ? obs.iconCode : 4400),
        cond: translateWeatherNarrative(rawObsCond),
        wind: windStr,
        windRaw: { direction: windDir, speed: obs.windSpeed },
        gusts: (obs.windGust != null && obs.windGust !== 0 && obs.windGust !== "None" && obs.windGust !== "Aucune") ? obs.windGust : "",
        humidity: (obs.relativeHumidity != null && obs.relativeHumidity !== "") ? (String(obs.relativeHumidity).replace("%", "") + "%") : "",
        feelslike: { type: feelsType, val: (feelsVal != null && feelsVal !== "") ? feelsVal : "" },
        dewpoint: (obs.temperatureDewPoint != null && obs.temperatureDewPoint !== "") ? obs.temperatureDewPoint : "",
        pressure: { val: pressureVal, trend: obs.pressureTendencyTrend || "" },
        visibility: (obs.visibility != null && obs.visibility !== "") ? obs.visibility : ""
    };
}

async function fetchAggCommonBatch(items, mappingFn) {
    if (!items || items.length === 0) return [];
    var results = [];
    var chunkSize = 15;
    for (var i = 0; i < items.length; i += chunkSize) {
        var chunk = items.slice(i, i + chunkSize);
        var geocodes = chunk.map(item => item.val).filter(Boolean).join(";");
        if (!geocodes) continue;
        var url = "https://api.weather.com/v3/aggcommon/v3-wx-observations-current;v3-wx-forecast-daily-5day?geocodes=" + geocodes + "&language=en-US&units=" + getUnits() + "&format=json&apiKey=" + api_key;
        try {
            var data = await $.getJSON(url);
            if (Array.isArray(data)) {
                data.forEach((ajaxedLoc, idx) => {
                    var originalItem = chunk[idx];
                    if (originalItem) {
                        results.push(mappingFn(originalItem, ajaxedLoc));
                    }
                });
            }
        } catch (err) {
            console.warn("[Weather] Batch aggcommon fetch failed for chunk:", err);
        }
    }
    return results;
}

async function grabRegionalForecasts() {
    weatherInfo.regionalForecasts.regions = [];
    if (!locationConfig.regionalForecasts || locationConfig.regionalForecasts.length === 0) {
        weatherInfo.regionalForecasts.noReport = true;
        return;
    }
    weatherInfo.regionalForecasts.noReport = false;
    try {
        var results = await fetchAggCommonBatch(locationConfig.regionalForecasts, (item, ajaxed) => extractAggWeatherItem(item, ajaxed));
        weatherInfo.regionalForecasts.regions = results;
        weatherInfo.regionalForecasts.noReport = results.length === 0;
    } catch (e) {
        weatherInfo.regionalForecasts.noReport = true;
    }
}

async function grabCanadaCities() {
    weatherInfo.canadaCities.cities = [];
    if (!locationConfig.canadaCities || locationConfig.canadaCities.length === 0) {
        weatherInfo.canadaCities.noReport = true;
        return;
    }
    weatherInfo.canadaCities.noReport = false;
    try {
        var results = await fetchAggCommonBatch(locationConfig.canadaCities, (item, ajaxed) => extractAggWeatherItem(item, ajaxed));
        weatherInfo.canadaCities.cities = results;
        weatherInfo.canadaCities.noReport = results.length === 0;
    } catch (e) {
        weatherInfo.canadaCities.noReport = true;
    }
}

async function grabQuebecCities() {
    weatherInfo.quebecCities.cities = [];
    if (!locationConfig.quebecCities || locationConfig.quebecCities.length === 0) {
        weatherInfo.quebecCities.noReport = true;
        return;
    }
    weatherInfo.quebecCities.noReport = false;
    try {
        var results = await fetchAggCommonBatch(locationConfig.quebecCities, (item, ajaxed) => extractAggWeatherItem(item, ajaxed));
        weatherInfo.quebecCities.cities = results;
        weatherInfo.quebecCities.noReport = results.length === 0;
    } catch (e) {
        weatherInfo.quebecCities.noReport = true;
    }
}

function extract7DayOutlookItem(configItem, ajaxedLoc) {
    var fcst = (ajaxedLoc && ajaxedLoc["v3-wx-forecast-daily-7day"]) || {};
    var days = [];
    if (!fcst || !Array.isArray(fcst.dayOfWeek)) {
        return { name: configItem.name || "", region: configItem.region || "", days: [] };
    }

    var dayShort = { "SUN": "DIM", "MON": "LUN", "TUE": "MAR", "WED": "MER", "THU": "JEU", "FRI": "VEN", "SAT": "SAM" };
    var isOffset = fcst.daypart && fcst.daypart[0] && fcst.daypart[0].wxPhraseLong && fcst.daypart[0].wxPhraseLong[0] === null;

    for (let j = 0; j < 7; j++) {
        var dayIdx = isOffset ? j + 1 : j;
        var rawDayName = (fcst.dayOfWeek[dayIdx] || "").substring(0, 3).toUpperCase();
        var dayName = dayShort[rawDayName] || rawDayName;
        
        var phraseIdx = isOffset ? (j * 2 + 2) : (j * 2);
        var condPhrase = "";
        var iconCode = 4400;
        var high = "";
        var low = "";

        if (fcst.daypart && fcst.daypart[0]) {
            var dp = fcst.daypart[0];
            condPhrase = dp.wxPhraseShort && dp.wxPhraseShort[phraseIdx] ? dp.wxPhraseShort[phraseIdx] : (dp.wxPhraseLong && dp.wxPhraseLong[phraseIdx] ? dp.wxPhraseLong[phraseIdx] : "");
            condPhrase = condPhrase.replaceAll("Thunderstorms", "Thunder storms").replaceAll("Scattered", "Sct'd").replaceAll("Thundershowers", "Thunder showers").replaceAll("/Wind", " & Windy").replaceAll("Rain/", "Rain, ").replaceAll("Clouds/PM", "Clouds, PM");
            condPhrase = translateWeatherNarrative(condPhrase);
            
            iconCode = dp.iconCodeExtend && dp.iconCodeExtend[phraseIdx] != null ? dp.iconCodeExtend[phraseIdx] : (dp.iconCode && dp.iconCode[phraseIdx] != null ? dp.iconCode[phraseIdx] : 4400);

            var highVal = (fcst.calendarDayTemperatureMax && fcst.calendarDayTemperatureMax[dayIdx] != null)
                ? fcst.calendarDayTemperatureMax[dayIdx]
                : ((fcst.temperatureMax && fcst.temperatureMax[dayIdx] != null) ? fcst.temperatureMax[dayIdx] : (dp.temperature ? dp.temperature[phraseIdx] : ""));
            
            var lowVal = (fcst.calendarDayTemperatureMin && fcst.calendarDayTemperatureMin[dayIdx] != null)
                ? fcst.calendarDayTemperatureMin[dayIdx]
                : ((fcst.temperatureMin && fcst.temperatureMin[dayIdx] != null) ? fcst.temperatureMin[dayIdx] : (dp.temperature ? dp.temperature[phraseIdx + 1] : ""));
            
            high = highVal !== "" && highVal != null ? highVal : "";
            low = lowVal !== "" && lowVal != null ? lowVal : "";
        }

        days.push({
            name: dayName,
            cond: condPhrase,
            icon: iconCode,
            high: high,
            low: low
        });
    }

    return {
        name: configItem.name || "",
        region: configItem.region || "",
        days: days
    };
}

async function grabQuebecWeekAhead() {
    weatherInfo.quebecWeekAhead.cities = [];
    if (!locationConfig.quebecCities || locationConfig.quebecCities.length === 0) {
        weatherInfo.quebecWeekAhead.noReport = true;
        return;
    }
    weatherInfo.quebecWeekAhead.noReport = false;
    try {
        var items = locationConfig.quebecCities;
        var results = [];
        var chunkSize = 15;
        for (var i = 0; i < items.length; i += chunkSize) {
            var chunk = items.slice(i, i + chunkSize);
            var geocodes = chunk.map(item => item.val).filter(Boolean).join(";");
            if (!geocodes) continue;
            var url = "https://api.weather.com/v3/aggcommon/v3-wx-forecast-daily-7day?geocodes=" + geocodes + "&language=fr-US&units=" + getUnits() + "&format=json&apiKey=" + api_key;
            var data = await $.getJSON(url);
            if (Array.isArray(data)) {
                data.forEach((ajaxedLoc, idx) => {
                    var originalItem = chunk[idx];
                    if (originalItem) {
                        results.push(extract7DayOutlookItem(originalItem, ajaxedLoc));
                    }
                });
            }
        }
        weatherInfo.quebecWeekAhead.cities = results;
        weatherInfo.quebecWeekAhead.noReport = results.length === 0;
    } catch (e) {
        console.warn("[Weather] grabQuebecWeekAhead failed:", e);
        weatherInfo.quebecWeekAhead.noReport = true;
    }
}

async function grabResortCities() {
    weatherInfo.resortCities.cities = [];
    if (!locationConfig.resortCities || locationConfig.resortCities.length === 0) {
        weatherInfo.resortCities.noReport = true;
        return;
    }
    weatherInfo.resortCities.noReport = false;
    try {
        var results = await fetchAggCommonBatch(locationConfig.resortCities, (item, ajaxed) => extractAggWeatherItem(item, ajaxed));
        weatherInfo.resortCities.cities = results;
        weatherInfo.resortCities.noReport = results.length === 0;
    } catch (e) {
        weatherInfo.resortCities.noReport = true;
    }
}
async function grabNearbyCC() {
    if(locationConfig.eightCities.cities.length == 0){
        weatherInfo.eightCities.noReport = true;
        return;
    }
    weatherInfo.eightCities.noReport = false;
    weatherInfo.eightCities.cities = [];
    var url = "https://api.weather.com/v3/aggcommon/v3-wx-observations-current?geocodes="
    for (var l = 0; l < 8; l++) {
        if (locationConfig.eightCities.cities[l]) {
            url += locationConfig.eightCities.cities[l].lat + "," + locationConfig.eightCities.cities[l].lon + ";"
        }
    }
    url += "&language=en-US&units=" + getUnits() + "&format=json&apiKey=" + api_key;

    return $.getJSON(url, function (data) {
        data.forEach((ajaxedLoc, i) => {
            var obsCurr = (ajaxedLoc && ajaxedLoc["v3-wx-observations-current"]) || {};
            var rawCond = (obsCurr.wxPhraseLong || "").replace("Showers in the Vicinity", "Showers Nearby").replace("/Wind", ", Windy").replace("Thunder in the Vicinity", "Thunder");
            var windDir = (obsCurr.windDirectionCardinal == "CALM" || obsCurr.windSpeed === 0 || !obsCurr.windDirectionCardinal) ? "Calme" : translateWindCardinal(obsCurr.windDirectionCardinal);
            var windStr = (windDir === "Calme" || obsCurr.windSpeed === 0 || obsCurr.windSpeed == null) ? "Calme" : `${windDir} ${obsCurr.windSpeed}`.trim();
            var feelsVal = obsCurr.temperatureFeelsLike != null ? obsCurr.temperatureFeelsLike : (obsCurr.temperatureHeatIndex != null ? obsCurr.temperatureHeatIndex : (obsCurr.temperatureWindChill != null ? obsCurr.temperatureWindChill : obsCurr.temperature));
            var feelsType = "Ressenti";
            if (obsCurr.temperatureHeatIndex != null && obsCurr.temperature != null && obsCurr.temperatureHeatIndex > obsCurr.temperature + 2) {
                feelsType = "Indice humidex";
            } else if (obsCurr.temperatureWindChill != null && obsCurr.temperature != null && obsCurr.temperatureWindChill < obsCurr.temperature - 2) {
                feelsType = "Refroid. éolien";
            }
            var pressureVal = obsCurr.pressureAltimeter ? (isMetric() ? (obsCurr.pressureAltimeter > 500 ? (obsCurr.pressureAltimeter / 10).toFixed(1) : obsCurr.pressureAltimeter.toFixed(1)) : obsCurr.pressureAltimeter.toFixed(2)) : "";

            var eightslideloc = {
                name: (locationConfig.eightCities.cities[i] && locationConfig.eightCities.cities[i].displayname) || "",
                temp: obsCurr.temperature != null ? obsCurr.temperature : "",
                icon: obsCurr.iconCodeExtend != null ? obsCurr.iconCodeExtend : (obsCurr.iconCode != null ? obsCurr.iconCode : 4400),
                cond: translateWeatherNarrative(rawCond),
                wind: {
                    direction: windDir,
                    speed: obsCurr.windSpeed
                },
                windStr: windStr,
                gusts: (obsCurr.windGust != null && obsCurr.windGust !== 0 && obsCurr.windGust !== "None" && obsCurr.windGust !== "Aucune") ? obsCurr.windGust : "",
                humidity: (obsCurr.relativeHumidity != null && obsCurr.relativeHumidity !== "") ? (String(obsCurr.relativeHumidity).replace("%", "") + "%") : "",
                feelslike: { type: feelsType, val: (feelsVal != null && feelsVal !== "") ? feelsVal : "" },
                dewpoint: (obsCurr.temperatureDewPoint != null && obsCurr.temperatureDewPoint !== "") ? obsCurr.temperatureDewPoint : "",
                pressure: { val: pressureVal, trend: obsCurr.pressureTendencyTrend || "" },
                visibility: (obsCurr.visibility != null && obsCurr.visibility !== "") ? obsCurr.visibility : ""
            };
            weatherInfo.eightCities.cities.push(eightslideloc);
        })
    }).fail(function () {
        weatherInfo.eightCities.noReport = true;
        for (var i = 0; i < 8; i++) {
            var eightslideNR = { name: !(locationConfig.eightCities.cities[i].displayname) ? "" : locationConfig.eightCities.cities[i].displayname, temp: "", icon: 4400, wind: "", windspeed: "" }
            weatherInfo.eightCities.cities.push(eightslideNR)
        }
    })
}

var RAW_WEATHER_PHRASES = [
    // Complex Storm & Hazard phrases (Longest first)
    ["Storms may contain strong gusty winds and heavy rain", "les orages peuvent s'accompagner de fortes rafales et de fortes pluies"],
    ["Storms may contain strong gusty winds and small hail", "les orages peuvent s'accompagner de fortes rafales et de petit grésil"],
    ["Storms may contain strong gusty winds and large hail", "les orages peuvent s'accompagner de fortes rafales et de gros grêlons"],
    ["Storms may contain strong gusty winds", "les orages peuvent être accompagnés de fortes rafales de vent"],
    ["Storms may contain strong gusty", "les orages peuvent être accompagnés de fortes rafales"],
    ["Storms may contain gusty winds and heavy rain", "les orages peuvent s'accompagner de rafales et de fortes pluies"],
    ["Storms may contain gusty winds", "les orages peuvent être accompagnés de rafales de vent"],
    ["Storms may contain strong winds", "les orages peuvent être accompagnés de vents violents"],
    ["Storms may contain heavy rainfall", "les orages peuvent produire de fortes pluies"],
    ["Storms may contain heavy rain", "les orages peuvent produire de fortes pluies"],
    ["Storms may contain heavy downpours", "les orages peuvent produire de fortes averses"],
    ["Storms may contain large hail", "les orages peuvent produire de gros grêlons"],
    ["Storms may contain small hail", "les orages peuvent produire du petit grésil"],
    ["Storms may contain hail", "les orages peuvent produire de la grêle"],
    ["Storms may contain", "les orages peuvent produire"],
    ["Storms may produce strong gusty winds and heavy rain", "les orages peuvent produire de fortes rafales et de fortes pluies"],
    ["Storms may produce strong gusty winds and large hail", "les orages peuvent produire de fortes rafales et de gros grêlons"],
    ["Storms may produce strong gusty winds", "les orages peuvent produire de fortes rafales de vent"],
    ["Storms may produce heavy rainfall and gusty winds", "les orages peuvent produire de fortes pluies et des rafales de vent"],
    ["Storms may produce heavy rain and gusty winds", "les orages peuvent produire de fortes pluies et des rafales de vent"],
    ["Storms may produce gusty winds and heavy rain", "les orages peuvent produire des rafales et de fortes pluies"],
    ["Storms may produce gusty winds", "les orages peuvent produire des rafales de vent"],
    ["Storms may produce heavy rainfall", "les orages peuvent produire de fortes pluies"],
    ["Storms may produce heavy rain", "les orages peuvent produire de fortes pluies"],
    ["Storms may produce heavy downpours", "les orages peuvent produire de fortes averses"],
    ["Storms may produce large hail", "les orages peuvent produire de gros grêlons"],
    ["Storms may produce small hail", "les orages peuvent produire du petit grésil"],
    ["Storms may produce hail", "les orages peuvent produire de la grêle"],
    ["Storms may produce", "les orages peuvent produire"],
    ["Storms could contain strong gusty winds", "les orages pourraient être accompagnés de fortes rafales de vent"],
    ["Storms could contain gusty winds", "les orages pourraient être accompagnés de rafales de vent"],
    ["Storms could contain", "les orages pourraient être accompagnés de"],
    ["Storms could produce strong gusty winds", "les orages pourraient produire de fortes rafales de vent"],
    ["Storms could produce heavy rainfall", "les orages pourraient produire de fortes pluies"],
    ["Storms could produce heavy rain", "les orages pourraient produire de fortes pluies"],
    ["Storms could produce", "les orages pourraient produire"],
    ["Storms may be severe", "les orages peuvent être violents"],
    ["Storms could be severe", "les orages pourraient être violents"],
    ["may contain strong gusty winds", "pouvant être accompagnés de fortes rafales de vent"],
    ["may contain gusty winds", "pouvant être accompagnés de rafales de vent"],
    ["may contain strong winds", "pouvant être accompagnés de vents violents"],
    ["may contain heavy rainfall", "pouvant s'accompagner de fortes pluies"],
    ["may contain heavy rain", "pouvant s'accompagner de fortes pluies"],
    ["may contain heavy downpours", "pouvant s'accompagner de fortes averses"],
    ["may contain large hail", "pouvant s'accompagner de gros grêlons"],
    ["may contain small hail", "pouvant s'accompagner de petit grésil"],
    ["may contain hail", "pouvant s'accompagner de grêle"],
    ["may contain", "pouvant produire"],
    ["may produce strong gusty winds", "pouvant produire de fortes rafales de vent"],
    ["may produce gusty winds", "pouvant produire des rafales de vent"],
    ["may produce heavy rainfall", "pouvant produire de fortes pluies"],
    ["may produce heavy rain", "pouvant produire de fortes pluies"],
    ["may produce heavy downpours", "pouvant produire de fortes averses"],
    ["may produce large hail", "pouvant produire de gros grêlons"],
    ["may produce small hail", "pouvant produire du petit grésil"],
    ["may produce hail", "pouvant produire de la grêle"],
    ["may produce", "pouvant produire"],
    ["could contain", "pourrait contenir"],
    ["could produce", "pourrait produire"],
    ["with strong gusty winds", "avec de fortes rafales de vent"],
    ["with gusty winds", "avec rafales de vent"],
    ["strong gusty winds", "fortes rafales de vent"],
    ["strong gusty", "fortes rafales"],
    ["gusty winds", "vents avec rafales"],
    ["gusty", "avec rafales"],

    // Developing storm/shower patterns
    ["Scattered strong thunderstorms developing in the afternoon", "développement d'orages violents dispersés en après-midi"],
    ["Scattered strong thunderstorms developing in the evening", "développement d'orages violents dispersés en soirée"],
    ["Scattered strong thunderstorms developing", "développement d'orages violents dispersés"],
    ["Isolated strong thunderstorms developing in the afternoon", "développement d'orages violents isolés en après-midi"],
    ["Isolated strong thunderstorms developing in the evening", "développement d'orages violents isolés en soirée"],
    ["Isolated strong thunderstorms developing", "développement d'orages violents isolés"],
    ["Scattered thunderstorms developing later in the day", "développement d'orages dispersés plus tard en journée"],
    ["Scattered thunderstorms developing in the afternoon", "développement d'orages dispersés en après-midi"],
    ["Scattered thunderstorms developing in the evening", "développement d'orages dispersés en soirée"],
    ["Scattered thunderstorms developing", "développement d'orages dispersés"],
    ["Isolated thunderstorms developing in the afternoon", "développement d'orages isolés en après-midi"],
    ["Isolated thunderstorms developing in the evening", "développement d'orages isolés en soirée"],
    ["Isolated thunderstorms developing", "développement d'orages isolés"],
    ["Scattered showers developing in the afternoon", "développement d'averses dispersées en après-midi"],
    ["Scattered showers developing", "développement d'averses dispersées"],
    ["Isolated showers developing in the afternoon", "développement d'averses isolées en après-midi"],
    ["Isolated showers developing", "développement d'averses isolées"],
    ["Thunderstorms developing later in the day", "développement d'orages plus tard en journée"],
    ["Thunderstorms developing later in the afternoon", "développement d'orages en fin d'après-midi"],
    ["Thunderstorms developing in the afternoon", "développement d'orages en après-midi"],
    ["Thunderstorms developing in the morning", "développement d'orages en matinée"],
    ["Thunderstorms developing in the evening", "développement d'orages en soirée"],
    ["Thunderstorms developing late in the afternoon", "développement d'orages en fin d'après-midi"],
    ["Thunderstorms developing late in the evening", "développement d'orages en fin de soirée"],
    ["Thunderstorms developing early in the afternoon", "développement d'orages tôt en après-midi"],
    ["Thunderstorms developing early in the morning", "développement d'orages tôt en matinée"],
    ["Thunderstorms developing later at night", "développement d'orages plus tard durant la nuit"],
    ["Thunderstorms developing overnight", "développement d'orages durant la nuit"],
    ["Thunderstorms developing", "développement d'orages"],
    ["thundershowers developing later in the day", "développement d'averses orageuses plus tard en journée"],
    ["thundershowers developing later in the afternoon", "développement d'averses orageuses en fin d'après-midi"],
    ["thundershowers developing in the afternoon", "développement d'averses orageuses en après-midi"],
    ["thundershowers developing in the morning", "développement d'averses orageuses en matinée"],
    ["thundershowers developing in the evening", "développement d'averses orageuses en soirée"],
    ["thundershowers developing late in the afternoon", "développement d'averses orageuses en fin d'après-midi"],
    ["thundershowers developing late in the evening", "développement d'averses orageuses en fin de soirée"],
    ["thundershowers developing early in the afternoon", "développement d'averses orageuses tôt en après-midi"],
    ["thundershowers developing early in the morning", "développement d'averses orageuses tôt en matinée"],
    ["thundershowers developing later at night", "développement d'averses orageuses plus tard durant la nuit"],
    ["thundershowers developing overnight", "développement d'averses orageuses durant la nuit"],
    ["thundershowers developing", "développement d'averses orageuses"],
    ["thunder showers developing in the afternoon", "développement d'averses orageuses en après-midi"],
    ["thunder showers developing in the morning", "développement d'averses orageuses en matinée"],
    ["thunder showers developing in the evening", "développement d'averses orageuses en soirée"],
    ["thunder showers developing overnight", "développement d'averses orageuses durant la nuit"],
    ["thunder showers developing", "développement d'averses orageuses"],
    ["Showers developing later in the day", "développement d'averses plus tard en journée"],
    ["Showers developing later at night", "développement d'averses plus tard durant la nuit"],
    ["Showers developing in the afternoon", "développement d'averses en après-midi"],
    ["Showers developing in the morning", "développement d'averses en matinée"],
    ["Showers developing in the evening", "développement d'averses en soirée"],
    ["Showers developing late in the afternoon", "développement d'averses en fin d'après-midi"],
    ["Showers developing overnight", "développement d'averses durant la nuit"],
    ["Showers developing", "développement d'averses"],
    // Rain, Snow, Storms developing patterns
    ["rain developing later in the day", "pluie se développant plus tard en journée"],
    ["rain developing late in the day", "pluie se développant en fin de journée"],
    ["rain developing later in the afternoon", "pluie se développant en fin d'après-midi"],
    ["rain developing in the afternoon", "pluie se développant en après-midi"],
    ["rain developing in the morning", "pluie se développant en matinée"],
    ["rain developing in the evening", "pluie se développant en soirée"],
    ["rain developing late in the afternoon", "pluie se développant en fin d'après-midi"],
    ["rain developing late in the evening", "pluie se développant en fin de soirée"],
    ["rain developing early in the afternoon", "pluie se développant tôt en après-midi"],
    ["rain developing early in the morning", "pluie se développant tôt en matinée"],
    ["rain developing later at night", "pluie se développant plus tard durant la nuit"],
    ["rain developing after midnight", "pluie se développant après minuit"],
    ["rain developing overnight", "pluie se développant durant la nuit"],
    ["rain developing late", "pluie se développant tard"],
    ["rain developing early", "pluie se développant tôt"],
    ["rain developing", "pluie se développant"],

    ["snow developing later in the day", "neige se développant plus tard en journée"],
    ["snow developing late in the day", "neige se développant en fin de journée"],
    ["snow developing later in the afternoon", "neige se développant en fin d'après-midi"],
    ["snow developing in the afternoon", "neige se développant en après-midi"],
    ["snow developing in the morning", "neige se développant en matinée"],
    ["snow developing in the evening", "neige se développant en soirée"],
    ["snow developing later at night", "neige se développant plus tard durant la nuit"],
    ["snow developing after midnight", "neige se développant après minuit"],
    ["snow developing overnight", "neige se développant durant la nuit"],
    ["snow developing late", "neige se développant tard"],
    ["snow developing early", "neige se développant tôt"],
    ["snow developing", "neige se développant"],

    ["showers developing later in the day", "averses se développant plus tard en journée"],
    ["showers developing later in the afternoon", "averses se développant en fin d'après-midi"],
    ["showers developing in the afternoon", "averses se développant en après-midi"],
    ["showers developing in the morning", "averses se développant en matinée"],
    ["showers developing in the evening", "averses se développant en soirée"],
    ["showers developing later at night", "averses se développant plus tard durant la nuit"],
    ["showers developing after midnight", "averses se développant après minuit"],
    ["showers developing overnight", "averses se développant durant la nuit"],
    ["showers developing late", "averses se développant tard"],
    ["showers developing early", "averses se développant tôt"],
    ["showers developing", "averses se développant"],

    ["thunderstorms developing later in the day", "orages se développant plus tard en journée"],
    ["thunderstorms developing in the afternoon", "orages se développant en après-midi"],
    ["thunderstorms developing in the evening", "orages se développant en soirée"],
    ["thunderstorms developing late", "orages se développant tard"],
    ["thunderstorms developing early", "orages se développant tôt"],
    ["thunderstorms developing overnight", "orages se développant durant la nuit"],
    ["thunderstorms developing after midnight", "orages se développant après minuit"],
    ["thunderstorms developing", "orages se développant"],

    ["winds developing later in the day", "vents se développant plus tard en journée"],
    ["winds developing in the afternoon", "vents se développant en après-midi"],
    ["winds developing", "vents se développant"],
    ["fog developing late", "brouillard se développant tard"],
    ["fog developing early", "brouillard se développant tôt"],
    ["fog developing overnight", "brouillard se développant durant la nuit"],
    ["fog developing after midnight", "brouillard se développant après minuit"],
    ["fog developing", "brouillard se développant"],

    ["developing later in the day", "se développant plus tard en journée"],
    ["developing later in the afternoon", "se développant en fin d'après-midi"],
    ["developing later in the morning", "se développant en fin de matinée"],
    ["developing later in the evening", "se développant en fin de soirée"],
    ["developing in the afternoon", "se développant en après-midi"],
    ["developing in the morning", "se développant en matinée"],
    ["developing in the evening", "se développant en soirée"],
    ["developing late in the day", "se développant en fin de journée"],
    ["developing late in the afternoon", "se développant en fin d'après-midi"],
    ["developing late in the evening", "se développant en fin de soirée"],
    ["developing early in the day", "se développant tôt en journée"],
    ["developing early in the afternoon", "se développant tôt en après-midi"],
    ["developing early in the morning", "se développant tôt en matinée"],
    ["developing later at night", "se développant plus tard durant la nuit"],
    ["developing after midnight", "se développant après minuit"],
    ["developing before midnight", "se développant avant minuit"],
    ["developing around midnight", "se développant vers minuit"],
    ["developing overnight", "se développant durant la nuit"],
    ["developing this afternoon", "se développant cet après-midi"],
    ["developing this morning", "se développant ce matin"],
    ["developing this evening", "se développant en soirée"],
    ["developing tonight", "se développant ce soir"],
    ["developing late", "se développant tard"],
    ["developing early", "se développant tôt"],
    ["developing", "se développant"],
    ["develops", "se développe"],
    ["will develop", "se développera"],
    ["may develop", "pourrait se développer"],
    ["could develop", "pourrait se développer"],

    // Heavy and tapering compounds
    ["Snow will become heavy at times during the afternoon", "la neige deviendra parfois forte en après-midi"],
    ["Snow will become heavy at times this afternoon", "la neige deviendra parfois forte cet après-midi"],
    ["Snow will become heavy at times during the morning", "la neige deviendra parfois forte en matinée"],
    ["Snow will become heavy at times this morning", "la neige deviendra parfois forte ce matin"],
    ["Snow will become heavy at times overnight", "la neige deviendra parfois forte durant la nuit"],
    ["Snow will become heavy at times late", "la neige deviendra parfois forte tard"],
    ["Snow will become heavy during the afternoon", "la neige deviendra forte en après-midi"],
    ["Snow will become heavy this afternoon", "la neige deviendra forte cet après-midi"],
    ["Snow will become heavy overnight", "la neige deviendra forte durant la nuit"],
    ["Snow will become heavy late", "la neige deviendra forte tard"],
    ["Snow will be heavy at times along with gusty winds", "la neige sera parfois forte avec rafales de vent"],
    ["Snow will be heavy at times during the morning", "la neige sera parfois forte en matinée"],
    ["Snow will be heavy at times in the evening", "la neige sera parfois forte en soirée"],
    ["Snow will be heavy at times this evening", "la neige sera parfois forte en soirée"],
    ["Snow will be heavy at times this morning", "la neige sera parfois forte ce matin"],
    ["Snow will be heavy at times", "la neige sera parfois forte"],
    ["The rain will be heavy at times", "la pluie sera parfois forte"],
    ["Snow during the morning will become heavy at times during the afternoon", "la neige en matinée deviendra parfois forte en après-midi"],
    ["Snow in the evening will become heavy at times overnight", "la neige en soirée deviendra parfois forte durant la nuit"],
    ["Snow this evening will become heavy at times late", "la neige en soirée deviendra parfois forte tard"],
    ["Snow this morning will become heavy at times this afternoon", "la neige ce matin deviendra parfois forte cet après-midi"],
    ["Snow during the morning will taper off to light snow during the afternoon", "la neige en matinée diminuera en neige légère en après-midi"],
    ["Snow this evening will taper off to light snow late", "la neige en soirée diminuera en neige légère tard"],
    ["will taper off to light snow", "diminuera en neige légère"],
    ["will taper off to light rain", "diminuera en pluie légère"],
    ["will taper off to", "diminuera en"],
    ["will taper off", "diminuera"],
    ["taper off to", "diminuer en"],
    ["taper off", "diminuer"],
    ["will become heavy at times", "deviendra parfois forte"],
    ["will become heavy", "deviendra forte"],
    ["will be heavy at times", "sera parfois forte"],
    ["will be heavy", "sera forte"],
    ["heavy at times", "parfois forte"],

    // Periods and mixtures
    ["periods of light rain this afternoon", "périodes de pluie légère cet après-midi"],
    ["periods of light rain", "périodes de pluie légère"],
    ["periods of light snow", "périodes de neige légère"],
    ["period of light rain", "période de pluie légère"],
    ["period of light snow", "période de neige légère"],
    ["periods of rain", "périodes de pluie"],
    ["periods of snow", "périodes de neige"],
    ["period of rain", "période de pluie"],
    ["period of snow", "période de neige"],
    ["periods of", "périodes de"],
    ["period of", "période de"],
    ["cloudy intervals", "passages nuageux"],

    ["a mixture of light rain and snow", "un mélange de pluie légère et de neige"],
    ["a mixture of rain and snow", "un mélange de pluie et de neige"],
    ["a mixture of snow and rain", "un mélange de neige et de pluie"],
    ["mixture of light rain and snow", "mélange de pluie légère et de neige"],
    ["mixture of rain and snow", "mélange de pluie et de neige"],
    ["mixture of snow and rain", "mélange de neige et de pluie"],
    ["a mixture of", "un mélange de"],
    ["mixture of", "mélange de"],
    ["mixture", "mélange"],

    // Otherwise and under
    ["otherwise mostly sunny", "sinon généralement ensoleillé"],
    ["otherwise mostly cloudy", "sinon généralement nuageux"],
    ["otherwise generally sunny", "sinon généralement ensoleillé"],
    ["otherwise generally clear", "sinon généralement dégagé"],
    ["otherwise sunny", "sinon ensoleillé"],
    ["otherwise clear", "sinon dégagé"],
    ["otherwise cloudy", "sinon nuageux"],
    ["otherwise", "sinon"],

    ["under partly cloudy skies", "sous un ciel partiellement nuageux"],
    ["under mostly cloudy skies", "sous un ciel généralement nuageux"],
    ["under mostly sunny skies", "sous un ciel généralement ensoleillé"],
    ["under mainly sunny skies", "sous un ciel principalement ensoleillé"],
    ["under mainly cloudy skies", "sous un ciel principalement nuageux"],
    ["under sunny skies", "sous un ciel ensoleillé"],
    ["under clear skies", "sous un ciel dégagé"],
    ["under cloudy skies", "sous un ciel nuageux"],
    ["under overcast skies", "sous un ciel couvert"],
    ["under", "sous"],

    // More / Less
    ["becoming less numerous later in the day", "diminuant en nombre plus tard en journée"],
    ["becoming less numerous during the afternoon hours", "diminuant en nombre en après-midi"],
    ["becoming less numerous overnight", "diminuant en nombre durant la nuit"],
    ["becoming less numerous late", "diminuant en nombre tard"],
    ["becoming less numerous", "diminuant en nombre"],
    ["less numerous", "moins nombreux"],
    ["more numerous during the evening", "plus nombreux en soirée"],
    ["more numerous this evening", "plus nombreux en soirée"],
    ["more numerous in the afternoon", "plus nombreux en après-midi"],
    ["more numerous", "plus nombreux"],
    ["becoming more intermittent overnight", "devenant plus intermittentes durant la nuit"],
    ["becoming more intermittent in the afternoon", "devenant plus intermittentes en après-midi"],
    ["becoming more intermittent", "devenant plus intermittent"],
    ["becoming more scattered later", "devenant plus dispersé plus tard"],
    ["becoming more scattered", "devenant plus dispersé"],
    ["becoming more widespread in the afternoon", "devenant plus généralisé en après-midi"],
    ["becoming more widespread", "devenant plus généralisé"],
    ["more scattered", "plus dispersé"],
    ["more widespread", "plus généralisé"],
    ["more intermittent", "plus intermittent"],
    ["more showers at times", "plus d'averses par moments"],
    ["more showers", "plus d'averses"],
    ["with more sunshine this afternoon", "avec plus de soleil cet après-midi"],
    ["with more sunshine", "avec plus de soleil"],
    ["with more clouds for later at night", "avec plus de nuages plus tard durant la nuit"],
    ["with more clouds for later in the day", "avec plus de nuages plus tard en journée"],
    ["with more clouds for this afternoon", "avec plus de nuages cet après-midi"],
    ["with more clouds for overnight", "avec plus de nuages durant la nuit"],
    ["with more clouds", "avec plus de nuages"],
    ["with more sun", "avec plus de soleil"],
    ["more clouds than sun", "plus de nuages que de soleil"],
    ["more sun than clouds", "plus de soleil que de nuages"],
    ["more clouds", "plus de nuages"],
    ["more sunshine", "plus de soleil"],
    ["more sun", "plus de soleil"],

    // Isolated and scattered
    ["with isolated thunderstorms developing later in the day", "avec orages isolés se développant plus tard en journée"],
    ["with isolated thunderstorms developing", "avec orages isolés se développant"],
    ["with isolated thunderstorms possible", "avec orages isolés possibles"],
    ["with isolated thunderstorms", "avec orages isolés"],
    ["with scattered strong thunderstorms developing later in the day", "avec orages violents dispersés se développant plus tard en journée"],
    ["with scattered thunderstorms developing later in the day", "avec orages dispersés se développant plus tard en journée"],
    ["with scattered strong storms developing in the afternoon", "avec orages violents dispersés se développant en après-midi"],
    ["scattered strong storms developing", "orages violents dispersés se développant"],
    ["scattered strong storms", "orages violents dispersés"],
    ["isolated thunderstorms possible", "orages isolés possibles"],
    ["isolated thunderstorm possible", "orage isolé possible"],
    ["isolated thunderstorms likely", "orages isolés probables"],
    ["isolated thunderstorm likely", "orage isolé probable"],
    ["isolated thunderstorms", "orages isolés"],
    ["isolated thunderstorm", "orage isolé"],
    ["isolated showers possible", "averses isolées possibles"],
    ["isolated shower possible", "averse isolée possible"],
    ["isolated showers", "averses isolées"],
    ["isolated shower", "averse isolée"],
    ["isolated storms", "orages isolés"],
    ["isolated storm", "orage isolé"],
    ["an isolated thunderstorm", "un orage isolé"],
    ["an isolated storm", "un orage isolé"],
    ["an isolated shower", "une averse isolée"],
    ["isolated", "isolé"],

    ["scattered flurries and snow showers", "quelques flocons et averses de neige dispersés"],
    ["scattered snow flurries and snow showers", "quelques flocons et averses de neige dispersés"],
    ["scattered snow flurries", "quelques flocons dispersés"],
    ["scattered flurries", "quelques flocons dispersés"],
    ["scattered showers in the morning", "averses dispersées en matinée"],
    ["scattered showers", "averses dispersées"],
    ["scattered storms", "orages dispersés"],
    ["scattered", "dispersé"],

    // Numerous, ample, lingering, patchy
    ["numerous thunderstorms", "orages nombreux"],
    ["numerous snow showers or flurries expected", "nombreuses averses de neige ou quelques flocons prévus"],
    ["numerous snow showers", "nombreuses averses de neige"],
    ["numerous rain showers", "nombreuses averses de pluie"],
    ["numerous showers", "nombreuses averses"],
    ["numerous storms", "nombreux orages"],
    ["numerous", "nombreux"],
    ["with ample sunshine later in the day", "avec franc soleil plus tard en journée"],
    ["ample sunshine", "franc soleil"],
    ["ample sun", "franc soleil"],
    ["ample", "franc"],
    ["patchy clouds", "nuages par endroits"],
    ["patchy drizzle possible", "bruine par endroits possible"],
    ["patchy drizzle", "bruine par endroits"],
    ["lingering snow showers later", "averses de neige résiduelles plus tard"],
    ["lingering snow showers", "averses de neige résiduelles"],
    ["lingering showers", "averses résiduelles"],
    ["lingering flurries", "quelques flocons résiduels"],
    ["lingering rain", "pluie résiduelle"],
    ["lingering", "résiduel"],

    // Steadier, likely, diminishing
    ["steadier snow developing later in the day", "neige plus continue se développant plus tard en journée"],
    ["a steadier snow developing late", "une neige plus continue se développant tard"],
    ["a steadier snow", "une neige plus continue"],
    ["a steadier rain", "une pluie plus continue"],
    ["steadier snow", "neige plus continue"],
    ["steadier rain", "pluie plus continue"],
    ["steadier", "plus continue"],
    ["steady snow likely later in the day", "neige continue probable plus tard en journée"],
    ["thunderstorms becoming likely during the afternoon", "orages devenant probables en après-midi"],
    ["thunderstorms becoming likely", "orages devenant probables"],
    ["becoming likely during the afternoon", "devenant probable en après-midi"],
    ["becoming likely", "devenant probable"],
    ["Showers and thundershowers likely", "averses et averses orageuses probables"],
    ["becoming less likely by morning", "devenant moins probable d'ici le matin"],
    ["becoming less likely toward evening", "devenant moins probable vers le soir"],
    ["becoming less likely during the morning", "devenant moins probable en matinée"],
    ["becoming less likely", "devenant moins probable"],
    ["less likely", "moins probable"],
    ["more likely", "plus probable"],
    ["is likely", "est probable"],
    ["are likely", "sont probables"],
    ["should diminish as the evening progresses", "diminueront au cours de la soirée"],
    ["should diminish", "devrait diminuer"],
    ["early morning breaks in the overcast", "éclaircies tôt en matinée"],
    ["breaks in the overcast", "éclaircies"],
    ["breaks in the clouds", "éclaircies"],
    ["Snowy and windy", "neige et venteux"],
    ["Snowy", "neigeux"],
    ["a few may be severe", "quelques-uns pourraient être violents"],
    ["may be severe", "pourraient être violents"],
    ["especially this morning", "particulièrement ce matin"],
    ["especially this afternoon", "particulièrement cet après-midi"],
    ["especially this evening", "particulièrement ce soir"],
    ["especially", "particulièrement"],
    ["before noon", "avant midi"],
    ["after noon", "après midi"],
    ["around noon", "vers midi"],
    ["by noon", "d'ici midi"],
    ["noon", "midi"],

    // Daypart & timing
    ["Evening showers", "averses en soirée"],
    ["Morning showers", "averses en matinée"],
    ["Afternoon showers", "averses en après-midi"],
    ["Evening thunderstorms", "orages en soirée"],
    ["Morning thunderstorms", "orages en matinée"],
    ["Afternoon thunderstorms", "orages en après-midi"],
    ["afternoon snow showers", "averses de neige en après-midi"],
    ["afternoon rain showers", "averses de pluie en après-midi"],
    ["afternoon showers", "averses en après-midi"],
    ["afternoon thunderstorms", "orages en après-midi"],
    ["evening showers", "averses en soirée"],
    ["morning showers", "averses en matinée"],
    ["late night snow showers", "averses de neige tard durant la nuit"],
    ["late night showers", "averses tard durant la nuit"],
    ["late night", "tard durant la nuit"],
    ["Morning sunshine will give way to", "le soleil en matinée fera place à"],
    ["Morning sunshine", "soleil en matinée"],
    ["Morning sun", "soleil en matinée"],
    ["Afternoon sunshine", "soleil en après-midi"],
    ["Afternoon sun", "soleil en après-midi"],

    ["by the afternoon", "d'ici l'après-midi"],
    ["by the morning", "d'ici le matin"],
    ["by the evening", "d'ici le soir"],
    ["becoming steady by the afternoon", "devenant continue d'ici l'après-midi"],
    ["becoming steady", "devenant continue"],
    ["arriving by the afternoon", "arrivant d'ici l'après-midi"],
    ["a few peeks of sunshine possible", "quelques éclaircies possibles"],
    ["peeks of sunshine", "éclaircies"],
    ["Rain and wind", "pluie et vent"],
    ["Snow and wind", "neige et vent"],
    ["along with gusty winds at times", "avec rafales de vent par moments"],
    ["along with gusty winds", "avec rafales de vent"],
    ["along with", "avec"],
    ["with a possibility of an isolated thunderstorm", "avec possibilité d'un orage isolé"],
    ["with a possibility of", "avec possibilité de"],
    ["possibility of an isolated", "possibilité d'un"],
    ["possibility of", "possibilité de"],
    ["possibly", "possiblement"],

    ["light snow flurries possible", "quelques flocons légers possibles"],
    ["light snow flurries", "quelques flocons légers"],
    ["light rain and snow", "pluie et neige légères"],
    ["light snow and rain", "neige et pluie légères"],
    ["light rain likely", "pluie légère probable"],
    ["light snow likely", "neige légère probable"],
    ["light rain", "pluie légère"],
    ["light snow", "neige légère"],
    ["Rain developing", "pluie se développant"],
    ["Snow developing", "neige se développant"],

    // "A stray ... is possible" / "A stray ... or two" / "A ... or two"
    ["A stray shower or thunderstorm is possible", "possibilité d'une averse isolée ou d'un orage"],
    ["A stray shower or thunderstorm", "une averse isolée ou un orage"],
    ["A stray shower or two is possible", "possibilité d'une ou deux averses isolées"],
    ["A stray shower or two", "une ou deux averses isolées"],
    ["A stray storm or two", "un ou deux orages isolés"],
    ["A stray thunderstorm or two", "un ou deux orages isolés"],
    ["A shower or two early", "une ou deux averses tôt"],
    ["A shower or two late", "une ou deux averses tard"],
    ["A shower or two", "une ou deux averses"],
    ["A flurry or two early", "un ou deux flocons tôt"],
    ["A flurry or two late", "un ou deux flocons tard"],
    ["A flurry or two", "un ou deux flocons"],
    ["A thunderstorm or two", "un ou deux orages"],
    ["A storm or two", "un ou deux orages"],
    ["shower or two early", "une ou deux averses tôt"],
    ["shower or two late", "une ou deux averses tard"],
    ["shower or two", "une ou deux averses"],
    ["flurry or two", "un ou deux flocons"],
    ["thunderstorm or two", "un ou deux orages"],
    ["storm or two", "un ou deux orages"],

    // "A couple of ..."
    ["A couple of thunderstorms", "un ou deux orages"],
    ["A couple of storms", "un ou deux orages"],
    ["A couple of showers", "une ou deux averses"],
    ["A couple of flurries", "un ou deux flocons"],
    ["couple of thunderstorms", "un ou deux orages"],
    ["couple of showers", "une ou deux averses"],
    ["couple of flurries", "un ou deux flocons"],

    // "A few ..." (LONGEST FIRST!)
    ["A few clouds from time to time", "quelques nuages par moments"],
    ["A few clouds in the morning", "quelques nuages en matinée"],
    ["A few clouds in the afternoon", "quelques nuages en après-midi"],
    ["A few clouds in the evening", "quelques nuages en soirée"],
    ["A few clouds this morning", "quelques nuages ce matin"],
    ["A few clouds this afternoon", "quelques nuages cet après-midi"],
    ["A few clouds this evening", "quelques nuages ce soir"],
    ["A few clouds overnight", "quelques nuages durant la nuit"],
    ["A few clouds early", "quelques nuages tôt"],
    ["A few clouds late", "quelques nuages tard"],
    ["A few afternoon clouds", "quelques nuages en après-midi"],
    ["A few morning clouds", "quelques nuages en matinée"],
    ["A few evening clouds", "quelques nuages en soirée"],
    ["A few clouds", "quelques nuages"],

    ["A few thunderstorms possible", "possibilité de quelques orages"],
    ["A few storms possible", "possibilité de quelques orages"],
    ["A few thunderstorms", "quelques orages"],
    ["A few storms", "quelques orages"],
    ["A few showers possible", "possibilité de quelques averses"],
    ["A few showers early", "quelques averses tôt"],
    ["A few showers late", "quelques averses tard"],
    ["A few showers", "quelques averses"],
    ["A few snow showers", "quelques averses de neige"],
    ["A few rain showers", "quelques averses de pluie"],
    ["A few flurries early", "quelques flocons tôt"],
    ["A few flurries late", "quelques flocons tard"],
    ["A few flurries possible", "possibilité de quelques flocons"],
    ["A few flurries", "quelques flocons"],
    ["A few passing clouds", "quelques nuages passagers"],
    ["A few passing showers", "quelques averses passagères"],
    ["A few lingering showers", "quelques averses résiduelles"],
    ["A few lingering flurries", "quelques flocons résiduels"],
    ["A few isolated thunderstorms", "quelques orages isolés"],
    ["A few isolated showers", "quelques averses isolées"],
    ["A few scattered thunderstorms", "quelques orages dispersés"],
    ["A few scattered showers", "quelques averses dispersées"],
    ["In a few spots", "par endroits"],
    ["A few spots", "quelques endroits"],
    ["A few", "quelques"],

    // "Few ..."
    ["Few clouds from time to time", "quelques nuages par moments"],
    ["Few clouds early", "quelques nuages tôt"],
    ["Few clouds late", "quelques nuages tard"],
    ["Few clouds", "quelques nuages"],
    ["Few thunderstorms possible", "possibilité de quelques orages"],
    ["Few thunderstorms", "quelques orages"],
    ["Few showers possible", "possibilité de quelques averses"],
    ["Few showers early", "quelques averses tôt"],
    ["Few showers late", "quelques averses tard"],
    ["Few showers", "quelques averses"],
    ["Few snow showers", "quelques averses de neige"],
    ["Few rain showers", "quelques averses de pluie"],
    ["Few flurries early", "quelques flocons tôt"],
    ["Few flurries late", "quelques flocons tard"],
    ["Few flurries possible", "possibilité de quelques flocons"],
    ["Few flurries", "quelques flocons"],
    ["Few passing clouds", "quelques nuages passagers"],
    ["Few passing showers", "quelques averses passagères"],
    ["Few", "quelques"],

    // "Some ..." phrases
    ["Sunshine along with some cloudy intervals", "ensoleillement avec quelques passages nuageux"],
    ["along with some cloudy intervals", "avec quelques passages nuageux"],
    ["with some cloudy intervals", "avec quelques passages nuageux"],
    ["some cloudy intervals", "quelques passages nuageux"],
    ["along with", "avec"],

    ["Some sun in the morning with increasing clouds during the afternoon", "un peu de soleil en matinée avec ennuagement en après-midi"],
    ["Some sun in the morning followed by cloudy skies in the afternoon", "un peu de soleil en matinée suivi d'un ciel nuageux en après-midi"],
    ["Some sun in the morning", "un peu de soleil en matinée"],
    ["Some sun in the afternoon", "un peu de soleil en après-midi"],
    ["Some sun and clouds", "alternance de soleil et de nuages"],
    ["Some clouds and sun", "alternance de nuages et de soleil"],
    ["Some sun", "un peu de soleil"],
    ["Some sunshine", "un peu de soleil"],

    ["Some clouds early, then clearing", "quelques nuages tôt, puis dégagement"],
    ["Some clouds early", "quelques nuages tôt"],
    ["Some clouds late", "quelques nuages tard"],
    ["Some clouds in the morning", "quelques nuages en matinée"],
    ["Some clouds in the afternoon", "quelques nuages en après-midi"],
    ["Some clouds in the evening", "quelques nuages en soirée"],
    ["Some clouds overnight", "quelques nuages durant la nuit"],
    ["Some clouds this morning", "quelques nuages ce matin"],
    ["Some clouds this afternoon", "quelques nuages cet après-midi"],
    ["Some clouds this evening", "quelques nuages ce soir"],
    ["Some clouds", "quelques nuages"],

    ["Some morning fog", "un peu de brouillard en matinée"],
    ["Some morning clouds", "quelques nuages en matinée"],
    ["Some morning showers", "quelques averses en matinée"],
    ["Some afternoon clouds", "quelques nuages en après-midi"],
    ["Some afternoon showers", "quelques averses en après-midi"],
    ["Some afternoon storms", "quelques orages en après-midi"],
    ["Some afternoon thunderstorms", "quelques orages en après-midi"],
    ["Some evening showers", "quelques averses en soirée"],

    ["Some clearing overnight", "quelques éclaircies durant la nuit"],
    ["Some clearing late", "quelques éclaircies tard"],
    ["Some clearing early", "quelques éclaircies tôt"],
    ["Some clearing", "quelques éclaircies"],
    ["with some clearing", "avec quelques éclaircies"],
    ["with some clouds", "avec quelques nuages"],
    ["with some sun", "avec quelques éclaircies"],
    ["with some sunshine", "avec quelques éclaircies"],

    ["Some passing clouds", "quelques nuages passagers"],
    ["Some passing showers", "quelques averses passagères"],
    ["Some lingering showers", "quelques averses résiduelles"],
    ["Some lingering flurries", "quelques flocons résiduels"],
    ["Some rain showers", "quelques averses de pluie"],
    ["Some snow showers", "quelques averses de neige"],
    ["Some thunderstorms", "quelques orages"],
    ["Some storms", "quelques orages"],
    ["Some showers", "quelques averses"],
    ["Some flurries", "quelques flocons"],
    ["Some drizzle", "un peu de bruine"],
    ["Some fog", "un peu de brouillard"],
    ["Some rain", "un peu de pluie"],
    ["Some snow", "un peu de neige"],
    ["Some ice", "un peu de verglas"],
    ["Some sleet", "un peu de grésil"],
    ["Some", "quelques"],

    // "A stray ..." singles
    ["A stray thunderstorm possible", "possibilité d'un orage isolé"],
    ["A stray thunderstorm", "un orage isolé"],
    ["A stray thundershower", "une averse orageuse isolée"],
    ["A stray shower possible", "possibilité d'une averse isolée"],
    ["A stray shower", "une averse isolée"],
    ["A stray snow shower", "une averse de neige isolée"],
    ["A stray flurry", "un flocon isolé"],
    ["A stray flurries", "quelques flocons isolés"],
    ["A stray storm", "un orage isolé"],

    // "A steady ..." / "steady ..."
    ["becoming a steady light rain overnight", "devenant une pluie légère continue durant la nuit"],
    ["becoming a steady light rain in the afternoon", "devenant une pluie légère continue en après-midi"],
    ["becoming a steady light rain later in the day", "devenant une pluie légère continue plus tard en journée"],
    ["becoming a steady light rain late", "devenant une pluie légère continue tard"],
    ["becoming a steady light rain", "devenant une pluie légère continue"],
    ["becoming a steady rain later in the day", "devenant une pluie continue plus tard en journée"],
    ["becoming a steady rain late", "devenant une pluie continue tard"],
    ["becoming a steady rain overnight", "devenant une pluie continue durant la nuit"],
    ["becoming a steady rain", "devenant une pluie continue"],
    ["A steady light rain", "une pluie légère continue"],
    ["A steady light snow", "une neige légère continue"],
    ["A steady rain", "une pluie continue"],
    ["A steady snow", "une neige continue"],
    ["Steady light rain", "pluie légère continue"],
    ["Steady light snow", "neige légère continue"],
    ["Steady rain", "pluie continue"],
    ["Steady snow", "neige continue"],

    // "A ... sky" / "... skies" (LONGEST FIRST!)
    ["A mostly clear sky", "ciel généralement dégagé"],
    ["A mainly clear sky", "ciel principalement dégagé"],
    ["A mostly sunny sky", "ciel généralement ensoleillé"],
    ["A mainly sunny sky", "ciel principalement ensoleillé"],
    ["A mostly cloudy sky", "ciel généralement nuageux"],
    ["A mainly cloudy sky", "ciel principalement nuageux"],
    ["A partly cloudy sky", "ciel partiellement nuageux"],
    ["A partly sunny sky", "ciel partiellement ensoleillé"],
    ["A clear sky", "ciel dégagé"],
    ["A sunny sky", "ciel ensoleillé"],
    ["A cloudy sky", "ciel nuageux"],
    ["An overcast sky", "ciel couvert"],
    ["A fair sky", "ciel clément"],

    ["mainly cloudy skies", "ciel généralement nuageux"],
    ["mostly cloudy skies", "ciel généralement nuageux"],
    ["partly cloudy skies", "ciel partiellement nuageux"],
    ["partly sunny skies", "ciel partiellement ensoleillé"],
    ["mostly sunny skies", "ciel généralement ensoleillé"],
    ["mainly sunny skies", "ciel généralement ensoleillé"],
    ["mainly clear skies", "ciel généralement dégagé"],
    ["mostly clear skies", "ciel généralement dégagé"],
    ["clear skies", "ciel dégagé"],
    ["sunny skies", "ciel ensoleillé"],
    ["cloudy skies", "ciel nuageux"],
    ["fair skies", "ciel clément"],
    ["overcast skies", "ciel couvert"],
    ["hazy skies", "ciel brumeux"],

    ["mostly clear sky", "ciel généralement dégagé"],
    ["mainly clear sky", "ciel principalement dégagé"],
    ["mostly sunny sky", "ciel généralement ensoleillé"],
    ["mainly sunny sky", "ciel principalement ensoleillé"],
    ["mostly cloudy sky", "ciel généralement nuageux"],
    ["mainly cloudy sky", "ciel principalement nuageux"],
    ["partly cloudy sky", "ciel partiellement nuageux"],
    ["partly sunny sky", "ciel partiellement ensoleillé"],
    ["clear sky", "ciel dégagé"],
    ["sunny sky", "ciel ensoleillé"],
    ["cloudy sky", "ciel nuageux"],
    ["overcast sky", "ciel couvert"],


    // "A mix of ..." / "Mix of ..."
    ["A mix of clouds and sun in the morning", "alternance de nuages et de soleil en matinée"],
    ["A mix of sun and clouds in the morning", "alternance de soleil et de nuages en matinée"],
    ["A mix of sun and clouds", "alternance de soleil et de nuages"],
    ["Mix of sun and clouds", "alternance de soleil et de nuages"],
    ["A mix of clouds and sun", "alternance de nuages et de soleil"],
    ["Mix of clouds and sun", "alternance de nuages et de soleil"],
    ["A mix of rain and snow", "mélange de pluie et de neige"],
    ["Mix of rain and snow", "mélange de pluie et de neige"],
    ["A mix of snow and rain", "mélange de neige et de pluie"],
    ["Mix of snow and rain", "mélange de neige et de pluie"],
    ["A mix of precipitation", "mélange de précipitations"],
    ["Mix of precipitation", "mélange de précipitations"],
    ["A mix of", "un mélange de"],
    ["Mix of", "mélange de"],
    ["A blend of sun and clouds", "alternance de soleil et de nuages"],
    ["A blend of clouds and sun", "alternance de nuages et de soleil"],
    ["A blend of", "un mélange de"],
    ["Blend of", "mélange de"],

    // Chances & Slight chances
    ["A slight chance of a rain shower", "faible risque d'averse de pluie"],
    ["A slight chance of a shower", "faible risque d'une averse"],
    ["A slight chance of a thunderstorm", "faible risque d'un orage"],
    ["A slight chance of a thundershower", "faible risque d'une averse orageuse"],
    ["A slight chance of a snow shower", "faible risque d'averse de neige"],
    ["A slight chance of a flurry", "faible risque de flocons"],
    ["A slight chance of rain", "faible probabilité de pluie"],
    ["A slight chance of snow", "faible probabilité de neige"],
    ["A slight chance of showers", "faible risque d'averses"],
    ["A slight chance of storms", "faible risque d'orages"],
    ["A slight chance of thunderstorms", "faible risque d'orages"],
    ["A slight chance of precipitation", "faible probabilité de précipitations"],
    ["A slight chance of precip", "faible probabilité de précipitations"],
    ["A slight chance of", "faible probabilité de"],
    ["A slight chance", "faible risque"],

    ["Slight chance of a rain shower", "faible risque d'averse de pluie"],
    ["Slight chance of a shower", "faible risque d'une averse"],
    ["Slight chance of a thunderstorm", "faible risque d'un orage"],
    ["Slight chance of a thundershower", "faible risque d'une averse orageuse"],
    ["Slight chance of a snow shower", "faible risque d'averse de neige"],
    ["Slight chance of a flurry", "faible risque de flocons"],
    ["Slight chance of rain", "faible probabilité de pluie"],
    ["Slight chance of snow", "faible probabilité de neige"],
    ["Slight chance of showers", "faible risque d'averses"],
    ["Slight chance of storms", "faible risque d'orages"],
    ["Slight chance of thunderstorms", "faible risque d'orages"],
    ["Slight chance of precipitation", "faible probabilité de précipitations"],
    ["Slight chance of precip", "faible probabilité de précipitations"],
    ["Slight chance of", "faible probabilité de"],
    ["Slight chance", "faible risque"],

    ["A chance of a rain shower", "probabilité d'averse de pluie"],
    ["A chance of a shower", "probabilité d'une averse"],
    ["A chance of a thunderstorm", "risque d'un orage"],
    ["A chance of a thundershower", "risque d'une averse orageuse"],
    ["A chance of a snow shower", "probabilité d'averse de neige"],
    ["A chance of a flurry", "probabilité de flocons"],
    ["A chance of rain", "probabilité de pluie"],
    ["A chance of snow", "probabilité de neige"],
    ["A chance of showers", "probabilité d'averses"],
    ["A chance of storms", "risque d'orages"],
    ["A chance of thunderstorms", "risque d'orages"],
    ["A chance of precipitation", "probabilité de précipitations"],
    ["A chance of precip", "probabilité de précipitations"],
    ["A chance of", "probabilité de"],

    ["Chance of a rain shower", "probabilité d'averse de pluie"],
    ["Chance of a shower", "probabilité d'une averse"],
    ["Chance of a thunderstorm", "risque d'un orage"],
    ["Chance of a thundershower", "risque d'une averse orageuse"],
    ["Chance of a snow shower", "probabilité d'averse de neige"],
    ["Chance of a flurry", "probabilité de flocons"],
    ["Chance of rain", "probabilité de pluie"],
    ["Chance of snow", "probabilité de neige"],
    ["Chance of showers", "probabilité d'averses"],
    ["Chance of storms", "risque d'orages"],
    ["Chance of thunderstorms", "risque d'orages"],
    ["Chance of precipitation", "probabilité de précipitations"],
    ["Chance of precip", "probabilité de précipitations"],
    ["Chance of", "probabilité de"],

    ["Risk of a thunderstorm", "risque d'un orage"],
    ["Risk of thunderstorms", "risque d'orages"],
    ["Risk of rain", "risque de pluie"],
    ["Risk of snow", "risque de neige"],
    ["Precipitation possible", "précipitations possibles"],

    // Other "A / An ..." singles
    ["A rain shower", "une averse de pluie"],
    ["A snow shower", "une averse de neige"],
    ["A shower", "une averse"],
    ["A thunderstorm", "un orage"],
    ["A thundershower", "une averse orageuse"],
    ["A flurry", "un flocon"],
    ["A heavy downpour", "une forte averse"],
    ["A downpour", "une forte averse"],
    ["A heavy shower", "une forte averse"],
    ["A light shower", "une légère averse"],
    ["A light rain shower", "une légère averse de pluie"],
    ["A light snow shower", "une légère averse de neige"],
    ["A light rain", "une pluie légère"],
    ["A light snow", "une neige légère"],
    ["A heavy rain", "une forte pluie"],
    ["A heavy snow", "une forte neige"],
    ["A period of freezing rain", "une période de pluie verglacée"],
    ["A period of drizzle", "une période de bruine"],
    ["A period of rain", "une période de pluie"],
    ["A period of snow", "une période de neige"],
    ["A break in the clouds", "une éclaircie"],
    ["A break in the overcast", "une éclaircie"],

    // Multi-level cloud & sky transitions
    ["clear to partly cloudy", "dégagé à partiellement nuageux"],
    ["partly to mostly cloudy", "partiellement à généralement nuageux"],
    ["mostly to partly cloudy", "généralement à partiellement nuageux"],
    ["sunny to partly cloudy", "ensoleillé à partiellement nuageux"],
    ["partly to mostly", "partiellement à généralement"],
    ["mostly to partly", "généralement à partiellement"],
    ["clear to partly", "dégagé à partiellement"],
    ["sunny to partly", "ensoleillé à partiellement"],

    ["mainly cloudy", "généralement nuageux"],
    ["mainly sunny", "généralement ensoleillé"],
    ["mainly clear", "généralement dégagé"],
    ["mostly cloudy", "généralement nuageux"],
    ["mostly sunny", "généralement ensoleillé"],
    ["mostly clear", "généralement dégagé"],
    ["partly cloudy", "partiellement nuageux"],
    ["partly sunny", "partiellement ensoleillé"],

    // Off and on / At times
    ["off and on rain showers", "averses de pluie intermittentes"],
    ["off and on snow showers", "averses de neige intermittentes"],
    ["off and on showers", "averses intermittentes"],
    ["off and on rain", "pluie intermittente"],
    ["off and on snow", "neige intermittente"],
    ["off and on", "intermittent"],
    ["rain showers at times", "averses de pluie par moments"],
    ["snow showers at times", "averses de neige par moments"],
    ["showers at times", "averses par moments"],
    ["rain at times", "pluie par moments"],
    ["snow at times", "neige par moments"],
    ["at times", "par moments"],

    // Remaining / Continuing / Arriving / Ending
    ["remaining mostly cloudy", "demeurant généralement nuageux"],
    ["remaining partly cloudy", "demeurant partiellement nuageux"],
    ["remaining cloudy", "demeurant nuageux"],
    ["remaining clear", "demeurant dégagé"],
    ["remaining sunny", "demeurant ensoleillé"],
    ["remaining", "demeurant"],
    ["Showers continuing in the afternoon", "averses se poursuivant en après-midi"],
    ["Showers continuing in the morning", "averses se poursuivant en matinée"],
    ["Showers continuing late", "averses se poursuivant tard"],
    ["Showers continuing overnight", "averses se poursuivant durant la nuit"],
    ["Showers continuing", "averses se poursuivant"],
    ["Rain continuing", "pluie se poursuivant"],
    ["Snow continuing", "neige se poursuivant"],
    ["continuing in the afternoon", "se poursuivant en après-midi"],
    ["continuing in the morning", "se poursuivant en matinée"],
    ["continuing late", "se poursuivant tard"],
    ["continuing overnight", "se poursuivant durant la nuit"],
    ["continuing", "se poursuivant"],

    ["arriving sometime in the afternoon", "arrivant en après-midi"],
    ["arriving sometime in the morning", "arrivant en matinée"],
    ["arriving sometime in the evening", "arrivant en soirée"],
    ["arriving sometime", "arrivant au cours de la journée"],
    ["arriving late", "arrivant tard"],
    ["arriving early", "arrivant tôt"],
    ["arriving", "arrivant"],

    ["Rain ending this evening then becoming foggy", "pluie se terminant en soirée, puis devenant brumeux"],
    ["Rain ending this evening", "pluie se terminant en soirée"],
    ["Rain ending this morning", "pluie se terminant ce matin"],
    ["ending this evening", "se terminant en soirée"],
    ["ending this morning", "se terminant ce matin"],
    ["ending this afternoon", "se terminant cet après-midi"],
    ["ending tonight", "se terminant ce soir"],
    ["ending overnight", "se terminant durant la nuit"],
    ["ending early", "se terminant tôt"],
    ["ending late", "se terminant tard"],
    ["ending as", "se terminant en"],
    ["ending", "se terminant"],
    ["starting early", "débutant tôt"],
    ["starting late", "débutant tard"],
    ["starting as", "débutant en"],
    ["starting", "débutant"],
    ["beginning early", "débutant tôt"],
    ["beginning late", "débutant tard"],
    ["beginning", "débutant"],

    // Partial sunshine / clearing
    ["partial sunshine expected late", "éclaircies prévues tard"],
    ["partial sunshine expected early", "éclaircies prévues tôt"],
    ["partial sunshine expected", "éclaircies prévues"],
    ["partial sunshine", "éclaircies"],
    ["partial clearing", "dégagement partiel"],

    // Followed by
    ["followed by mostly cloudy skies", "suivi d'un ciel généralement nuageux"],
    ["followed by partly cloudy skies", "suivi d'un ciel partiellement nuageux"],
    ["followed by cloudy skies", "suivi d'un ciel nuageux"],
    ["followed by clearing skies", "suivi d'un dégagement"],
    ["followed by increasing clouds", "suivi d'un ennuagement"],
    ["followed by clearing", "suivi d'un dégagement"],
    ["followed by showers", "suivi d'averses"],
    ["followed by rain", "suivi de pluie"],
    ["followed by snow", "suivi de neige"],
    ["followed by a", "suivi d'un"],
    ["followed by an", "suivi d'un"],
    ["followed by", "suivi de"],

    // Becoming / Turning
    ["becoming foggy", "devenant brumeux"],
    ["becoming mostly sunny", "devenant généralement ensoleillé"],
    ["becoming mostly cloudy", "devenant généralement nuageux"],
    ["becoming partly cloudy", "devenant partiellement nuageux"],
    ["becoming partly sunny", "devenant partiellement ensoleillé"],
    ["becoming mostly", "devenant généralement"],
    ["becoming partly", "devenant partiellement"],
    ["becoming sunny", "devenant ensoleillé"],
    ["becoming clear", "devenant dégagé"],
    ["becoming cloudy", "devenant nuageux"],
    ["becoming overcast", "devenant couvert"],
    ["becoming windy", "devenant venteux"],
    ["becoming less windy", "vents diminuant"],
    ["becoming breezy", "devenant venteux"],
    ["becoming", "devenant"],
    ["will become overcast later during the night", "deviendra couvert plus tard durant la nuit"],
    ["will become overcast", "deviendra couvert"],
    ["will become", "deviendra"],

    ["turning to rain", "se changeant en pluie"],
    ["turning to snow", "se changeant en neige"],
    ["turning to", "se changeant en"],
    ["turning into", "se transformant en"],
    ["turning mostly", "devenant généralement"],
    ["turning partly", "devenant partiellement"],
    ["turning cloudy", "devenant nuageux"],
    ["turning sunny", "devenant ensoleillé"],
    ["turning clear", "devenant dégagé"],
    ["turning colder", "se refroidissant"],
    ["turning warmer", "se réchauffant"],
    ["turning windy", "devenant venteux"],
    ["turning", "devenant"],
    ["changing to rain", "se changeant en pluie"],
    ["changing to snow", "se changeant en neige"],
    ["changing to", "se changeant en"],
    ["changing into", "se transformant en"],
    ["transitioning to", "passant à"],
    ["tapering off to", "diminuant en"],
    ["tapering off", "diminuant progressivement"],
    ["diminishing to", "diminuant à"],
    ["diminishing", "diminuant"],

    // Rain & showers early/late combinations
    ["Rain showers early with clearing later at night", "averses de pluie tôt avec dégagement plus tard durant la nuit"],
    ["Rain showers early with clearing late at night", "averses de pluie tôt avec dégagement tard durant la nuit"],
    ["Rain showers early with clearing late", "averses de pluie tôt avec dégagement tard"],
    ["Rain showers early with overcast skies later in the day", "averses de pluie tôt avec ciel couvert plus tard en journée"],
    ["Rain showers early with overcast skies late", "averses de pluie tôt avec ciel couvert tard"],
    ["Rain showers in the evening becoming a steady light rain overnight", "averses de pluie en soirée devenant une pluie légère continue durant la nuit"],
    ["Rain showers in the morning becoming a steady light rain in the afternoon", "averses de pluie en matinée devenant une pluie légère continue en après-midi"],
    ["Rain showers in the evening", "averses de pluie en soirée"],
    ["Rain showers in the morning", "averses de pluie en matinée"],
    ["Rain showers in the afternoon", "averses de pluie en après-midi"],
    ["Showers early becoming a steady light rain later in the day", "averses tôt devenant une pluie légère continue plus tard en journée"],
    ["Showers early becoming a steady light rain late", "averses tôt devenant une pluie légère continue tard"],
    ["Showers early becoming a steady rain later in the day", "averses tôt devenant une pluie continue plus tard en journée"],
    ["Showers early becoming a steady rain late", "averses tôt devenant une pluie continue tard"],
    ["Showers early, becoming a steady rain later in the day", "averses tôt, devenant une pluie continue plus tard en journée"],
    ["Showers early, becoming a steady rain late", "averses tôt, devenant une pluie continue tard"],
    ["Showers in the evening with some clearing overnight", "averses en soirée avec quelques éclaircies durant la nuit"],
    ["Showers in the evening, then cloudy overnight", "averses en soirée, puis nuageux durant la nuit"],
    ["Showers in the evening, then partly cloudy overnight", "averses en soirée, puis partiellement nuageux durant la nuit"],
    ["Showers in the morning, then cloudy in the afternoon", "averses en matinée, puis nuageux en après-midi"],
    ["Showers in the morning, then partly cloudy in the afternoon", "averses en matinée, puis partiellement nuageux en après-midi"],
    ["Showers in the evening", "averses en soirée"],
    ["Showers in the morning", "averses en matinée"],
    ["Showers in the afternoon", "averses en après-midi"],
    ["Showers early, then cloudy overnight", "averses tôt, puis nuageux durant la nuit"],
    ["Showers early, then partly cloudy overnight", "averses tôt, puis partiellement nuageux durant la nuit"],
    ["Rain showers early", "averses de pluie tôt"],
    ["Rain showers late", "averses de pluie tard"],
    ["Snow showers early", "averses de neige tôt"],
    ["Snow showers late", "averses de neige tard"],
    ["Showers early", "averses tôt"],
    ["Showers late", "averses tard"],
    ["Rain early", "pluie tôt"],
    ["Rain late", "pluie tard"],
    ["Snow early", "neige tôt"],
    ["Snow late", "neige tard"],

    // Occasional & periods
    ["Considerable cloudiness with occasional rain showers", "nuages abondants avec averses de pluie intermittentes"],
    ["Considerable cloudiness with occasional snow showers", "nuages abondants avec averses de neige intermittentes"],
    ["Considerable cloudiness with occasional showers", "nuages abondants avec averses intermittentes"],
    ["Considerable cloudiness with occasional light rain", "nuages abondants avec pluie légère intermittente"],
    ["Considerable cloudiness with occasional light snow", "nuages abondants avec neige légère intermittente"],
    ["Considerable cloudiness with occasional rain", "nuages abondants avec pluie intermittente"],
    ["Considerable cloudiness", "nuages abondants"],
    ["Considerable clouds early", "nuages abondants tôt"],
    ["Considerable clouds late", "nuages abondants tard"],
    ["Considerable clouds", "nuages abondants"],

    ["Cloudy with occasional rain showers", "nuageux avec averses de pluie intermittentes"],
    ["Cloudy with occasional snow showers", "nuageux avec averses de neige intermittentes"],
    ["Cloudy with occasional showers late at night", "nuageux avec averses intermittentes tard durant la nuit"],
    ["Cloudy with occasional showers", "nuageux avec averses intermittentes"],
    ["Cloudy with occasional light rain", "nuageux avec pluie légère intermittente"],
    ["Cloudy with occasional light snow", "nuageux avec neige légère intermittente"],
    ["Cloudy with occasional rain", "nuageux avec pluie intermittente"],
    ["Cloudy with occasional snow", "nuageux avec neige intermittente"],
    ["Cloudy with periods of rain", "nuageux avec périodes de pluie"],
    ["Cloudy with periods of snow", "nuageux avec périodes de neige"],
    ["Cloudy with showers", "nuageux avec averses"],
    ["Cloudy with rain", "nuageux avec pluie"],
    ["Cloudy with snow", "nuageux avec neige"],

    ["with occasional rain showers", "avec averses de pluie intermittentes"],
    ["with occasional snow showers", "avec averses de neige intermittentes"],
    ["with occasional light rain", "avec pluie légère intermittente"],
    ["with occasional light snow", "avec neige légère intermittente"],
    ["with occasional rain", "avec pluie intermittente"],
    ["with occasional snow", "avec neige intermittente"],
    ["with occasional showers", "avec averses intermittentes"],
    ["with occasional drizzle", "avec bruine intermittente"],
    ["occasional rain showers in the afternoon", "averses de pluie intermittentes en après-midi"],
    ["occasional rain showers", "averses de pluie intermittentes"],
    ["occasional snow showers", "averses de neige intermittentes"],
    ["occasional light rain", "pluie légère intermittente"],
    ["occasional light snow", "neige légère intermittente"],
    ["occasional rain", "pluie intermittente"],
    ["occasional snow", "neige intermittente"],
    ["occasional showers", "averses intermittentes"],
    ["occasional drizzle", "bruine intermittente"],

    ["periods of rain", "périodes de pluie"],
    ["periods of snow", "périodes de neige"],
    ["periods of showers after midnight", "périodes d'averses après minuit"],
    ["periods of showers", "périodes d'averses"],
    ["periods of drizzle", "périodes de bruine"],
    ["periods of freezing rain", "périodes de pluie verglacée"],

    // Time phrases
    ["in the afternoon and evening", "en après-midi et en soirée"],
    ["during the afternoon and evening", "en après-midi et en soirée"],
    ["in the morning and afternoon", "en matinée et en après-midi"],
    ["during the morning and afternoon", "en matinée et en après-midi"],
    ["during the afternoon hours", "en après-midi"],
    ["during the morning hours", "en matinée"],
    ["during the evening hours", "en soirée"],
    ["for the afternoon hours", "en après-midi"],
    ["for the morning hours", "en matinée"],
    ["for the evening hours", "en soirée"],
    ["afternoon hours", "en après-midi"],
    ["morning hours", "en matinée"],
    ["evening hours", "en soirée"],
    ["later during the night", "plus tard durant la nuit"],
    ["later at night", "plus tard durant la nuit"],
    ["late at night", "tard durant la nuit"],
    ["during the night", "durant la nuit"],
    ["through the night", "durant la nuit"],
    ["throughout the night", "tout au long de la nuit"],
    ["for the afternoon", "en après-midi"],
    ["for the morning", "en matinée"],
    ["for the evening", "en soirée"],
    ["for the night", "durant la nuit"],
    ["for the day", "durant la journée"],
    ["later in the day", "plus tard en journée"],
    ["later in the afternoon", "en fin d'après-midi"],
    ["later in the morning", "en fin de matinée"],
    ["later in the evening", "en fin de soirée"],
    ["later tonight", "plus tard cette nuit"],
    ["early in the day", "tôt en journée"],
    ["early in the morning", "tôt en matinée"],
    ["early in the afternoon", "tôt en après-midi"],
    ["early in the evening", "tôt en soirée"],
    ["late in the day", "en fin de journée"],
    ["late in the morning", "en fin de matinée"],
    ["late in the afternoon", "en fin d'après-midi"],
    ["late in the evening", "en fin de soirée"],
    ["during the morning", "en matinée"],
    ["during the afternoon", "en après-midi"],
    ["during the evening", "en soirée"],
    ["during the day", "durant la journée"],
    ["through the morning", "durant la matinée"],
    ["through the afternoon", "durant l'après-midi"],
    ["through the evening", "durant la soirée"],
    ["throughout the day", "tout au long de la journée"],
    ["in the afternoon", "en après-midi"],
    ["in the morning", "en matinée"],
    ["in the evening", "en soirée"],
    ["early tonight", "en début de nuit"],
    ["late tonight", "en fin de nuit"],
    ["after midnight", "après minuit"],
    ["before midnight", "avant minuit"],
    ["around midnight", "vers minuit"],
    ["towards morning", "vers le matin"],
    ["towards evening", "vers le soir"],
    ["by morning", "d'ici le matin"],
    ["by evening", "d'ici le soir"],
    ["by afternoon", "d'ici l'après-midi"],
    ["this morning", "ce matin"],
    ["this afternoon", "cet après-midi"],
    ["this evening", "en soirée"],
    ["all day", "toute la journée"],
    ["all night", "toute la nuit"],
    ["overnight", "durant la nuit"],
    ["tonight", "ce soir"],
    ["today", "aujourd'hui"],
    ["tomorrow", "demain"],

    // Cloudiness & Sunshine
    ["Intervals of clouds and sunshine", "passages nuageux avec éclaircies"],
    ["Intervals of clouds and sun", "passages nuageux avec éclaircies"],
    ["Intervals of sunshine and clouds", "éclaircies avec passages nuageux"],
    ["Intervals of sun and clouds", "éclaircies avec passages nuageux"],
    ["Times of sun and clouds", "alternance de soleil et de nuages"],
    ["Times of clouds and sun", "alternance de nuages et de soleil"],
    ["Sunshine and clouds mixed", "alternance de soleil et de nuages"],
    ["Sun and clouds mixed", "alternance de soleil et de nuages"],
    ["Clouds and sun mixed", "alternance de nuages et de soleil"],
    ["Clouds and sunshine mixed", "alternance de nuages et de soleil"],
    ["Increasing clouds early", "ennuagement tôt"],
    ["Increasing clouds late", "ennuagement tard"],
    ["Increasing clouds", "ennuagement"],
    ["Increasing cloudiness", "ennuagement progressif"],
    ["Decreasing clouds early", "dégagement tôt"],
    ["Decreasing clouds late", "dégagement tard"],
    ["Decreasing clouds", "dégagement"],
    ["Decreasing cloudiness", "dégagement progressif"],
    ["Clearing early", "dégagement tôt"],
    ["Clearing late", "dégagement tard"],
    ["Clearing skies late", "dégagement tard"],
    ["Clearing skies early", "dégagement tôt"],
    ["Clearing skies", "dégagement"],
    ["Clearing overnight", "dégagement durant la nuit"],
    ["Clearing", "dégagement"],
    ["Gradual clearing", "dégagement progressif"],
    ["Variably cloudy", "nuages variables"],
    ["Variable clouds", "nuages variables"],
    ["Variable cloudiness", "nébulosité variable"],
    ["Broken clouds", "nuages fragmentés"],
    ["Passing clouds", "nuages passagers"],
    ["Scattered clouds", "nuages dispersés"],
    ["Abundant sunshine", "franc soleil"],
    ["Plentiful sunshine", "franc soleil"],
    ["Filtered sunshine", "soleil voilé"],
    ["Filtered sun", "soleil voilé"],
    ["Hazy sunshine", "soleil voilé"],
    ["Sunshine", "ensoleillement"],
    ["from time to time", "par moments"],

    // Precipitation & storms compounds
    ["Thunderstorms in the vicinity", "tonnerre à proximité"],
    ["Thunder in the vicinity", "tonnerre à proximité"],
    ["Thunder in the Vicinity", "tonnerre à proximité"],
    ["Thunderstorms around", "orages à proximité"],
    ["Thunderstorms likely", "orages probables"],
    ["Thunderstorms possible", "orages possibles"],
    ["Thunderstorm likely", "orage probable"],
    ["Thunderstorm possible", "orage possible"],
    ["Scattered strong thunderstorms", "orages violents dispersés"],
    ["Isolated strong thunderstorms", "orages violents isolés"],
    ["Severe thunderstorms", "orages violents"],
    ["Severe thunderstorm", "orage violent"],
    ["Scattered thunderstorms early", "orages dispersés tôt"],
    ["Scattered thunderstorms late", "orages dispersés tard"],
    ["Scattered thunderstorms", "orages dispersés"],
    ["Isolated thunderstorms early", "orages isolés tôt"],
    ["Isolated thunderstorms late", "orages isolés tard"],
    ["Isolated thunderstorms", "orages isolés"],
    ["Widely scattered thunderstorms", "orages très dispersés"],
    ["Widely scattered showers", "averses très dispersées"],
    ["Widely scattered", "très dispersé"],

    ["Snow showers around", "averses de neige à proximité"],
    ["Rain showers around", "averses de pluie à proximité"],
    ["Showers around", "averses à proximité"],
    ["Showers in the vicinity", "averses à proximité"],
    ["Showers in the Vicinity", "averses à proximité"],
    ["Showers nearby", "averses à proximité"],
    ["Showers Nearby", "averses à proximité"],
    ["Rain around", "pluie à proximité"],
    ["Snow around", "neige à proximité"],

    ["Scattered snow showers", "averses de neige dispersées"],
    ["Isolated snow showers", "averses de neige isolées"],
    ["Scattered rain showers", "averses de pluie dispersées"],
    ["Isolated rain showers", "averses de pluie isolées"],
    ["Scattered showers for the afternoon", "averses dispersées en après-midi"],
    ["Scattered showers", "averses dispersées"],
    ["Isolated showers", "averses isolées"],
    ["Passing rain showers", "averses de pluie passagères"],
    ["Passing snow showers", "averses de neige passagères"],
    ["Passing showers", "averses passagères"],
    ["Passing shower", "averse passagère"],
    ["Rain showers", "averses de pluie"],
    ["Snow showers", "averses de neige"],

    ["Thunder showers", "averses orageuses"],
    ["Thundershowers", "averses orageuses"],
    ["Thundershower", "averse orageuse"],
    ["Thunder storms", "orages"],
    ["Thunderstorm", "orage"],
    ["Thunder storm", "orage"],
    ["Thunder possible", "tonnerre possible"],
    ["Thunder likely", "tonnerre probable"],

    ["Heavy freezing rain", "forte pluie verglacée"],
    ["Light freezing rain", "pluie verglacée légère"],
    ["Freezing rain likely", "pluie verglacée probable"],
    ["Freezing rain", "pluie verglacée"],
    ["Heavy freezing drizzle", "forte bruine verglacée"],
    ["Light freezing drizzle", "bruine verglacée légère"],
    ["Freezing drizzle", "bruine verglacée"],
    ["Snow flurries early", "quelques flocons tôt"],
    ["Snow flurries late", "quelques flocons tard"],
    ["Snow flurries", "quelques flocons"],
    ["Snow squalls", "bourrasques de neige"],
    ["Snow squall", "bourrasque de neige"],
    ["Blowing snow", "poudrerie"],
    ["Drifting snow", "poudrerie basse"],
    ["Wintry mix changing to rain", "précipitations mixtes se changeant en pluie"],
    ["Wintry mix", "précipitations mixtes"],
    ["Heavy drizzle", "forte bruine"],
    ["Light drizzle", "bruine légère"],
    ["Drizzle likely", "bruine probable"],
    ["Moderate rain", "pluie modérée"],
    ["Heavy rainfall", "fortes pluies"],
    ["Heavy downpours", "fortes averses"],
    ["Heavy rain early", "forte pluie tôt"],
    ["Heavy rain late", "forte pluie tard"],
    ["Heavy rain", "forte pluie"],
    ["Light rain early", "pluie légère tôt"],
    ["Light rain late", "pluie légère tard"],
    ["Light rain with thunderstorms by evening", "pluie légère avec orages en soirée"],
    ["Light rain with thunderstorms", "pluie légère avec orages"],
    ["Light rain", "pluie légère"],
    ["Moderate snow", "neige modérée"],
    ["Heavy snow", "forte neige"],
    ["Light snow", "neige légère"],
    ["Rain likely", "pluie probable"],
    ["Snow likely", "neige probable"],
    ["Showers likely", "averses probables"],
    ["Rain possible", "pluie possible"],
    ["Snow possible", "neige possible"],
    ["Showers possible", "averses possibles"],
    ["Rain and snow mixed with", "pluie et neige mélangées avec"],
    ["Rain and snow", "pluie et neige"],
    ["Rain / snow", "pluie et neige"],
    ["Rain / Snow", "pluie et neige"],
    ["Snow and rain", "neige et pluie"],
    ["Snow / rain", "neige et pluie"],
    ["Snow / Rain", "neige et pluie"],
    ["Rain and sleet", "pluie et grésil"],
    ["Snow and sleet", "neige et grésil"],
    ["Heavy sleet", "fort grésil"],
    ["Light sleet", "grésil léger"],
    ["Ice pellets", "grésil"],
    ["Dense fog early", "brouillard dense tôt"],
    ["Dense fog late", "brouillard dense tard"],
    ["Dense fog", "brouillard dense"],
    ["Patchy fog", "brouillard par endroits"],
    ["Areas of fog", "bancs de brouillard"],
    ["Freezing fog", "brouillard givrant"],
    ["Localized flooding possible", "inondations localisées possibles"],
    ["Snow accumulating", "accumulation de neige"],
    ["Snow accumulation", "accumulation de neige"],
    ["Rain accumulating", "accumulation de pluie"],
    ["Rain accumulation", "accumulation de pluie"],
    ["Accumulations of", "accumulations de"],
    ["Accumulation of", "accumulation de"],
    ["Accumulating to", "accumulation de"],
    ["Accumulating", "accumulation de"],
    ["Less than 1 inch", "moins de 2 cm"],
    ["1 to 3 inches", "2 à 5 cm"],
    ["3 to 5 inches", "5 à 10 cm"],
    ["5 to 8 inches", "10 à 20 cm"],
    ["8 to 12 inches", "20 à 30 cm"],
    ["Around 1 inch of snow", "près de 2 cm de neige"],
    ["Around 1 inch", "près de 2 cm"],
    ["Around 2 inches", "près de 5 cm"],
    ["Around 3 inches", "près de 8 cm"],
    ["Around 4 inches", "près de 10 cm"],
    ["Around 5 inches", "près de 12 cm"],

    // Wind phrases
    ["Windy with gusts up to", "venteux avec rafales jusqu'à"],
    ["with gusts up to", "avec rafales jusqu'à"],
    ["Winds light and variable", "vents faibles et variables"],
    ["Winds light & variable", "vents faibles et variables"],
    ["Light and variable winds", "vents faibles et variables"],
    ["Light and variable wind", "vent faible et variable"],
    ["Light and variable", "faibles et variables"],
    ["Light & variable", "faibles et variables"],
    ["Light winds", "vents faibles"],
    ["Calm wind", "vent calme"],
    ["Calm winds", "vents calmes"],
    ["Higher wind gusts possible", "plus fortes rafales possibles"],
    ["Winds increasing to", "vents augmentant à"],
    ["Winds diminishing to", "vents diminuant à"],
    ["Winds decreasing to", "vents diminuant à"],
    ["Winds shifting to", "vents tournant au"],
    ["Winds from the", "vents de"],
    ["Winds WNW", "Vents ONO"],
    ["Winds WSW", "Vents OSO"],
    ["Winds NNW", "Vents NNO"],
    ["Winds SSW", "Vents SSO"],
    ["Winds ENE", "Vents ENE"],
    ["Winds ESE", "Vents ESE"],
    ["Winds NNE", "Vents NNE"],
    ["Winds SSE", "Vents SSE"],
    ["Winds NW", "Vents NO"],
    ["Winds SW", "Vents SO"],
    ["Winds NE", "Vents NE"],
    ["Winds SE", "Vents SE"],
    ["Winds W", "Vents O"],
    ["Winds E", "Vents E"],
    ["Winds N", "Vents N"],
    ["Winds S", "Vents S"],
    ["Winds", "Vents"],

    // Conditions & general temps
    ["Near steady temperature around", "température quasi stationnaire autour de"],
    ["Near steady temperature near", "température quasi stationnaire près de"],
    ["Near steady temperature", "température quasi stationnaire"],
    ["Temperatures nearly steady in the", "températures quasi stationnaires dans les"],
    ["Temperatures nearly steady", "températures quasi stationnaires"],
    ["Temperatures falling to", "températures à la baisse vers"],
    ["Temperatures rising to", "températures à la hausse vers"],
    ["from the north", "du nord"],
    ["from the south", "du sud"],
    ["from the east", "de l'est"],
    ["from the west", "de l'ouest"],
    ["from the northeast", "du nord-est"],
    ["from the northwest", "du nord-ouest"],
    ["from the southeast", "du sud-est"],
    ["from the southwest", "du sud-ouest"],

    // Short 7-day outlook abbreviations & combos
    ["AM Clouds/PM Sun", "Nuages AM / Soleil PM"],
    ["PM Clouds/AM Sun", "Nuages PM / Soleil AM"],
    ["Clouds Early/Clearing Late", "Nuages tôt / Dégagement tard"],
    ["P Cloudy", "Beau"],
    ["P. Cloudy", "Beau"],
    ["P Cldy", "Beau"],
    ["M Cloudy", "Nuageux"],
    ["M. Cloudy", "Nuageux"],
    ["M Cldy", "Nuageux"],
    ["M Sunny", "Très beau"],
    ["M. Sunny", "Très beau"],
    ["M Clear", "Très dégagé"],
    ["P Sunny", "Beau"],
    ["P. Sunny", "Beau"],
    ["PM T-Storms", "Orages PM"],
    ["AM T-Storms", "Orages AM"],
    ["PM T-storm", "Orages PM"],
    ["AM T-storm", "Orages AM"],
    ["T-Storms", "Orages"],
    ["T-Storm", "Orage"],
    ["T-Showers", "Averses orageuses"],
    ["T-Shower", "Averse orageuse"],
    ["PM Showers", "Averses PM"],
    ["AM Showers", "Averses AM"],
    ["PM Lgt Rain", "Pluie lég. PM"],
    ["AM Lgt Rain", "Pluie lég. AM"],
    ["PM Light Rain", "Pluie lég. PM"],
    ["AM Light Rain", "Pluie lég. AM"],
    ["PM Rain", "Pluie PM"],
    ["AM Rain", "Pluie AM"],
    ["PM Snow", "Neige PM"],
    ["AM Snow", "Neige AM"],
    ["Few Showers", "Quelques averses"],
    ["Few Flurries", "Quelques flocons"],
    ["Few Storms", "Quelques orages"],
    ["Few Clouds", "Quelques nuages"],
    ["Shwrs Early", "Averses tôt"],
    ["Shwrs Late", "Averses tard"],
    ["Showers Early", "Averses tôt"],
    ["Showers Late", "Averses tard"],
    ["Sct'd Thunder storms", "Orages dispersés"],
    ["Sct'd Thunderstorms", "Orages dispersés"],
    ["Sct'd Thundershowers", "Averses orageuses"],
    ["Sct'd T-Storms", "Orages local."],
    ["Sct T-Storms", "Orages local."],
    ["Sct'd Showers", "Averses local."],
    ["Sct'd Snow", "Neige local."],
    ["Sct'd Rain", "Pluie local."],
    ["Sct'd", "Dispersé"],
    ["Sct", "Dispersé"],
    ["Wintry Mix", "Précip. mixtes"],
    ["Rain & Windy", "Pluie et venteux"],
    ["Rain, Windy", "Pluie et venteux"],
    ["Rain / Windy", "Pluie et venteux"],
    ["Rain/Windy", "Pluie et venteux"],
    ["Rain / Wind", "Pluie et venteux"],
    ["Rain/Wind", "Pluie et venteux"],
    ["Snow & Windy", "Neige et venteux"],
    ["Snow, Windy", "Neige et venteux"],
    ["Snow / Windy", "Neige et venteux"],
    ["Snow/Windy", "Neige et venteux"],
    ["Snow / Wind", "Neige et venteux"],
    ["Snow/Wind", "Neige et venteux"],
    ["Showers / Wind", "Averses et venteux"],
    ["Showers/Wind", "Averses et venteux"],
    ["Clouds & Windy", "Nuages et venteux"],
    ["Clouds, Windy", "Nuages et venteux"],
    ["Clouds / Windy", "Nuages et venteux"],
    ["Cloudy & Windy", "Nuageux et venteux"],
    ["Cloudy, Windy", "Nuageux et venteux"],
    ["Cloudy / Windy", "Nuageux et venteux"],
    ["Cloudy / Wind", "Nuageux et venteux"],
    ["Cloudy/Wind", "Nuageux et venteux"],
    ["Sunny & Windy", "Ensoleillé et venteux"],
    ["Sunny, Windy", "Ensoleillé et venteux"],
    ["Sunny / Windy", "Ensoleillé et venteux"],
    ["Sunny / Wind", "Ensoleillé et venteux"],
    ["Sunny/Wind", "Ensoleillé et venteux"],
    ["Clear / Wind", "Dégagé et venteux"],
    ["Clear/Wind", "Dégagé et venteux"],
    ["Clouds, PM", "Nuages PM"],
    ["Clouds/PM", "Nuages PM"],
    ["PM Clouds", "Nuages PM"],
    ["AM Clouds", "Nuages AM"],
    ["Clear Late", "Dégagé tard"],
    ["Clear Early", "Dégagé tôt"],

    // Single words & compounds
    ["Thunderstorms", "orages"],
    ["Thunderstorm", "orage"],
    ["Thunder", "tonnerre"],
    ["Showers", "averses"],
    ["Shower", "averse"],
    ["Rainfall", "pluie"],
    ["Snowfall", "neige"],
    ["Rain", "pluie"],
    ["Snow", "neige"],
    ["Flurries", "quelques flocons"],
    ["Flurry", "flocon"],
    ["Sleet", "grésil"],
    ["Hail", "grêle"],
    ["Drizzle", "bruine"],
    ["Overcast", "couvert"],
    ["Cloudy", "nuageux"],
    ["Clouds", "nuages"],
    ["Cloud", "nuage"],
    ["Sunny", "ensoleillé"],
    ["Sun", "soleil"],
    ["Clear", "dégagé"],
    ["Fair", "beau temps"],
    ["Foggy", "brumeux"],
    ["Fog", "brouillard"],
    ["Hazy", "brumeux"],
    ["Haze", "brume sèche"],
    ["Smoke", "fumée"],
    ["Mist", "brume"],
    ["Windy", "venteux"],
    ["Breezy", "légère brise"],
    ["Mixed with", "mélangé avec"],
    ["mixed with", "mélangé avec"],

    // Residual words & connectors
    ["\\bMostly\\b", "généralement"],
    ["\\bPartly\\b", "partiellement"],
    ["\\bGenerally\\b", "généralement"],
    ["\\bMainly\\b", "principalement"],
    ["\\bHigh\\b", "Max"],
    ["\\bLow\\b", "Min"],
    ["\\bearly\\b", "tôt"],
    ["\\blate\\b", "tard"],
    ["\\bmph\\b", "km/h"],
    ["\\bskies\\b", "ciel"],
    ["\\bsky\\b", "ciel"],
    ["\\bwith\\b", "avec"],
    ["\\bwithout\\b", "sans"],
    ["\\baround\\b", "autour de"],
    ["\\bnear\\b", "près de"],
    ["\\bexpected\\b", "prévu"],
    ["\\bpossible\\b", "possible"],
    ["\\boccasional\\b", "intermittent"],
    ["\\boccasionally\\b", "occasionnellement"],
    ["\\band\\b", "et"],
    ["\\bor\\b", "ou"],
    ["\\bto\\b", "à"],
    ["\\bfrom\\b", "de"],
    ["\\bfor\\b", "pour"],
    ["\\bduring\\b", "durant"],
    ["\\blater\\b", "plus tard"],
    ["\\bconditions\\b", "conditions"],
    ["\\bcondition\\b", "condition"],
    ["\\bdeveloping\\b", "se développant"],
    ["\\bdevelops\\b", "se développe"],
    ["\\bdevelop\\b", "se développer"],
    ["\\botherwise\\b", "sinon"],
    ["\\bunder\\b", "sous"],
    ["\\bmixture\\b", "mélange"],
    ["\\bample\\b", "franc"],
    ["\\bnumerous\\b", "nombreux"],
    ["\\bheavy\\b", "forte"],
    ["\\bsteadier\\b", "plus continue"],
    ["\\blikely\\b", "probable"],
    ["\\bnoon\\b", "midi"],
    ["\\bdiminish\\b", "diminuer"],
    ["\\bdiminishing\\b", "diminuant"],
    ["\\bmore\\b", "plus"],
    ["\\bless\\b", "moins"],
    ["\\bespecially\\b", "particulièrement"],
    ["\\bpossibly\\b", "possiblement"],
    ["\\bwind\\b", "vent"]
];

// Pre-compiled list of [RegExp, replacement]
var SORTED_WEATHER_PHRASES = (() => {
    var regexList = [];
    var plainList = [];
    for (var i = 0; i < RAW_WEATHER_PHRASES.length; i++) {
        var item = RAW_WEATHER_PHRASES[i];
        if (item[0].startsWith("\\b") || item[0].includes("(") || item[0].includes("?")) {
            regexList.push([new RegExp(item[0], "gi"), item[1]]);
        } else {
            plainList.push(item);
        }
    }
    plainList.sort((a, b) => b[0].length - a[0].length);
    var compiledPlain = plainList.map(item => [new RegExp("\\b" + item[0].replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&") + "\\b", "gi"), item[1]]);
    return [...compiledPlain, ...regexList];
})();

function translateWeatherNarrative(text) {
    if (!text) return "";
    let t = String(text).trim();
    if (!t) return "";

    // 0. Initial normalization
    t = t.replace(/\s+/g, " ");
    t = t.replace(/F\.\s+/g, ". ").replace(/C\.\s+/g, ". ");
    t = t.replace(/\/Wind\b/gi, " et venteux");
    t = t.replace(/\/Sun\b/gi, " / Soleil");
    t = t.replace(/\/Rain\b/gi, " / Pluie");
    t = t.replace(/\/Snow\b/gi, " / Neige");
    t = t.replace(/\/PM\b/gi, " PM");
    t = t.replace(/\/AM\b/gi, " AM");
    t = t.replace(/\.{3,}then\b/gi, "... puis ");
    t = t.replace(/\.{3,}/g, "... ");

    // 1. High-level transition & complex sentence regexes
    t = t.replace(/\bExcept for a few\s+(?:morning|afternoon|evening|night)?\s*clouds,\s*/gi, (match) => {
        if (/morning/i.test(match)) return "Sauf quelques nuages en matinée, ";
        if (/afternoon/i.test(match)) return "Sauf quelques nuages en après-midi, ";
        if (/evening/i.test(match)) return "Sauf quelques nuages en soirée, ";
        if (/night/i.test(match)) return "Sauf quelques nuages durant la nuit, ";
        return "Sauf quelques nuages, ";
    });
    t = t.replace(/\bExcept for a few clouds\b/gi, "sauf quelques nuages");
    t = t.replace(/\bExcept for\b/gi, "à l'exception de");

    t = t.replace(/\b(?:Some|A\s+few)\s+clouds\s+(?:in\s+the\s+morning|this\s+morning|early)\s+will\s+give\s+way\s+to\s+(?:mainly|mostly|generally)\s+sunny\s+skies\s+(?:for|in)\s+the\s+afternoon\b/gi,
        "quelques nuages en matinée feront place à un ciel généralement ensoleillé en après-midi");
    t = t.replace(/\b(?:Some|A\s+few)\s+clouds\s+(?:in\s+the\s+morning|this\s+morning|early)\s+will\s+give\s+way\s+to\s+sunny\s+skies\s+(?:for|in)\s+the\s+afternoon\b/gi,
        "quelques nuages en matinée feront place à un ciel ensoleillé en après-midi");
    t = t.replace(/\b(?:Some|A\s+few)\s+clouds\s+(?:in\s+the\s+morning|this\s+morning|early)\s+will\s+give\s+way\s+to\s+sunshine\s+(?:for|in)\s+the\s+afternoon\b/gi,
        "quelques nuages en matinée feront place au soleil en après-midi");
    t = t.replace(/\b(?:Some|A\s+few)\s+clouds\s+(?:in\s+the\s+morning|this\s+morning|early)\s+will\s+give\s+way\s+to\s+(?:mainly|mostly|generally)\s+cloudy\s+skies\s+(?:for|in)\s+the\s+afternoon\b/gi,
        "quelques nuages en matinée feront place à un ciel généralement nuageux en après-midi");
    t = t.replace(/\b(?:Some|A\s+few)\s+clouds\s+(?:in\s+the\s+morning|this\s+morning|early)\s+will\s+give\s+way\s+to\s+(?:generally|mainly|mostly)?\s*clear\s+(?:conditions|skies)\s+(?:overnight|tonight|late)\b/gi,
        "quelques nuages tôt feront place à des conditions généralement dégagées durant la nuit");
    t = t.replace(/\b(?:Some|A\s+few)\s+clouds\s+(?:early|in\s+the\s+morning)\s+will\s+give\s+way\s+to\s+(?:generally|mainly|mostly)?\s*clear\s+(?:conditions|skies)\b/gi,
        "quelques nuages tôt feront place à des conditions généralement dégagées");

    t = t.replace(/\bMorning\s+clouds\s+(?:will\s+give|giving)\s+way\s+to\s+(?:afternoon\s+sunshine|sunshine\s+(?:for|in)\s+the\s+afternoon)\b/gi,
        "nuages en matinée faisant place au soleil en après-midi");

    t = t.replace(/\bwill\s+give\s+way\s+to\s+(?:mainly|mostly|generally)\s+sunny\s+skies\b/gi, "feront place à un ciel généralement ensoleillé");
    t = t.replace(/\bwill\s+give\s+way\s+to\s+(?:mainly|mostly|generally)\s+cloudy\s+skies\b/gi, "feront place à un ciel généralement nuageux");
    t = t.replace(/\bwill\s+give\s+way\s+to\s+(?:generally|mainly|mostly)?\s*clear\s+conditions\b/gi, "feront place à des conditions généralement dégagées");
    t = t.replace(/\bwill\s+give\s+way\s+to\s+sunny\s+skies\b/gi, "feront place à un ciel ensoleillé");
    t = t.replace(/\bwill\s+give\s+way\s+to\s+clear\s+skies\b/gi, "feront place à un ciel dégagé");
    t = t.replace(/\bwill\s+give\s+way\s+to\s+cloudy\s+skies\b/gi, "feront place à un ciel nuageux");
    t = t.replace(/\bwill\s+give\s+way\s+to\s+sunshine\b/gi, "feront place au soleil");
    t = t.replace(/\bgiving\s+way\s+to\s+(?:mainly|mostly|generally)\s+sunny\s+skies\b/gi, "faisant place à un ciel généralement ensoleillé");
    t = t.replace(/\bgiving\s+way\s+to\s+sunny\s+skies\b/gi, "faisant place à un ciel ensoleillé");
    t = t.replace(/\bgiving\s+way\s+to\s+sunshine\b/gi, "faisant place au soleil");
    t = t.replace(/\bwill\s+give\s+way\s+to\b/gi, "feront place à");
    t = t.replace(/\bgiving\s+way\s+to\b/gi, "faisant place à");
    t = t.replace(/\bgives\s+way\s+to\b/gi, "fait place à");
    t = t.replace(/\bgive\s+way\s+to\b/gi, "faire place à");

    // 2. Wind patterns
    t = t.replace(/\b([A-Z]{1,3})\s+winds?\s+shifting\s+to\s+([A-Z]{1,3})\s+at\s+(\d+)\s+to\s+(\d+)\s*(?:mph|km\/h)?\b/gi, (match, d1, d2, min, max) => {
        return `Vents ${translateWindCardinal(d1)} tournant au ${translateWindCardinal(d2)} de ${min} à ${max} km/h`;
    });
    t = t.replace(/\b([A-Z]{1,3})\s+winds?\s+shifting\s+to\s+([A-Z]{1,3})\s+at\s+(\d+)\s*(?:mph|km\/h)?\b/gi, (match, d1, d2, spd) => {
        return `Vents ${translateWindCardinal(d1)} tournant au ${translateWindCardinal(d2)} à ${spd} km/h`;
    });
    t = t.replace(/\bWinds?\s+([A-Z]{1,3}|variable|light\s*(?:and|&)\s*variable)\s+at\s+(\d+)\s+to\s+(\d+)\s*(?:mph|km\/h)?\b/gi, (match, dir, min, max) => {
        const dirFr = translateWindCardinal(dir);
        return `Vents ${dirFr} de ${min} à ${max} km/h`;
    });
    t = t.replace(/\bWinds?\s+([A-Z]{1,3}|variable|light\s*(?:and|&)\s*variable)\s+at\s+(\d+)\s*(?:mph|km\/h)?\b/gi, (match, dir, spd) => {
        const dirFr = translateWindCardinal(dir);
        return `Vents ${dirFr} à ${spd} km/h`;
    });
    t = t.replace(/\bWinds?\s+at\s+(\d+)\s+to\s+(\d+)\s*(?:mph|km\/h)?\b/gi, "Vents de $1 à $2 km/h");
    t = t.replace(/\bWinds?\s+at\s+(\d+)\s*(?:mph|km\/h)?\b/gi, "Vents à $1 km/h");
    t = t.replace(/\b(?:Wind\s+)?gusts?\s+(?:up\s+to|could\s+reach)\s+(\d+)\s*(?:mph|km\/h)?\b/gi, "rafales jusqu'à $1 km/h");
    t = t.replace(/\bwith\s+gusts\s+up\s+to\s+(\d+)\s*(?:mph|km\/h)?\b/gi, "avec rafales jusqu'à $1 km/h");
    t = t.replace(/\bat\s+(\d+)\s+to\s+(\d+)\s*(?:mph|km\/h)?\b/gi, "de $1 à $2 km/h");
    t = t.replace(/\bat\s+(\d+)\s*(?:mph|km\/h)\b/gi, "à $1 km/h");

    // 3. Numbers, Measurements & Ranges
    t = t.replace(/\b(\d+)\s+to\s+(\d+)\s*(cm|mm|km|km\/h|m)\b/gi, "$1 à $2 $3");
    t = t.replace(/\bHighs?\s+in\s+the\s+upper\s+(\d+)s?\b/gi, "Maxs dans les hauts $1");
    t = t.replace(/\bHighs?\s+in\s+the\s+mid\s+(\d+)s?\b/gi, "Maxs autour de $1");
    t = t.replace(/\bHighs?\s+in\s+the\s+low\s+(\d+)s?\b/gi, "Maxs dans les bas $1");
    t = t.replace(/\bHighs?\s+in\s+the\s+(\d+)s?\b/gi, "Maxs dans les $1");
    t = t.replace(/\bLows?\s+in\s+the\s+upper\s+(\d+)s?\b/gi, "Mins dans les hauts $1");
    t = t.replace(/\bLows?\s+in\s+the\s+mid\s+(\d+)s?\b/gi, "Mins autour de $1");
    t = t.replace(/\bLows?\s+in\s+the\s+low\s+(\d+)s?\b/gi, "Mins dans les bas $1");
    t = t.replace(/\bLows?\s+in\s+the\s+(\d+)s?\b/gi, "Mins dans les $1");
    t = t.replace(/\bLows?\s+overnight\s+in\s+the\s+upper\s+(\d+)s?\b/gi, "Mins durant la nuit dans les hauts $1");
    t = t.replace(/\bLows?\s+overnight\s+in\s+the\s+mid\s+(\d+)s?\b/gi, "Mins durant la nuit autour de $1");
    t = t.replace(/\bLows?\s+overnight\s+in\s+the\s+low\s+(\d+)s?\b/gi, "Mins durant la nuit dans les bas $1");
    t = t.replace(/\bLows?\s+overnight\s+in\s+the\s+(\d+)s?\b/gi, "Mins durant la nuit dans les $1");
    t = t.replace(/\bLows?\s+overnight\s+(?:around|near)\s+(\d+)\b/gi, "Mins durant la nuit près de $1");
    t = t.replace(/\bLows?\s+overnight\s+(\d+)\b/gi, "Mins durant la nuit $1");
    t = t.replace(/\bHighs?\s+(\d+)\s+to\s+(\d+)\b/gi, "Maxs de $1 à $2");
    t = t.replace(/\bLows?\s+(\d+)\s+to\s+(\d+)\b/gi, "Mins de $1 à $2");
    t = t.replace(/\bHigh\s+(?:near|around)\s+(\d+)[FC]?\b/gi, "Max près de $1");
    t = t.replace(/\bLow\s+(?:near|around)\s+(\d+)[FC]?\b/gi, "Min près de $1");
    t = t.replace(/\bHigh\s+(\d+)[FC]?\b/gi, "Max $1");
    t = t.replace(/\bLow\s+(\d+)[FC]?\b/gi, "Min $1");

    t = t.replace(/\bRainfall\s+near\s+(\d+)\s*(mm|cm|in|inches)?\b/gi, "Accumulation de pluie près de $1 $2");
    t = t.replace(/\bRainfall\s+around\s+(\d+)\s*(mm|cm|in|inches)?\b/gi, "Accumulation de pluie autour de $1 $2");
    t = t.replace(/\bSnowfall\s+near\s+(\d+)\s*(mm|cm|in|inches)?\b/gi, "Accumulation de neige près de $1 $2");
    t = t.replace(/\bSnowfall\s+around\s+(\d+)\s*(mm|cm|in|inches)?\b/gi, "Accumulation de neige autour de $1 $2");

    t = t.replace(/\b(?:A\s+)?Chance\s+of\s+rain\s+(\d+)\s*%/gi, "Probabilité de pluie $1%");
    t = t.replace(/\b(\d+)\s*%\s+chance\s+of\s+rain\b/gi, "Probabilité de pluie $1%");
    t = t.replace(/\b(?:A\s+)?Chance\s+of\s+snow\s+(\d+)\s*%/gi, "Probabilité de neige $1%");
    t = t.replace(/\b(\d+)\s*%\s+chance\s+of\s+snow\b/gi, "Probabilité de neige $1%");
    t = t.replace(/\b(?:A\s+)?Chance\s+of\s+(?:precip|precipitation)\s+(\d+)\s*%/gi, "Probabilité de précipitations $1%");
    t = t.replace(/\b(\d+)\s*%\s+chance\s+of\s+(?:precip|precipitation)\b/gi, "Probabilité de précipitations $1%");
    t = t.replace(/\b(?:A\s+)?Chance\s+of\s+(?:storms|thunderstorms)\s+(\d+)\s*%/gi, "Risque d'orages $1%");
    t = t.replace(/\b(\d+)\s*%\s+chance\s+of\s+(?:storms|thunderstorms)\b/gi, "Risque d'orages $1%");
    t = t.replace(/\b(?:A\s+)?Chance\s+of\s+showers\s+(\d+)\s*%/gi, "Probabilité d'averses $1%");
    t = t.replace(/\b(\d+)\s*%\s+chance\s+of\s+showers\b/gi, "Probabilité d'averses $1%");

    // 4. Sequential transitions
    t = t.replace(/,\s*\bthen\s+/gi, ", puis ");
    t = t.replace(/\band\s+then\s+/gi, " puis ");
    t = t.replace(/\bthen\s+/gi, "puis ");

    // 5. Pre-sorted dictionary replacements
    for (let i = 0; i < SORTED_WEATHER_PHRASES.length; i++) {
        const entry = SORTED_WEATHER_PHRASES[i];
        t = t.replace(entry[0], entry[1]);
    }

    // 6. Residual "A", "An", "Some" cleanup:
    t = t.replace(/\bSome\s+([a-zà-öø-ÿ]+)\b/gi, (m, word) => {
        const w = word.toLowerCase();
        if (["pluie", "neige", "bruine", "brouillard", "brume", "verglas", "grésil", "soleil"].includes(w)) {
            return `un peu de ${word}`;
        }
        return `quelques ${word}`;
    });
    t = t.replace(/\bSome\b/gi, "quelques");

    t = t.replace(/\bA\s+(quelques\b)/gi, "$1");
    t = t.replace(/\bA\s+(probabilité\b)/gi, "$1");
    t = t.replace(/\bA\s+(risque\b)/gi, "$1");
    t = t.replace(/\bA\s+(possibilité\b)/gi, "$1");
    t = t.replace(/\bA\s+(faible\s+probabilité\b)/gi, "$1");
    t = t.replace(/\bA\s+(faible\s+risque\b)/gi, "$1");
    t = t.replace(/\bA\s+(alternance\b)/gi, "$1");
    t = t.replace(/\bA\s+(ciel\b)/gi, "un $1");
    t = t.replace(/\bA\s+(orage\b)/gi, "un $1");
    t = t.replace(/\bA\s+(flocon\b)/gi, "un $1");
    t = t.replace(/\bA\s+(mélange\b)/gi, "un $1");
    t = t.replace(/\bA\s+(dégagement\b)/gi, "un $1");
    t = t.replace(/\bA\s+(ennuagement\b)/gi, "un $1");
    t = t.replace(/\bA\s+(averse\b)/gi, "une $1");
    t = t.replace(/\bA\s+(pluie\b)/gi, "une $1");
    t = t.replace(/\bA\s+(neige\b)/gi, "une $1");
    t = t.replace(/\bA\s+(période\b)/gi, "une $1");
    t = t.replace(/\bA\s+(éclaircie\b)/gi, "une $1");
    t = t.replace(/\bA\s+or\s+two\b/gi, "ou deux");
    t = t.replace(/\bAn?\s+([a-zà-öø-ÿ]+)\b/gi, (m, word) => {
        const w = word.toLowerCase();
        if (["averse", "pluie", "neige", "période", "éclaircie", "forte", "légère", "continue"].includes(w)) {
            return `une ${word}`;
        }
        if (["orage", "ciel", "flocon", "mélange", "dégagement", "ennuagement", "fort", "léger", "continu"].includes(w)) {
            return `un ${word}`;
        }
        if (["quelques", "probabilité", "risque", "possibilité", "généralement", "partiellement", "principalement"].includes(w)) {
            return word;
        }
        return word;
    });

    // 7. Cleanup residual English artifacts
    t = t.replace(/\bhours\b/gi, "");
    t = t.replace(/\bhour\b/gi, "heure");
    t = t.replace(/\bremaining\b/gi, "demeurant");
    t = t.replace(/\bis\s+possible\b/gi, "possible");
    t = t.replace(/\bare\s+possible\b/gi, "possibles");
    t = t.replace(/\bdeveloping\b/gi, "se développant");
    t = t.replace(/\bdevelops\b/gi, "se développe");
    t = t.replace(/\bdevelop\b/gi, "se développer");
    t = t.replace(/\botherwise\b/gi, "sinon");
    t = t.replace(/\bunder\b/gi, "sous");
    t = t.replace(/\balong\s+avec\b/gi, "avec");
    t = t.replace(/\balong\b/gi, "avec");
    t = t.replace(/\blikely\b/gi, "probable");
    t = t.replace(/\bthe\s+mostly\b/gi, "puis généralement");

    // 8. Post-processing cleanup
    t = t.replace(/\s+([.,;:!?])/g, "$1");
    t = t.replace(/\s+/g, " ").trim();
    t = t.replace(/(^|[.!?]\s+)([a-zà-öø-ÿ])/g, (m, sep, letter) => `${sep}${letter.toUpperCase()}`);
    t = t.replace(/,\s*puis\s+([A-ZÀ-ÖØ-ß])/g, (m, letter) => `, puis ${letter.toLowerCase()}`);
    t = t.replace(/\b(?:un\s+)?ciel\s+([a-zà-öø-ÿ\s]+)\s+feront\s+place\s+à\b/gi, "un ciel $1 fera place à");
    t = t.replace(/\bCiel\s+([a-zà-öø-ÿ\s]+)\s+feront\s+place\s+à\b/gi, "Ciel $1 fera place à");
    t = t.replace(/\bmax\s+(\d+)/gi, "Max $1");
    t = t.replace(/\bmin\s+(\d+)/gi, "Min $1");

    return t;
}
window.translateWeatherNarrative = translateWeatherNarrative;

function formatSunTime(ts) {
    if (!ts) return "";
    var d = new Date(ts);
    var h = String(d.getHours()).padStart(2, "0");
    var m = String(d.getMinutes()).padStart(2, "0");
    return `${h}h${m}`;
}

async function grabLocalForecast() {
    //includes 36 hour forecast and week ahead
    weatherInfo.dayDesc.days = [];
    weatherInfo.weekAhead.days = [];
    weatherInfo.almanac.days = [];
    var url = "https://api.weather.com/v3/wx/forecast/daily/7day?geocode=" + locationConfig.mainCity.lat + "," + locationConfig.mainCity.lon + "&format=json&units=" + getUnits() + "&language=en-US&apiKey=" + api_key;
    return $.getJSON(url, function (data) {
        markFeedSuccess("forecast");
        var dayOfWeek = { 0: "Dimanche", 1: "Lundi", 2: "Mardi", 3: "Mercredi", 4: "Jeudi", 5: "Vendredi", 6: "Samedi" };
        var dayShort = { "SUN": "DIM", "MON": "LUN", "TUE": "MAR", "WED": "MER", "THU": "JEU", "FRI": "VEN", "SAT": "SAM" };
        //36 HOUR
        for (var i = (data.daypart[0].daypartName[0] === null ? 1 : 0); i < (data.daypart[0].daypartName[0] === null ? 5 : 4); i++) {
            var rawName = data.daypart[0].daypartName[i] || "";
            var translatedName = rawName
                .replace("Tomorrow", dayOfWeek[new Date().getHours() > 3 ? new Date().getDay() : new Date().getDay() - 1])
                .replace("Sunday", "Dimanche").replace("Monday", "Lundi").replace("Tuesday", "Mardi")
                .replace("Wednesday", "Mercredi").replace("Thursday", "Jeudi").replace("Friday", "Vendredi")
                .replace("Saturday", "Samedi").replace("Tonight", "Ce soir").replace("Today", "Aujourd'hui")
                .replace(" night", " Soir").replace(" Night", " Soir");

            var rawNarrative = data.daypart[0].narrative[i] ? data.daypart[0].narrative[i].replaceAll("F. ", ". ").replaceAll("C. ", ". ") : "";
            var translatedNarrative = translateWeatherNarrative(rawNarrative);

            var dayDescToAdd = {
                name: translatedName,
                desc: translatedNarrative,
                rawName: rawName,
                rawDesc: rawNarrative,
                narrQualiCode: data.daypart[0].qualifierCode[i] == null ? "" : data.daypart[0].qualifierCode[i].replace("Q",""),
                iconCode: data.daypart[0].iconCodeExtend[i],
                cond: { name: codetoFcst[data.daypart[0].iconCodeExtend[i]].mov, time: data.daypart[0].daypartName[i].endsWith("night") ? "_night" : "_day" }
            }
            weatherInfo.dayDesc.days.push(dayDescToAdd);
        }
        //7 DAY
        for (var j = 0; j < 7; j++) {
            var dayWAtoAdd = { name: "", cond: "", icon: "", high: "", low: "", windspeed: "" }
            var rawDayName = data.dayOfWeek[data.daypart[0].wxPhraseLong[0] === null ? j + 1 : j].substring(0, 3).toUpperCase();
            dayWAtoAdd.name = dayShort[rawDayName] || rawDayName;
            var phraseRaw = data.daypart[0].wxPhraseShort && data.daypart[0].wxPhraseShort[(data.daypart[0].wxPhraseLong[0] === null ? (j * 2 + 2) : (j * 2))]
                ? data.daypart[0].wxPhraseShort[(data.daypart[0].wxPhraseLong[0] === null ? (j * 2 + 2) : (j * 2))]
                : (data.daypart[0].wxPhraseLong[(data.daypart[0].wxPhraseLong[0] === null ? (j * 2 + 2) : (j * 2))] || "");
            phraseRaw = phraseRaw.replaceAll("Thunderstorms", "Thunder storms").replaceAll("Scattered", "Sct'd").replaceAll("Thundershowers", "Thunder showers").replaceAll("/Wind", " & Windy").replaceAll("Rain/", "Rain, ").replaceAll("Clouds/PM", "Clouds, PM");
            dayWAtoAdd.cond = translateWeatherNarrative(phraseRaw);
            dayWAtoAdd.icon = data.daypart[0].iconCodeExtend[(data.daypart[0].iconCodeExtend[0] === null ? (j * 2 + 2) : (j * 2))];
            dayWAtoAdd.high = data.daypart[0].temperature[(data.daypart[0].temperature[0] === null ? (j * 2 + 2) : (j * 2))];
            dayWAtoAdd.low = data.daypart[0].temperature[(data.daypart[0].temperature[0] === null ? (j * 2 + 3) : (j * 2 + 1))];
            if (data.daypart[0].temperature[0] != null && j === 0) {
                dayWAtoAdd.low = "";
            }
            weatherInfo.weekAhead.days.push(dayWAtoAdd)
        }
        //ALMANAC
        var almOffset = data.dayOfWeek[0] === null ? 1 : 0;
        var rawAlmDay1 = (data.dayOfWeek[almOffset] || "").toUpperCase();
        var rawAlmDay2 = (data.dayOfWeek[almOffset + 1] || "").toUpperCase();
        var almFr = { "SUNDAY": "DIMANCHE", "MONDAY": "LUNDI", "TUESDAY": "MARDI", "WEDNESDAY": "MERCREDI", "THURSDAY": "JEUDI", "FRIDAY": "VENDREDI", "SATURDAY": "SAMEDI" };
        var almanacDayOne = {
            day: almFr[rawAlmDay1] || rawAlmDay1,
            sunrise: formatSunTime(data.sunriseTimeLocal[almOffset]),
            sunset: formatSunTime(data.sunsetTimeLocal[almOffset])
        }
        weatherInfo.almanac.days.push(almanacDayOne);
        var almanacDayTwo = {
            day: almFr[rawAlmDay2] || rawAlmDay2,
            sunrise: formatSunTime(data.sunriseTimeLocal[almOffset + 1]),
            sunset: formatSunTime(data.sunsetTimeLocal[almOffset + 1])
        }
        weatherInfo.almanac.days.push(almanacDayTwo);
    }).fail(function () {
        weatherInfo.dayDesc.noReport = true;
        weatherInfo.weekAhead.noReport = true;
        weatherInfo.almanac.noReport = true;
        var periods = ["Aujourd'hui", "Ce soir", "Demain"]
        for (var i = 0; i < 3; i++) {
            var dayDescToAddNR = { name: periods[i], desc: "Temporairement indisponible" }
            weatherInfo.dayDesc.days.push(dayDescToAddNR);
        }
        for (var j = 0; j < 7; j++) {
            var dayOfWeekFr = { 0: "DIM", 1: "LUN", 2: "MAR", 3: "MER", 4: "JEU", 5: "VEN", 6: "SAM" }
            var dayWAtoAddNR = { name: dayOfWeekFr[(new Date().getDay() + j) % 7], cond: "", icon: 4400, high: "", low: "" }
            weatherInfo.weekAhead.days.push(dayWAtoAddNR);
        }
        weatherInfo.almanac.days.push({ day: "", sunrise: "", sunset: "" });
        weatherInfo.almanac.days.push({ day: "", sunrise: "", sunset: "" });
    })
}
function grabMonthlyPrecip() {
    var url = "https://api.weather.com/v1/geocode/" + locationConfig.mainCity.lat + "/" + locationConfig.mainCity.lon + "/observations/current.json?language=en-US&units=" + getUnits() + "&apiKey=" + api_key;
    return $.getJSON(url, function (data) {
        try {
            weatherInfo.monthlyPrecip = isMetric() ? data.observation.metric.precip_mtd.toFixed(1) : data.observation.imperial.precip_mtd.toFixed(2);
        } catch (error) {
            weatherInfo.monthlyPrecip = ""
        }
    }).fail(function () {
        weatherInfo.monthlyPrecip = ""
    })
}
async function grabAirQuality() {
    weatherInfo.airQuality.pollutants = [];
    var pollutantCount = 0;
    return $.getJSON(`https://api.weather.com/v3/wx/globalAirQuality?geocode=${locationConfig.mainCity.lat},${locationConfig.mainCity.lon}&language=en-US&scale=EPA&format=json&apiKey=${api_key}`, function (data) {
        var catMap = {
            "Good": "BON",
            "Moderate": "MODÉRÉ",
            "Unhealthy for Sensitive Groups": "GROUPES SENSIBLES",
            "Unhealthy": "DANGEREUX",
            "Very Unhealthy": "TRÈS DANGEREUX",
            "Hazardous": "EXTRÊME"
        };
        weatherInfo.airQuality.category = catMap[data.globalairquality.airQualityCategory] || data.globalairquality.airQualityCategory;
        weatherInfo.airQuality.categoryIndex = data.globalairquality.airQualityCategoryIndex;
        var pollutantNames = {
            "Particulate matter": "Particules fines (PM2.5)",
            "PM2.5": "Particules fines (PM2.5)",
            "PM10": "Particules fines (PM10)",
            "Ozone": "Ozone (O3)",
            "O3": "Ozone (O3)",
            "Nitrogen dioxide": "Dioxyde d'azote (NO2)",
            "NO2": "Dioxyde d'azote (NO2)",
            "Sulfur dioxide": "Dioxyde de soufre (SO2)",
            "SO2": "Dioxyde de soufre (SO2)",
            "Carbon monoxide": "Monoxyde de carbone (CO)",
            "CO": "Monoxyde de carbone (CO)"
        };
        for (pollutant in data.globalairquality.pollutants) {
            pollutantCount++;
            if (data.globalairquality.pollutants[pollutant].categoryIndex == data.globalairquality.airQualityCategoryIndex) {
                var rawPhr = data.globalairquality.pollutants[pollutant].phrase || "";
                var baseName = rawPhr.startsWith("Particulate matter") ? "Particulate matter" : rawPhr;
                var translatedPol = pollutantNames[baseName] || pollutantNames[pollutant] || baseName;
                weatherInfo.airQuality.pollutants.push(translatedPol);
            }
        }
        if (weatherInfo.airQuality.pollutants.length == 0 || weatherInfo.airQuality.pollutants.length == pollutantCount) {
            weatherInfo.airQuality.pollutants = [];
            weatherInfo.airQuality.pollutants.push("Aucun");
        }
    })
}

async function grabAlmanac() {
    var date = new Date();
    date.setDate(date.getDate() - 1);
    var yidx = new Date().getHours() >= 15 ? 1 : 0;
    return $.getJSON(`https://api.weather.com/v3/aggcommon/v3-wx-conditions-historical-dailysummary-30day;v3-wx-almanac-daily-5day?geocode=${locationConfig.mainCity.lat},${locationConfig.mainCity.lon}&language=en-US&format=json&units=${getUnits()}&startDay=${date.getDate()}&startMonth=${date.getMonth() + 1}&apiKey=${api_key}`, function (data) {
        weatherInfo.almanac.stationname = locationConfig.mainCity.displayname.toUpperCase();
        var hist = data["v3-wx-conditions-historical-dailysummary-30day"];
        if (hist && hist.temperatureMax && hist.temperatureMax.length > 1) {
            var yHigh = hist.temperatureMax[1 - yidx] ?? hist.temperatureMax[1];
            var yLow = hist.temperatureMin[1 - yidx] ?? hist.temperatureMin[1];
            weatherInfo.almanac.yesterday.high = yHigh !== null && yHigh !== undefined ? Math.round(yHigh) : "";
            weatherInfo.almanac.yesterday.low = yLow !== null && yLow !== undefined ? Math.round(yLow) : "";
        }

        if (data["v3-wx-almanac-daily-5day"]) {
            weatherInfo.almanac.average.high = Math.round(data["v3-wx-almanac-daily-5day"].temperatureAverageMax[1]);
            weatherInfo.almanac.average.low = Math.round(data["v3-wx-almanac-daily-5day"].temperatureAverageMin[1]);
            weatherInfo.almanac.record.high = Math.round(data["v3-wx-almanac-daily-5day"].temperatureRecordMax[1]);
            weatherInfo.almanac.record.recordYearHigh = data["v3-wx-almanac-daily-5day"].almanacRecordYearMax[1];
            weatherInfo.almanac.record.low = Math.round(data["v3-wx-almanac-daily-5day"].temperatureRecordMin[1]);
            weatherInfo.almanac.record.recordYearLow = data["v3-wx-almanac-daily-5day"].almanacRecordYearMin[1];
        } else if (hist && hist.temperatureMax) {
            var validHighs = hist.temperatureMax.filter(v => v !== null && v !== undefined);
            var validLows = hist.temperatureMin.filter(v => v !== null && v !== undefined);
            if (validHighs.length > 0) {
                weatherInfo.almanac.average.high = Math.round(validHighs.reduce((a, b) => a + b, 0) / validHighs.length);
                weatherInfo.almanac.record.high = Math.round(Math.max(...validHighs));
                weatherInfo.almanac.record.recordYearHigh = "N/A";
            }
            if (validLows.length > 0) {
                weatherInfo.almanac.average.low = Math.round(validLows.reduce((a, b) => a + b, 0) / validLows.length);
                weatherInfo.almanac.record.low = Math.round(Math.min(...validLows));
                weatherInfo.almanac.record.recordYearLow = "N/A";
            }
        }
    });
}

async function grabDaypartForecast() {
    weatherInfo.daypartForecast.times = [];
    var dpHours = [];
    var dayOfWeek = {
        0: ["DIMANCHE", "DIM SOIR/LUN", "LUNDI"], 
        1: ["LUNDI", "LUN SOIR/MAR", "MARDI"], 
        2: ["MARDI", "MAR SOIR/MER", "MERCREDI"], 
        3: ["MERCREDI", "MER SOIR/JEU", "JEUDI"],
        4: ["JEUDI", "JEU SOIR/VEN", "VENDREDI"], 
        5: ["VENDREDI", "VEN SOIR/SAM", "SAMEDI"], 
        6: ["SAMEDI", "SAM SOIR/DIM", "DIMANCHE"]
    };
    var dpCurrent = dateFns.getHours(new Date())
    if (dpCurrent < 5) {
        weatherInfo.daypartForecast.dayName = dayOfWeek[new Date().getDay()][0];
        dpHours = [6, 12, 15, 17];
    } else if (dpCurrent >= 5 && dpCurrent < 10) {
        weatherInfo.daypartForecast.dayName = dayOfWeek[new Date().getDay()][0];
        dpHours = [12, 15, 17, 20];
    } else if (dpCurrent >= 10 && dpCurrent < 14) {
        weatherInfo.daypartForecast.dayName = dayOfWeek[new Date().getDay()][1];
        dpHours = [15, 17, 20, 0];
    } else if (dpCurrent >= 14 && dpCurrent < 16) {
        weatherInfo.daypartForecast.dayName = dayOfWeek[new Date().getDay()][2];
        dpHours = [17, 20, 0, 6];
    } else if (dpCurrent >= 16) {
        weatherInfo.daypartForecast.dayName = dayOfWeek[new Date().getDay()][2];
        dpHours = [6, 12, 15, 17];
    }
    var url = "https://api.weather.com/v3/wx/forecast/hourly/2day?geocode=" + locationConfig.mainCity.lat + "," + locationConfig.mainCity.lon + "&format=json&units=" + getUnits() + "&language=en-US&apiKey=" + api_key;
    return $.getJSON(url, function (data) {
        if(data.precipChance[0] > 15){weatherInfo.specialModes.precip = true}
        var dpidx = 0;
        for (var i = 0; i < data.validTimeLocal.length; i++) {
            var dpTime = dateFns.getHours(data.validTimeLocal[i]);
            if (dpTime == dpHours[dpidx]) {
                var dayPartToAdd = { name: "", cond: "", icon: "", temp: "", wind: "", windspeed: "" }
                dayPartToAdd.name = { "0": "Minuit", "6": "06h00", "12": "Midi", "15": "15h00", "17": "17h00", "20": "20h00" }[dpTime] || `${dpTime}h00`;
                var phrRaw = data.wxPhraseLong[i] || "";
                phrRaw = phrRaw.replaceAll("/Wind", " & Wind").replaceAll("Rain/", "Rain & ");
                dayPartToAdd.cond = translateWeatherNarrative(phrRaw);
                dayPartToAdd.icon = data.iconCodeExtend[i]
                dayPartToAdd.temp = data.temperature[i]
                dayPartToAdd.wind = data.windSpeed[i] == 0 ? "Calme" : `${translateWindCardinal(data.windDirectionCardinal[i])} ${data.windSpeed[i]}`;
                dayPartToAdd.windspeed = data.windSpeed[i]
                weatherInfo.daypartForecast.times.push(dayPartToAdd);
                dpidx++;
            }
        }
    }).fail(function () {
        weatherInfo.daypartForecast.noReport = true;
        for (var i = 0; i < 4; i++) {
            weatherInfo.daypartForecast.times.push({ name: "", cond: "", icon: 4400, temp: "", wind: "", windspeed: "" });
        }
    })
}

function translateMapDayName(dayName) {
    if (!dayName) return "";
    var d = String(dayName).trim();
    var map = {
        "Today": "Aujourd'hui",
        "Tonight": "Ce soir",
        "Tomorrow": "Demain",
        "Sunday": "Dimanche",
        "Monday": "Lundi",
        "Tuesday": "Mardi",
        "Wednesday": "Mercredi",
        "Thursday": "Jeudi",
        "Friday": "Vendredi",
        "Saturday": "Samedi",
        "Sunday Night": "Dimanche soir",
        "Monday Night": "Lundi soir",
        "Tuesday Night": "Mardi soir",
        "Wednesday Night": "Mercredi soir",
        "Thursday Night": "Jeudi soir",
        "Friday Night": "Vendredi soir",
        "Saturday Night": "Samedi soir"
    };
    return map[d] || d;
}

async function grabMapCityData(){
    weatherInfo.map.mapCities = [];
    if (!locationConfig.regionalMap.map || locationConfig.regionalMap.map.length === 0) return;
    var url = 'https://api.weather.com/v3/aggcommon/v3-wx-observations-current;v3-wx-forecast-daily-3day?geocodes='
    for(let i = 0; i < locationConfig.regionalMap.map.length; i++){
        url = url + `${locationConfig.regionalMap.map[i].lat},${locationConfig.regionalMap.map[i].lon};`
    }
    url += "&language=en-US&units=" + getUnits() + "&format=json&apiKey=" + api_key;
    var midx = 0;
    return $.getJSON(url, function(data){
        midx = data[0]["v3-wx-forecast-daily-3day"].daypart[0].temperature[0] == null ? 1 : 0;
        var rawDay1 = data[0]["v3-wx-forecast-daily-3day"].daypart[0].daypartName[midx];
        var rawDay2 = data[0]["v3-wx-forecast-daily-3day"].daypart[0].daypartName[midx+1] == "Tomorrow" ? data[0]["v3-wx-forecast-daily-3day"].dayOfWeek[1] : data[0]["v3-wx-forecast-daily-3day"].daypart[0].daypartName[midx+1];
        weatherInfo.map.days = [
            translateMapDayName(rawDay1),
            translateMapDayName(rawDay2)
        ];
        data.forEach((ajaxedLoc, i) =>{
            var mapObj = {
                name: locationConfig.regionalMap.map[i].name,
                current: {
                    temp: ajaxedLoc["v3-wx-observations-current"].temperature,
                    icon: ajaxedLoc["v3-wx-observations-current"].iconCodeExtend
                },
                forecasts: [
                    {
                        temp: ajaxedLoc["v3-wx-forecast-daily-3day"].daypart[0].temperature[midx],
                        icon: ajaxedLoc["v3-wx-forecast-daily-3day"].daypart[0].iconCodeExtend[midx]
                    },
                    {
                        temp: ajaxedLoc["v3-wx-forecast-daily-3day"].daypart[0].temperature[midx+1],
                        icon: ajaxedLoc["v3-wx-forecast-daily-3day"].daypart[0].iconCodeExtend[midx+1]
                    }
                ]
            }
            weatherInfo.map.mapCities.push(mapObj);
        })
    })
}

function capitalizeFirst(text) {
    text = String(text || "").trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

// Environment Canada (MSC GeoMet) already publishes alerts in French, with the
// official name, colour and text, so no translation is needed.
// Returns true when every request succeeded and the alerts were applied.
async function grabAlertsEccc(geocodes, geocodeCityMap) {
    var requests = geocodes.map((geocode) => {
        var parts = geocode.split(",");
        var lat = parseFloat(parts[0]);
        var lon = parseFloat(parts[1]);
        if (isNaN(lat) || isNaN(lon)) {
            return Promise.resolve({ ok: false });
        }
        var d = 0.005;
        var url = `https://api.weather.gc.ca/collections/weather-alerts/items?f=json&lang=fr&skipGeometry=true&limit=100&bbox=${lon - d},${lat - d},${lon + d},${lat + d}`;
        return new Promise((resolve) => {
            $.getJSON(url, function (data) {
                resolve({ ok: !!(data && Array.isArray(data.features)), features: (data && data.features) || [], cityName: geocodeCityMap[geocode] || "" });
            }).fail(function () {
                resolve({ ok: false });
            });
        });
    });

    var responses = await Promise.all(requests);
    if (responses.length === 0 || responses.some((r) => !r.ok)) {
        return false;
    }

    markFeedSuccess("alerts");

    var now = Date.now();
    var grouped = {};
    responses.forEach((resp) => {
        resp.features.forEach((feature) => {
            var p = feature && feature.properties;
            if (!p || !p.alert_name_fr) {
                return;
            }
            var status = String(p.status_en || "").toLowerCase();
            if (status === "ended" || status === "cancelled" || status === "canceled") {
                return;
            }
            var expiry = Date.parse(p.event_end_datetime || p.expiration_datetime || "");
            if (!isNaN(expiry) && expiry <= now) {
                return;
            }

            var colour = String(p.risk_colour_en || "").toLowerCase();
            var nameFr = capitalizeFirst(p.alert_name_fr);
            // Keep the official colour in the title for colour-coded warnings (e.g. "Avertissement jaune - Vent")
            var shortFr = String(p.alert_short_name_fr || "").replace(/\s*\(.*\)\s*$/, "");
            var displayName = (p.alert_type === "warning" && p.risk_colour_fr && shortFr)
                ? `Avertissement ${p.risk_colour_fr} - ${shortFr}`
                : nameFr;

            var rule = (typeof warningSettings !== "undefined") ? (warningSettings[nameFr] || warningSettings[nameFr.toLowerCase()]) : null;
            if (rule && rule.included === false) {
                return;
            }
            var lowered = nameFr.toLowerCase();
            var isRed = colour === "red" || colour === "orange" || /tornade|amber|urgence/.test(lowered);
            var isWatch = p.alert_type === "watch" || p.alert_type === "advisory" || p.alert_type === "statement" || /veille|avis|bulletin/.test(lowered);
            var color = isRed ? "red" : "yellow";
            var priority = rule ? rule.priority : (isWatch ? 44 : 25);
            var severe = rule ? !!rule.severe : isRed;

            var desc = String(p.alert_text_fr || p.alert_text_en || "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
            var city = resp.cityName || p.feature_name_fr || "";
            var key = `${displayName}|${desc}`;
            if (!grouped[key]) {
                grouped[key] = {
                    name: displayName,
                    headline: displayName,
                    desc: displayName,
                    description: desc,
                    areas: city ? [city] : [],
                    cities: city ? [city] : [],
                    cityName: city,
                    detailKey: p.feature_id || key,
                    significance: p.alert_code,
                    severity: p.alert_type,
                    priority: priority,
                    color: color,
                    severe: severe,
                    expiresAt: isNaN(expiry) ? undefined : expiry,
                    expireTimeLocal: p.expiration_datetime || "",
                    endTimeLocal: p.event_end_datetime || ""
                };
            } else {
                if (city && !grouped[key].areas.includes(city)) {
                    grouped[key].areas.push(city);
                    grouped[key].cities.push(city);
                }
                if (!isNaN(expiry)) {
                    grouped[key].expiresAt = Math.max(grouped[key].expiresAt || 0, expiry);
                }
            }
        });
    });

    var nextAlerts = Object.values(grouped).map((alert) => {
        alert.cityName = alert.cities.join(", ");
        alert.areaText = alert.cities.length > 0 ? "Secteurs : " + alert.cities.join(", ") : "";
        return alert;
    }).sort((a, b) => a.priority - b.priority);

    weatherInfo.bulletin.alerts = nextAlerts;
    if (nextAlerts.length > 0) {
        weatherInfo.specialModes.bulletin = true;
        weatherInfo.bulletin.enabled = true;
        var top = nextAlerts[0];
        weatherInfo.bulletin.crawlAlert.enabled = true;
        weatherInfo.bulletin.crawlAlert.alert = {
            name: top.name,
            code: top.significance,
            type: "Alert",
            significance: top.significance,
            description: top.description || top.headline,
            severe: top.severe,
            color: top.color,
            priority: top.priority,
            detailKey: top.detailKey,
            expiresAt: top.expiresAt,
            cityName: top.cityName,
            areas: top.areas,
            areaText: top.areaText
        };
        setTimeout(startAlertCrawl, 1000);
    } else {
        clearActiveAlerts();
    }
    return true;
}

async function grabAlerts() {
    if (applyAlertTestModeIfNeeded()) {
        return;
    }

    var geocodes = [];
    var geocodeCityMap = {};
    if (locationConfig.mainCity && locationConfig.mainCity.lat !== "" && locationConfig.mainCity.lon !== "") {
        var mainKey = `${locationConfig.mainCity.lat},${locationConfig.mainCity.lon}`;
        geocodes.push(mainKey);
        geocodeCityMap[mainKey] = locationConfig.mainCity.displayname || locationConfig.mainCity.name || "Montréal";
    }
    if (locationConfig.eightCities && Array.isArray(locationConfig.eightCities.cities)) {
        for (let i = 0; i < locationConfig.eightCities.cities.length; i++) {
            var city = locationConfig.eightCities.cities[i];
            if (!city || city.lat === "" || city.lon === "") {
                continue;
            }
            var cityKey = `${city.lat},${city.lon}`;
            geocodes.push(cityKey);
            geocodeCityMap[cityKey] = city.displayname || city.name || "";
        }
    }

    geocodes = [...new Set(geocodes)];
    if (geocodes.length === 0) {
        clearActiveAlerts();
        return;
    }

    try {
        if (await grabAlertsEccc(geocodes, geocodeCityMap)) {
            return;
        }
    } catch (e) {
        console.warn("[Alerts] ECCC fetch failed, falling back to TWC:", e);
    }

    var alertRequests = geocodes.map((geocode) => {
        return new Promise((resolve) => {
            $.getJSON(`https://api.weather.com/v3/alerts/headlines?geocode=${geocode}&format=json&language=fr-CA&apiKey=${api_key}`, function (data) {
                resolve({ ok: true, data: data, geocode: geocode, cityName: geocodeCityMap[geocode] || "" });
            }).fail(function (jqXHR) {
                if (jqXHR && jqXHR.status === 204) {
                    resolve({ ok: true, data: { alerts: [] }, geocode: geocode, cityName: geocodeCityMap[geocode] || "" });
                } else {
                    resolve({ ok: false, data: null, geocode: geocode, cityName: geocodeCityMap[geocode] || "" });
                }
            });
        });
    });

    var alertResponses = await Promise.all(alertRequests);
    var successfulResponses = alertResponses.filter((response) => response.ok && response.data);

    if (successfulResponses.length === 0) {
        return;
    }

    markFeedSuccess("alerts");

    var mergedAlerts = [];
    for (let i = 0; i < successfulResponses.length; i++) {
        var responseAlerts = successfulResponses[i].data.alerts;
        var queryCity = successfulResponses[i].cityName;
        if (!Array.isArray(responseAlerts)) {
            continue;
        }
        for (let j = 0; j < responseAlerts.length; j++) {
            var aItem = responseAlerts[j];
            if (aItem) {
                aItem._queryCity = queryCity;
                mergedAlerts.push(aItem);
            }
        }
    }

    var detailMap = {};
    var uniqueDetailKeys = [...new Set(mergedAlerts.map(a => a.detailKey).filter(Boolean))];
    if (uniqueDetailKeys.length > 0) {
        var detailPromises = uniqueDetailKeys.map((dKey) => {
            return new Promise((resolve) => {
                $.getJSON(`https://api.weather.com/v3/alerts/detail?alertId=${dKey}&format=json&language=fr-CA&apiKey=${api_key}`, function (data) {
                    if (data && data.alertDetail) {
                        detailMap[dKey] = data.alertDetail;
                    }
                    resolve();
                }).fail(() => resolve());
            });
        });
        await Promise.all(detailPromises);
    }

    var groupedAlerts = {};
    var now = Date.now();
    for (let i = 0; i < mergedAlerts.length; i++) {
        var sourceAlert = mergedAlerts[i];
        if (!sourceAlert || !sourceAlert.eventDescription) {
            continue;
        }

        var detail = detailMap[sourceAlert.detailKey];
        if (isAlertExpired(sourceAlert, detail, now)) {
            console.log(`[Alerts] Ignoring already expired/cancelled alert: "${sourceAlert.eventDescription}" (detailKey: ${sourceAlert.detailKey})`);
            continue;
        }

        var alertName = String(sourceAlert.eventDescription).trim();

        var alertRules = warningSettings ? (warningSettings[alertName] || warningSettings[normalizeDisasterAlertName(alertName)]) : null;
        if (!alertRules && typeof warningSettings !== 'undefined') {
            var loweredDesc = alertName.toLowerCase();
            var matchedKey = Object.keys(warningSettings).find(k => k.toLowerCase() === loweredDesc);
            if (matchedKey) {
                alertRules = warningSettings[matchedKey];
            } else {
                var isRed = loweredDesc.includes("tornado") || loweredDesc.includes("tornade") || loweredDesc.includes("rouge") || loweredDesc.includes("amber");
                var isWatchOrStatement = loweredDesc.includes("watch") || loweredDesc.includes("veille") || loweredDesc.includes("statement") || loweredDesc.includes("advisory") || loweredDesc.includes("jaune") || loweredDesc.includes("avis");
                alertRules = {
                    priority: isWatchOrStatement ? 44 : 25,
                    severe: isRed,
                    color: isRed ? 'red' : 'yellow',
                    included: true,
                    marine: false
                };
            }
        }

        if (alertRules && alertRules.included === false) {
            continue;
        }

        var detail = detailMap[sourceAlert.detailKey];
        var displayName = getAlertDisplayNameFr(alertName);
        var headline = translateAlertHeadline(sourceAlert.headlineText || (detail && detail.headlineText) || "");
        var area = formatAreaNameFr(sourceAlert.areaName || (detail && detail.areaName) || "");
        var targetCity = sourceAlert._queryCity || area || (locationConfig.mainCity && (locationConfig.mainCity.displayname || locationConfig.mainCity.name)) || "";
        if (!area) {
            area = targetCity;
        }

        var alertDesc = "";
        if (detail) {
            var frText = detail.texts && detail.texts.find(t => t && t.languageCode && t.languageCode.toLowerCase().startsWith('fr'));
            var rawText = frText ? frText.description : (detail.texts && detail.texts[0] ? detail.texts[0].description : "");
            if (rawText) {
                var parts = rawText.split('###');
                var candidate = (parts[0] || rawText).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
                alertDesc = translateAlertText(candidate);
            }
        }
        if (!alertDesc && headline) {
            alertDesc = headline;
        }

        var expiry = getAlertExpiryTimestamp(sourceAlert, detail);
        var groupKey = `${displayName}|${alertDesc || headline}`;
        if (!groupedAlerts[groupKey]) {
            groupedAlerts[groupKey] = {
                name: displayName,
                headline: headline,
                desc: headline,
                description: alertDesc,
                areas: targetCity ? [targetCity] : (area ? [area] : []),
                cities: targetCity ? [targetCity] : (area ? [area] : []),
                cityName: targetCity || area,
                detailKey: sourceAlert.detailKey,
                significance: sourceAlert.significance,
                severity: sourceAlert.severity,
                priority: alertRules ? alertRules.priority : 125,
                color: alertRules ? alertRules.color : 'yellow',
                severe: alertRules ? !!alertRules.severe : false,
                expiresAt: expiry,
                expireTimeLocal: sourceAlert.expireTimeLocal || (detail && detail.expireTimeLocal) || "",
                endTimeLocal: sourceAlert.endTimeLocal || (detail && detail.endTimeLocal) || ""
            };
        } else {
            var cityToAdd = targetCity || area;
            if (cityToAdd && !groupedAlerts[groupKey].areas.includes(cityToAdd)) {
                groupedAlerts[groupKey].areas.push(cityToAdd);
            }
            if (cityToAdd && !groupedAlerts[groupKey].cities.includes(cityToAdd)) {
                groupedAlerts[groupKey].cities.push(cityToAdd);
            }
            if (expiry) {
                groupedAlerts[groupKey].expiresAt = Math.max(groupedAlerts[groupKey].expiresAt || 0, expiry);
            }
        }
    }

    var nextAlerts = Object.values(groupedAlerts).map((alert) => {
        var cityList = (alert.cities && alert.cities.length > 0) ? alert.cities : alert.areas;
        alert.cityName = cityList.join(", ");
        if (cityList.length > 0) {
            alert.areaText = "Secteurs : " + cityList.join(", ");
        } else {
            alert.areaText = "";
        }
        return alert;
    }).sort((a, b) => a.priority - b.priority);

    weatherInfo.bulletin.alerts = nextAlerts;
    if (weatherInfo.bulletin.alerts.length > 0) {
        weatherInfo.specialModes.bulletin = true;
        weatherInfo.bulletin.enabled = true;

        var topAlert = nextAlerts[0];
        weatherInfo.bulletin.crawlAlert.enabled = true;
        weatherInfo.bulletin.crawlAlert.alert = {
            name: topAlert.name,
            code: topAlert.significance,
            type: "Alert",
            significance: topAlert.significance,
            description: topAlert.description || topAlert.headline,
            severe: topAlert.severe,
            priority: topAlert.priority,
            color: topAlert.color,
            detailKey: topAlert.detailKey,
            expiresAt: topAlert.expiresAt,
            cityName: topAlert.cityName,
            areas: topAlert.areas,
            areaText: topAlert.areaText
        };
        setTimeout(startAlertCrawl, 1000);
    } else {
        clearActiveAlerts();
    }
}
function grabAlertCrawl(dKey) {
    weatherInfo.bulletin.crawlAlert.enabled = true;
    if (weatherInfo.bulletin.crawlAlert.alert != undefined) {
        if (weatherInfo.bulletin.crawlAlert.alert.detailKey == dKey) return;
    }
    $.getJSON('https://api.weather.com/v3/alerts/detail?alertId=' + dKey + '&format=json&language=fr-CA&apiKey=' + api_key, function (data) {
        if (!data || !data.alertDetail) return;
        if (isAlertExpired(data.alertDetail, data.alertDetail)) return;
        var eventDesc = data.alertDetail.eventDescription;
        var rule = (warningSettings && (warningSettings[eventDesc] || warningSettings[normalizeDisasterAlertName(eventDesc)])) 
            ? (warningSettings[eventDesc] || warningSettings[normalizeDisasterAlertName(eventDesc)]) 
            : { priority: 125, severe: false };
        
        // If an existing alert already has higher priority (lower numeric value), keep it
        if (weatherInfo.bulletin.crawlAlert.alert != undefined && (rule.priority > weatherInfo.bulletin.crawlAlert.alert.priority)) {
            return;
        }

        var frenchText = data.alertDetail.texts && data.alertDetail.texts.find(t => t && t.languageCode && t.languageCode.toLowerCase().startsWith('fr'));
        var rawDesc = (frenchText && frenchText.description) 
            ? frenchText.description 
            : (data.alertDetail.texts && data.alertDetail.texts[0] && data.alertDetail.texts[0].description) 
                ? data.alertDetail.texts[0].description 
                : (data.alertDetail.headlineText || data.alertDetail.eventDescription || "");
        
        var cleanDesc = String(rawDesc)
            .replace(/[\r\n\t]+/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();

        var rawArea = data.alertDetail.areaName || "";
        var cleanArea = formatAreaNameFr(rawArea);

        var alert = {
            name: getAlertDisplayNameFr(eventDesc),
            code: data.alertDetail.productIdentifier,
            type: data.alertDetail.messageType,
            significance: data.alertDetail.significance,
            description: translateAlertText(cleanDesc),
            severe: !!rule.severe,
            priority: rule.priority,
            detailKey: dKey,
            expiresAt: getAlertExpiryTimestamp(data.alertDetail, data.alertDetail),
            cityName: cleanArea,
            areas: cleanArea ? [cleanArea] : [],
            areaText: cleanArea ? "Secteurs : " + cleanArea : ""
        };
        weatherInfo.bulletin.crawlAlert.alert = alert;
        setTimeout(startAlertCrawl, 1000);
    });
}
async function grabMoonphases(){
    weatherInfo.almanac.moonphases = [];
    var frMonths = {
        "January": "janv.", "February": "févr.", "March": "mars", "April": "avr.",
        "May": "mai", "June": "juin", "July": "juil.", "August": "août",
        "September": "sept.", "October": "oct.", "November": "nov.", "December": "déc."
    };
    var frPhases = {
        "New": "Nouvelle",
        "First": "Premier quartier",
        "Full": "Pleine lune",
        "Last": "Dernier quartier"
    };
    await $.getJSON(`https://www.icalendar37.net/lunar/api/?lang=en&month=${dateFns.format(new Date(),"M")}&year=${dateFns.format(new Date(),"YYYY")}`, function(data){
        var monthAbbr = frMonths[data.monthName] || (data.monthName ? data.monthName.substring(0,3) : "");
        for(phase in data.phase){
            if(data.phase[phase].isPhaseLimit != false){
                if(phase < new Date().getDate()){ continue; }
                var moonphaseToAdd = {date:"",type:""}
                moonphaseToAdd.date = monthAbbr + " " + phase;
                var rawPhaseType = data.phase[phase].phaseName.split(" ")[0];
                moonphaseToAdd.type = frPhases[rawPhaseType] || rawPhaseType;
                weatherInfo.almanac.moonphases.push(moonphaseToAdd);
            }
        }
    })
    await $.getJSON(`https://www.icalendar37.net/lunar/api/?lang=en&month=${dateFns.format(dateFns.addMonths(new Date(),1),"M")}&year=${dateFns.format(new Date(),"YYYY")}`, function(data){
        var monthAbbr = frMonths[data.monthName] || (data.monthName ? data.monthName.substring(0,3) : "");
        for(phase in data.phase){
            if(data.phase[phase].isPhaseLimit != false){
                var moonphaseToAdd = {date:"",type:""}
                moonphaseToAdd.date = monthAbbr + " " + phase;
                var rawPhaseType = data.phase[phase].phaseName.split(" ")[0];
                moonphaseToAdd.type = frPhases[rawPhaseType] || rawPhaseType;
                weatherInfo.almanac.moonphases.push(moonphaseToAdd);
            }
        }
    })
}
async function grabOutdoorActivityData(){
    var oaCurrent = () => {
        if(dateFns.getHours(new Date()) <= 6){
            return 9;
        }else if(dateFns.getHours(new Date()) <= 11){
            return 14;
        }else if(dateFns.getHours(new Date()) <= 16){
            weatherInfo.outdoorActivity.bg = 3;
            return 19;
        }
        return 9;
    }
    var dayOfWeekFr = { 0: "Dimanche", 1: "Lundi", 2: "Mardi", 3: "Mercredi", 4: "Jeudi", 5: "Vendredi", 6: "Samedi" };
    var url = "https://api.weather.com/v3/wx/forecast/hourly/1day?geocode=" + locationConfig.mainCity.lat + "," + locationConfig.mainCity.lon + "&format=json&units=" + getUnits() + "&language=en-US&apiKey=" + api_key;
    return $.getJSON(url, function(data){
        try {
            for(let i = 0; i < data.validTimeLocal.length; i++){
                var targetHr = oaCurrent();
                if(dateFns.getHours(data.validTimeLocal[i]) == targetHr){
                    var hr = dateFns.getHours(data.validTimeLocal[i]);
                    var dayName = dayOfWeekFr[new Date(data.validTimeLocal[i]).getDay()] || "";
                    weatherInfo.outdoorActivity.time = `${hr}h00 ${dayName}`;
                    weatherInfo.outdoorActivity.temp = data.temperature[i];
                    weatherInfo.outdoorActivity.cond = translateWeatherNarrative(data.wxPhraseLong[i]);
                    weatherInfo.outdoorActivity.icon = data.iconCodeExtend[i];
                    weatherInfo.outdoorActivity.wind = data.windSpeed[i] == 0 ? "Calme" : `${translateWindCardinal(data.windDirectionCardinal[i])} ${data.windSpeed[i]}`;
                    if(data.temperatureHeatIndex[i] > data.temperature[i] + 3){
                        weatherInfo.outdoorActivity.feelslike.type = "Indice humidex";
                        weatherInfo.outdoorActivity.feelslike.val = data.temperatureHeatIndex[i];
                    }else if(data.temperatureWindChill[i] < data.temperature[i] - 3){
                        weatherInfo.outdoorActivity.feelslike.type = "Refroid. éolien";
                        weatherInfo.outdoorActivity.feelslike.val = data.temperatureWindChill[i];
                    } else {
                        weatherInfo.outdoorActivity.feelslike.type = "Ressenti";
                        weatherInfo.outdoorActivity.feelslike.val = data.temperature[i];
                    }
                    break;
                }
            }
        } catch (error) {
            weatherInfo.outdoorActivity.noReport = true;
        }
    }).fail(function(){
        weatherInfo.outdoorActivity.noReport = true;
    })
}