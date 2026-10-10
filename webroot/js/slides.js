var slideDivs = {
    "currentConditions": ".current-conditions",
    "nearbyCities": ".eight-cities",
    "dayDesc": ".local-forecast",
    "localForecast": ".local-forecast",
    "weekAhead": ".week-ahead",
    "airQuality": ".air-quality",
    "dopplerRadar": ".radar",
    "radarDoppler": ".radar",
    "canadaDoppler": ".radar",
    "localDoppler": ".radar",
    "localDoppler1": ".radar",
    "localDoppler2": ".radar",
    "localDoppler3": ".radar",
    "localDoppler4": ".radar",
    "localDoppler5": ".radar",
    "localDoppler6": ".radar",
    "localDoppler7": ".radar",
    "localDoppler8": ".radar",
    "localDoppler9": ".radar",
    "localDoppler10": ".radar",
    "localDoppler11": ".radar",
    "localDoppler12": ".radar",
    "regionalForecast": ".regional-forecast",
    "canadaForecast": ".canada-forecast",
    "quebecCities": ".quebec-cities",
    "quebecForecast": ".quebec-cities",
    "quebecWeekAhead": ".quebec-week-ahead",
    "resortForecast": ".resort-forecast",
    "daypartForecast": ".daypart-forecast",
    "almanac": ".almanac",
    "bulletin": ".bulletin",
    "outdoorActivity": ".outdoor-activity",
    "mapCurrent": ".map",
    "mapForecast": ".map",
    "mapTest": ".map",
    "couvertureNuageuse": ".satellite",
    "couvertureNuageuse1": ".satellite",
    "couvertureNuageuse2": ".satellite",
    "couvertureNuageuse3": ".satellite",
    "couvertureNuageuse4": ".satellite",
    "couvertureNuageuse5": ".satellite",
    "couvertureNuageuse6": ".satellite",
    "couvertureNuageuse7": ".satellite",
    "couvertureNuageuse8": ".satellite",
    "couvertureNuageuse9": ".satellite",
    "couvertureNuageuse10": ".satellite",
    "couvertureNuageuse11": ".satellite",
    "couvertureNuageuse12": ".satellite",
    "canadaSatellite": ".satellite",
    "satellite": ".satellite",
    "satellite1": ".satellite",
    "satellite2": ".satellite",
    "satellite3": ".satellite",
    "satellite4": ".satellite",
    "satellite5": ".satellite",
    "satellite6": ".satellite",
    "satellite7": ".satellite",
    "satellite8": ".satellite",
    "satellite9": ".satellite",
    "satellite10": ".satellite",
    "satellite11": ".satellite",
    "satellite12": ".satellite",
    "cloudCover": ".satellite",
    "neigeAuSol": ".snow-cover",
    "neigeAuSol1": ".snow-cover",
    "neigeAuSol2": ".snow-cover",
    "neigeAuSol3": ".snow-cover",
    "neigeAuSol4": ".snow-cover",
    "neigeAuSol5": ".snow-cover",
    "neigeAuSol6": ".snow-cover",
    "neigeAuSol7": ".snow-cover",
    "neigeAuSol8": ".snow-cover",
    "neigeAuSol9": ".snow-cover",
    "neigeAuSol10": ".snow-cover",
    "neigeAuSol11": ".snow-cover",
    "neigeAuSol12": ".snow-cover",
    "canadaNeigeAuSol": ".snow-cover",
    "snowCover": ".snow-cover",
    "environmentCanada": ".environment-canada"
};

var slideHeaders = {
    "currentConditions": "*city*",
    "nearbyCities": "",
    "dayDesc": "*city* *ending*",
    "weekAhead": "*city* *ending*",
    "couvertureNuageuse": "Couverture Nuageuse",
    "couvertureNuageuse1": "Couverture Nuageuse",
    "couvertureNuageuse2": "Couverture Nuageuse",
    "couvertureNuageuse3": "Couverture Nuageuse",
    "couvertureNuageuse4": "Couverture Nuageuse",
    "couvertureNuageuse5": "Couverture Nuageuse",
    "couvertureNuageuse6": "Couverture Nuageuse",
    "couvertureNuageuse7": "Couverture Nuageuse",
    "couvertureNuageuse8": "Couverture Nuageuse",
    "couvertureNuageuse9": "Couverture Nuageuse",
    "couvertureNuageuse10": "Couverture Nuageuse",
    "couvertureNuageuse11": "Couverture Nuageuse",
    "couvertureNuageuse12": "Couverture Nuageuse",
    "canadaSatellite": "Couverture Nuageuse",
    "satellite": "Couverture Nuageuse",
    "satellite1": "Couverture Nuageuse",
    "satellite2": "Couverture Nuageuse",
    "satellite3": "Couverture Nuageuse",
    "satellite4": "Couverture Nuageuse",
    "satellite5": "Couverture Nuageuse",
    "satellite6": "Couverture Nuageuse",
    "satellite7": "Couverture Nuageuse",
    "satellite8": "Couverture Nuageuse",
    "satellite9": "Couverture Nuageuse",
    "satellite10": "Couverture Nuageuse",
    "satellite11": "Couverture Nuageuse",
    "satellite12": "Couverture Nuageuse",
    "cloudCover": "Couverture Nuageuse",
    "neigeAuSol": "Neige au Sol",
    "neigeAuSol1": "Neige au Sol",
    "neigeAuSol2": "Neige au Sol",
    "neigeAuSol3": "Neige au Sol",
    "neigeAuSol4": "Neige au Sol",
    "neigeAuSol5": "Neige au Sol",
    "neigeAuSol6": "Neige au Sol",
    "neigeAuSol7": "Neige au Sol",
    "neigeAuSol8": "Neige au Sol",
    "neigeAuSol9": "Neige au Sol",
    "neigeAuSol10": "Neige au Sol",
    "neigeAuSol11": "Neige au Sol",
    "neigeAuSol12": "Neige au Sol",
    "canadaNeigeAuSol": "Neige au Sol",
    "snowCover": "Neige au Sol",
    "environmentCanada": ""
};

var slideFlavor = {
    flavor: '',
    bulletin: false,
    precip: false,
    order: slideSettings.order
};

var slideLength;
var currentProgram;
var currentDiv;
var idx = 0, nidx = 1;
var currentSlideToken = 0;
var isResettingCycle = false;
var slidesRunning = false;

function hideAllSlides(exceptSelector) {
    $('.slides > div, #main .map').each(function() {
        if (!exceptSelector || !$(this).is(exceptSelector)) {
            $(this).hide();
            $(this).find('.header, .desc-mov, .outdoor-bg, .qualityarrow').stop(true, true).hide();
            $(this).find('*').stop(true, true);
        }
    });
    if (!exceptSelector || !$(exceptSelector).is('.daypart-forecast')) {
        $('.daypart-forecast .hour .bar').stop(true, true).css('height', '0px');
        $('.daypart-forecast .hour .bar .temp').stop(true, true).hide();
    }
    if (!exceptSelector || !$(exceptSelector).is('.air-quality')) {
        $('.air-quality .qualityarrow').stop(true, true).css('bottom', '270px').hide();
        $('.qualitybar span.text').stop(true, true).hide();
    }
}

function slideKickOff() {
    slidesRunning = true;
    isResettingCycle = false;
    idx = 0;
    nidx = 1;
    hideAllSlides();
    showSlides();
}

function stopSlides() {
    slidesRunning = false;
    isResettingCycle = false;
    currentSlideToken++;
    if (typeof stopSatellite === 'function') {
        stopSatellite("radarsat");
    }
    hideAllSlides();
}

