var obsInterval;
var obsTimeout = null;
var alertActive;
var crawlIndex = 0;
var today = new Date();

function scheduleNextObs(fn, delay) {
    if (obsTimeout) {
        clearTimeout(obsTimeout);
        obsTimeout = null;
    }
    if (typeof clearMetricSlideTimeout === 'function') {
        clearMetricSlideTimeout();
    }
    obsTimeout = setTimeout(fn, delay);
}

function updateLDLClock() {
    var parts = new Date().toLocaleTimeString('en-US', {hour: 'numeric', hour12: true, minute: 'numeric'}).split(" ");
    var timePart = parts[0] || "";
    var ampmPart = parts[1] || "";
    var clockHtml = `${timePart}<span class="ampm">${ampmPart}</span>`;
    $(".ldl-black .time").html(clockHtml);
    $(".ldl-blue .time span").html(clockHtml);
}
updateLDLClock();
var dateTimeChanger = setInterval(updateLDLClock, 5000);

function startLoops(){
    if(alertActive) return;
    blueCityIndex = 0;
    if(Number(appearanceSettings.graphicsPackage) >= 2009){
        blueLDL(appearanceSettings.ldlType);
        $(".ldl-blue").show();
        $(".ldl-black").hide();
    }else{
        $(".ldl-black").show();
        $(".ldl-blue").hide();
        timeTab("time");
        blackLDL(appearanceSettings.ldlType);
    }
}

var timeTabIndex = 0;
var timeTabTimeout = null;
function timeTab(type){
    if (timeTabTimeout) {
        clearTimeout(timeTabTimeout);
        timeTabTimeout = null;
    }
    if (alertActive) {
        $(".ldl-black .time").show();
        $(".ldl-black .temp").hide();
        return;
    }
    var currentTemp = (weatherInfo && weatherInfo.currentConditions && weatherInfo.currentConditions.temp !== undefined)
        ? weatherInfo.currentConditions.temp
        : "";
    $(".ldl-black .temp").text(currentTemp !== "" ? currentTemp + "°" : "");
    if(type == "time"){
        $(".ldl-black .time").fadeIn(500);
        $(".ldl-black .temp").fadeOut(500);
    }
    if(type == "temp"){
        $(".ldl-black .time").fadeOut(500);
        $(".ldl-black .temp").fadeIn(500);
    }
    var list = ["temp","time"];
    timeTabTimeout = setTimeout(() => {
        timeTab(list[timeTabIndex % list.length]);
        timeTabIndex = timeTabIndex + 1;
    }, 8000);
}

function blackLDL(type){
    if (obsTimeout) {
        clearTimeout(obsTimeout);
        obsTimeout = null;
    }
    if(type == 'both'){
        crawlIndex = Math.floor(Math.random() * appearanceSettings.marqueeAd.length);
        adCrawl(crawlIndex);
    } else {
        blackLDLObs();
    }
}

function adCrawl(idx){
    if (obsTimeout) {
        clearTimeout(obsTimeout);
        obsTimeout = null;
    }
    $(".ldl-black .observations").hide();
    $(".ldl-black .template.ad").show();
    $(".ldl-black .weathercomlogo").hide();
    $('.ldl-black .crawl').text(appearanceSettings.marqueeAd[idx]);
    $('.ldl-black .crawl').marquee({ speed: 185, pauseOnHover: false }).on('finished', () => {
        $('.ldl-black .crawl').text("");
        $('.ldl-black .crawl').marquee('destroy');
        scheduleNextObs(blackLDLObs, 500);
    });
}

const DEFAULT_QC_CITIES = new Set([
    "montreal", "quebec", "laval", "gatineau", "longueuil", "sherbrooke",
    "saguenay", "levis", "trois-rivieres", "terrebonne", "saint-jean-sur-richelieu",
    "drummondville", "rouyn-noranda", "rimouski", "saint-jerome", "granby",
    "victoriaville", "saint-hyacinthe", "shawinigan", "joliette", "sorel-tracy",
    "salaberry-de-valleyfield", "val-d'or", "val d'or", "val-dor", "sept-iles",
    "baie-comeau", "gaspe", "matane", "amos", "alma", "thetford mines",
    "chibougamau", "magog", "saint-remi", "mont-laurier", "montebello",
    "lachute", "mont-tremblant", "bromont", "charlevoix", "le massif",
    "mont-sainte-anne", "brossard", "repentigny", "blainville", "mirabel",
    "mascouche", "chateauguay"
]);

function isQuebecCity(c) {
    if (!c || !c.name) return false;
    var nameLower = c.name.toLowerCase().trim();
    var nameNorm = nameLower.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");

    // If explicit province is provided (e.g. from canadaCities)
    if (c.province) {
        var prov = c.province.toLowerCase().replace(/[^a-z]/g, '');
        if (prov === 'qc' || prov === 'quebec') return true;
        return false;
    }

    // If configured in locationConfig.quebecCities
    if (locationConfig && Array.isArray(locationConfig.quebecCities)) {
        for (var qc of locationConfig.quebecCities) {
            if (qc && qc.name) {
                var qn = qc.name.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
                if (qn === nameNorm) return true;
            }
        }
    }

    // If present in default QC cities set
    if (DEFAULT_QC_CITIES.has(nameNorm)) return true;

    // If in quebecCities weather array
    if (weatherInfo && weatherInfo.quebecCities && Array.isArray(weatherInfo.quebecCities.cities)) {
        for (var qcc of weatherInfo.quebecCities.cities) {
            if (qcc && qcc.name) {
                var qccn = qcc.name.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
                if (qccn === nameNorm) return true;
            }
        }
    }

    return false;
}

