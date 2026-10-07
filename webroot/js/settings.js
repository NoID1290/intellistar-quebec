var inSettings = true;

function setAlertTestStatus(message, isError) {
    var status = document.querySelector(".alertteststatus");
    if (!status) {
        return;
    }
    status.textContent = message;
    status.style.color = isError ? "#8a0000" : "#0b5f00";
    status.style.display = "block";
    setTimeout(() => {
        status.style.display = "none";
    }, 2200);
}

async function runAlertTestFromUI(mode) {
    if (!window.alertTest) {
        setAlertTestStatus("Test d'alerte non disponible.", true);
        return;
    }

    if (mode === "single") {
        var picker = document.getElementById("alerttesttype");
        var picked = picker ? picker.value : "tornado";
        var ok = await window.alertTest.trigger(picked);
        setAlertTestStatus(ok ? `Test exécuté : ${picked}` : "Type de test d'alerte inconnu.", !ok);
        return;
    }

    if (mode === "all") {
        await window.alertTest.triggerAll();
        setAlertTestStatus("Tous les tests d'alerte de catastrophe ont été exécutés.", false);
        return;
    }

    if (mode === "quebec") {
        await window.alertTest.triggerQuebec();
        setAlertTestStatus("Test Québec En Alerte exécuté.", false);
        return;
    }

    if (mode === "clear") {
        await window.alertTest.clear();
        setAlertTestStatus("Mode test d'alerte effacé.", false);
    }
}

function syncSettingsUI() {
    $("#settings-menu .version").text(`v${appearanceSettings.version || "1.2"}`);

    if (slideSettings.flavor) {
        flavorChanger(String(slideSettings.flavor));
    } else {
        $("#settings-menu .flavortext").text("Format : " + (slideSettings.flavor || "120") + "s");
    }

    if (appearanceSettings.graphicsPackage) {
        if (appearanceSettings.graphicsPackage == 2010 || appearanceSettings.graphicsPackage == "2010") {
            appearanceSettings.iconSet = "2010";
        } else if (appearanceSettings.graphicsPackage == 2026 || appearanceSettings.graphicsPackage == "2026") {
            appearanceSettings.iconSet = "2026";
        }
        versionsChanger(appearanceSettings.graphicsPackage);
    }

    if (appearanceSettings.ldlType) {
        ldlChanger(appearanceSettings.ldlType);
    }

    radarSmoothChanger(appearanceSettings.smoothRadar !== undefined ? appearanceSettings.smoothRadar : true);

    $("#musicvol-val").text(Math.round((audioSettings.musicVolume !== undefined ? audioSettings.musicVolume : 0.8) * 100) + '%');
    $("#vocalvol-val").text(Math.round((audioSettings.vocalVolume !== undefined ? audioSettings.vocalVolume : 1.0) * 100) + '%');

    var vlCheckbox = document.getElementById("enablevlcb");
    if (vlCheckbox) {
        vlCheckbox.checked = !!audioSettings.vocallocal;
    }

    var songOffsetInput = document.getElementById("songoffsetinput");
    if (songOffsetInput) {
        songOffsetInput.value = (audioSettings.offset !== undefined && audioSettings.offset >= 0) ? audioSettings.offset : 0;
    }

    var songInput = document.getElementById("songinput");
    if (songInput && Array.isArray(audioSettings.order)) {
        if (audioSettings.order.length === 1 && audioSettings.order[0].startsWith("Track ")) {
            var trackNum = audioSettings.order[0].replace("Track ", "");
            songInput.value = trackNum;
        } else if (audioSettings.order.length >= 12 || (audioSettings.order.length > 1 && audioSettings.order[0].startsWith("Track "))) {
            songInput.value = "N";
        } else if (audioSettings.order.length > 0 && !audioSettings.order[0].startsWith("Track ")) {
            songInput.value = "C";
        }
    }

    if (window.audioPlayer && typeof audioPlayer.buildPlaylist === "function") {
        audioPlayer.buildPlaylist();
    }

    var audioSourceSelect = document.getElementById("audiosourceinput");
    if (audioSourceSelect) {
        audioSourceSelect.value = audioSettings.source || "local";
        toggleAudioSourceUI(audioSourceSelect.value);
    }

    var clientIdInput = document.getElementById("spotify-client-id");
    if (clientIdInput && typeof spotifySettings !== "undefined") {
        clientIdInput.value = spotifySettings.clientId || "";
    }

    var spotifyModeSelect = document.getElementById("spotify-mode-select");
    if (spotifyModeSelect && typeof spotifySettings !== "undefined") {
        spotifyModeSelect.value = spotifySettings.mode || "sync";
    }

    updateSpotifyStatusUI();
}

function toggleAudioSourceUI(source) {
    var localControls = document.getElementById("local-song-controls");
    var spotifyPanel = document.getElementById("spotify-config-panel");

    if (source === "spotify") {
        if (localControls) localControls.style.display = "none";
        if (spotifyPanel) spotifyPanel.style.display = "flex";
    } else {
        if (localControls) localControls.style.display = "flex";
        if (spotifyPanel) spotifyPanel.style.display = "none";
    }
}

function updateSpotifyStatusUI() {
    var label = document.getElementById("spotify-status-label");
    var btn = document.getElementById("spotify-auth-btn");
    if (!label || typeof spotifySettings === "undefined") return;

    if (spotifySettings.enabled && spotifySettings.accessToken) {
        label.textContent = "Connected ✓";
        label.style.color = "#0b5f00";
        if (btn) btn.textContent = "Disconnect";
    } else {
        label.textContent = "Disconnected";
        label.style.color = "#555";
        if (btn) btn.textContent = "Connect Spotify";
    }
}

