$(function(){
	var $main = $("#main"),
		$window = $( window ),
	    mainHeight = $main.outerHeight(),
	    mainWidth = $main.outerWidth();
	$(window).resize(() =>{
		scaleWindow();
	});

	function scaleWindow() {
		var scaleX, scaleY, windowAspect;
		var targetAspect = 16 / 9;
		var baseAspect = mainWidth / mainHeight; // 1620 / 1080 = 1.5
		var stretchX = targetAspect / baseAspect; // 32 / 27 (~1.185185)

		windowAspect = $window.width() / $window.height();
		if (windowAspect >= targetAspect) {
			scaleY = $window.height() / mainHeight;
			scaleX = scaleY * stretchX;
		} else {
			scaleX = $window.width() / (mainWidth * stretchX);
			scaleY = scaleX / stretchX;
		}

		$main.css({
			transform: "translate(-50%, -50%) " + "scale(" + scaleX + ", " + scaleY + ")"
		});
		$(".container").css({
			transform: "translate(-50%, -50%) " + "scale(" + scaleX + ", " + scaleY + ")"
		});
		$("#colorbar-screen, .colorbar-container").css({
			transform: "translate(-50%, -50%) " + "scale(" + scaleX + ", " + scaleY + ")"
		});
	}
	window.scaleWindow = scaleWindow;
	scaleWindow();

});

const CANADIAN_PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"];

function isMetric() {
    if (typeof appearanceSettings !== "undefined" && appearanceSettings.units === "metric") return true;
    if (typeof appearanceSettings !== "undefined" && appearanceSettings.units === "imperial") return false;
    if (typeof locationConfig !== "undefined" && locationConfig.mainCity) {
        var country = locationConfig.mainCity.country;
        var state = locationConfig.mainCity.state;
        if (country === "Canada" || country === "CA" || CANADIAN_PROVINCES.includes(state)) {
            return true;
        }
    }
    return false;
}

function getUnits() {
    return isMetric() ? "m" : "e";
}

// ═══════════════════════════════════════════════════════════════════════
// Live JS Hot-Reload Engine (Zero-Downtime Stream Update)
// ═══════════════════════════════════════════════════════════════════════
const HOT_RELOAD_SCRIPTS = [
    'js/config.js',
    'js/spotify.js',
    'js/extras.js',
    'js/weather.js',
    'js/audio.js',
    'js/vocallocal.js',
    'js/settings.js',
    'js/newlocation.js',
    'js/radar.js',
    'js/ldl.js',
    'js/slides.js'
];

async function reloadScripts() {
    console.log('[Live Refresh] Hot-reloading all JavaScript modules without killing stream...');
    const cacheBuster = Date.now();
    let successCount = 0;

    for (const scriptPath of HOT_RELOAD_SCRIPTS) {
        try {
            const res = await fetch(`${scriptPath}?v=${cacheBuster}`);
            if (!res.ok) {
                console.warn(`[Live Refresh] Failed to fetch ${scriptPath}: HTTP ${res.status}`);
                continue;
            }
            const code = await res.text();
            (0, eval)(code);
            successCount++;
        } catch (err) {
            console.error(`[Live Refresh] Error evaluating ${scriptPath}:`, err);
        }
    }

    if (typeof grabAlerts === 'function') {
        try {
            await grabAlerts();
            if (typeof refreshSlidesForAlertTest === 'function') {
                refreshSlidesForAlertTest();
            }
        } catch (e) {
            console.warn('[Live Refresh] Post-reload grabAlerts error:', e);
        }
    }

    console.log(`[Live Refresh] Successfully hot-reloaded ${successCount}/${HOT_RELOAD_SCRIPTS.length} JS modules!`);
    return { success: true, count: successCount, total: HOT_RELOAD_SCRIPTS.length };
}

window.reloadScripts = reloadScripts;
window.refreshAllJS = reloadScripts;

let lastProcessedRefreshId = 0;
function startRefreshCommandListener() {
    if (window._refreshCommandListenerStarted) return;
    window._refreshCommandListenerStarted = true;
    setInterval(async () => {
        try {
            const res = await fetch('/api/refresh');
            if (!res.ok) return;
            const data = await res.json();
            if (!data || !data.id || data.id === lastProcessedRefreshId) return;

            lastProcessedRefreshId = data.id;
            if (data.action === 'refresh') {
                console.log('[Live Refresh] Remote refresh trigger received from API.');
                await reloadScripts();
            }
        } catch (e) {}
    }, 1000);
}
startRefreshCommandListener();