var locWeatherID = appearanceSettings.localWeatherID == "XXXXX" ? Math.floor(Math.random() * 30000) + 10000 : appearanceSettings.localWeatherID;
var ldlIndex = 0;
function blackLDLObs(){
    if (obsTimeout) {
        clearTimeout(obsTimeout);
        obsTimeout = null;
    }
    if (alertActive) {
        return;
    }
    $(".ldl-black .template.obs").show();
    $(".ldl-black .template.ad").hide();
    $(".ldl-black .observations").show();
    $(".ldl-black .weathercomlogo").show();

    if (!weatherInfo || !weatherInfo.currentConditions) {
        scheduleNextObs(blackLDLObs, 2000);
        return;
    }

    var mainCityName = (locationConfig && locationConfig.mainCity && locationConfig.mainCity.displayname)
        ? locationConfig.mainCity.displayname
        : "";

    var observations = [
        cc = function(){
            $(".ldl-black .currently").show();
            $(".ldl-black .info").show();
            $(".ldl-black .info-header").hide();
            $(".ldl-black .info").text(`${weatherInfo.currentConditions.temp}°`);
            getIcon($(".ldl-black .icon"), weatherInfo.currentConditions.icon, "ldl", undefined);
            $(".ldl-black .icon").show();
            $(".ldl-black .city-name").text(mainCityName);
        },
        wind = function(){
            $(".ldl-black .currently").hide();
            $(".ldl-black .info-header").show();
            $(".ldl-black .icon").hide();
            $(".ldl-black .city-name").text(mainCityName);
            $(".ldl-black .info-header").text("VENT:");
            $(".ldl-black .info").empty();
            var windParts = (weatherInfo.currentConditions.wind || "").split(" ");
            $(".ldl-black .info").append(`<span class="wdc">${windParts[0] || ""}</span> ${windParts[1] === undefined ? "" : windParts[1]}`);
        },
        gusts = (!weatherInfo.currentConditions.gusts || weatherInfo.currentConditions.gusts == "None" || weatherInfo.currentConditions.gusts == "Aucune") ? null : function(){
            $(".ldl-black .currently").hide();
            $(".ldl-black .info-header").show();
            $(".ldl-black .icon").hide();
            $(".ldl-black .city-name").text(mainCityName);
            $(".ldl-black .info-header").text("RAFALES:");
            $(".ldl-black .info").empty();
            $(".ldl-black .info").append(`${weatherInfo.currentConditions.gusts}<span>${isMetric() ? "KM/H" : "MPH"}</span>`);
        },
        humidity = function(){
            $(".ldl-black .currently").hide();
            $(".ldl-black .info-header").show();
            $(".ldl-black .icon").hide();
            $(".ldl-black .city-name").text(mainCityName);
            $(".ldl-black .info-header").text("HUMIDITÉ:");
            $(".ldl-black .info").empty();
            $(".ldl-black .info").append(`${(weatherInfo.currentConditions.humidity || "").replace("%","")}<span>%</span>`);
        },
        dewpoint = function(){
            $(".ldl-black .currently").hide();
            $(".ldl-black .info-header").show();
            $(".ldl-black .icon").hide();
            $(".ldl-black .city-name").text(mainCityName);
            $(".ldl-black .info-header").text("PND. ROSÉE:");
            $(".ldl-black .info").empty();
            $(".ldl-black .info").text(`${weatherInfo.currentConditions.dewpoint}°`);
        },
        pressure = function(){
            $(".ldl-black .currently").hide();
            $(".ldl-black .info-header").show();
            $(".ldl-black .icon").hide();
            $(".ldl-black .city-name").text(mainCityName);
            $(".ldl-black .info-header").text("PRESSION:");
            $(".ldl-black .info").empty();
            var pressureVal = (weatherInfo.currentConditions.pressure && weatherInfo.currentConditions.pressure.val !== undefined)
                ? weatherInfo.currentConditions.pressure.val
                : "";
            $(".ldl-black .info").append(`${pressureVal}`);
        },
        visibility = function(){
            $(".ldl-black .currently").hide();
            $(".ldl-black .info-header").show();
            $(".ldl-black .icon").hide();
            $(".ldl-black .city-name").text(mainCityName);
            $(".ldl-black .info-header").text("VISIBILITÉ:");
            $(".ldl-black .info").empty();
            $(".ldl-black .info").append(`${weatherInfo.currentConditions.visibility}<span>${isMetric() ? "KM" : "MI"}</span>`);
        },
        precip = (!weatherInfo.monthlyPrecip || weatherInfo.monthlyPrecip === "0.00" || weatherInfo.monthlyPrecip === "0.0" || weatherInfo.monthlyPrecip === "0" || weatherInfo.monthlyPrecip === "") ? null : function(){
            $(".ldl-black .currently").hide();
            $(".ldl-black .info-header").show();
            $(".ldl-black .icon").hide();
            $(".ldl-black .city-name").text(mainCityName);
            $(".ldl-black .info-header").text(`${today.toLocaleDateString("fr-CA", {month: 'short'}).toUpperCase()} PRÉCIP:`);
            $(".ldl-black .info").empty();
            $(".ldl-black .info").append(`${weatherInfo.monthlyPrecip}<span>${isMetric() ? "MM" : "IN"}</span>`);
        }
    ];

    const seenCityNames = new Set();
    const addCityObs = (c) => {
        if (c && c.name && c.temp !== "" && c.temp !== undefined && !seenCityNames.has(c.name.toLowerCase())) {
            if (!isQuebecCity(c)) return;
            seenCityNames.add(c.name.toLowerCase());
            observations.push(function() {
                $(".ldl-black .currently").show();
                $(".ldl-black .info").show();
                $(".ldl-black .info-header").hide();
                $(".ldl-black .info").text(`${c.temp}°`);
                getIcon($(".ldl-black .icon"), c.icon, "ldl", undefined);
                $(".ldl-black .icon").show();
                $(".ldl-black .city-name").text(c.name);
            });
        }
    };

    if (weatherInfo.eightCities && weatherInfo.eightCities.cities) {
        weatherInfo.eightCities.cities.forEach(addCityObs);
    }
    if (weatherInfo.quebecCities && weatherInfo.quebecCities.cities) {
        weatherInfo.quebecCities.cities.forEach(addCityObs);
    }
    var currentProgram = observations[ldlIndex % observations.length];
    if(currentProgram == null){
        ldlIndex++;
        blackLDLObs();
        return;
    }
    currentProgram();
    ldlIndex = ldlIndex + 1;

    scheduleNextObs(blackLDLObs, 6000);
}