document.addEventListener('DOMContentLoaded', async () =>{
    syncSettingsUI();
    if (typeof spotifyManager !== "undefined") {
        spotifyManager.init();
    }
    await preloadFonts();
    await preloadImages();
    $.getJSON("https://mistwx.com/crawlnetwork.json", function(data){
        if(appearanceSettings.marqueeAd[0] == "network"){
            appearanceSettings.marqueeAd = data.crawls.intellistar;
        }
        if(Number(appearanceSettings.version) < Number(data.simVersions.intellistar)){
            alert("New update available. Download latest version at\nhttps://github.com/MistWeatherMedia/intellistar-1")
        }
    })

    var audioSourceSelect = document.getElementById("audiosourceinput");
    if (audioSourceSelect) {
        audioSourceSelect.addEventListener("change", (e) => {
            audioSettings.source = e.target.value;
            toggleAudioSourceUI(audioSettings.source);
            if (audioSettings.source === "spotify" && typeof spotifyManager !== "undefined") {
                spotifyManager.init();
            }
        });
    }

    var clientIdInput = document.getElementById("spotify-client-id");
    if (clientIdInput) {
        clientIdInput.addEventListener("change", (e) => {
            if (typeof spotifySettings !== "undefined") {
                spotifySettings.clientId = e.target.value.trim();
                spotifyManager.saveSettings();
            }
        });
    }

    var authBtn = document.getElementById("spotify-auth-btn");
    if (authBtn) {
        authBtn.addEventListener("click", () => {
            if (typeof spotifySettings !== "undefined" && spotifySettings.enabled) {
                spotifyManager.disconnect();
                updateSpotifyStatusUI();
            } else if (typeof spotifyManager !== "undefined") {
                spotifyManager.startAuth();
            }
        });
    }

    var spotifyModeSelect = document.getElementById("spotify-mode-select");
    if (spotifyModeSelect) {
        spotifyModeSelect.addEventListener("change", (e) => {
            if (typeof spotifySettings !== "undefined") {
                spotifySettings.mode = e.target.value;
                spotifyManager.saveSettings();
                spotifyManager.init();
            }
        });
    }

    var playlistSelect = document.getElementById("spotify-playlist-select");
    if (playlistSelect) {
        playlistSelect.addEventListener("change", (e) => {
            if (typeof spotifySettings !== "undefined") {
                spotifySettings.playlistId = e.target.value;
                spotifyManager.saveSettings();
                if (spotifySettings.mode === "sdk" && spotifyManager) {
                    spotifyManager.playPlaylist(spotifySettings.playlistId);
                }
            }
        });
    }

    document.getElementById("uploadsongbutton").addEventListener("click", () =>{
        document.getElementById("songuploadinput").click();
        document.getElementById("songinput").value = "C";
    })

    document.getElementById("songuploadinput")
        .addEventListener('change', (event) => {
            if(event.target.files[0]){
                document.getElementById("songinput").value = "C";
                var file = event.target.files[0];
                audioSettings.order = [file.name];
                var url = URL.createObjectURL(file);
                audioPlayer.playlist = [url];
            } else {
                audioSettings.order = [
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
                ]
                audioPlayer.buildPlaylist();
            }
        })
    document.getElementById("songoffsetinput")
        .addEventListener("change", (event) =>{
            audioSettings.offset = event.target.value >= 0 ? parseInt(event.target.value) : 0;
        })

    document.getElementById("songinput")
        .addEventListener('change', (event) => {
            if (event.target.value == "C") {
                document.getElementById("songuploadinput").click();
                return;
            }
            if (event.target.value == "N") {
                audioSettings.order = [
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
                ]
            } else {
                audioSettings.order = [`Track ${parseInt(event.target.value)}`];
            }
            console.log(`Track ${parseInt(event.target.value)}`);
            audioPlayer.buildPlaylist();
            console.log(audioPlayer.playlist);
            //console.log($('#songinput').val('selectedvalue'));
        })

    document.getElementById("enablevlcb")
        .addEventListener('change', (event) =>{
            audioSettings.vocallocal = event.target.checked;
        })

    document.getElementById("locsearchlookup")
        .addEventListener("keyup", (k) =>{
            if(k.key == "Enter"){
                locationSearch('locsearchlookup')
            }
        })
    document.getElementById("advlocsearchlookup")
        .addEventListener("keyup", (k) =>{
            if(k.key == "Enter"){
                locationSearch('advlocsearchlookup')
            }
        })

    document.getElementById("map-interactive")
        .addEventListener("click", () => {
            mapSettings();
        })

    var alertRunBtn = document.getElementById("alerttesttrigger");
    var alertAllBtn = document.getElementById("alerttestall");
    var alertQuebecBtn = document.getElementById("alerttestquebec");
    var alertClearBtn = document.getElementById("alerttestclear");
    if (alertRunBtn) {
        alertRunBtn.addEventListener("click", () => runAlertTestFromUI("single"));
    }
    if (alertAllBtn) {
        alertAllBtn.addEventListener("click", () => runAlertTestFromUI("all"));
    }
    if (alertQuebecBtn) {
        alertQuebecBtn.addEventListener("click", () => runAlertTestFromUI("quebec"));
    }
    if (alertClearBtn) {
        alertClearBtn.addEventListener("click", () => runAlertTestFromUI("clear"));
    }

    // IPTV mode: initialize with SMPTE color bars and 1000 Hz calibration tone (stays at color bar init)
    if (window.location.search.includes('iptv')) {
        console.log('[IPTV] Initialization mode detected — showing color bars & calibration tone');
        $("#settings-menu").css('visibility', 'hidden');
        $("#colorbar-screen").show();
        if (typeof window.scaleWindow === 'function') {
            window.scaleWindow();
        }
        if (typeof startTestTone === 'function') {
            startTestTone();
        }
        if (typeof setBootStatus === 'function') {
            setBootStatus("Initialisation et chargement des données météo...");
        }

        // Monitor data readiness and update status text without auto-starting forecast
        var iptvReadyCheck = setInterval(() => {
            var btn = document.getElementById('startbutton');
            var isReady = window.isWeatherDataReady || (btn && btn.style.pointerEvents !== 'none' && btn.style.opacity !== '0.5');
            if (isReady) {
                clearInterval(iptvReadyCheck);
                console.log('[IPTV] System ready — Color bars & test tone active. Waiting for start command...');
                if (typeof setBootStatus === 'function') {
                    setBootStatus("Prêt — En attente du lancement de la diffusion");
                }
            }
        }, 500);
    }

    startForecastCommandListener();

})

