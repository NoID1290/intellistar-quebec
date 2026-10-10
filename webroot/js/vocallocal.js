function getVocallocalPath() {
    var lang = (typeof audioSettings !== 'undefined' && audioSettings.vocalLanguage)
        || (typeof appearanceSettings !== 'undefined' && appearanceSettings.vocalLanguage)
        || ((typeof appearanceSettings !== 'undefined' && appearanceSettings.units === 'metric') ? 'fr' : 'en');
    return lang === 'fr' ? '/vocallocal_fr/' : '/vocallocal/';
}

var vocallocalPath = getVocallocalPath();

function vocallocalCC() {
    try {
        var base = getVocallocalPath();
        vocallocalPath = base;
        var narrationArr = [];

        var condPath = base + 'cond/';
        var tempPath = base + 'temp/';

        // CC INTRO
        narrationArr.push(base + `CC_INTRO${(Math.floor(Math.random() * 2) + 1)}.wav`);

        // TEMP
        var tempVal = weatherInfo.currentConditions.temp;
        var tempNum = Math.round(Number(tempVal));
        if (isNaN(tempNum)) tempNum = 0;
        var tempe = tempNum < 0 ? `M${Math.abs(tempNum)}` : `${tempNum}`;
        var temper = tempPath + tempe + ".wav";
        narrationArr.push(temper);

        // COND
        var iconCode = weatherInfo.currentConditions.icon;
        var condi = (typeof codeToCurrent !== 'undefined' && codeToCurrent[iconCode] && codeToCurrent[iconCode].narration)
            ? codeToCurrent[iconCode].narration
            : iconCode;
        if (condi != null && condi !== '') {
            var condit = condPath + condi + '.wav';
            narrationArr.push(condit);
        }

        narrationArr = narrationArr.filter(Boolean);
        if (narrationArr.length === 0) {
            narrationArr = [base + 'CC_INTRO1.wav'];
        }
        return narrationArr;
    } catch (error) {
        console.error('[vocallocalCC] Error:', error);
        return [];
    }
}