var activeAlertCrawlIndex = 0;
function rotateNextAlertCrawl() {
    if (!weatherInfo || !weatherInfo.bulletin || !Array.isArray(weatherInfo.bulletin.alerts) || weatherInfo.bulletin.alerts.length <= 1) {
        return;
    }
    activeAlertCrawlIndex = (activeAlertCrawlIndex + 1) % weatherInfo.bulletin.alerts.length;
    var nextItem = weatherInfo.bulletin.alerts[activeAlertCrawlIndex];
    if (nextItem) {
        weatherInfo.bulletin.crawlAlert.alert = {
            name: nextItem.name,
            code: nextItem.significance,
            type: "Alert",
            significance: nextItem.significance,
            description: nextItem.description || nextItem.headline,
            severe: nextItem.severe,
            color: nextItem.color,
            priority: nextItem.priority,
            detailKey: nextItem.detailKey,
            expiresAt: nextItem.expiresAt,
            cityName: nextItem.cityName,
            areas: nextItem.areas,
            areaText: nextItem.areaText
        };
        startAlertCrawl();
    }
}

function startAlertCrawl(){
    if (!weatherInfo || !weatherInfo.bulletin || !weatherInfo.bulletin.crawlAlert || !weatherInfo.bulletin.crawlAlert.alert) {
        return;
    }
    if (obsTimeout) {
        clearTimeout(obsTimeout);
        obsTimeout = null;
    }
    clearMetricSlideTimeout();
    if (timeTabTimeout) {
        clearTimeout(timeTabTimeout);
        timeTabTimeout = null;
    }
    alertActive = true;
    var alertObj = weatherInfo.bulletin.crawlAlert.alert;
    var crawlt = crawlType(alertObj.name, alertObj.color);
    var rule = warningSettings ? (warningSettings[alertObj.name] || (typeof normalizeDisasterAlertName === 'function' ? warningSettings[normalizeDisasterAlertName(alertObj.name)] : null)) : null;
    var isSevere = rule ? !!rule.severe : (alertObj.severe === true);

    try {
        $('.ldl-black .crawl').marquee('destroy');
        $('.ldl-blue .crawl .scroll').marquee('destroy');
    } catch (e) {}
    $('.ldl-black .crawl').text("");
    $('.ldl-blue .crawl .scroll').text("");

    $('.ldl-blue').hide();
    $('.ldl-black').show();
    $('.ldl-black .time').show();
    $('.ldl-black .temp').hide();
    $('.ldl-black .observations').hide();
    $('.ldl-black .weathercomlogo').hide();
    $('.ldl-black .logo').hide();
    $('.ldl-black .template.obs').hide();
    $('.ldl-black .template.ad').hide();
    $('.data-updated').hide();
    $('.ldl-black .template.alert').css("background-image", "url(images/" + crawlt + ".png)");
    $('.ldl-black .template.alert').show();
    $('.ldl-black .time').css({
        "color": "#e7e7e7"
    });
    if(crawlt == "Advisory"){
        $('.ldl-black .alertinfo .name').css({"color": "#171717", "text-shadow": "0px 0px #000"});
    }else{
        $('.ldl-black .alertinfo .name').css({"color": "", "text-shadow": ""});
    }
    if(!inSettings && isSevere) audioPlayer.playSevere(alertObj.name);
    try {
        $('.ldl-black .alertinfo .alertcrawl').marquee('destroy');
    } catch (e) {}
    var displayName = (typeof getAlertDisplayNameFr === 'function' ? getAlertDisplayNameFr(alertObj.name) : (alertObj.name || "")).toUpperCase();
    var crawlDesc = String(alertObj.description || alertObj.desc || "")
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

    // Determine target city for the alert
    var city = alertObj.cityName || (Array.isArray(alertObj.areas) && alertObj.areas.length > 0 ? alertObj.areas.join(", ") : "");
    if (!city && alertObj.areaText) {
        city = String(alertObj.areaText).replace(/^Secteurs?\s*:\s*/i, "").trim();
    }

    var headerName = displayName;
    if (city) {
        // Keep the header short next to the clock: show at most 2 cities, then "+N"
        var headerCities = city.split(/\s*,\s*/).filter(Boolean);
        var headerCity = headerCities.slice(0, 2).join(", ");
        if (headerCities.length > 2) {
            headerCity += ` +${headerCities.length - 2}`;
        }
        headerName = `${displayName} — ${headerCity.toUpperCase()}`;
    }

    var fullCrawl = crawlDesc;
    if (city) {
        var cityUpper = city.toUpperCase();
        var crawlUpper = crawlDesc.toUpperCase();
        if (!crawlUpper.startsWith(cityUpper) && !crawlUpper.startsWith("SECTEUR") && !crawlUpper.startsWith("POUR")) {
            fullCrawl = `${cityUpper} : ${crawlDesc}`;
        }
    }

    $('.ldl-black .alertinfo .name').text(headerName);
    $('.ldl-black .alertinfo .alertcrawl').text(fullCrawl.toUpperCase());
    $('.ldl-black .alertinfo').show();
    $('.ldl-black .alertinfo .alertcrawl').marquee({speed: 185, pauseOnHover: false}).on('finished', () =>{
        if (typeof checkAlertExpiration === 'function') {
            checkAlertExpiration();
        }
        if (!alertActive || !weatherInfo || !weatherInfo.bulletin || !weatherInfo.bulletin.crawlAlert || !weatherInfo.bulletin.crawlAlert.enabled || !weatherInfo.bulletin.crawlAlert.alert) {
            return;
        }

        // If multiple alerts exist across different cities, rotate crawl to next alert
        if (weatherInfo.bulletin.alerts && weatherInfo.bulletin.alerts.length > 1) {
            rotateNextAlertCrawl();
        }

        if(!inSettings && isSevere) audioPlayer.playSevere(alertObj.name);
    });
}