let lastProcessedForecastCommandId = null;
function startForecastCommandListener() {
    if (window._forecastCommandListenerStarted) return;
    window._forecastCommandListenerStarted = true;
    setInterval(async () => {
        try {
            const res = await fetch('/api/forecast');
            if (!res.ok) return;
            const data = await res.json();
            if (!data) return;

            // On first poll, record baseline ID without executing stale command
            if (lastProcessedForecastCommandId === null) {
                lastProcessedForecastCommandId = data.id || 0;
                console.log(`[Forecast API] Initialized listener with baseline ID: ${lastProcessedForecastCommandId}`);
                return;
            }

            if (!data.id || data.id === lastProcessedForecastCommandId) return;

            lastProcessedForecastCommandId = data.id;
            console.log(`[Forecast API] Received remote forecast command: ${data.action} (id: ${data.id})`);

            if (data.action === 'start') {
                await window.startForecast();
            } else if (data.action === 'stop') {
                window.stopForecast();
            }
        } catch (e) {}
    }, 1000);
}

/**
 * Changes between two slides (settings only)
 * 
 * Has to be IDs, otherwise it will not work
 * @param {string} id1 Div ID to fade out
 * @param {string} id2 Div ID to fade in
 */
function changeSlide(id1, id2, callback){
    $(`#${id1} .box`).fadeOut(333, 'linear', function(){
        $(`#${id1}`).fadeOut(0, function(){
            if(id2 != ""){
                $(`#${id2}`).fadeIn(0);
                $(`#${id2} .box`).fadeIn(333, 'linear');
            }
            if(callback){callback()}
        });
    })
}

var locNameInterval = null;
var dataGrabInterval = null;
var divs = ["i","ii","iii","iv","v","vi","vii","viii"];
function setLocationText(){
    if (locationConfig.mainCity) {
        var mainName = locationConfig.mainCity.displayname || "";
        var mainState = locationConfig.mainCity.state ? ", " + locationConfig.mainCity.state : (locationConfig.mainCity.stateFull ? ", " + locationConfig.mainCity.stateFull : '');
        $('.loctext').text("Nom du lieu : " + mainName + mainState); 
        $('.mainloc').text("Lieu principal : " + mainName + mainState); 
        $('.loccontainer .mainextraloc').text('Nom supplémentaire : ' + (locationConfig.mainCity.extraname || ""));
    }
    if (locationConfig.eightCities && locationConfig.eightCities.cities) {
        for(let i = 0; i < locationConfig.eightCities.cities.length; i++){
            var city = locationConfig.eightCities.cities[i];
            if (city) {
                var cityName = city.displayname || "";
                var cityState = city.state ? ", " + city.state : (city.stateFull ? ", " + city.stateFull : '');
                $(`.extracity.${divs[i]} .extrcitydisplayname`).text(cityName + cityState);
            }
        }
    }
}

function onLocationInit(){
    console.log(locationConfig);
    setLocationText();
    setTimeout(grabData, 100);
    if (dataGrabInterval) {
        clearInterval(dataGrabInterval);
        dataGrabInterval = null;
    }
    var configuredIntervalMs = (typeof getFetchIntervalMs === "function") ? getFetchIntervalMs() : 60000;
    dataGrabInterval = setInterval(() =>{
        if(inSettings == false){
            console.log("New data grab");
            grabData();
        }
    }, configuredIntervalMs);
}

function getSpecialModes() {
    if (typeof weatherInfo !== 'undefined' && weatherInfo && weatherInfo.specialModes) {
        return {
            bulletin: !!weatherInfo.specialModes.bulletin,
            precip: !!weatherInfo.specialModes.precip
        };
    }
    return { bulletin: false, precip: false };
}

var isForecastRunning = false;

async function startForecast() {
    if (window.isForecastRunning) {
        console.log('[Forecast] Forecast presentation is already running.');
        return;
    }

    // Ensure weather data has completed loading before beginning the presentation
    if (window.isWeatherDataReady === false) {
        console.log('[Forecast] Waiting for weather data to complete loading before starting presentation...');
        if (typeof setBootStatus === 'function') {
            setBootStatus("Lancement demandé — Finalisation du chargement des données...");
        }
        if (window.weatherDataReadyPromise) {
            await Promise.race([
                window.weatherDataReadyPromise,
                new Promise(resolve => setTimeout(resolve, 15000))
            ]);
        }
    }

    // Re-verify in case stopForecast was invoked while waiting
    if (window.isForecastRunning) {
        return;
    }

    window.isForecastRunning = true;
    inSettings = false;
    $("#map-interactive-settings").css('pointer-events', 'none');
    $("#settings-menu").fadeOut(0);
    if (typeof stopTestTone === 'function') {
        stopTestTone();
    }
    $("#colorbar-screen").fadeOut(300);
    $("#blackscreen").fadeIn(0);

    // Warm radar maps asynchronously in the background so presentation starts immediately
    if (typeof createMaps === 'function') {
        createMaps().catch((err) => console.warn('[Forecast] Background map warming:', err));
    }

    slideFlavor = flavorPicker(slideSettings.flavor, getSpecialModes());
    const startupDelay = 500;

    setTimeout(() => {
        if (!window.isForecastRunning) return;
        if (typeof audioPlayer !== 'undefined' && audioPlayer.startPlaying) {
            audioPlayer.startPlaying(audioPlayer.playlist, true);
        }
    }, 150);

    setTimeout(() => {
        if (!window.isForecastRunning) return;
        $("#blackscreen").fadeOut(200);
        slideKickOff();
        startLoops();
    }, startupDelay);

    console.log('[Forecast] Forecast presentation started.');
}

function stopForecast() {
    window.isForecastRunning = false;
    inSettings = true;

    // Stop slides
    if (typeof stopSlides === 'function') {
        stopSlides();
    } else if (typeof hideAllSlides === 'function') {
        hideAllSlides();
    }

    // Stop LDL
    if (typeof stopLoops === 'function') {
        stopLoops();
    }

    // Stop radar playback if active
    if (typeof radarEngine !== 'undefined' && radarEngine.stopPlayback) {
        radarEngine.stopPlayback();
    }

    // Stop all audio & vocal narrations
    if (typeof audioPlayer !== 'undefined' && audioPlayer.stopAll) {
        audioPlayer.stopAll();
    } else if (typeof audioPlayer !== 'undefined' && audioPlayer.stopPlaying) {
        audioPlayer.stopPlaying();
    }

    // Hide overlays & menus
    $("#blackscreen").hide();
    $("#settings-menu").css('visibility', 'hidden').hide();

    // Show color bar screen and resume calibration tone
    $("#colorbar-screen").fadeIn(300);
    if (typeof setBootStatus === 'function') {
        setBootStatus("Barres d'étalonnage actives — En attente du signal");
    }
    if (typeof startTestTone === 'function') {
        startTestTone();
    }
    console.log('[Forecast] Forecast presentation stopped. Returned to color bar initialization.');
}