function slideCallBack() {
    if (!slidesRunning || isResettingCycle) return;
    idx++;
    nidx++;

    if (!slideFlavor || !Array.isArray(slideFlavor.order) || slideFlavor.order.length === 0) {
        idx = 0;
        nidx = 1;
        return;
    }

    if (idx >= slideFlavor.order.length) {
        isResettingCycle = true;
        idx = 0;
        nidx = 1;
        console.log('[Slides] Cycle complete, showing Environment Canada attribution & refreshing weather data in background...');

        // Start background data fetch asynchronously without freezing the presentation
        grabData().catch((err) => {
            console.error('[Slides] Error during grabData in cycle reset:', err);
        });

        // Studio may disable the automatic closing attribution (explicit entries remain).
        const resumeCycle = () => {
            if (!slidesRunning) {
                isResettingCycle = false;
                return;
            }
            slideFlavor = flavorPicker(slideSettings.flavor, {
                bulletin: weatherInfo.specialModes.bulletin,
                precip: weatherInfo.specialModes.precip
            });
            isResettingCycle = false;
            showSlides();
        };
        if (slideSettings.endAttribution === false) resumeCycle();
        else slidePrograms.environmentCanada(resumeCycle);
        return;
    }

    if (slidesRunning) {
        showSlides();
    }
}
var slidePrograms = {
    getMapPaging() {
        var configured = Number(locationSettings && locationSettings.mapCities && locationSettings.mapCities.citiesPerSlide);
        if (!Number.isFinite(configured) || configured <= 0) {
            configured = 10;
        }
        var perPage = Math.max(1, Math.min(10, Math.floor(configured)));
        var totalCities = locationConfig.regionalMap.map.length;
        var totalPages = Math.max(1, Math.ceil(totalCities / perPage));
        return { perPage, totalCities, totalPages };
    },
    renderMapPage(midx, pageIdx, mode, fadeInMs) {
        var mapDivs = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
        var paging = slidePrograms.getMapPaging();
        var start = pageIdx * paging.perPage;

        for (let slot = 0; slot < mapDivs.length; slot++) {
            $(`.map-cities .city.${mapDivs[slot]}`).hide();
        }

        for (let slot = 0; slot < paging.perPage; slot++) {
            let cityIndex = start + slot;
            if (cityIndex >= paging.totalCities || slot >= mapDivs.length) { break; }

            try {
                let city = locationConfig.regionalMap.map[cityIndex];
                let cityDiv = `.map-cities .city.${mapDivs[slot]}`;
                $(cityDiv).fadeIn(fadeInMs, 'linear');
                $(`${cityDiv} .city-name`).text(city.name);
                $(cityDiv).css({ left: city.left, top: city.top });

                if (mode === 'current') {
                    $(`${cityDiv} .temp`).text(weatherInfo.map.mapCities[cityIndex].current.temp);
                    getIcon($(`${cityDiv} .icon`), weatherInfo.map.mapCities[cityIndex].current.icon, "current", "large");
                } else {
                    $(`${cityDiv} .temp`).text(weatherInfo.map.mapCities[cityIndex].forecasts[midx].temp);
                    getIcon($(`${cityDiv} .icon`), weatherInfo.map.mapCities[cityIndex].forecasts[midx].icon, "forecast", "large");
                }
            } catch (error) {
                let cityDiv = `.map-cities .city.${mapDivs[slot]}`;
                $(`${cityDiv} .temp`).text("");
                getIcon($(`${cityDiv} .icon`), "blank", mode === 'current' ? "current" : "forecast", "large");
            }
        }
    },
    currentConditions() {
        const $cc = $('.current-conditions');
        try {
            audioPlayer.vocallocal.cc = vocallocalCC();
            $cc.show();
            $cc.find('.right-pane, .left-pane').show();
            $cc.find(".city-name").text(locationConfig.mainCity.displayname.toUpperCase());
            $cc.find(".cond").text(weatherInfo.currentConditions.cond);
            $cc.find(".temp").text(weatherInfo.currentConditions.temp);
            $cc.find(".humidity").text(weatherInfo.currentConditions.humidity);
            $cc.find(".dewpoint").text(weatherInfo.currentConditions.dewpoint + "°");
            $cc.find(".pressure .data").text(weatherInfo.currentConditions.pressure.val);
            $cc.find(".pressure .inches").text(isMetric() ? "kPa" : "INCHES");
            $cc.find(".visibility .data").text(weatherInfo.currentConditions.visibility);
            $cc.find(".visibility .miles").text(isMetric() ? "KM" : "MILES");
            $cc.find(".wind").text(weatherInfo.currentConditions.wind);
            if (weatherInfo.currentConditions.gusts !== "None" && weatherInfo.currentConditions.gusts !== "Aucune" && weatherInfo.currentConditions.gusts !== "" && weatherInfo.currentConditions.gusts != null) {
                $cc.find(".gusts .none").hide();
                $cc.find(".gusts .data").text(weatherInfo.currentConditions.gusts);
                $cc.find(".gusts .miles").text(isMetric() ? "KM/H" : "MPH").show();
            } else {
                $cc.find(".gusts .data").text("");
                $cc.find(".gusts .none").text("Aucune").show();
                $cc.find(".gusts .miles").hide();
            }
            var feelsType = (weatherInfo.currentConditions.feelslike && weatherInfo.currentConditions.feelslike.type) ? weatherInfo.currentConditions.feelslike.type.toUpperCase() : "RESSENTI";
            $cc.find('.labels').html(`HUMIDITÉ<br>PND. ROSÉE<br>PRESSION<br>VISIBILITÉ<br>VENT<br>RAFALES<br>${feelsType}`);
            $cc.find('.feelslike').show();
            var feelsVal = (weatherInfo.currentConditions.feelslike.val !== undefined && weatherInfo.currentConditions.feelslike.val !== "") ? weatherInfo.currentConditions.feelslike.val : weatherInfo.currentConditions.temp;
            $cc.find('.feelslike').text(feelsVal + "°");
            getIcon($cc.find('.icon'), weatherInfo.currentConditions.icon, "current", "large");

            $cc.find('.box').fadeIn(167, 'linear');
            $cc.find('.header').fadeIn(333, 'linear');
            audioPlayer.playCC(true);

            setTimeout(() => {
                $cc.find('.box').fadeOut(167, 'linear');
                $cc.find('.header').fadeOut(333, 'linear');
                setTimeout(() => {
                    $cc.hide();
                    slideCallBack();
                }, 333);
            }, slideLength - 333);
        } catch (error) {
            $cc.show();
            $cc.find(".city-name").text(locationConfig.mainCity.displayname.toUpperCase());
            $cc.find('.box').fadeIn(167, 'linear');
            $cc.find('.header').fadeIn(333, 'linear');
            $cc.find('.right-pane').hide();

            setTimeout(() => {
                $cc.find('.box').fadeOut(167, 'linear');
                $cc.find('.header').fadeOut(333, 'linear');
                setTimeout(() => {
                    $cc.hide();
                    slideCallBack();
                }, 333);
            }, slideLength - 333);
        }
    },
    nearbyCities() {
        try {
            if (weatherInfo.eightCities.cities.length == 0) {
                throw new Error("No local observations");
            }
            $('.eight-cities').show();
            $('.eight-cities .header').text("Actuellement");
            $(".eight-cities .top .wind").text(isMetric() ? "VENT (km/h)" : "VENT (mph)");
            function eightCities(offset) {
                var loDivs = ["i", "ii", "iii", "iv"];
                for (var i = 0; i < 4; i++) {
                    $(`.extra-loc.${loDivs[i]} .name`).text(weatherInfo.eightCities.cities[i + offset].name);
                    $(`.extra-loc.${loDivs[i]} .temp`).text(weatherInfo.eightCities.cities[i + offset].temp);
                    $(`.extra-loc.${loDivs[i]} .wind .direction`).text(weatherInfo.eightCities.cities[i + offset].wind.direction);
                    $(`.extra-loc.${loDivs[i]} .wind .speed`).text(weatherInfo.eightCities.cities[i + offset].wind.speed == 0 ? "" : weatherInfo.eightCities.cities[i + offset].wind.speed);
                    getIcon($(`.extra-loc.${loDivs[i]} .icon`), weatherInfo.eightCities.cities[i + offset].icon, "current", "large");
                }
            }

            eightCities(0);
            $('.eight-cities .box').fadeIn(167, 'linear');
            $('.eight-cities .header').fadeIn(333, 'linear');
            if (weatherInfo.eightCities.cities.length > 4) {
                setTimeout(() => {
                    $(".eight-cities .information").fadeOut(167, 'linear');
                    setTimeout(() => {
                        eightCities(4);
                        $(".eight-cities .information").fadeIn(167, 'linear');
                    }, 167);
                    setTimeout(() => {
                        $('.eight-cities .box').fadeOut(167, 'linear');
                        $('.eight-cities .header').fadeOut(333, 'linear');
                        setTimeout(() => {
                            $('.eight-cities').hide();
                            slideCallBack();
                        }, 333, 'linear');
                    }, slideLength - 333);
                }, slideLength);
            } else {
                setTimeout(() => {
                    $('.eight-cities .box').fadeOut(167, 'linear');
                    $('.eight-cities .header').fadeOut(333, 'linear');
                    setTimeout(() => {
                        $('.eight-cities').hide();
                        slideCallBack();
                    }, 333, 'linear');
                }, slideLength - 333);
            }
        } catch (error) {
            console.warn('[Slides] nearbyCities error/empty:', error.message);
            $('.eight-cities').hide();
            slideCallBack();
        }

    },
    localForecast(lidx) {
        if (lidx === undefined) { lidx = 0; }
        if (!weatherInfo.dayDesc || !Array.isArray(weatherInfo.dayDesc.days) || weatherInfo.dayDesc.days.length === 0) {
            $('.local-forecast').hide();
            slideCallBack();
            return;
        }
        var totalDays = weatherInfo.dayDesc.days.length;
        var maxSlides = (slideFlavor.order[idx] && slideFlavor.order[idx].slides) ? slideFlavor.order[idx].slides : totalDays;
        var allowedSlides = Math.min(maxSlides, totalDays);

        if (lidx >= allowedSlides) {
            $('.local-forecast').hide();
            slideCallBack();
            return;
        }

        var currentDay = weatherInfo.dayDesc.days[lidx];
        if (!currentDay) {
            $('.local-forecast').hide();
            slideCallBack();
            return;
        }

        if (audioSettings.narrations !== false) {
            audioPlayer.vocallocal.lf = vocallocalLF(lidx, slideLength);
            audioPlayer.playLF();
        }

        $('.local-forecast').show();
        if (lidx === 0) {
            $('.local-forecast .box').fadeIn(167, 'linear');
            $('.local-forecast .header').fadeIn(333, 'linear');
        }
        $('.local-forecast .information').fadeIn(167, 'linear');
        $('.local-forecast .desc-mov').fadeIn(167, 'linear');

        var cityName = (locationConfig.mainCity.extraname || locationConfig.mainCity.displayname || "").toUpperCase();
        $('.local-forecast .city-name').text(cityName);
        $('.local-forecast .period').text(currentDay.name || "");
        $('.local-forecast .description').text(currentDay.desc || "");
        var condName = currentDay.cond ? currentDay.cond.name : "cloudy";
        var condTime = (currentDay.cond && showNight(currentDay, idx)) ? currentDay.cond.time : "";
        $('.local-forecast .desc-mov').css({
            'background-image': `url(images/localforecast/${condName}${condTime}.png)`
        });
        if (lidx >= allowedSlides - 1) {
            setTimeout(() => {
                $('.local-forecast .box').fadeOut(167, 'linear');
                $('.local-forecast .header').fadeOut(333, 'linear');
                $('.local-forecast .desc-mov').fadeOut(167, 'linear');
                setTimeout(() => {
                    $('.local-forecast').hide();
                    slideCallBack();
                }, 333);
            }, slideLength - 333);
        } else {
            setTimeout(() => {
                $('.local-forecast .information').fadeOut(167, 'linear');
                $('.local-forecast .desc-mov').fadeOut(167, 'linear');
                setTimeout(() => {
                    slidePrograms.localForecast(lidx + 1);
                }, 333);
            }, slideLength - 333);
        }
    },
    weekAhead() {
        // If quebecWeekAhead is present in order, skip single-city weekAhead to avoid duplicating Montreal's 7-day outlook
        var hasQuebecWeekAhead = slideFlavor && Array.isArray(slideFlavor.order) && slideFlavor.order.some(s => s && s.function === 'quebecWeekAhead');
        if (hasQuebecWeekAhead) {
            $('.week-ahead').hide();
            slideCallBack();
            return;
        }

        audioPlayer.playEF();
        $('.week-ahead').show();
        $('.week-ahead .box').fadeIn(167, 'linear');
        $('.week-ahead .header').fadeIn(333, 'linear');
        $('.week-ahead .city-name').text(locationConfig.mainCity.extraname.toUpperCase());

        var waDivs = ["i", "ii", "iii", "iv", "v", "vi", "vii"];
        for (var i = 0; i < 7; i++) {
            // Skip an isolated leftover Sunday at index 0 (today's weekend already ending) so the
            // WEEKEND badge only highlights the upcoming weekend at the far right, not both edges.
            var isIsolatedLeadingWeekend = i === 0 && weatherInfo.weekAhead.days[i].name == "SUN";
            if (!isIsolatedLeadingWeekend && (weatherInfo.weekAhead.days[i].name == "SAT" || weatherInfo.weekAhead.days[i].name == "SUN")) {
                $(`.week-ahead .day.${waDivs[i]} .weekend`).show();
                $(`.week-ahead .day.${waDivs[i]} .name`).addClass("wk");
            } else {
                $(`.week-ahead .day.${waDivs[i]} .weekend`).hide();
                $(`.week-ahead .day.${waDivs[i]} .name`).removeClass("wk");
            }
            $(`.week-ahead .day.${waDivs[i]} .name`).text(weatherInfo.weekAhead.days[i].name);
            $(`.week-ahead .day.${waDivs[i]} .cond`).text(weatherInfo.weekAhead.days[i].cond);
            $(`.week-ahead .day.${waDivs[i]} .high`).text(weatherInfo.weekAhead.days[i].high);
            $(`.week-ahead .day.${waDivs[i]} .low`).text(weatherInfo.weekAhead.days[i].low);
            getIcon($(`.week-ahead .day.${waDivs[i]} .icon`), weatherInfo.weekAhead.days[i].icon, "forecast", "large");
        }
        setTimeout(() => {
            $('.week-ahead .box').fadeOut(167, 'linear');
            $('.week-ahead .header').fadeOut(333, 'linear');
            setTimeout(() => {
                $('.week-ahead').hide();
                slideCallBack();
            }, 333);
        }, slideLength - 333);
    },
    quebecWeekAhead(cityIdx = 0) {
        try {
            var cities = (weatherInfo.quebecWeekAhead && weatherInfo.quebecWeekAhead.cities) ? weatherInfo.quebecWeekAhead.cities : [];
            if (cities.length === 0) {
                throw new Error("No Quebec 7-day outlook data");
            }
            var maxCities = (slideFlavor.order[idx] && slideFlavor.order[idx].slides) ? slideFlavor.order[idx].slides : cities.length;
            var totalCities = Math.min(maxCities, cities.length);

            if (cityIdx >= totalCities) {
                $('.quebec-week-ahead').hide();
                slideCallBack();
                return;
            }

            var currentCity = cities[cityIdx];
            if (!currentCity || !currentCity.days || currentCity.days.length === 0) {
                $('.quebec-week-ahead').hide();
                slideCallBack();
                return;
            }

            $('.quebec-week-ahead').show();
            $('.quebec-week-ahead .city-name').text(currentCity.name.toUpperCase());

            var waDivs = ["i", "ii", "iii", "iv", "v", "vi", "vii"];
            for (var i = 0; i < 7; i++) {
                var d = currentCity.days[i];
                var $day = $(`.quebec-week-ahead .day.${waDivs[i]}`);
                if (d) {
                    // Skip an isolated leftover Sunday at index 0 so the WEEKEND badge only
                    // highlights the upcoming weekend at the far right, not both edges.
                    var isIsolatedLeadingWeekend = i === 0 && (d.name == "SUN" || d.name == "DIM");
                    if (!isIsolatedLeadingWeekend && (d.name == "SAT" || d.name == "SUN" || d.name == "SAM" || d.name == "DIM")) {
                        $day.find('.weekend').show();
                        $day.find('.name').addClass("wk");
                    } else {
                        $day.find('.weekend').hide();
                        $day.find('.name').removeClass("wk");
                    }
                    $day.find('.name').text(d.name);
                    $day.find('.cond').text(d.cond);
                    $day.find('.high').text(d.high !== "" && d.high != null ? d.high : "");
                    $day.find('.low').text(d.low !== "" && d.low != null ? d.low : "");
                    getIcon($day.find('.icon'), d.icon, "forecast", "large");
                }
            }

            if (cityIdx === 0) {
                audioPlayer.playEF();
                $('.quebec-week-ahead .box').fadeIn(167, 'linear');
                $('.quebec-week-ahead .header').fadeIn(333, 'linear');
                $('.quebec-week-ahead .information').fadeIn(167, 'linear');
            } else {
                $('.quebec-week-ahead .information').fadeIn(167, 'linear');
            }

            setTimeout(() => {
                if (cityIdx < totalCities - 1) {
                    $('.quebec-week-ahead .information').fadeOut(167, 'linear');
                    setTimeout(() => {
                        slidePrograms.quebecWeekAhead(cityIdx + 1);
                    }, 167);
                } else {
                    $('.quebec-week-ahead .box').fadeOut(167, 'linear');
                    $('.quebec-week-ahead .header').fadeOut(333, 'linear');
                    setTimeout(() => {
                        $('.quebec-week-ahead').hide();
                        slideCallBack();
                    }, 333);
                }
            }, slideLength - 167);
        } catch (error) {
            console.warn('[Slides] quebecWeekAhead error/empty:', error.message);
            $('.quebec-week-ahead').hide();
            slideCallBack();
        }
    },
    airQuality() {
        const mySlideToken = currentSlideToken;
        $('.air-quality .qualityarrow').stop(true, true).css('bottom', '270px').hide();
        $('.qualitybar span.text').stop(true, true).hide();

        $('.air-quality').show();
        $('.air-quality .box').fadeIn(167, 'linear');
        $('.air-quality .header').fadeIn(333, 'linear');
        $('.air-quality .qualityarrow').fadeIn(167, 'linear');
        $('.air-quality .city-name').text(locationConfig.mainCity.displayname.toUpperCase());
        var arrowAnim = 317.5 + (95 * (weatherInfo.airQuality.categoryIndex - 1));
        var aqDiv = { 1: "low", 2: "moderate", 3: "unhealthy", 4: "high", 5: "extreme" }[weatherInfo.airQuality.categoryIndex];
        var day = { 0: "Dimanche", 1: "Lundi", 2: "Mardi", 3: "Mercredi", 4: "Jeudi", 5: "Vendredi", 6: "Samedi" }[new Date().getDay()]
        $('.air-quality .day').text(day + " :");
        $('.primpollut .pollutants').empty();
        for (var i = 0; i < weatherInfo.airQuality.pollutants.length; i++) {
            $('.primpollut .pollutants').append(`<span>${weatherInfo.airQuality.pollutants[i]}</span>`);
        }
        setTimeout(() => {
            if (mySlideToken !== currentSlideToken || !slidesRunning) return;
            $('.air-quality .qualityarrow').animate({ "bottom": `${arrowAnim}px` }, 500, 'linear', function () {
                if (mySlideToken !== currentSlideToken || !slidesRunning) return;
                $(`.qualitybar .${aqDiv} span.text`).fadeIn(500);
            })
        }, 167);

        setTimeout(() => {
            if (mySlideToken !== currentSlideToken || !slidesRunning) return;
            $('.air-quality .header').fadeOut(333, 'linear');
            setTimeout(() => {
                $('.air-quality').hide();
                $('.air-quality .qualityarrow').stop(true, true).css('bottom', '270px').hide();
                $('.qualitybar span.text').stop(true, true).hide();
                if (mySlideToken === currentSlideToken && slidesRunning) {
                    slideCallBack();
                }
            }, 333);
        }, slideLength - 333);
    },
    almanac() {
        $('.almanac').show();
        $('.almanac .box').fadeIn(167, 'linear');
        $('.almanac .header').fadeIn(333, 'linear');
        $('.almanac .day.i .almheader').text(weatherInfo.almanac.days[0].day);
        $('.almanac .day.i .sunrise').html(weatherInfo.almanac.days[0].sunrise);
        $('.almanac .day.i .sunset').html(weatherInfo.almanac.days[0].sunset);
        $('.almanac .day.ii .almheader').text(weatherInfo.almanac.days[1].day);
        $('.almanac .day.ii .sunrise').html(weatherInfo.almanac.days[1].sunrise);
        $('.almanac .day.ii .sunset').html(weatherInfo.almanac.days[1].sunset);
        $('.almanac .stationname').text(weatherInfo.almanac.stationname);
        $('.almanac .almdate').text(new Date().toLocaleDateString('fr-CA', { month: 'long', day: 'numeric' }).toUpperCase());
        $('.almanac .yesterday .high').text(weatherInfo.almanac.yesterday.high);
        $('.almanac .yesterday .low').text(weatherInfo.almanac.yesterday.low);
        $('.almanac .average .high').text(weatherInfo.almanac.average.high);
        $('.almanac .average .low').text(weatherInfo.almanac.average.low);
        $('.almanac .records .high').text(weatherInfo.almanac.record.high);
        $('.almanac .records .low').text(weatherInfo.almanac.record.low);
        $('.almanac .records .highyear').text(weatherInfo.almanac.record.recordYearHigh);
        $('.almanac .records .lowyear').text(weatherInfo.almanac.record.recordYearLow);

        setTimeout(() => {
            $('.almanac .box').fadeOut(167, 'linear');
            $('.almanac .header').fadeOut(333, 'linear');
            setTimeout(() => {
                $('.almanac').hide();
                slideCallBack();
            }, 333);
        }, slideLength - 333);
    },
    async radarDoppler() {
        audioPlayer.playRadar();

        $('.radar').show();
        $('#regradar').show();
        addRadarCities();
        $(".reg-cities").show();
        $(".reg-cities-trans").show();
        $('.radar .header').text("Radar");
        $('.radar .header').fadeIn(167);
        startRadar("regradar");

        setTimeout(() => {
            $(".reg-cities").hide();
            $(".reg-cities-trans").hide();
            $('.radar .header').hide();
            stopRadar("regradar");
            $('.radar').hide();
            $('#regradar').hide();

            slideCallBack();
        }, slideLength);
    },
    async localDoppler(dopplerIdx = 0) {
        var dConfig = (locationConfig.localDopplers && locationConfig.localDopplers[dopplerIdx]) ? locationConfig.localDopplers[dopplerIdx] : null;

        if (dopplerIdx === 0 && audioSettings.narrations !== false) {
            audioPlayer.playRadar();
        }

        $('.radar').show();
        $('#locradar').show();
        addRadarCities(dopplerIdx, dConfig);
        $(".loc-cities").show();
        $(".loc-cities-trans").show();
        var headerText = (dConfig && dConfig.name) ? dConfig.name.replace(/^doppler\s+local\s*[-—–:]\s*/i, '').trim() : "Doppler local";
        $('.radar .header').text(headerText);
        $('.radar .header').fadeIn(167);
        startRadar("locradar", dopplerIdx, dConfig);

        setTimeout(() => {
            $(".loc-cities").hide();
            $(".loc-cities-trans").hide();
            $('.radar .header').hide();
            stopRadar("locradar");
            $('.radar').hide();
            $('#locradar').hide();

            slideCallBack();
        }, slideLength);
    },
    async localDoppler1() { return slidePrograms.localDoppler(0); },
    async localDoppler2() { return slidePrograms.localDoppler(1); },
    async localDoppler3() { return slidePrograms.localDoppler(2); },
    async localDoppler4() { return slidePrograms.localDoppler(3); },
    async localDoppler5() { return slidePrograms.localDoppler(4); },
    async localDoppler6() { return slidePrograms.localDoppler(5); },
    async localDoppler7() { return slidePrograms.localDoppler(6); },
    async localDoppler8() { return slidePrograms.localDoppler(7); },
    async localDoppler9() { return slidePrograms.localDoppler(8); },
    async localDoppler10() { return slidePrograms.localDoppler(9); },
    async localDoppler11() { return slidePrograms.localDoppler(10); },
    async localDoppler12() { return slidePrograms.localDoppler(11); },
    async canadaDoppler() {
        var canadaIdx = (locationConfig.localDopplers || []).findIndex(d => d.name && d.name.toLowerCase().includes('canada'));
        return slidePrograms.localDoppler(canadaIdx >= 0 ? canadaIdx : 10);
    },
    async couvertureNuageuse(dopplerIdx = 0) {
        var dConfig = (dopplerIdx !== null && locationConfig.localDopplers && locationConfig.localDopplers[dopplerIdx]) ? locationConfig.localDopplers[dopplerIdx] : null;

        $('.satellite').show();
        $('#radarsat').show();
        if (typeof addSatelliteCities === 'function') {
            addSatelliteCities(dopplerIdx, dConfig);
        }
        $(".sat-cities").show();
        $(".sat-cities-trans").show();

        var headerText = "Couverture Nuageuse";
        if (dConfig && dConfig.name) {
            var regionName = dConfig.name.replace(/^doppler\s+local\s*[-—–:]\s*/i, '').trim();
            $('.satellite .hourloop').text(regionName.toUpperCase() + " • SATELLITE");
        } else {
            $('.satellite .hourloop').text("Boucle satellite");
        }
        $('.satellite .header').text(headerText);
        $('.satellite .header').fadeIn(167);
        if (typeof startSatellite === 'function') {
            startSatellite("radarsat", dopplerIdx, dConfig);
        } else if (typeof startRadar === 'function') {
            startRadar("radarsat");
        }

        setTimeout(() => {
            $(".sat-cities").hide();
            $(".sat-cities-trans").hide();
            $('.satellite .header').hide();
            if (typeof stopSatellite === 'function') {
                stopSatellite("radarsat");
            } else if (typeof stopRadar === 'function') {
                stopRadar("radarsat");
            }
            $('.satellite').hide();
            $('#radarsat').hide();

            slideCallBack();
        }, slideLength);
    },
    async couvertureNuageuse1() { return slidePrograms.couvertureNuageuse(0); },
    async couvertureNuageuse2() { return slidePrograms.couvertureNuageuse(1); },
    async couvertureNuageuse3() { return slidePrograms.couvertureNuageuse(2); },
    async couvertureNuageuse4() { return slidePrograms.couvertureNuageuse(3); },
    async couvertureNuageuse5() { return slidePrograms.couvertureNuageuse(4); },
    async couvertureNuageuse6() { return slidePrograms.couvertureNuageuse(5); },
    async couvertureNuageuse7() { return slidePrograms.couvertureNuageuse(6); },
    async couvertureNuageuse8() { return slidePrograms.couvertureNuageuse(7); },
    async couvertureNuageuse9() { return slidePrograms.couvertureNuageuse(8); },
    async couvertureNuageuse10() { return slidePrograms.couvertureNuageuse(9); },
    async couvertureNuageuse11() { return slidePrograms.couvertureNuageuse(10); },
    async couvertureNuageuse12() { return slidePrograms.couvertureNuageuse(11); },
    async canadaSatellite() {
        var canadaIdx = (locationConfig.localDopplers || []).findIndex(d => d.name && d.name.toLowerCase().includes('canada'));
        return slidePrograms.couvertureNuageuse(canadaIdx >= 0 ? canadaIdx : 10);
    },
    async satellite() { return slidePrograms.couvertureNuageuse(null); },
    async satellite1() { return slidePrograms.couvertureNuageuse(0); },
    async satellite2() { return slidePrograms.couvertureNuageuse(1); },
    async satellite3() { return slidePrograms.couvertureNuageuse(2); },
    async satellite4() { return slidePrograms.couvertureNuageuse(3); },
    async satellite5() { return slidePrograms.couvertureNuageuse(4); },
    async satellite6() { return slidePrograms.couvertureNuageuse(5); },
    async satellite7() { return slidePrograms.couvertureNuageuse(6); },
    async satellite8() { return slidePrograms.couvertureNuageuse(7); },
    async satellite9() { return slidePrograms.couvertureNuageuse(8); },
    async satellite10() { return slidePrograms.couvertureNuageuse(9); },
    async satellite11() { return slidePrograms.couvertureNuageuse(10); },
    async satellite12() { return slidePrograms.couvertureNuageuse(11); },
    async cloudCover() { return slidePrograms.couvertureNuageuse(); },
    async neigeAuSol(dopplerIdx = 0) {
        var dConfig = (dopplerIdx !== null && locationConfig.localDopplers && locationConfig.localDopplers[dopplerIdx]) ? locationConfig.localDopplers[dopplerIdx] : null;

        $('.snow-cover').show();
        $('#radarsnow').show();
        if (typeof addSnowCities === 'function') {
            await addSnowCities(dopplerIdx, dConfig);
        }
        $(".snow-cities").show();
        $(".snow-cities-trans").show();

        var headerText = "Neige au Sol";
        if (dConfig && dConfig.name) {
            var regionName = dConfig.name.replace(/^doppler\s+local\s*[-—–:]\s*/i, '').trim();
            $('.snow-cover .hourloop').text(regionName.toUpperCase() + " • NEIGE AU SOL");
        } else {
            $('.snow-cover .hourloop').text("Accumulation au sol • En direct");
        }
        $('.snow-cover .header').text(headerText);
        $('.snow-cover .header').fadeIn(167);
        if (typeof startSnowCover === 'function') {
            startSnowCover("radarsnow", dopplerIdx, dConfig);
        }

        setTimeout(() => {
            $(".snow-cities").hide();
            $(".snow-cities-trans").hide();
            $('.snow-cover .header').hide();
            if (typeof stopSnowCover === 'function') {
                stopSnowCover("radarsnow");
            }
            $('.snow-cover').hide();
            $('#radarsnow').hide();

            slideCallBack();
        }, slideLength);
    },
    async neigeAuSol1() { return slidePrograms.neigeAuSol(0); },
    async neigeAuSol2() { return slidePrograms.neigeAuSol(1); },
    async neigeAuSol3() { return slidePrograms.neigeAuSol(2); },
    async neigeAuSol4() { return slidePrograms.neigeAuSol(3); },
    async neigeAuSol5() { return slidePrograms.neigeAuSol(4); },
    async neigeAuSol6() { return slidePrograms.neigeAuSol(5); },
    async neigeAuSol7() { return slidePrograms.neigeAuSol(6); },
    async neigeAuSol8() { return slidePrograms.neigeAuSol(7); },
    async neigeAuSol9() { return slidePrograms.neigeAuSol(8); },
    async neigeAuSol10() { return slidePrograms.neigeAuSol(9); },
    async neigeAuSol11() { return slidePrograms.neigeAuSol(10); },
    async neigeAuSol12() { return slidePrograms.neigeAuSol(11); },
    async canadaNeigeAuSol() {
        var canadaIdx = (locationConfig.localDopplers || []).findIndex(d => d.name && d.name.toLowerCase().includes('canada'));
        return slidePrograms.neigeAuSol(canadaIdx >= 0 ? canadaIdx : 10);
    },
    async snowCover() { return slidePrograms.neigeAuSol(null); },
    regionalForecast(pageIdx = 0) {
        try {
            var regions = (weatherInfo.regionalForecasts && weatherInfo.regionalForecasts.regions) ? weatherInfo.regionalForecasts.regions : [];
            if (regions.length === 0) {
                throw new Error("No regional forecast data");
            }
            var perPage = 6;
            var maxSlides = (slideFlavor.order[idx] && slideFlavor.order[idx].slides) ? slideFlavor.order[idx].slides : Math.ceil(regions.length / perPage);
            var totalPages = Math.min(maxSlides, Math.ceil(regions.length / perPage));

            if (pageIdx >= totalPages) {
                $('.regional-forecast').hide();
                slideCallBack();
                return;
            }

            $('.regional-forecast').show();
            function renderRegionsPage(offset) {
                var slots = ["i", "ii", "iii", "iv", "v", "vi"];
                for (var i = 0; i < 6; i++) {
                    var r = regions[i + offset];
                    var $slot = $(`.regional-forecast .region-loc.${slots[i]}`);
                    if (r) {
                        $slot.show();
                        $slot.find('.reg-name').text(r.name);
                        $slot.find('.city-name').text(r.city);
                        $slot.find('.temp').text(r.temp !== "" && r.temp !== undefined ? r.temp + "°" : "");
                        $slot.find('.high-low').text((r.high !== "" || r.low !== "") ? `H ${r.high}°  L ${r.low}°` : "");
                        getIcon($slot.find('.icon'), r.icon, "forecast", "large");
                    } else {
                        $slot.hide();
                    }
                }
            }

            var offset = pageIdx * perPage;
            renderRegionsPage(offset);

            if (pageIdx === 0) {
                $('.regional-forecast .box').fadeIn(167, 'linear');
                $('.regional-forecast .header').fadeIn(333, 'linear');
                $('.regional-forecast .information').fadeIn(167, 'linear');
            } else {
                $('.regional-forecast .information').fadeIn(167, 'linear');
            }

            setTimeout(() => {
                if (pageIdx < totalPages - 1) {
                    $('.regional-forecast .information').fadeOut(167, 'linear');
                    setTimeout(() => {
                        slidePrograms.regionalForecast(pageIdx + 1);
                    }, 167);
                } else {
                    $('.regional-forecast .box').fadeOut(167, 'linear');
                    $('.regional-forecast .header').fadeOut(333, 'linear');
                    setTimeout(() => {
                        $('.regional-forecast').hide();
                        slideCallBack();
                    }, 333);
                }
            }, slideLength - 167);
        } catch (error) {
            console.warn('[Slides] regionalForecast error/empty:', error.message);
            $('.regional-forecast').hide();
            slideCallBack();
        }
    },
    canadaForecast(pageIdx = 0) {
        try {
            var cities = (weatherInfo.canadaCities && weatherInfo.canadaCities.cities) ? weatherInfo.canadaCities.cities : [];
            if (cities.length === 0) {
                throw new Error("No Canada cities forecast data");
            }
            var perPage = 6;
            var maxSlides = (slideFlavor.order[idx] && slideFlavor.order[idx].slides) ? slideFlavor.order[idx].slides : Math.ceil(cities.length / perPage);
            var totalPages = Math.min(maxSlides, Math.ceil(cities.length / perPage));

            if (pageIdx >= totalPages) {
                $('.canada-forecast').hide();
                slideCallBack();
                return;
            }

            $('.canada-forecast').show();
            function renderCanadaPage(offset) {
                var slots = ["i", "ii", "iii", "iv", "v", "vi"];
                for (var i = 0; i < 6; i++) {
                    var c = cities[i + offset];
                    var $slot = $(`.canada-forecast .canada-loc.${slots[i]}`);
                    if (c) {
                        $slot.show();
                        $slot.find('.city-name').text(c.name);
                        $slot.find('.province').text(c.province || c.region || "");
                        $slot.find('.temp').text(c.temp !== "" && c.temp !== undefined ? c.temp + "°" : "");
                        $slot.find('.high-low').text((c.high !== "" || c.low !== "") ? `H ${c.high}°  L ${c.low}°` : "");
                        getIcon($slot.find('.icon'), c.icon, "forecast", "large");
                    } else {
                        $slot.hide();
                    }
                }
            }

            var offset = pageIdx * perPage;
            renderCanadaPage(offset);

            if (pageIdx === 0) {
                $('.canada-forecast .box').fadeIn(167, 'linear');
                $('.canada-forecast .header').fadeIn(333, 'linear');
                $('.canada-forecast .information').fadeIn(167, 'linear');
            } else {
                $('.canada-forecast .information').fadeIn(167, 'linear');
            }

            setTimeout(() => {
                if (pageIdx < totalPages - 1) {
                    $('.canada-forecast .information').fadeOut(167, 'linear');
                    setTimeout(() => {
                        slidePrograms.canadaForecast(pageIdx + 1);
                    }, 167);
                } else {
                    $('.canada-forecast .box').fadeOut(167, 'linear');
                    $('.canada-forecast .header').fadeOut(333, 'linear');
                    setTimeout(() => {
                        $('.canada-forecast').hide();
                        slideCallBack();
                    }, 333);
                }
            }, slideLength - 167);
        } catch (error) {
            console.warn('[Slides] canadaForecast error/empty:', error.message);
            $('.canada-forecast').hide();
            slideCallBack();
        }
    },
    quebecCities(pageIdx = 0) {
        try {
            var cities = (weatherInfo.quebecCities && weatherInfo.quebecCities.cities) ? weatherInfo.quebecCities.cities : [];
            if (cities.length === 0) {
                throw new Error("No Quebec cities data");
            }
            var perPage = 6;
            var maxSlides = (slideFlavor.order[idx] && slideFlavor.order[idx].slides) ? slideFlavor.order[idx].slides : Math.ceil(cities.length / perPage);
            var totalPages = Math.min(maxSlides, Math.ceil(cities.length / perPage));

            if (pageIdx >= totalPages) {
                $('.quebec-cities').hide();
                slideCallBack();
                return;
            }

            $('.quebec-cities').show();
            function renderQuebecPage(offset) {
                var slots = ["i", "ii", "iii", "iv", "v", "vi"];
                for (var i = 0; i < 6; i++) {
                    var c = cities[i + offset];
                    var $slot = $(`.quebec-cities .qc-loc.${slots[i]}`);
                    if (c) {
                        $slot.show();
                        $slot.find('.city-name').text(c.name);
                        $slot.find('.region-name').text(c.region || "");
                        $slot.find('.temp').text(c.temp !== "" && c.temp !== undefined ? c.temp + "°" : "");
                        $slot.find('.high-low').text((c.high !== "" || c.low !== "") ? `H ${c.high}°  L ${c.low}°` : "");
                        getIcon($slot.find('.icon'), c.icon, "forecast", "large");
                    } else {
                        $slot.hide();
                    }
                }
            }

            var offset = pageIdx * perPage;
            renderQuebecPage(offset);

            if (pageIdx === 0) {
                $('.quebec-cities .box').fadeIn(167, 'linear');
                $('.quebec-cities .header').fadeIn(333, 'linear');
                $('.quebec-cities .information').fadeIn(167, 'linear');
            } else {
                $('.quebec-cities .information').fadeIn(167, 'linear');
            }

            setTimeout(() => {
                if (pageIdx < totalPages - 1) {
                    $('.quebec-cities .information').fadeOut(167, 'linear');
                    setTimeout(() => {
                        slidePrograms.quebecCities(pageIdx + 1);
                    }, 167);
                } else {
                    $('.quebec-cities .box').fadeOut(167, 'linear');
                    $('.quebec-cities .header').fadeOut(333, 'linear');
                    setTimeout(() => {
                        $('.quebec-cities').hide();
                        slideCallBack();
                    }, 333);
                }
            }, slideLength - 167);
        } catch (error) {
            console.warn('[Slides] quebecCities error/empty:', error.message);
            $('.quebec-cities').hide();
            slideCallBack();
        }
    },
    resortForecast(pageIdx = 0) {
        try {
            var resorts = (weatherInfo.resortCities && weatherInfo.resortCities.cities) ? weatherInfo.resortCities.cities : [];
            if (resorts.length === 0) {
                throw new Error("No resort data");
            }
            var perPage = 6;
            var maxSlides = (slideFlavor.order[idx] && slideFlavor.order[idx].slides) ? slideFlavor.order[idx].slides : Math.ceil(resorts.length / perPage);
            var totalPages = Math.min(maxSlides, Math.ceil(resorts.length / perPage));

            if (pageIdx >= totalPages) {
                $('.resort-forecast').hide();
                slideCallBack();
                return;
            }

            $('.resort-forecast').show();
            function renderResortsPage(offset) {
                var slots = ["i", "ii", "iii", "iv", "v", "vi"];
                for (var i = 0; i < 6; i++) {
                    var r = resorts[i + offset];
                    var $slot = $(`.resort-forecast .resort-loc.${slots[i]}`);
                    if (r) {
                        $slot.show();
                        $slot.find('.resort-name').text(r.name);
                        $slot.find('.resort-region').text(r.region || "");
                        $slot.find('.temp').text(r.temp !== "" && r.temp !== undefined ? r.temp + "°" : "");
                        $slot.find('.high-low').text((r.high !== "" || r.low !== "") ? `H ${r.high}°  L ${r.low}°` : "");
                        getIcon($slot.find('.icon'), r.icon, "forecast", "large");
                    } else {
                        $slot.hide();
                    }
                }
            }

            var offset = pageIdx * perPage;
            renderResortsPage(offset);

            if (pageIdx === 0) {
                $('.resort-forecast .box').fadeIn(167, 'linear');
                $('.resort-forecast .header').fadeIn(333, 'linear');
                $('.resort-forecast .information').fadeIn(167, 'linear');
            } else {
                $('.resort-forecast .information').fadeIn(167, 'linear');
            }

            setTimeout(() => {
                if (pageIdx < totalPages - 1) {
                    $('.resort-forecast .information').fadeOut(167, 'linear');
                    setTimeout(() => {
                        slidePrograms.resortForecast(pageIdx + 1);
                    }, 167);
                } else {
                    $('.resort-forecast .box').fadeOut(167, 'linear');
                    $('.resort-forecast .header').fadeOut(333, 'linear');
                    setTimeout(() => {
                        $('.resort-forecast').hide();
                        slideCallBack();
                    }, 333);
                }
            }, slideLength - 167);
        } catch (error) {
            console.warn('[Slides] resortForecast error/empty:', error.message);
            $('.resort-forecast').hide();
            slideCallBack();
        }
    },
    daypartForecast() {
        if (!weatherInfo.daypartForecast || !Array.isArray(weatherInfo.daypartForecast.times) || weatherInfo.daypartForecast.times.length === 0) {
            $('.daypart-forecast').hide();
            slideCallBack();
            return;
        }

        const mySlideToken = currentSlideToken;

        // Reset bars to 0 height and hide temp text so the growth animation plays on every cycle
        $('.daypart-forecast .hour .bar').stop(true, true).css('height', '0px');
        $('.daypart-forecast .hour .bar .temp').stop(true, true).hide();

        $('.daypart-forecast').show();
        $('.daypart-forecast .header').fadeIn(167, 'linear');
        $('.daypart-forecast .box').fadeIn(133, 'linear');
        $('.daypart-forecast .city-name').text(locationConfig.mainCity.extraname.toUpperCase());
        $('.daypart-forecast .forecast-period').text(weatherInfo.daypartForecast.dayName || "");
        var dpDivs = ["i", "ii", "iii", "iv"];
        var barTemps = weatherInfo.daypartForecast.times.map(t => (t && t.temp !== "" && t.temp != null) ? Number(t.temp) : 0);
        var barMin = barTemps.length > 0 ? Math.min(...barTemps) : 0;
        var barMax = barTemps.length > 0 ? Math.max(...barTemps) : 0;
        var barRange = barMax - barMin;
        var barminHeight = 70;
        for (let i = 0; i < 4; i++) {
            let tObj = weatherInfo.daypartForecast.times[i];
            if (tObj) {
                $(`.daypart-forecast .hour.${dpDivs[i]} .time`).text(tObj.name || "");
                getIcon($(`.daypart-forecast .hour.${dpDivs[i]} .icon`), tObj.icon || 4400, "forecast", "large");
                $(`.daypart-forecast .hour.${dpDivs[i]} .cond`).text(tObj.cond || "");
                $(`.daypart-forecast .hour.${dpDivs[i]} .wind`).text(tObj.wind || "");
                $(`.daypart-forecast .hour.${dpDivs[i]} .bar .temp`).text(tObj.temp !== "" ? tObj.temp : "");
                let tempNum = (tObj.temp !== "" && tObj.temp != null) ? Number(tObj.temp) : barMin;
                let barHgtMultipler = barRange === 0 ? 80 : ((tempNum - barMin) / barRange) * 110;
                let dpDiv = dpDivs[i];
                setTimeout(() => {
                    if (mySlideToken !== currentSlideToken || !slidesRunning) return;
                    $(`.daypart-forecast .hour.${dpDiv} .bar`).stop(true, false).animate({ "height": `${(barHgtMultipler + barminHeight)}px` }, 167, 'linear', function () {
                        if (mySlideToken !== currentSlideToken || !slidesRunning) return;
                        $(`.daypart-forecast .hour.${dpDiv} .bar .temp`).fadeIn(133);
                    });
                }, 267 * (i + 1));
            }
        }

        setTimeout(() => {
            if (mySlideToken !== currentSlideToken || !slidesRunning) return;
            $('.daypart-forecast .header').fadeOut(167, 'linear');
            $('.daypart-forecast .box').fadeOut(167, 'linear');
            setTimeout(() => {
                $('.daypart-forecast').hide();
                $('.daypart-forecast .hour .bar').stop(true, true).css('height', '0px');
                $('.daypart-forecast .hour .bar .temp').stop(true, true).hide();
                if (mySlideToken === currentSlideToken && slidesRunning) {
                    slideCallBack();
                }
            }, 167);
        }, slideLength - 167);
    },
    bulletin(pageIdx = 0) {
        if (typeof checkAlertExpiration === 'function') {
            checkAlertExpiration();
        }
        if (!weatherInfo.bulletin || !Array.isArray(weatherInfo.bulletin.alerts) || weatherInfo.bulletin.alerts.length === 0) {
            console.warn('[Slides] Bulletin program called with no active bulletin alerts. Skipping slide.');
            $('.bulletin').hide();
            slideCallBack();
            return;
        }

        var alertsPerPage = 1;
        var totalPages = Math.max(1, Math.ceil(weatherInfo.bulletin.alerts.length / alertsPerPage));

        if (pageIdx >= totalPages) {
            $('.bulletin').hide();
            slideCallBack();
            return;
        }

        if (pageIdx === 0) {
            audioPlayer.vocallocal.bl = vocallocalBulletin();
            $('.bulletin').show();
            $('.bulletin .box').show();
            $('.bulletin .header').show();
            $('.bulletin .alerts').show();
        } else {
            $('.bulletin .alerts').fadeIn(167, 'linear');
        }

        var item = weatherInfo.bulletin.alerts[pageIdx];
        if (!item) {
            $('.bulletin').hide();
            slideCallBack();
            return;
        }

        var title = (typeof getAlertDisplayNameFr === 'function' ? getAlertDisplayNameFr(item.name) : (item.name || "Alerte météo")).toUpperCase();
        var headline = typeof translateAlertHeadline === 'function' ? translateAlertHeadline(item.headline || item.desc || "") : (item.headline || item.desc || "");
        var city = item.cityName || (Array.isArray(item.areas) && item.areas.length > 0 ? item.areas.join(", ") : "");
        var area = item.areaText || (city ? `Secteurs : ${city}` : (item.area ? `Secteurs : ${item.area}` : ""));
        var rawDesc = item.description || "";
        var description = typeof translateAlertText === 'function' ? translateAlertText(rawDesc) : rawDesc;
        var isRed = (item.color === 'red' || item.severe);
        var titleColor = isRed ? '#ff4d4d' : '#ffe066';

        var html = `
            <div class="bulletin-card">
                <div class="bulletin-title" style="color: ${titleColor};">${title}</div>
                ${headline ? `<div class="bulletin-headline">${headline}</div>` : ''}
                ${area ? `<div class="bulletin-area">${area}</div>` : ''}
                ${description ? `<div class="bulletin-desc">${description}</div>` : ''}
            </div>
        `;

        $('.bulletin .alerts').empty().append(html);

        var wordCount = (title + " " + headline + " " + area + " " + description).split(/\s+/).filter(Boolean).length;
        // Comfortable reading time: minimum 20 seconds, dynamic up to 30 seconds
        var pageDuration = Math.max(20000, Math.min(30000, (wordCount / 2.5) * 1000 + 6000));

        // French TTS narration of this page (server-rendered WAV, see tts.js).
        // Set window.BULLETIN_TTS = false to disable.
        var ttsEnabled = typeof window === 'undefined' || window.BULLETIN_TTS !== false;
        var speech = [title.charAt(0) + title.slice(1).toLowerCase(), headline, area, description]
            .map(s => String(s || '').replace(/<[^>]*>/g, ' ').trim())
            .filter(Boolean)
            .map(s => /[.!?:]$/.test(s) ? s : s + '.')
            .join(' ');
        var introQueue = pageIdx === 0 ? (audioPlayer.vocallocal.bl || []) : [];

        var schedulePage = (duration) => {
            setTimeout(() => {
                if (pageIdx === totalPages - 1) {
                    $('.bulletin .header').fadeOut(167, 'linear');
                    $('.bulletin .alerts').fadeOut(167, 'linear');
                    setTimeout(() => {
                        $('.bulletin').hide();
                        slideCallBack();
                    }, 167);
                } else {
                    $('.bulletin .alerts').fadeOut(167, 'linear');
                    setTimeout(() => {
                        slidePrograms.bulletin(pageIdx + 1);
                    }, 167);
                }
            }, duration - 167);
        };

        if (!ttsEnabled || !speech || typeof Audio === 'undefined') {
            if (pageIdx === 0) audioPlayer.playBulletin();
            schedulePage(pageDuration);
            return;
        }

        var ttsUrl = '/api/tts?text=' + encodeURIComponent(speech);
        var probe = new Audio();
        var settled = false;
        var proceed = (speechMs) => {
            if (settled) return;
            settled = true;
            probe.onloadedmetadata = probe.onerror = null;
            if (speechMs > 0) {
                audioPlayer.startPlaying(introQueue.concat([ttsUrl]), false);
                var introMs = introQueue.length ? 5000 : 0;
                schedulePage(Math.max(pageDuration, introMs + speechMs + 1500));
            } else {
                if (introQueue.length) audioPlayer.startPlaying(introQueue, false);
                schedulePage(pageDuration);
            }
        };
        probe.preload = 'metadata';
        probe.onloadedmetadata = () => proceed(isFinite(probe.duration) ? probe.duration * 1000 : pageDuration);
        probe.onerror = () => { console.warn('[Slides] Bulletin TTS unavailable, using default narration.'); proceed(0); };
        setTimeout(() => proceed(0), 8000); // synthesis timeout safeguard
        probe.src = ttsUrl;
    },
    mapTest() {
        $('.map').show();
        $('.map .box').show();
        var mapDivs = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"]
        for (let i = 0; i < locationConfig.regionalMap.map.length; i++) {
            $(`.map-cities .city.${mapDivs[i]}`).show();
            $(`.map-cities .city.${mapDivs[i]} .city-name`).text(locationConfig.regionalMap.map[i].name)
            $(`.map-cities .city.${mapDivs[i]}`).css({ left: locationConfig.regionalMap.map[i].left, top: locationConfig.regionalMap.map[i].top })
        }
    },
    mapCurrent(pageIdx) {
        if (pageIdx === undefined) { pageIdx = 0; }
        var paging = slidePrograms.getMapPaging();
        $('.map').show();
        $('.map .box').show();
        $('.map .header').text(paging.totalPages > 1 ? `Actuellement (${pageIdx + 1}/${paging.totalPages})` : "Actuellement");
        $('.map .header').fadeIn(167, 'linear');
        slidePrograms.renderMapPage(0, pageIdx, 'current', 0);

        setTimeout(() => {
            $('.map .header').fadeOut(167, 'linear');
            setTimeout(() => {
                if (pageIdx < paging.totalPages - 1) {
                    $('.map').hide();
                    slidePrograms.mapCurrent(pageIdx + 1);
                } else {
                    $('.map').hide();
                    slideCallBack();
                }
            }, 167);
        }, slideLength - 167);
    },
    mapForecast(midx, pageIdx) {
        if (midx === undefined) { midx = 0; }
        if (pageIdx === undefined) { pageIdx = 0; }
        var paging = slidePrograms.getMapPaging();
        $('.map').show();
        $('.map .box').show();
        var dayName = (weatherInfo.map && weatherInfo.map.days && weatherInfo.map.days[midx]) ? weatherInfo.map.days[midx] : "";
        var prefix = /^[aeiouyéèêëàâôîïûù]/i.test(dayName) ? "Prévisions d'" : "Prévisions de ";
        $('.map .header').text(paging.totalPages > 1
            ? `${prefix}${dayName} (${pageIdx + 1}/${paging.totalPages})`
            : `${prefix}${dayName}`);
        $('.map .header').fadeIn(167, 'linear');
        slidePrograms.renderMapPage(midx, pageIdx, 'forecast', (midx == 0 && pageIdx == 0 ? 0 : 167));

        setTimeout(() => {
            if (slideFlavor.order[idx].slides == undefined) {
                $('.map .header').fadeOut(167, 'linear');
                setTimeout(() => {
                    if (pageIdx < paging.totalPages - 1) {
                        $('.map').hide();
                        slidePrograms.mapForecast(midx, pageIdx + 1);
                    } else {
                        $('.map').hide();
                        slideCallBack();
                    }
                }, 167);
            } else {
                if (pageIdx < paging.totalPages - 1) {
                    $('.map .header').fadeOut(167, 'linear');
                    setTimeout(() => {
                        $('.map').hide();
                        slidePrograms.mapForecast(midx, pageIdx + 1);
                    }, 167);
                } else if (midx >= slideFlavor.order[idx].slides - 1) {
                    $('.map .header').fadeOut(167, 'linear');
                    setTimeout(() => {
                        $('.map').hide();
                        slideCallBack();
                    }, 167);
                } else {
                    $('.map .header').fadeOut(167, 'linear');
                    for (let i = 0; i < 10; i++) {
                        let mapDivs = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
                        $(`.map-cities .city.${mapDivs[i]}`).fadeOut(167);
                    }
                    setTimeout(() => {
                        $('.map').hide();
                        slidePrograms.mapForecast(midx + 1, 0);
                    }, 167);
                }
            }
        }, slideLength);
    },
    outdoorActivity(){
        $(".outdoor-activity").show();
        $(".outdoor-activity .header").fadeIn(133, 'linear');
        $(".outdoor-activity .box").show();
        $(".outdoor-activity .outdoor-bg").css({'background-image': `url(images/outdoorActivity${weatherInfo.outdoorActivity.bg}.png)`, 'background-size': '100% 100%'});
        $(".outdoor-activity .outdoor-bg").fadeIn(300, 'linear');

        $(".outdoor-activity .time").text(weatherInfo.outdoorActivity.time);
        var oaTemp = weatherInfo.outdoorActivity.temp;
        $(".outdoor-activity .temp").text((oaTemp !== undefined && oaTemp !== null && oaTemp !== "") ? (String(oaTemp).includes("°") ? oaTemp : oaTemp + "°") : "");
        $(".outdoor-activity .cond").text(weatherInfo.outdoorActivity.cond);
        $(".outdoor-activity .wind .val").text(weatherInfo.outdoorActivity.wind);
        if(weatherInfo.outdoorActivity.feelslike.type == undefined){
            $(".outdoor-activity .feelslike").hide();
        }else{
            $(".outdoor-activity .feelslike .heading").text(weatherInfo.outdoorActivity.feelslike.type.toUpperCase());
            $(".outdoor-activity .feelslike .val").text(weatherInfo.outdoorActivity.feelslike.val + "°");
        }
        getIcon($(".outdoor-activity .icon"), weatherInfo.outdoorActivity.icon, "forecast", "large");

        setTimeout(() => {
            $(".outdoor-activity .outdoor-bg").fadeOut(300, 'linear');
            setTimeout(() => {
                $(".outdoor-activity .header").fadeOut(133, 'linear');
            }, 167);
            setTimeout(() => {
                $(".outdoor-activity").hide();
                slideCallBack();
            }, 300);
        }, slideLength - 300);
    },
    environmentCanada(callback) {
        hideAllSlides('.environment-canada');
        $('.environment-canada').show();
        $('.environment-canada .header').text("Source des données");
        $('.environment-canada .header').fadeIn(133, 'linear');
        $('.environment-canada .box').show();
        $('.environment-canada .ec-content').fadeIn(200, 'linear');

        var duration = typeof callback === 'function' ? (slideSettings.attributionDelay || 6000) : (slideLength || 6000);
        setTimeout(() => {
            $('.environment-canada .ec-content').fadeOut(200, 'linear');
            $('.environment-canada .header').fadeOut(133, 'linear');
            setTimeout(() => {
                $('.environment-canada').hide();
                if (typeof callback === 'function') {
                    callback();
                } else {
                    slideCallBack();
                }
            }, 250);
        }, duration - 350);
    }
} //end of slidePrograms
function showSlides() {
    if (!slidesRunning) return;
    currentSlideToken++;
    const myToken = currentSlideToken;

    try {
        if (!slideFlavor || !Array.isArray(slideFlavor.order) || slideFlavor.order.length === 0) {
            console.warn('[Slides] Invalid slideFlavor configuration; skipping cycle');
            setTimeout(() => { if (myToken === currentSlideToken && slidesRunning) slideCallBack(); }, 2000);
            return;
        }

        idx = idx % slideFlavor.order.length;
        nidx = (idx + 1) % slideFlavor.order.length;

        var slideItem = slideFlavor.order[idx];
        if (!slideItem || !slideItem.function || typeof slidePrograms[slideItem.function] !== 'function') {
            console.warn('[Slides] Unknown program function:', slideItem ? slideItem.function : 'null');
            setTimeout(() => { if (myToken === currentSlideToken && slidesRunning) slideCallBack(); }, 1000);
            return;
        }

        slideLength = slideItem.slideDelay || 6000;
        currentProgram = slidePrograms[slideItem.function];
        currentDiv = slideDivs[slideItem.function];
        nextProgram = slidePrograms[slideFlavor.order[nidx].function];
        nextDiv = slideDivs[slideFlavor.order[nidx].function];

        // Ensure all other slides are cleanly hidden
        hideAllSlides(currentDiv);

        currentProgram();
    } catch (err) {
        console.error('[Slides] Error in showSlides execution:', err);
        setTimeout(() => { if (myToken === currentSlideToken && slidesRunning) slideCallBack(); }, 2000);
    }
}

window.slideKickOff = slideKickOff;
window.stopSlides = stopSlides;
window.hideAllSlides = hideAllSlides;
window.slidePrograms = slidePrograms;
window.slideDivs = slideDivs;
window.slideHeaders = slideHeaders;