function endAlertCrawl(){
    activeAlertCrawlIndex = 0;
    try {
        $('.ldl-black .alertinfo .alertcrawl').marquee('destroy');
    } catch (e) {}
    $('.ldl-black .alertinfo .alertcrawl').text('');
    $('.ldl-black .alertinfo .name').text('');
    $('.ldl-black .alertinfo').hide();
    $('.ldl-black .template.alert').hide();
    $('.data-updated').show();
    if (weatherInfo && weatherInfo.bulletin && weatherInfo.bulletin.crawlAlert) {
        weatherInfo.bulletin.crawlAlert.alert = undefined;
        weatherInfo.bulletin.crawlAlert.enabled = false;
    }
    alertActive = false;
    $('.ldl-black .time').css({
        "color": ""
    });

    if (typeof inSettings !== "undefined" && inSettings) {
        return;
    }

    if (obsTimeout) {
        clearTimeout(obsTimeout);
        obsTimeout = null;
    }

    if (Number(appearanceSettings.graphicsPackage) >= 2009) {
        $('.ldl-blue').show();
        $('.ldl-black').hide();
        blueLDL(appearanceSettings.ldlType);
    } else {
        $('.ldl-black').show();
        $('.ldl-blue').hide();
        $('.ldl-black .template.obs').show();
        $('.ldl-black .template.ad').hide();
        $('.ldl-black .observations').show();
        $('.ldl-black .weathercomlogo').show();
        timeTab("time");
        blackLDL(appearanceSettings.ldlType);
    }
}

async function preloadImages(){
    $('.ldl-blue').show().hide();
    $('.ldl-black .template').show().hide();
}

function blueLDL(){
    if (obsTimeout) {
        clearTimeout(obsTimeout);
        obsTimeout = null;
    }
    if(weatherInfo.currentConditions.temp >= 100){
        $(".ldl-blue .temptab span.temp").css("left", "13px");
        $(".ldl-blue .temptab span.degree").css("left", "13px");
    }
    $(".ldl-blue .temptab span.temp").text(weatherInfo.currentConditions.temp);
    $(".ldl-blue .template").css('animation', 'blueLDLInit 0.75s linear forwards');
    $(".ldl-blue .temptab").css('animation', 'tempTabInit 0.17s linear forwards');
    $(".ldl-blue .time").css('animation', 'timeTabInit 0.33s linear forwards');
    setTimeout(() => {
        $(".ldl-blue .time-padding").show();
        $(".ldl-blue .crawl-tab").show();
        $(".ldl-blue .top-bar").show();
        $(".ldl-blue .crawl-tab").css('animation', 'tabCapInit 0.43s linear forwards');
        $(".ldl-blue .top-bar").css('animation', 'topBarInit 0.43s linear forwards');
    }, 233);
    setTimeout(() => {
        addTabs();
    }, 1000);
    if(appearanceSettings.ldlType == "both"){
        setTimeout(() => {
            $(".ldl-blue .crawl .box").css('animation', 'crawlInit 0.15s linear forwards');
            crawlIndex = Math.floor(Math.random() * appearanceSettings.marqueeAd.length);
            adCrawlBlue(crawlIndex);
        }, 2000);
    }
}

function addTabs(){
    if(appearanceSettings.ldlType == "observations"){
        setTimeout(() => {
            $(".ldl-blue .upnext-tabs .upnext-now").animate({'left': '0px'}, 133, 'linear', function(){
                setTimeout(() => {
                    $(".ldl-blue .flare").css('animation', 'flare 0.5s linear forwards');
                    blueLDLObs();
                }, 500);
            });
        }, 500);
    }else{
        $(".ldl-blue .upnext-tabs .upnext-crawl").css('z-index', 10);
        $(".ldl-blue .upnext-tabs .upnext-now").css('opacity', '0.5');
        $(".ldl-blue .upnext-tabs .upnext-crawl").animate({'left': '-55.5px'}, 133, 'linear', function(){
            setTimeout(() => {
                $(".ldl-blue .upnext-tabs .upnext-now").css('animation', 'nowTabCrawlInit 0.2s linear forwards');
            }, 250);
        });
    }
}