async function startProgram() {
    return startForecast();
}

window.startForecast = startForecast;
window.stopForecast = stopForecast;
window.startProgram = startProgram;

function flavorChanger(flv){
    //changing color
    switch (flv) {
        case '60':
            $('.flavortext').text("Format : 60s");
            $("#flavor60 div").css('color', 'red'); 
            $("#flavor90 div").css('color', ''); 
            $("#flavor120 div").css('color', ''); 
            break;
        case '90':
            $('.flavortext').text("Format : 90s");
            $("#flavor60 div").css('color', ''); 
            $("#flavor90 div").css('color', 'red'); 
            $("#flavor120 div").css('color', ''); 
            break;
        case '120':
            $('.flavortext').text("Format : 120s");
            $("#flavor60 div").css('color', ''); 
            $("#flavor90 div").css('color', ''); 
            $("#flavor120 div").css('color', 'red'); 
            break;
        default:
            $("#flavor60 div").css('color', ''); 
            $("#flavor90 div").css('color', ''); 
            $("#flavor120 div").css('color', ''); 
            break;
    }
    slideSettings.flavor = flv;
    slideFlavor = flavorPicker(flv, getSpecialModes());
}

/**
 * Returns a flavor
 * @param {int} time Duration of the flavor
 * @param {{bulletin: boolean, precip: boolean}} modes Different modes that will determine the slides in the flavor
 * @returns 
 */
function flavorPicker(time, modes) {
    function filterUnsupportedSlides(order) {
        if (!Array.isArray(order)) {
            return [];
        }

        if (window.__iptvMapsAvailable !== false) {
            return order;
        }

        var disabledSlides = new Set([
            "mapCurrent", "mapForecast", "mapTest", "radarDoppler", "canadaDoppler",
            "couvertureNuageuse", "canadaSatellite", "satellite", "cloudCover"
        ]);
        console.warn('[IPTV] Skipping map and radar slides because WebGL maps are unavailable.');
        return order.filter(slide => {
            if (!slide || !slide.function) return false;
            if (disabledSlides.has(slide.function)) return false;
            if (/^(localDoppler|couvertureNuageuse|satellite)\d+$/.test(slide.function)) return false;
            return true;
        });
    }

    function getCloudSlideForDoppler(fn) {
        if (!fn || typeof fn !== 'string') return null;
        if (fn === 'localDoppler' || fn === 'localDoppler1') return 'couvertureNuageuse';
        var match = fn.match(/^localDoppler(\d+)$/);
        if (match) {
            var num = parseInt(match[1], 10);
            return (num === 1) ? 'couvertureNuageuse' : `couvertureNuageuse${num}`;
        }
        if (fn === 'canadaDoppler') return 'canadaSatellite';
        return null;
    }

    function isMatchingCloudSlide(cloudFn, candidateFn) {
        if (!cloudFn || !candidateFn) return false;
        if (candidateFn === cloudFn) return true;
        if (cloudFn === 'couvertureNuageuse' && (candidateFn === 'couvertureNuageuse1' || candidateFn === 'satellite1' || candidateFn === 'satellite')) return true;
        if (cloudFn === 'couvertureNuageuse1' && (candidateFn === 'couvertureNuageuse' || candidateFn === 'satellite' || candidateFn === 'satellite1')) return true;
        var matchCloud = cloudFn.match(/^couvertureNuageuse(\d+)$/);
        var matchCandidate = candidateFn.match(/^(?:couvertureNuageuse|satellite)(\d+)$/);
        if (matchCloud && matchCandidate && matchCloud[1] === matchCandidate[1]) return true;
        if (cloudFn === 'canadaSatellite' && (candidateFn === 'canadaSatellite' || candidateFn === 'couvertureNuageuse11' || candidateFn === 'satellite11')) return true;
        return false;
    }

    function normalizeToLocalDoppler(order) {
        if (!Array.isArray(order)) {
            return [];
        }

        var validSlides = order.filter(slide => slide && slide.enabled !== false && typeof slide.function === "string");
        var normalized = [];

        for (var i = 0; i < validSlides.length; i++) {
            var current = validSlides[i];
            normalized.push(current);

            var cloudCompanion = getCloudSlideForDoppler(current.function);
            if (cloudCompanion) {
                var next = (i + 1 < validSlides.length) ? validSlides[i + 1] : null;
                if (!next || !isMatchingCloudSlide(cloudCompanion, next.function)) {
                    normalized.push({
                        function: cloudCompanion,
                        slideDelay: 8500
                    });
                }
            }
        }

        return normalized;
    }

    if(slideSettings.auto == false){
        var manualOrder = filterUnsupportedSlides(normalizeToLocalDoppler(slideSettings.order));
        if (modes && modes.bulletin) {
            var hasBulletin = manualOrder.some(slide => slide && slide.function === "bulletin");
            if (!hasBulletin) {
                manualOrder = [{ function: "bulletin", slideDelay: 22000 }, ...manualOrder];
            }
        }
        return {
            ...slideSettings,
            order: manualOrder
        };
    }
    if(time == '') time = '120';
    if(!modes) modes = { bulletin: false, precip: false };
    if(modes.bulletin == undefined) modes.bulletin = false;
    if(modes.precip == undefined) modes.precip = false;

    var flavorKey = `${time}sec`;
    if (typeof slideFlavors === 'undefined' || !slideFlavors[flavorKey]) {
        flavorKey = '120sec';
    }

    var flavorsList = (typeof slideFlavors !== 'undefined' && slideFlavors[flavorKey]) ? slideFlavors[flavorKey] : [];
    var usableFlavors = flavorsList.filter(f => f.bulletin === modes.bulletin && f.precip === modes.precip);
    if (!usableFlavors || usableFlavors.length === 0) {
        usableFlavors = flavorsList.filter(f => f.bulletin === modes.bulletin);
    }
    if (!usableFlavors || usableFlavors.length === 0) {
        usableFlavors = flavorsList;
    }

    var flavor = usableFlavors.length > 0 ? usableFlavors[Math.floor(Math.random() * usableFlavors.length)] : { order: [] };
    var filteredOrder = filterUnsupportedSlides(normalizeToLocalDoppler(flavor.order || []));
    if (modes.bulletin && !filteredOrder.some(s => s && s.function === "bulletin")) {
        filteredOrder.unshift({ function: "bulletin", slideDelay: 22000 });
    }

    return {
        ...flavor,
        order: filteredOrder
    };
}

