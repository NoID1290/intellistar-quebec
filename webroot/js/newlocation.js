var locationConfig = {
    mainCity: {
        displayname: "",
        extraname: "",
        lat: "",
        lon: "",
        state: "",
        stateFull: "",
    },
    eightCities: {
        cities: [],
    },
    regionalMap: {
        leftPos: "",
        topPos: "",
        map: [],
        autoFind: true
    },
    radarCities: {
        local: [
        ],
        regional: [
        ],
    },
    regionalForecasts: [],
    canadaCities: [],
    quebecCities: [],
    resortCities: [],
    localDopplers: []
}
var mainquery = undefined;
var queryFail = false;
let locationQueue = [];
let newCities = [];
const CONFIG_ENDPOINT = "/api/config";
let locationConfigLoadError = "";

function setLocationConfigError(message) {
    locationConfigLoadError = message;
    console.error("[Config] " + message);
    $(".loctext").text("Erreur de localisation : " + message);
    $(".loctext").css("color", "#ff8f8f");
    $(".data-updated").text("Données météo : bloquées par une erreur de configuration").addClass("error");
    $("#startbutton").css("opacity", "0.5");
    $("#startbutton").css("pointer-events", "none");
}

function clearLocationConfigError() {
    locationConfigLoadError = "";
    $(".loctext").css("color", "");
    $(".data-updated").removeClass("error");
    // Note: Do not eagerly enable startbutton here. It will be enabled once grabData() completes.
}

function configHasRequiredLocation(configObj) {
    if (!configObj) return false;
    const loc = configObj.locationSettings || configObj;
    if (!loc || !loc.mainCity) return false;
    const city = loc.mainCity;
    return city.autoFind === false && city.type === "geocode" && typeof city.val === "string" && city.val.includes(",");
}

async function loadLocationSettingsFromConfig() {
    try {
        const response = await fetch(CONFIG_ENDPOINT, { cache: "no-store" });
        if (!response.ok) {
            setLocationConfigError("MYCONFIG.json n'a pas pu être chargé depuis /api/config.");
            return false;
        }
        const json = await response.json();
        if (!configHasRequiredLocation(json)) {
            setLocationConfigError("MYCONFIG.json est invalide. mainCity.autoFind doit être false et mainCity.val doit être au format geocode lat,lon.");
            return false;
        }

        // Merge location settings
        const locData = json.locationSettings || json;
        Object.assign(locationSettings, locData);

        // Merge appearance settings if provided
        if (json.appearanceSettings && typeof json.appearanceSettings === 'object') {
            Object.assign(appearanceSettings, json.appearanceSettings);
        }
        if (json.units !== undefined) appearanceSettings.units = json.units;
        if (json.vocalLanguage !== undefined) appearanceSettings.vocalLanguage = json.vocalLanguage;
        if (json.graphicsPackage !== undefined) appearanceSettings.graphicsPackage = json.graphicsPackage;
        if (json.ldlType !== undefined) appearanceSettings.ldlType = json.ldlType;
        if (json.iconSet !== undefined) appearanceSettings.iconSet = json.iconSet;
        if (json.startupTime !== undefined) appearanceSettings.startupTime = json.startupTime;
        if (json.localWeatherID !== undefined) appearanceSettings.localWeatherID = json.localWeatherID;
        if (json.marqueeAd !== undefined) appearanceSettings.marqueeAd = json.marqueeAd;
        if (json.smoothRadar !== undefined) appearanceSettings.smoothRadar = !!json.smoothRadar;

        // Merge slide settings if provided
        if (json.slideSettings && typeof json.slideSettings === 'object') {
            Object.assign(slideSettings, json.slideSettings);
        }
        if (json.flavor !== undefined) slideSettings.flavor = String(json.flavor);
        if (json.bulletin !== undefined) slideSettings.bulletin = json.bulletin;
        if (json.precip !== undefined) slideSettings.precip = json.precip;
        if (json.auto !== undefined) slideSettings.auto = json.auto;
        if (json.slideOrder !== undefined || json.order !== undefined) {
            if (Array.isArray(json.slideOrder)) slideSettings.order = json.slideOrder;
            else if (Array.isArray(json.order) && json.order.length > 0 && typeof json.order[0] === 'object') slideSettings.order = json.order;
        }

        // Merge audio settings if provided
        if (json.audioSettings && typeof json.audioSettings === 'object') {
            Object.assign(audioSettings, json.audioSettings);
        }
        if (json.enableMusic !== undefined) audioSettings.enableMusic = json.enableMusic;
        if (json.shuffle !== undefined) audioSettings.shuffle = json.shuffle;
        if (json.randomStart !== undefined) audioSettings.randomStart = json.randomStart;
        if (json.narrations !== undefined) audioSettings.narrations = json.narrations;
        if (json.vocallocal !== undefined) audioSettings.vocallocal = json.vocallocal;
        if (json.vocalLanguage !== undefined) audioSettings.vocalLanguage = json.vocalLanguage;
        if (json.musicVolume !== undefined) audioSettings.musicVolume = json.musicVolume;
        if (json.vocalVolume !== undefined) audioSettings.vocalVolume = json.vocalVolume;
        if (json.musicDuckedVolume !== undefined) audioSettings.musicDuckedVolume = json.musicDuckedVolume;
        if (json.offset !== undefined) audioSettings.offset = json.offset;
        if (json.audioOrder !== undefined || (Array.isArray(json.order) && typeof json.order[0] === 'string')) {
            audioSettings.order = json.audioOrder || json.order;
        }

        // Merge alert test settings if provided
        if (json.alertTestSettings && typeof json.alertTestSettings === 'object') {
            Object.assign(alertTestSettings, json.alertTestSettings);
        }

        if (typeof getVocallocalPath === 'function') {
            vocallocalPath = getVocallocalPath();
        }

        if (typeof window.applyEditorPreset === 'function') {
            window.applyEditorPreset(json);
        }

        if (typeof syncSettingsUI === 'function') {
            syncSettingsUI();
        }

        clearLocationConfigError();
        console.log("[Config] MYCONFIG.json loaded and applied.");
        return true;
    } catch (error) {
        setLocationConfigError("Échec du chargement de MYCONFIG.json : " + error.message);
        return false;
    }
}