function adCrawlBlue(idx){
    if (obsTimeout) {
        clearTimeout(obsTimeout);
        obsTimeout = null;
    }
    clearMetricSlideTimeout();
    $('.ldl-blue .observations').stop(true, true).hide();
    $('.ldl-blue .crawl').show();
    $('.ldl-blue .crawl .scroll').text(appearanceSettings.marqueeAd[idx]);
    $('.ldl-blue .crawl .scroll').marquee({ speed: 185, pauseOnHover: false, delayBeforeStart: 500 }).on('finished', () => {
        $('.ldl-blue .crawl .scroll').text("");
        try {
            $('.ldl-blue .crawl .scroll').marquee('destroy');
        } catch (e) {}
        $('.ldl-blue .crawl').hide();
        $(".ldl-blue .crawl .box").css('animation', 'crawlDestroy 0.15s linear forwards');
        $(".ldl-blue .upnext-tabs .upnext-crawl").fadeOut(133, 'linear');
        setTimeout(() => {
            $(".ldl-blue .upnext-tabs .upnext-now").css({'animation': '', 'left': '90px'});
            $(".ldl-blue .upnext-tabs .upnext-now").animate({'left': '0px'}, 150, 'linear', function(){
                $(".ldl-blue .upnext-tabs .upnext-now").css({'opacity': 1, 'z-index': 10});
                $(".ldl-blue .flare").css('animation', 'flare 0.5s linear forwards');
                $('.ldl-blue .observations').show();
                scheduleNextObs(blueLDLObs, 300);
            });
        }, 133);
    });
}

var metricSlideTimeout = null;
function clearMetricSlideTimeout() {
    if (metricSlideTimeout) {
        clearTimeout(metricSlideTimeout);
        metricSlideTimeout = null;
    }
}

function formatWindValue(windVal, windStr) {
    function cleanDir(d) {
        if (!d) return "";
        var str = String(d).trim();
        if (typeof translateWindCardinal === "function") {
            return translateWindCardinal(str);
        }
        return str;
    }

    if (typeof windStr === "string" && windStr.trim().length > 0 && windStr !== "[object Object]") {
        var s = windStr.trim();
        if (s.toLowerCase().includes("calm")) return "Calme";
        return s;
    }
    if (typeof windVal === "string" && windVal.trim().length > 0 && windVal !== "[object Object]") {
        var s = windVal.trim();
        if (s.toLowerCase().includes("calm")) return "Calme";
        return s;
    }
    if (windVal && typeof windVal === "object") {
        var dir = cleanDir(windVal.direction || "");
        var spd = (windVal.speed !== undefined && windVal.speed !== null && windVal.speed !== "") ? windVal.speed : "";
        if (dir === "Calme" || (!spd && dir !== "Calme" && !dir) || spd === 0 || spd === "0") {
            return "Calme";
        }
        return `${dir} ${spd}`.trim();
    }
    if (windStr && typeof windStr === "object") {
        var dir2 = cleanDir(windStr.direction || "");
        var spd2 = (windStr.speed !== undefined && windStr.speed !== null && windStr.speed !== "") ? windStr.speed : "";
        if (dir2 === "Calme" || (!spd2 && dir2 !== "Calme" && !dir2) || spd2 === 0 || spd2 === "0") {
            return "Calme";
        }
        return `${dir2} ${spd2}`.trim();
    }
    return "Calme";
}

function getBlueLDLCityList() {
    var list = [];
    var seen = new Set();

    // 1. Main City (only if in Quebec)
    var mainCityName = (locationConfig && locationConfig.mainCity && locationConfig.mainCity.displayname) || "Montréal";
    var mainCityObj = {
        name: mainCityName,
        province: (locationConfig && locationConfig.mainCity && locationConfig.mainCity.state) || "QC"
    };

    if (isQuebecCity(mainCityObj) && weatherInfo && weatherInfo.currentConditions && weatherInfo.currentConditions.temp !== undefined && weatherInfo.currentConditions.temp !== "") {
        var cc = weatherInfo.currentConditions;
        var todayHigh = "";
        var todayLow = "";
        if (weatherInfo.weekAhead && weatherInfo.weekAhead.days && weatherInfo.weekAhead.days[0]) {
            todayHigh = weatherInfo.weekAhead.days[0].high !== undefined ? weatherInfo.weekAhead.days[0].high : "";
            todayLow = weatherInfo.weekAhead.days[0].low !== undefined ? weatherInfo.weekAhead.days[0].low : "";
        } else if (weatherInfo.dayDesc && weatherInfo.dayDesc.days && weatherInfo.dayDesc.days[0]) {
            todayHigh = weatherInfo.dayDesc.days[0].high !== undefined ? weatherInfo.dayDesc.days[0].high : "";
            todayLow = weatherInfo.dayDesc.days[0].low !== undefined ? weatherInfo.dayDesc.days[0].low : "";
        }

        var mainWind = formatWindValue(cc.wind, cc.windStr);
        list.push({
            name: mainCityName,
            temp: cc.temp,
            icon: cc.icon,
            cond: cc.cond || "",
            wind: mainWind,
            windStr: mainWind,
            gusts: (cc.gusts && cc.gusts !== "Aucune" && cc.gusts !== "None") ? cc.gusts : "",
            humidity: cc.humidity || "",
            feelslike: cc.feelslike || { type: "Ressenti", val: cc.temp },
            dewpoint: cc.dewpoint !== undefined ? cc.dewpoint : "",
            pressure: cc.pressure || { val: "", trend: "" },
            visibility: cc.visibility !== undefined ? cc.visibility : "",
            high: todayHigh,
            low: todayLow
        });
        seen.add(mainCityName.toLowerCase().trim());
    }

    // Helper to add cities (strictly Quebec cities only)
    function addCities(arr) {
        if (!Array.isArray(arr)) return;
        arr.forEach(c => {
            if (!c || !c.name || c.temp === "" || c.temp === undefined) return;
            if (!isQuebecCity(c)) return;
            var key = c.name.toLowerCase().trim();
            if (seen.has(key)) return;
            seen.add(key);
            var normalizedWind = formatWindValue(c.wind, c.windStr);
            list.push(Object.assign({}, c, {
                wind: normalizedWind,
                windStr: normalizedWind
            }));
        });
    }

    if (weatherInfo.eightCities && weatherInfo.eightCities.cities) {
        addCities(weatherInfo.eightCities.cities);
    }
    if (weatherInfo.quebecCities && weatherInfo.quebecCities.cities) {
        addCities(weatherInfo.quebecCities.cities);
    }

    return list;
}