function locationSearch(id){
    $('.extracitytext').text("La modification du lieu est verrouillée par MYCONFIG.json. Modifiez le fichier et rechargez la page.");
    $('.extracitytext').css('color', 'darkred');
    $('.extracitytext').fadeIn(0);
    setTimeout(() => {
        $('.extracitytext').fadeOut(1000);
    }, 2500);
}

function versionsChanger(version){
    appearanceSettings.graphicsPackage = version;
    let versionHex;
    $(".versionstext").text("Version : " + version);
    $("#versions2007 div, #versions2008 div, #versions2009 div, #versions2010 div, #versions2026 div").css('color', '');
    $(`#versions${version} div`).css('color', 'red');
    switch(version){
        case 2007:
            appearanceSettings.iconSet = '2007';
            versionHex = "#304976";
            $('.changecolor').css('color', versionHex);
            break;
        case 2008:
            appearanceSettings.iconSet = '2007';
            versionHex = "#171717";
            $('.changecolor').css('color', versionHex);
            break;
        case 2009:
            appearanceSettings.iconSet = '2007';
            versionHex = "#171717";
            $('.changecolor').css('color', versionHex);
            break;
        case 2010:
            appearanceSettings.iconSet = '2010';
            version = 2009;
            versionHex = "#171717";
            $('.changecolor').css('color', versionHex);
            break;
        case 2026:
            appearanceSettings.iconSet = '2026';
            versionHex = "#0a192f";
            $('.changecolor').css('color', versionHex);
            break;
        default:
            break;
    }
    $("#styles").html(`<link rel="stylesheet" href="css/intellistar-32-${version}.css">`)
    setTimeout(() => {
        var flavorNum = slideSettings.flavor ? slideSettings.flavor : 120;
        flavorChanger(`${flavorNum}`);
    }, 500);
}

function ldlChanger(type){
    appearanceSettings.ldlType = type;
    if(type == 'observations'){
        $("#ldlbuttonboth div").css('color', ''); 
        $("#ldlbuttonobs div").css('color', 'red'); 
    }else{
        $("#ldlbuttonboth div").css('color', 'red'); 
        $("#ldlbuttonobs div").css('color', ''); 
    }
}

function radarSmoothChanger(enabled){
    appearanceSettings.smoothRadar = !!enabled;
    if(enabled){
        $("#radarsmoothon div").css('color', 'red'); 
        $("#radarsmoothoff div").css('color', ''); 
    }else{
        $("#radarsmoothon div").css('color', ''); 
        $("#radarsmoothoff div").css('color', 'red'); 
    }
    if (typeof radarEngine !== 'undefined' && radarEngine.activeTarget) {
        var target = radarEngine.activeTarget;
        var loc = radarEngine.activeLocKey;
        var layer = radarEngine.activeLayer;
        radarEngine.startPlayback(target, loc, layer);
    }
}

function saveLocationSettings(){
    try {
        locationSettings.mainCity.autoFind = false;
        locationSettings.eightCities.autoFind = false;
        locationSettings.mainCity.displayname = locationConfig.mainCity.displayname;
        locationSettings.mainCity.extraname = locationConfig.mainCity.extraname;
        locationSettings.mainCity.type = "geocode";
        locationSettings.mainCity.val = `${locationConfig.mainCity.lat},${locationConfig.mainCity.lon}`;
        for(let j = 0; j < 8; j++){
            locationSettings.eightCities.cities[j].displayname = locationConfig.eightCities.cities[j].displayname;
            locationSettings.eightCities.cities[j].type = "geocode";
            locationSettings.eightCities.cities[j].val = `${locationConfig.eightCities.cities[j].lat},${locationConfig.eightCities.cities[j].lon}`;
        }
    } catch(error){
        console.error(error);
    }
}

function downloadConfig(){
    saveLocationSettings()
    setTimeout(() => {
        var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(locationSettings));
        var downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href",     dataStr);
        downloadAnchorNode.setAttribute("download", `${locationConfig.mainCity.displayname}-${Date.now()}.json`);
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }, 1500);
}

function importJSONLocation() {
  const file = document.getElementById("jsonlocationimport").files[0];
  if (!file) {
    $('.extracitytext').text("L'importation de fichier est verrouillée par MYCONFIG.json.");
    $('.extracitytext').css('color', 'darkred');
    $('.extracitytext').fadeIn(0);
    setTimeout(() => {
        $('.extracitytext').fadeOut(1000);
    }, 2500);
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const json = JSON.parse(e.target.result);
      console.log(json);
      Object.assign(locationSettings, json);
      console.log("Updated location settings:", locationSettings);
        grabLocation().then(() =>{
            setTimeout(() => {
                onLocationInit()
            }, 100);
        });
      setTimeout(() => {
        $('.extracitytext').text("Succès ! JSON chargé.");
        $('.extracitytext').css('color', 'green');
        $('.extracitytext').fadeIn(0)
        setTimeout(() => {
            $('.extracitytext').fadeOut(1000);
        }, 2500);
      }, 1000);
    } catch (err) {
      console.error("Error parsing JSON:", err);
      $('.extracitytext').text("ERREUR : Une erreur s'est produite.");
      $('.extracitytext').css('color', 'darkred');
      $('.extracitytext').fadeIn(0)
      setTimeout(() => {
        $('.extracitytext').fadeOut(1000);
      }, 2500);
    }
  };
  reader.readAsText(file);
}