function getJSONPromise(url) {
    return new Promise((resolve, reject) => {
        $.getJSON(url, resolve).fail((jqxhr, textStatus, errorThrown) => {
            reject(new Error(errorThrown || textStatus || "Request failed"));
        });
    });
}

async function grabLocation() {
    if (typeof locNameInterval !== 'undefined' && locNameInterval) {
        clearInterval(locNameInterval);
        locNameInterval = null;
    }
    if (typeof dataGrabInterval !== 'undefined' && dataGrabInterval) {
        clearInterval(dataGrabInterval);
        dataGrabInterval = null;
    }
    $("#startbutton").css("opacity", "0.5");
    $("#startbutton").css("pointer-events", "none");
    const configLoaded = await loadLocationSettingsFromConfig();
    if (!configLoaded) {
        return;
    }
    locationConfig.mainCity = {displayname: "", extraname: "", lat: "", lon: "", state: "", stateFull: "", country: ""}
    locationQueue = [];
    newCities = [];
    locationConfig.eightCities.cities = [];
    locationConfig.regionalMap.map = [];
    await getMainCity();
    await getNearbyCities();
    sortRegionalList();
    mainquery = undefined;
}

async function getMainCity() {
    try {
        locationConfig.mainCity.displayname = locationSettings.mainCity.displayname || "";
        locationConfig.mainCity.extraname = locationSettings.mainCity.extraname || locationSettings.mainCity.displayname || "";
        if (locationSettings.eightCities && locationSettings.eightCities.cities) {
            locationConfig.eightCities.cities = locationSettings.eightCities.cities.map(c => ({
                displayname: c.displayname,
                lat: "",
                lon: "",
                state: "",
                stateFull: ""
            }));
        }
        const data = await getJSONPromise("https://api.weather.com/v3/location/point?" + locationSettings.mainCity.type + "=" + locationSettings.mainCity.val + "&language=en-US&format=json&apiKey=" + api_key);
        var cCountry = data.location.country || "US";
        getMapStyle(cCountry, data.location.adminDistrictCode);
        locationConfig.mainCity.displayname = locationSettings.mainCity.displayname || data.location.displayName;
        locationConfig.mainCity.extraname = locationSettings.mainCity.extraname || data.location.displayName;
        locationConfig.mainCity.lat = data.location.latitude;
        locationConfig.mainCity.lon = data.location.longitude;
        locationConfig.mainCity.state = data.location.adminDistrictCode;
        locationConfig.mainCity.stateFull = data.location.adminDistrict;
        locationConfig.mainCity.country = cCountry;

        if (locationSettings.radarCities && Array.isArray(locationSettings.radarCities.local)) {
            locationConfig.radarCities.local = locationSettings.radarCities.local.filter(c => c && (c.locationName || c.name || c.displayname));
        } else {
            locationConfig.radarCities.local = [];
        }
        if (locationSettings.radarCities && Array.isArray(locationSettings.radarCities.regional)) {
            locationConfig.radarCities.regional = locationSettings.radarCities.regional.filter(c => c && (c.locationName || c.name || c.displayname));
        } else {
            locationConfig.radarCities.regional = [];
        }

        locationConfig.regionalMap.autoFind = locationSettings.mapCities.autoFind;
        locationConfig.regionalMap.leftPos = locationSettings.mapCities.leftPos;
        locationConfig.regionalMap.topPos = locationSettings.mapCities.topPos;

        locationConfig.regionalForecasts = Array.isArray(locationSettings.regionalForecasts) ? locationSettings.regionalForecasts : [];
        locationConfig.canadaCities = Array.isArray(locationSettings.canadaCities) ? locationSettings.canadaCities : [];
        locationConfig.quebecCities = Array.isArray(locationSettings.quebecCities) ? locationSettings.quebecCities : [];
        locationConfig.resortCities = Array.isArray(locationSettings.resortCities) ? locationSettings.resortCities : [];
        locationConfig.localDopplers = Array.isArray(locationSettings.localDopplers) ? locationSettings.localDopplers : [];
    } catch (error) {
        queryFail = true;
        setLocationConfigError("Unable to resolve MYCONFIG mainCity geocode: " + error.message);
        throw error;
    }
}
let nearbyRound = 0;
//bit of a rewrite inspired from BFS nearby loc pull
async function getNearbyCities() {
    newCities = [];
    if (!locationSettings.eightCities || !Array.isArray(locationSettings.eightCities.cities)) {
        locationConfig.eightCities.cities = [];
        return;
    }
    const promises = locationSettings.eightCities.cities.map((entry, i) => {
        if (!entry || !entry.type || !entry.val) {
            return Promise.resolve(null);
        }
        return createNewCity(entry.type, entry.val, i, true);
    });
    await Promise.all(promises);
    locationConfig.eightCities.cities = newCities.filter(c => c !== undefined && c !== null);
}
function createNewCity(type, val, i, manual) {
    return new Promise((resolve) => {
        $.getJSON(`https://api.weather.com/v3/location/point?${type}=${val}&language=en-US&format=json&apiKey=${api_key}`, function (data) {
            var cityObj = {
                displayname: data.location.displayName.replaceAll(" Charter Township", "").replaceAll(" Township", ""),
                lat: data.location.latitude,
                lon: data.location.longitude,
                state: data.location.adminDistrictCode,
                stateFull: data.location.adminDistrict
            }
            if(manual == true){
                cityObj.displayname = (locationSettings.eightCities.cities[i] && locationSettings.eightCities.cities[i].displayname !== "") ? locationSettings.eightCities.cities[i].displayname : data.location.displayName;
                newCities[i] = cityObj;
            }else{
                for(let j = 0; j < newCities.length; j++){
                    if(newCities[j] && cityObj.displayname == newCities[j].displayname) {
                        resolve(null);
                        return;
                    }
                    if(newCities[j] && cityObj.displayname == newCities[j].stateFull) {
                        resolve(null);
                        return;
                    }
                    if(newCities.filter(c => c !== undefined).length >= 8) {
                        resolve(null);
                        return;
                    }
                }
                newCities.push(cityObj);
            }
            resolve(cityObj);
        }).fail(() => {
            resolve(null);
        });
    });
}
//for adv loc settings
var elDivs = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii"]
function createNewExtraCity(i){
    $('.extracitytext').text("Location editing is locked to MYCONFIG.json. Edit that file and reload.");
    $(".extracitytext").css('color', 'darkred');
    $('.extracitytext').fadeIn(0, function(){
        setTimeout(() => {
            $('.extracitytext').fadeOut(1000);
        }, 2500);
    })
}