function hasSlide2(city) {
    if (!city) return false;
    var pres = city.pressure;
    var presVal = (pres && pres.val !== undefined) ? pres.val : (pres || "");
    var hasPres = presVal !== "" && presVal != null;
    var hasDew = city.dewpoint !== "" && city.dewpoint !== undefined && city.dewpoint != null;
    var hasVis = city.visibility !== "" && city.visibility !== undefined && city.visibility != null;
    var hasHL = city.high !== "" && city.high !== undefined && city.high != null && city.low !== "" && city.low !== undefined && city.low != null;
    return (hasPres || hasDew || hasVis || hasHL);
}

function updateFirstVisibleBorder($metrics) {
    $metrics.children("div").removeClass("is-first-visible");
    $metrics.children("div:visible").first().addClass("is-first-visible");
}

function renderBluePrimary($obs, city) {
    var $name = $obs.find(".city-name");
    $name.text(city.name);

    // Dynamic font sizing for long city names to prevent clipping
    var len = (city.name || "").length;
    if (len > 16) {
        $name.css({ "font-size": "29px", "letter-spacing": "0.3px" });
    } else if (len > 11) {
        $name.css({ "font-size": "33px", "letter-spacing": "0.5px" });
    } else {
        $name.css({ "font-size": "38px", "letter-spacing": "0.8px" });
    }

    // Weather Icon
    getIcon($obs.find(".icon"), city.icon, 'ldl', undefined);

    // Temp
    var tempVal = (city.temp !== "" && city.temp !== undefined) ? `${city.temp}<span class="degree">°</span>` : "";
    $obs.find(".tempobs").html(tempVal);

    // Condition text
    var condText = city.cond || "";
    if (condText) {
        $obs.find(".condtext").text(condText).show();
    } else {
        $obs.find(".condtext").text("").hide();
    }
}

function renderSlide1Metrics($obs, city) {
    var $metrics = $obs.find(".obs-metrics");

    // Feels Like (Ressenti / Indice humidex / Refroid. éolien)
    var fl = city.feelslike;
    var flVal = (fl && fl.val !== "" && fl.val !== undefined) ? fl.val : "";
    var flType = (fl && fl.type) ? fl.type : "Ressenti";
    if (flVal !== "" && flVal != null) {
        $obs.find(".feelslike .obsheader").text(flType.toUpperCase() + ":");
        $obs.find(".feelslike .info").html(`${flVal}<span class="degree">°</span>`);
        $obs.find(".feelslike").show();
    } else {
        $obs.find(".feelslike").hide();
    }

    // Wind + Gusts
    var windVal = formatWindValue(city.wind, city.windStr);
    if (windVal && windVal !== "Calme") {
        var windParts = windVal.split(" ");
        var dir = (typeof translateWindCardinal === "function") ? translateWindCardinal(windParts[0]) : (windParts[0] || "");
        var spd = windParts.slice(1).join(" ").replace(/km\/h|mph/gi, "").trim();
        var gustText = (city.gusts && city.gusts !== "Aucune" && city.gusts !== "None" && city.gusts !== 0 && city.gusts !== "0")
            ? ` <span class="gust-label">RAF.</span> ${String(city.gusts).replace(/km\/h|mph/gi, "").trim()}`
            : "";
        var unitStr = isMetric() ? "KM/H" : "MPH";
        var windOutput = `${dir} ${spd}${gustText} <span class="unit">${unitStr}</span>`.trim();
        $obs.find(".wind .info").html(windOutput);
        $obs.find(".wind").show();
    } else if (windVal === "Calme") {
        $obs.find(".wind .info").html("Calme");
        $obs.find(".wind").show();
    } else {
        $obs.find(".wind").hide();
    }

    // Humidity
    var hum = city.humidity;
    if (hum !== "" && hum !== undefined && hum != null) {
        $obs.find(".humidity .info").html(`${String(hum).replace("%", "")}<span class="unit">%</span>`);
        $obs.find(".humidity").show();
    } else {
        $obs.find(".humidity").hide();
    }

    // Hide Slide 2 metrics
    $obs.find(".pressure, .dewpt, .visibility, .highlow, .precip").hide();
    updateFirstVisibleBorder($metrics);
}