function saveExtraName(){
    $('.extracitytext').text("Le nom supplémentaire est géré par MYCONFIG.json. Modifiez le fichier et rechargez.");
    $('.extracitytext').css('color', 'darkred');
    $('.extracitytext').fadeIn(0);
    setTimeout(() => {
        $('.extracitytext').fadeOut(1000);
    }, 2500);
    return;

    if(document.getElementById('extranameinput').value == undefined || document.getElementById('extranameinput').value == ''){
        return;
    }
    locationConfig.mainCity.extraname = document.getElementById('extranameinput').value;
    $('.mainextraloc').text("Nom supplémentaire : " + document.getElementById('extranameinput').value);
    setTimeout(() => {
        document.getElementById('extranameinput').value = '';
    }, 500);
}

var cookieDivs = ["One","Two","Three","Four","Five","Six","Seven","Eight"]
function saveLocationCookies(){
    saveLocationSettings()
    setTimeout(() => {
        try {
            document.cookie = `mainCityAutoFind=false`;
            document.cookie = `mainCityName=${locationConfig.mainCity.displayname}`;
            document.cookie = `mainCityExtraName=${locationConfig.mainCity.extraname}`;
            document.cookie = `mainCityType=geocode`;
            document.cookie = `mainCityVal=${locationConfig.mainCity.lat},${locationConfig.mainCity.lon}`;
            document.cookie = `eightCitiesAutoFind=false`;
            for(var i = 0; i < locationConfig.eightCities.cities.length; i++){
                document.cookie = `eightCitiesName${cookieDivs[i]}=${locationConfig.eightCities.cities[i].displayname}`;
                document.cookie = `eightCitiesType${cookieDivs[i]}=geocode`;
                document.cookie = `eightCitiesVal${cookieDivs[i]}=${locationConfig.eightCities.cities[i].lat},${locationConfig.eightCities.cities[i].lon}`;
            }
            setTimeout(() => {
                $('.extracitytext').text("Succès ! Témoins enregistrés.");
                $('.extracitytext').css('color', 'green');
                $('.extracitytext').fadeIn(0);

                setTimeout(() => {
                    $('.extracitytext').fadeOut(1000);
                }, 2500);
            }, 250);
        }catch(error){
            $('.extracitytext').text("ERREUR : Une erreur s'est produite.");
            $('.extracitytext').css('color', 'darkred');
            $('.extracitytext').fadeIn(0);
            setTimeout(() => {
                $('.extracitytext').fadeOut(1000);
            }, 2500);
        }
    }, 1000);
}
function loadLocationCookies(){
    $('.extracitytext').text("Le chargement des témoins est désactivé. MYCONFIG.json contrôle toutes les données.");
    $('.extracitytext').css('color', 'darkred');
    $('.extracitytext').fadeIn(0)
    setTimeout(() => {
        $('.extracitytext').fadeOut(1000);
    }, 2500);
    return;

    if(!document.cookie){
        $('.extracitytext').text("Vous n'avez aucun témoin enregistré !");
        $('.extracitytext').css('color', 'darkred');
        $('.extracitytext').fadeIn(0)
        setTimeout(() => {
            $('.extracitytext').fadeOut(1000);
        }, 2500);
        return;
    }
    locationSettings.mainCity.autoFind = getCookie("mainCityAutoFind") == "false" ? false : true;
    locationSettings.eightCities.autoFind = getCookie("eightCitiesAutoFind") == "false" ? false : true;
    locationSettings.mainCity.displayname = getCookie("mainCityName");
    locationSettings.mainCity.extraname = getCookie("mainCityExtraName");
    locationSettings.mainCity.type = getCookie("mainCityType");
    locationSettings.mainCity.val = getCookie("mainCityVal");
    for(let i = 0; i < locationSettings.eightCities.cities.length; i++){
        locationSettings.eightCities.cities[i].displayname = getCookie(`eightCitiesName${cookieDivs[i]}`);
        locationSettings.eightCities.cities[i].type = getCookie(`eightCitiesType${cookieDivs[i]}`);
        locationSettings.eightCities.cities[i].val = getCookie(`eightCitiesVal${cookieDivs[i]}`);
    }
    setTimeout(() => {
        grabLocation().then(() =>{
            setTimeout(() => {
                onLocationInit()
            }, 100);
        });
        setTimeout(() => {
            console.log(locationSettings);
            $('.extracitytext').text("Succès ! Témoins chargés.");
            $('.extracitytext').css('color', 'green');
            $('.extracitytext').fadeIn(0);
            setTimeout(() => {
                $('.extracitytext').fadeOut(1000);
            }, 2500);
        }, 500);
    }, 500);
}

function loadMapCityDropbox(){
    $("#citydropvalue").html("<option value=\"N\"> </option>");
    $(".map-cities .city").each((index) =>{
        if(locationConfig.regionalMap.map.length > index){
            $("#citydropvalue").append(`<option value=${index}>${locationConfig.regionalMap.map[index].name}</option>`)
        }
    }).promise().done(function(){
        if(!(document.getElementById("citydropvalue").options.length >= 11)){
            $("#citydropvalue").append(`<option value=add>Add a city...</option>`)
        }
    })
}