var distances = []
var distances = []
var rmBoundaries = [265, 270, 715, 630]
function sortRegionalList(){
    locationConfig.regionalMap.leftPos = locationSettings.mapCities.leftPos || -3353;
    locationConfig.regionalMap.topPos = locationSettings.mapCities.topPos || 1297;
    locationConfig.regionalMap.autoFind = locationSettings.mapCities.autoFind;

    if(locationSettings.mapCities.autoFind == false && locationSettings.mapCities.map && locationSettings.mapCities.map.length > 0){
        locationConfig.regionalMap.map = [];
        for(let i = 0; i < locationSettings.mapCities.map.length; i++){
            locationConfig.regionalMap.map[i] = locationSettings.mapCities.map[i];
        }
        centerMap(0, false);
        return;
    }

    // Build the list of cities configured in MYCONFIG.json / locationConfig
    let userCities = [];
    if (locationConfig.mainCity && locationConfig.mainCity.displayname) {
        userCities.push({
            name: locationConfig.mainCity.displayname,
            lat: locationConfig.mainCity.lat,
            lon: locationConfig.mainCity.lon
        });
    }
    if (locationConfig.eightCities && locationConfig.eightCities.cities) {
        for (let c of locationConfig.eightCities.cities) {
            if (c && c.displayname) {
                userCities.push({
                    name: c.displayname,
                    lat: c.lat,
                    lon: c.lon
                });
            }
        }
    }

    let savedMap = (locationSettings.mapCities && locationSettings.mapCities.map && locationSettings.mapCities.map.length > 0) ? locationSettings.mapCities.map : [];
    locationConfig.regionalMap.map = [];

    for (let i = 0; i < userCities.length && i < 10; i++) {
        let city = userCities[i];
        let saved = savedMap.find(m => m.name === city.name);
        if (saved && saved.left !== undefined && saved.top !== undefined && saved.left !== "") {
            locationConfig.regionalMap.map.push({
                name: city.name,
                lat: city.lat,
                lon: city.lon,
                left: Number(saved.left),
                top: Number(saved.top)
            });
        } else {
            let refMatch = regionalMapCities.find(r => r.name.toLowerCase() === city.name.toLowerCase());
            if (refMatch) {
                locationConfig.regionalMap.map.push({
                    name: city.name,
                    lat: city.lat,
                    lon: city.lon,
                    left: refMatch.left,
                    top: refMatch.top
                });
            } else {
                let dists = regionalMapCities.map((r) => {
                    let d = distanceByDegrees(city, r);
                    return { distance: d[0], ref: r };
                }).sort((a, b) => a.distance - b.distance);
                
                let nearest = dists[0].ref;
                let dLat = parseFloat(city.lat) - parseFloat(nearest.lat);
                let dLon = parseFloat(city.lon) - parseFloat(nearest.lon);
                let left = Math.round(nearest.left + dLon * 160);
                let top = Math.round(nearest.top - dLat * 425);
                locationConfig.regionalMap.map.push({
                    name: city.name,
                    lat: city.lat,
                    lon: city.lon,
                    left: left,
                    top: top
                });
            }
        }
    }

    centerMap(0, locationSettings.mapCities.autoFind !== false);
}

// Auto-load MYCONFIG.json from server, then resolve location
(async function autoLoadConfig() {
    await grabLocation();
    setTimeout(() => {
        onLocationInit();
    }, 100);
})();

function getMapStyle(country, state){
    mapStyle = {
        version: 8,
        sources: {
            "raster-tiles": {
                type: "raster",
                tiles: [
                    "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                ],
                tileSize: 256,
                attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
            },
        },
        layers: [
            {
                id: "basemap",
                type: "raster",
                source: "raster-tiles",
                layout: { visibility: "visible" },
                minzoom: 0,
                maxzoom: 22,
                paint: {
                    "raster-opacity": 1,
                },
            },
        ],
    };
}