function renderSlide2Metrics($obs, city) {
    var $metrics = $obs.find(".obs-metrics");

    // Hide Slide 1 metrics
    $obs.find(".feelslike, .wind, .humidity, .gusts").hide();

    // Pressure
    var pres = city.pressure;
    var presVal = (pres && pres.val !== undefined) ? pres.val : (pres || "");
    if (presVal !== "" && presVal != null) {
        var presUnit = isMetric() ? "kPa" : "inHg";
        $obs.find(".pressure .info").html(`${presVal} <span class="unit">${presUnit}</span>`);
        $obs.find(".pressure").show();
    } else {
        $obs.find(".pressure").hide();
    }

    // Dew Point
    var dew = city.dewpoint;
    if (dew !== "" && dew !== undefined && dew != null) {
        $obs.find(".dewpt .info").html(`${dew}<span class="degree">°</span>`);
        $obs.find(".dewpt").show();
    } else {
        $obs.find(".dewpt").hide();
    }

    // Visibility
    var vis = city.visibility;
    if (vis !== "" && vis !== undefined && vis != null) {
        var visUnit = isMetric() ? "KM" : "MI";
        $obs.find(".visibility .info").html(`${vis} <span class="unit">${visUnit}</span>`);
        $obs.find(".visibility").show();
    } else {
        $obs.find(".visibility").hide();
    }

    // High / Low
    if (city.high !== "" && city.high !== undefined && city.high != null && city.low !== "" && city.low !== undefined && city.low != null) {
        $obs.find(".highlow .info").html(`${city.high}<span class="degree">°</span> / ${city.low}<span class="degree">°</span>`);
        $obs.find(".highlow").show();
    } else {
        $obs.find(".highlow").hide();
    }

    updateFirstVisibleBorder($metrics);
}

var blueCityIndex = 0;
function blueLDLObs(){
    if (obsTimeout) {
        clearTimeout(obsTimeout);
        obsTimeout = null;
    }
    clearMetricSlideTimeout();

    if (alertActive) {
        return;
    }
    if (!weatherInfo || !weatherInfo.currentConditions) {
        scheduleNextObs(blueLDLObs, 2000);
        return;
    }

    var cities = getBlueLDLCityList();
    if (cities.length === 0) {
        scheduleNextObs(blueLDLObs, 2000);
        return;
    }

    // If both mode and completed a full cycle of cities, show ad crawl
    if (appearanceSettings.ldlType === "both" && blueCityIndex > 0 && (blueCityIndex % cities.length) === 0 && appearanceSettings.marqueeAd && appearanceSettings.marqueeAd.length > 0) {
        crawlIndex = Math.floor(Math.random() * appearanceSettings.marqueeAd.length);
        adCrawlBlue(crawlIndex);
        return;
    }

    var city = cities[blueCityIndex % cities.length];
    blueCityIndex++;

    var $obs = $(".ldl-blue .observations");
    var $metrics = $obs.find(".obs-metrics");

    $obs.show();
    $obs.stop(true, true).fadeTo(180, 0, function() {
        renderBluePrimary($obs, city);
        $metrics.css("opacity", 1);
        renderSlide1Metrics($obs, city);
        $obs.fadeTo(220, 1);

        // If city has secondary metrics, schedule crossfade to Slide 2 at 4 seconds
        if (hasSlide2(city)) {
            metricSlideTimeout = setTimeout(function() {
                if (alertActive) return;
                $metrics.stop(true, true).fadeTo(180, 0, function() {
                    renderSlide2Metrics($obs, city);
                    $metrics.fadeTo(220, 1);
                });
            }, 4000);
        }
    });

    scheduleNextObs(blueLDLObs, 8000);
}

function updateSpotifyDisplay(track) {
    var $blackLogo = $(".ldl-black .logo");
    var $blackWeatherLogo = $(".ldl-black .weathercomlogo");
    var $blueLogo = $(".ldl-blue .logo");
    var $blueWeatherLogo = $(".ldl-blue .weathercomlogo");

    if (track && track.coverUrl) {
        // Show Cover Art in .logo slot
        var coverHtml = `<img class="spotify-cover-art" src="${track.coverUrl}" alt="Album Art">`;
        $blackLogo.html(coverHtml).addClass("has-spotify").show();
        $blueLogo.html(coverHtml).addClass("has-spotify").show();

        // Show Song Title / Band in .weathercomlogo slot
        var textHtml = `<div class="spotify-track-info"><span class="spotify-title">${track.title}</span> <span class="spotify-artist">• ${track.artist}</span></div>`;
        $blackWeatherLogo.html(textHtml).addClass("has-spotify").show();
        $blueWeatherLogo.html(textHtml).addClass("has-spotify").show();
    } else {
        // Clear Spotify and hide logo elements on ldl-blue
        $blackLogo.empty().removeClass("has-spotify");
        $blueLogo.empty().removeClass("has-spotify").hide();
        $blackWeatherLogo.empty().removeClass("has-spotify");
        $blueWeatherLogo.empty().removeClass("has-spotify").hide();
    }
}

function stopLoops() {
    clearMetricSlideTimeout();
    if (obsTimeout) {
        clearTimeout(obsTimeout);
        obsTimeout = null;
    }
    if (timeTabTimeout) {
        clearTimeout(timeTabTimeout);
        timeTabTimeout = null;
    }
    $(".ldl-black, .ldl-blue").hide();
    $('.ldl-black .crawl').text("");
    try {
        $('.ldl-black .crawl').marquee('destroy');
    } catch (e) {}
}