var inMapBefore = false;
var currentMapIdx = '';
var mapDivs = ["i","ii","iii","iv","v","vi","vii","viii","ix","x"]
function mapSettings(){
    changeSlide('morelocation', '', function(){
        $("#citydropvalue").html("<option value=\"N\"> </option>");
        $(".map-cities .city." + mapDivs[currentMapIdx]).removeClass("selected");
        $(".city-properties").fadeOut(0);
        $("#settings-menu").fadeOut(0);
        slidePrograms.mapTest();
        $("#map-interactive-settings").fadeIn(0);
        document.getElementById("mapleftvalue").value = locationConfig.regionalMap.leftPos;
        document.getElementById("maptopvalue").value = locationConfig.regionalMap.topPos;
        if(!inMapBefore){
            $(".map-cities").css({
                left: locationConfig.regionalMap.leftPos + 'px',
                top: locationConfig.regionalMap.topPos + 'px'
            });
        }
        loadMapCityDropbox()
    });
    if(!inMapBefore){
        document.getElementById("mapleftvalue")
            .addEventListener("input", (event) =>{
                if(!Number(event.target.value)){
                    document.getElementById("mapleftvalue").value = locationConfig.regionalMap.leftPos;
                }else{
                    //console.log(event);
                    $(".map-regional").css({
                        left: `${event.target.value}px`
                    });
                    locationConfig.regionalMap.leftPos = event.target.value;
                }
            })
        document.getElementById("mapleftvalue")
            .addEventListener("keypress", (k) =>{
                //console.log(k)
                if(k.key == "a"){
                    locationConfig.regionalMap.leftPos++;
                    $(".map-regional").css({
                        left: `${locationConfig.regionalMap.leftPos}px`
                    });
                    document.getElementById("mapleftvalue").value = locationConfig.regionalMap.leftPos;
                }else if(k.key == "A"){
                    locationConfig.regionalMap.leftPos = locationConfig.regionalMap.leftPos + 10;
                    $(".map-regional").css({
                        left: `${locationConfig.regionalMap.leftPos}px`
                    });
                    document.getElementById("mapleftvalue").value = locationConfig.regionalMap.leftPos;
                }else if(k.key == "d"){
                    locationConfig.regionalMap.leftPos--;
                    $(".map-regional").css({
                        left: `${locationConfig.regionalMap.leftPos}px`
                    });
                    document.getElementById("mapleftvalue").value = locationConfig.regionalMap.leftPos;
                }else if(k.key == "D"){
                    locationConfig.regionalMap.leftPos = locationConfig.regionalMap.leftPos - 10;
                    $(".map-regional").css({
                        left: `${locationConfig.regionalMap.leftPos}px`
                    });
                    document.getElementById("mapleftvalue").value = locationConfig.regionalMap.leftPos;
                }
            })
        document.getElementById("maptopvalue")
            .addEventListener("input", (event) =>{
                if(!Number(event.target.value)){
                    document.getElementById("maptopvalue").value = locationConfig.regionalMap.topPos;
                }else{
                    //console.log(event);
                    $(".map-regional").css({
                        top: `${event.target.value}px`
                    });
                    locationConfig.regionalMap.topPos = event.target.value;
                }
            })
        document.getElementById("maptopvalue")
            .addEventListener("keypress", (k) =>{
                //console.log(k)
                if(k.key == "w"){
                    locationConfig.regionalMap.topPos++;
                    $(".map-regional").css({
                        top: `${locationConfig.regionalMap.topPos}px`
                    });
                    document.getElementById("maptopvalue").value = locationConfig.regionalMap.topPos;
                }else if(k.key == "W"){
                    locationConfig.regionalMap.topPos = locationConfig.regionalMap.topPos + 10;
                    $(".map-regional").css({
                        top: `${locationConfig.regionalMap.topPos}px`
                    });
                    document.getElementById("maptopvalue").value = locationConfig.regionalMap.topPos;
                }else if(k.key == "s"){
                    locationConfig.regionalMap.topPos--;
                    $(".map-regional").css({
                        top: `${locationConfig.regionalMap.topPos}px`
                    });
                    document.getElementById("maptopvalue").value = locationConfig.regionalMap.topPos;
                }else if(k.key == "S"){
                    locationConfig.regionalMap.topPos = locationConfig.regionalMap.topPos - 10;
                    $(".map-regional").css({
                        top: `${locationConfig.regionalMap.topPos}px`
                    });
                    document.getElementById("maptopvalue").value = locationConfig.regionalMap.topPos;
                }
            })
        document.getElementById("citydropvalue")
            .addEventListener('change', (event) =>{
                if(event.target.value == "N"){
                    $(".map-cities .city." + mapDivs[currentMapIdx]).removeClass("selected");
                    $(".city-properties").fadeOut(0);
                    return;
                }
                if(event.target.value == "add"){
                    $(".map-cities .city." + mapDivs[currentMapIdx]).removeClass("selected");
                    console.log("City added: no.", locationConfig.regionalMap.map.length);
                    locationConfig.regionalMap.map.push({
                        name: "City Name",
                        lat: 0,
                        lon: 0,
                        left: 720,
                        top: 430
                    });
                    $(".map-cities .city.selected").removeClass("selected");
                    currentMapIdx = locationConfig.regionalMap.map.length-1;
                    $("#citydropvalue").append(`<option value=${locationConfig.regionalMap.map.length-1}>City Name</option>`)
                    if(!(document.getElementById("citydropvalue").options.length >= 11)){
                        $("#citydropvalue").append(`<option value=add>Add a city...</option>`)
                    }else{
                        document.querySelector('option[value="add"]').remove();
                    }
                    $(".map-cities").append(`<div class="city ${mapDivs[locationConfig.regionalMap.map.length-1]} selected" style="left: 720px; top: 430px;"><div class="city-name">City Name</div><div class="temp">88</div><div class="icon" style="background-image: url(images/icons/2007/large/Ts.webp); background-size: 100% 100%;"></div></div>`)
                    $(".city-properties").fadeIn(0);
                    $(".city-properties .city-name").text("City Name:");
                    document.getElementById("cityleftvalue").value = 720;
                    document.getElementById("citytopvalue").value = 430;
                    loadMapCityDropbox();
                    return;
                }
                $(".map-cities .city." + mapDivs[currentMapIdx]).removeClass("selected");
                $(".city-properties").fadeIn(0);
                $(".city-properties .city-name").text(locationConfig.regionalMap.map[event.target.value].name + ":");
                currentMapIdx = event.target.value;
                document.getElementById("cityleftvalue").value = locationConfig.regionalMap.map[event.target.value].left;
                document.getElementById("citytopvalue").value = locationConfig.regionalMap.map[event.target.value].top;
                $(".map-cities .city." + mapDivs[currentMapIdx]).addClass("selected");
            })

        document.getElementById("cityleftvalue")
            .addEventListener('input', (event) =>{
                if(!Number(event.target.value)){
                    document.getElementById("cityleftvalue").value = locationConfig.regionalMap.map[currentMapIdx].left;
                }else{
                    //console.log(event);
                    $(".map-cities .city." + mapDivs[currentMapIdx]).css({
                        left: `${event.target.value}px`
                    });
                    locationConfig.regionalMap.map[currentMapIdx].left = event.target.value;
                }
            })
        document.getElementById("cityleftvalue")
            .addEventListener("keypress", (k) =>{
                //console.log(k)
                if(k.key == "d"){
                    locationConfig.regionalMap.map[currentMapIdx].left++;
                    $(".map-cities .city." + mapDivs[currentMapIdx]).css({
                        left: `${locationConfig.regionalMap.map[currentMapIdx].left}px`
                    });
                    document.getElementById("cityleftvalue").value = locationConfig.regionalMap.map[currentMapIdx].left;
                }else if(k.key == "D"){
                    locationConfig.regionalMap.map[currentMapIdx].left = locationConfig.regionalMap.map[currentMapIdx].left + 10;
                    $(".map-cities .city." + mapDivs[currentMapIdx]).css({
                        left: `${locationConfig.regionalMap.map[currentMapIdx].left}px`
                    });
                    document.getElementById("cityleftvalue").value = locationConfig.regionalMap.map[currentMapIdx].left;
                }else if(k.key == "a"){
                    locationConfig.regionalMap.map[currentMapIdx].left--;
                    $(".map-cities .city." + mapDivs[currentMapIdx]).css({
                        left: `${locationConfig.regionalMap.map[currentMapIdx].left}px`
                    });
                    document.getElementById("cityleftvalue").value = locationConfig.regionalMap.map[currentMapIdx].left;
                }else if(k.key == "A"){
                    locationConfig.regionalMap.map[currentMapIdx].left = locationConfig.regionalMap.map[currentMapIdx].left - 10;
                    $(".map-cities .city." + mapDivs[currentMapIdx]).css({
                        left: `${locationConfig.regionalMap.map[currentMapIdx].left}px`
                    });
                    document.getElementById("cityleftvalue").value = locationConfig.regionalMap.map[currentMapIdx].left;
                }
            })
        
        document.getElementById("citytopvalue")
            .addEventListener('input', (event) =>{
                if(!Number(event.target.value)){
                    document.getElementById("citytopvalue").value = locationConfig.regionalMap.map[currentMapIdx].top;
                }else{
                    //console.log(event);
                    $(".map-cities .city." + mapDivs[currentMapIdx]).css({
                        top: `${event.target.value}px`
                    });
                    locationConfig.regionalMap.map[currentMapIdx].top = event.target.value;
                }
            })
        document.getElementById("citytopvalue")
            .addEventListener("keypress", (k) =>{
                //console.log(k)
                if(k.key == "s"){
                    locationConfig.regionalMap.map[currentMapIdx].top++;
                    $(".map-cities .city." + mapDivs[currentMapIdx]).css({
                        top: `${locationConfig.regionalMap.map[currentMapIdx].top}px`
                    });
                    document.getElementById("citytopvalue").value = locationConfig.regionalMap.map[currentMapIdx].top;
                }else if(k.key == "S"){
                    locationConfig.regionalMap.map[currentMapIdx].top = locationConfig.regionalMap.map[currentMapIdx].top + 10;
                    $(".map-cities .city." + mapDivs[currentMapIdx]).css({
                        top: `${locationConfig.regionalMap.map[currentMapIdx].top}px`
                    });
                    document.getElementById("citytopvalue").value = locationConfig.regionalMap.map[currentMapIdx].top;
                }else if(k.key == "w"){
                    locationConfig.regionalMap.map[currentMapIdx].top--;
                    $(".map-cities .city." + mapDivs[currentMapIdx]).css({
                        top: `${locationConfig.regionalMap.map[currentMapIdx].top}px`
                    });
                    document.getElementById("citytopvalue").value = locationConfig.regionalMap.map[currentMapIdx].top;
                }else if(k.key == "W"){
                    locationConfig.regionalMap.map[currentMapIdx].top = locationConfig.regionalMap.map[currentMapIdx].top - 10;
                    $(".map-cities .city." + mapDivs[currentMapIdx]).css({
                        top: `${locationConfig.regionalMap.map[currentMapIdx].top}px`
                    });
                    document.getElementById("citytopvalue").value = locationConfig.regionalMap.map[currentMapIdx].top;
                }
            })
    }
}
function mapSettingsExit(){
    $("#settings-menu").fadeIn(0);
    $("#map-interactive-settings").fadeOut(0);
    $(".map-cities .city." + mapDivs[currentMapIdx]).removeClass("selected");
    $(".map").fadeOut(0);
    changeSlide('basic', 'morelocation');
    $(".map-cities .city").each((index, element) =>{
        if(!locationConfig.regionalMap.map[index]){return;}
        var oldLeft = Number($(element).css('left').split("px")[0]), oldTop = Number($(element).css('top').split("px")[0]);
        locationConfig.regionalMap.map[index].left = oldLeft;
        locationConfig.regionalMap.map[index].top = oldTop;
    })
    inMapBefore = true;
    locationSettings.mapCities = locationConfig.regionalMap;
    locationSettings.mapCities.autoFind = false;
}
async function removeMapCity(){
    locationConfig.regionalMap.map.splice(currentMapIdx, 1);
    $(".map-cities .city." + mapDivs[currentMapIdx]).fadeOut(0);
    $(".city-properties").fadeOut(0);
    document.getElementById("citydropvalue").remove(Number(currentMapIdx) + 1)
    $("#citydropvalue").html("<option value=\"N\"> </option>");
    $(".map-cities").children(`.${mapDivs[currentMapIdx]}`).remove();
    loadMapCityDropbox();
    //last thing
    await grabMapCityData();
}
async function searchMapCity(){
    $.getJSON("https://api.weather.com/v3/location/search?query=" + document.getElementById("searchcityvalue").value + "&language=en-US&format=json&apiKey=" + api_key, function(data){
        console.log(data);
        locationConfig.regionalMap.map[currentMapIdx].name = data.location.displayName[0];
        locationConfig.regionalMap.map[currentMapIdx].lat = data.location.latitude[0];
        locationConfig.regionalMap.map[currentMapIdx].lon = data.location.longitude[0];
        $(".city-properties .city-name").text(data.location.displayName[0] + ":");
        $(".map-cities .city." + mapDivs[currentMapIdx] + " .city-name").text(data.location.displayName[0]);
        $("#citydropvalue").html("<option value=\"N\"> </option>");
        loadMapCityDropbox()
    })
    await grabMapCityData();
}