function vocallocalLF(idx, durr) {
    try {
        var base = getVocallocalPath();
        vocallocalPath = base;
        var longformDuration = 0;
        var dayAudio, longformAudio, highlowAudio, shortcastAudio, qualifierAudio, precipAudio, windDirAudio, windSpeedAudio;
        var precipDuration = 0, windDuration = 0, pushPrecip = false, pushWind = false;

        if (!weatherInfo.dayDesc || !Array.isArray(weatherInfo.dayDesc.days) || !weatherInfo.dayDesc.days[idx]) {
            return [base + 'DAYPART_DEFAULT1.wav'];
        }

        var dayObj = weatherInfo.dayDesc.days[idx];
        var dayName = (dayObj.rawName || dayObj.name || "").trim();

        // Map French day names to file names on disk
        var dayMap = {
            "Aujourd'hui": "Today",
            "Ce soir": "Tonight",
            "Cette nuit": "Overnight",
            "Cet après-midi": "This_Afternoon",
            "Dimanche": "Sunday",
            "Dimanche Soir": "Sunday_Night",
            "Dimanche soir": "Sunday_Night",
            "Lundi": "Monday",
            "Lundi Soir": "Monday_Night",
            "Lundi soir": "Monday_Night",
            "Mardi": "Tuesday",
            "Mardi Soir": "Tuesday_Night",
            "Mardi soir": "Tuesday_Night",
            "Mercredi": "Wednesday",
            "Mercredi Soir": "Wednesday_Night",
            "Mercredi soir": "Wednesday_Night",
            "Jeudi": "Thursday",
            "Jeudi Soir": "Thursday_Night",
            "Jeudi soir": "Thursday_Night",
            "Vendredi": "Friday",
            "Vendredi Soir": "Friday_Night",
            "Vendredi soir": "Friday_Night",
            "Samedi": "Saturday",
            "Samedi Soir": "Saturday_Night",
            "Samedi soir": "Saturday_Night"
        };

        var mappedDay = dayMap[dayName] || dayName.replace(" ", "_");
        if (dayMap[mappedDay]) mappedDay = dayMap[mappedDay];
        mappedDay = mappedDay.replace(/\bnight\b/i, "Night").replace(" ", "_");

        dayAudio = base + 'dayname/' + mappedDay + '.wav';

        // Split narrative sentences from rawDesc (English) or desc (French/English)
        var rawNarrative = (dayObj.rawDesc || "").trim();
        var translatedNarrative = (dayObj.desc || "").trim();
        var narrativeText = rawNarrative || translatedNarrative;
        var lfNar = narrativeText.split(". ");

        // Shortcast fallback by icon code
        if (typeof shortcast !== 'undefined' && dayObj.iconCode != null) {
            for (let sc in shortcast) {
                if (dayObj.iconCode == parseInt(shortcast[sc].name, 10)) {
                    shortcastAudio = base + 'shortcast/' + shortcast[sc].name + '.wav';
                    longformDuration += (shortcast[sc].duration || 2000);
                    break;
                }
            }
        }

        // Parse sentences (compatible with both English and French text)
        for (let i = 0; i < lfNar.length; i++) {
            let sentence = lfNar[i].trim().replace(/\.$/, "");
            if (!sentence) continue;

            // Longform narrative match
            if (typeof longform !== 'undefined' && longform[sentence]) {
                longformAudio = base + 'longform/' + longform[sentence].name + '.wav';
                longformDuration += (longform[sentence].duration || 2500);
                continue;
            }

            // High / Low check
            var hlClean = sentence.replace("Around ", "").replace("Near ", "").replace("près de ", "").replace("autour de ", "").replace(".", "");
            if (typeof highlow !== 'undefined' && highlow[hlClean]) {
                highlowAudio = base + 'highlow/' + highlow[hlClean].name + '.wav';
                longformDuration += (highlow[hlClean].duration || 1500);
                continue;
            }

            var hlMatch = sentence.match(/(?:High|Low|Max|Min)\s+(?:around|near|près de|autour de\s+)?(-?\d+)/i);
            if (hlMatch) {
                var isHigh = /^(?:High|Max)/i.test(sentence);
                var num = parseInt(hlMatch[1], 10);
                var numStr = num < 0 ? `M${Math.abs(num)}` : `${num}`;
                var hlKey = `${isHigh ? 'HIGH' : 'LOW'}_${numStr}`;
                var hlDuration = 1500;
                if (typeof highlow !== 'undefined') {
                    var foundEntry = Object.values(highlow).find(v => v.name === hlKey);
                    if (foundEntry && foundEntry.duration) hlDuration = foundEntry.duration;
                }
                highlowAudio = base + 'highlow/' + hlKey + '.wav';
                longformDuration += hlDuration;
                continue;
            }

            // Precip check
            if (typeof precip !== 'undefined' && precip[sentence]) {
                precipAudio = base + 'precip/' + precip[sentence].name + '.wav';
                precipDuration = precip[sentence].duration || 1500;
            }

            // Winds check
            if (/^(?:Winds|Vents)/i.test(sentence)) {
                if (/light and variable|légers et variables/i.test(sentence)) {
                    windDirAudio = base + 'winds/W9902.wav';
                    windDuration = 1600;
                } else {
                    var windDirMatch = sentence.match(/(?:Winds|Vents)\s+([A-Za-z]+)\s+(?:at|de)\s+(\d+)\s*(?:to|à)\s*(\d+)/i);
                    if (windDirMatch) {
                        var dir = windDirMatch[1].toUpperCase().replaceAll("O", "W");
                        var minSpd = windDirMatch[2];
                        var maxSpd = windDirMatch[3];
                        windDirAudio = base + 'winds/W_' + dir + '.wav';
                        windSpeedAudio = base + 'winds/AT_' + minSpd + '_' + maxSpd + '.wav';
                        windDuration = 3000;
                    }
                }
                continue;
            }
        }

        var narrationArr = [dayAudio];
        if (longformAudio) {
            narrationArr.push(longformAudio);
        } else if (shortcastAudio) {
            narrationArr.push(shortcastAudio);
        }

        if (highlowAudio) {
            narrationArr.push(highlowAudio);
        }

        if (precipAudio && (longformDuration + precipDuration <= (durr || 8000) - 1000)) {
            pushPrecip = true;
            longformDuration += precipDuration;
        }

        if (windDirAudio && (longformDuration + windDuration <= (durr || 8000) - 1000)) {
            pushWind = true;
            longformDuration += windDuration;
        }

        if (pushWind && windDirAudio) {
            narrationArr.push(windDirAudio);
            if (windSpeedAudio) narrationArr.push(windSpeedAudio);
        }
        if (pushPrecip && precipAudio) {
            narrationArr.push(precipAudio);
        }

        narrationArr = narrationArr.filter(Boolean);
        if (narrationArr.length === 0) {
            narrationArr = [base + 'DAYPART_DEFAULT1.wav'];
        }
        return narrationArr;
    } catch (e) {
        console.error('[vocallocalLF] Error:', e);
        return [];
    }
}

function vocallocalBulletin() {
    var base = getVocallocalPath();
    vocallocalPath = base;
    var narrationArr = [];
    if (weatherInfo.bulletin && Array.isArray(weatherInfo.bulletin.alerts) && weatherInfo.bulletin.alerts.length > 0) {
        var alertName = weatherInfo.bulletin.alerts[0].name || "";
        var setting = (typeof warningSettings !== 'undefined' && warningSettings)
            ? (warningSettings[alertName] || (typeof normalizeDisasterAlertName === 'function' ? warningSettings[normalizeDisasterAlertName(alertName)] : null))
            : null;
        if (setting && setting.narration) {
            narrationArr.push(`${base}bulletin/${setting.narration}.wav`);
            narrationArr.push(`${base}bulletin/I.wav`);
        } else if (/tornad/i.test(alertName)) {
            narrationArr.push(`${base}TORNADO_DEFAULT.wav`);
        } else if (/orage/i.test(alertName) || /thunderstorm/i.test(alertName)) {
            narrationArr.push(`${base}TSTORM_DEFAULT.wav`);
        } else if (/crue|inondation|flood/i.test(alertName)) {
            narrationArr.push(`${base}FFLOOD_DEFAULT.wav`);
        } else {
            narrationArr.push(`${base}BULLETIN_DEFAULT.wav`);
        }
    } else {
        narrationArr.push(`${base}BULLETIN_DEFAULT.wav`);
    }

    return narrationArr.filter(Boolean);
}

if (typeof window !== 'undefined') {
    window.getVocallocalPath = getVocallocalPath;
    window.vocallocalCC = vocallocalCC;
    window.vocallocalLF = vocallocalLF;
    window.vocallocalBulletin = vocallocalBulletin;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getVocallocalPath,
        vocallocalCC,
        vocallocalLF,
        vocallocalBulletin
    };
}