function showLDLMessage(text) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) return;
    const msg = text.trim();
    console.log(`[LDL] Showing custom network crawl message: "${msg}"`);

    // If an active disaster alert crawl is displaying, don't clobber it
    if (alertActive) {
        console.warn('[LDL] Alert is active, custom crawl ignored to preserve emergency banner');
        return;
    }

    if (obsTimeout) {
        clearTimeout(obsTimeout);
        obsTimeout = null;
    }
    clearMetricSlideTimeout();

    const isBlue = Number(appearanceSettings.graphicsPackage) >= 2009;

    if (isBlue) {
        $('.ldl-blue').show();
        $('.ldl-black').hide();
        $('.ldl-blue .observations').stop(true, true).hide();
        $('.ldl-blue .crawl').show();
        $('.ldl-blue .crawl-tab').show();
        $('.ldl-blue .top-bar').show();
        $('.ldl-blue .crawl .box').css('animation', 'crawlInit 0.15s linear forwards');
        $('.ldl-blue .upnext-tabs .upnext-crawl').css({ 'z-index': 10, 'left': '-55.5px', 'opacity': 1 }).show();
        $('.ldl-blue .upnext-tabs .upnext-now').css('opacity', '0.5');

        try {
            $('.ldl-blue .crawl .scroll').marquee('destroy');
        } catch (e) {}

        $('.ldl-blue .crawl .scroll').text(msg);
        $('.ldl-blue .crawl .scroll').marquee({ speed: 185, pauseOnHover: false, delayBeforeStart: 400 }).on('finished', () => {
            $('.ldl-blue .crawl .scroll').text("");
            try {
                $('.ldl-blue .crawl .scroll').marquee('destroy');
            } catch (e) {}
            $('.ldl-blue .crawl').hide();
            $(".ldl-blue .crawl .box").css('animation', 'crawlDestroy 0.15s linear forwards');
            $(".ldl-blue .upnext-tabs .upnext-crawl").fadeOut(133, 'linear');
            setTimeout(() => {
                $(".ldl-blue .upnext-tabs .upnext-now").css({ 'animation': '', 'left': '90px' });
                $(".ldl-blue .upnext-tabs .upnext-now").animate({ 'left': '0px' }, 150, 'linear', function () {
                    $(".ldl-blue .upnext-tabs .upnext-now").css({ 'opacity': 1, 'z-index': 10 });
                    $(".ldl-blue .flare").css('animation', 'flare 0.5s linear forwards');
                    $('.ldl-blue .observations').show();
                    scheduleNextObs(blueLDLObs, 300);
                });
            }, 133);
        });
    } else {
        $('.ldl-black').show();
        $('.ldl-blue').hide();
        $('.ldl-black .observations').hide();
        $('.ldl-black .template.obs').hide();
        $('.ldl-black .template.ad').show();
        $('.ldl-black .weathercomlogo').hide();

        try {
            $('.ldl-black .crawl').marquee('destroy');
        } catch (e) {}

        $('.ldl-black .crawl').text(msg);
        $('.ldl-black .crawl').marquee({ speed: 185, pauseOnHover: false }).on('finished', () => {
            $('.ldl-black .crawl').text("");
            try {
                $('.ldl-black .crawl').marquee('destroy');
            } catch (e) {}
            $('.ldl-black .template.ad').hide();
            $('.ldl-black .template.obs').show();
            $('.ldl-black .observations').show();
            $('.ldl-black .weathercomlogo').show();
            scheduleNextObs(blackLDLObs, 500);
        });
    }
}

function clearLDLMessage() {
    console.log('[LDL] Clearing active custom crawl message');
    try {
        $('.ldl-blue .crawl .scroll').marquee('destroy');
    } catch (e) {}
    try {
        $('.ldl-black .crawl').marquee('destroy');
    } catch (e) {}
    $('.ldl-blue .crawl .scroll').text("");
    $('.ldl-black .crawl').text("");
    $('.ldl-blue .crawl').hide();
    $('.ldl-black .template.ad').hide();

    if (alertActive) {
        return;
    }

    if (Number(appearanceSettings.graphicsPackage) >= 2009) {
        $('.ldl-blue').show();
        $('.ldl-black').hide();
        $('.ldl-blue .observations').show();
        scheduleNextObs(blueLDLObs, 300);
    } else {
        $('.ldl-black').show();
        $('.ldl-blue').hide();
        $('.ldl-black .template.obs').show();
        $('.ldl-black .observations').show();
        $('.ldl-black .weathercomlogo').show();
        scheduleNextObs(blackLDLObs, 300);
    }
}

let lastProcessedMessageId = 0;
function startMessageCommandListener() {
    if (window._messageCommandListenerStarted) return;
    window._messageCommandListenerStarted = true;
    setInterval(async () => {
        try {
            const res = await fetch('/api/message');
            if (!res.ok) return;
            const data = await res.json();
            if (!data || !data.id || data.id === lastProcessedMessageId) return;

            lastProcessedMessageId = data.id;
            if (data.action === 'send' && data.text) {
                showLDLMessage(data.text);
            } else if (data.action === 'clear') {
                clearLDLMessage();
            }
        } catch (e) {}
    }, 1000);
}
startMessageCommandListener();

window.startLoops = startLoops;
window.stopLoops = stopLoops;
window.showLDLMessage = showLDLMessage;
window.clearLDLMessage = clearLDLMessage;