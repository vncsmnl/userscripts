// ==UserScript==
// @name         Vimm's Cheevos
// @namespace    https://github.com/vncsmnl/vimms-cheevos
// @version      1.0.5
// @description  Validates Vimm's Lair game files against RetroAchievements supported hashes.
// @author       vncsmnl
// @license      MIT
// @match        *://vimm.net/*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      retroachievements.org
// @connect      raw.githubusercontent.com
// @updateURL    https://raw.githubusercontent.com/vncsmnl/userscripts/main/vimms-cheevos/vimms-cheevos.user.js
// @downloadURL  https://raw.githubusercontent.com/vncsmnl/userscripts/main/vimms-cheevos/vimms-cheevos.user.js
// ==/UserScript==

(function () {
    "use strict";

    const SCRIPT_NAME = "Vimm's Cheevos";
    const SCRIPT_VERSION = "1.0.5";
    const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

    const REPO_OWNER = "vncsmnl";
    const REPO_NAME = "userscripts";
    const REPO_SLUG = REPO_OWNER + "/" + REPO_NAME;
    const REPO_BRANCH = "main";
    const SCRIPT_FILE_PATH = "vimms-cheevos/vimms-cheevos.user.js";

    const RAW_FILE_URL =
        "https://raw.githubusercontent.com/" +
        REPO_SLUG +
        "/" +
        REPO_BRANCH +
        "/" +
        SCRIPT_FILE_PATH;

    const STORAGE_KEYS = {
        raUsername: "raUsername",
        raWebApiKey: "raWebApiKey",
        latestVersion: "latestVersion",
        lastUpdateCheckAt: "lastUpdateCheckAt",
    };

    const VimmRASystemMap = {
        "Atari 2600": { id: 25, active: true },
        "Atari 5200": { id: 50, active: false },
        Nintendo: { id: 7, active: true },
        "Master System": { id: 11, active: true },
        "Atari 7800": { id: 51, active: true },
        "TurboGrafx-16": { id: 8, active: true },
        Genesis: { id: 1, active: true },
        "TurboGrafx-CD": { id: 76, active: true },
        "Super Nintendo": { id: 3, active: true },
        "CD-i": { id: 42, active: false },
        "Sega CD": { id: 9, active: true },
        Jaguar: { id: 17, active: true },
        "Sega 32X": { id: 10, active: true },
        Saturn: { id: 39, active: true },
        PlayStation: { id: 12, active: true },
        "Jaguar CD": { id: 77, active: true },
        "Nintendo 64": { id: 2, active: true },
        Dreamcast: { id: 40, active: true },
        "PlayStation 2": { id: 21, active: true },
        GameCube: { id: 16, active: true },
        Xbox: { id: 22, active: false },
        "Xbox 360": { id: null, active: false },
        "Xbox 360 (Digital)": { id: null, active: false },
        "PlayStation 3": { id: null, active: false },
        Wii: { id: 19, active: true },
        WiiWare: { id: 19, active: true },
        "Game Boy": { id: 4, active: true },
        Lynx: { id: 13, active: true },
        "Game Gear": { id: 15, active: true },
        "Virtual Boy": { id: 28, active: true },
        "Game Boy Color": { id: 6, active: true },
        "Game Boy Advance": { id: 5, active: true },
        "Nintendo DS": { id: 18, active: true },
        "PlayStation Portable": { id: 41, active: true },
        "Nintendo 3DS": { id: 62, active: false },
    };

    const titleTransforms = {
        Lynx: function (str) {
            return str.replace(/\.lyx$/i, ".lnx");
        },
        "Atari 7800": function (str) {
            return str.replace(/\.bin$/i, ".a78");
        },
        "PlayStation 2": function (str) {
            return str.replace(/\.iso$/i, "");
        },
        GameCube: function (str) {
            return str.replace(/\.iso$/i, "");
        },
        Wii: function (str) {
            return str.replace(/\.iso$/i, "");
        },
        WiiWare: function (str) {
            return str.replace(/\.wad$/i, "");
        },
    };

    function storageGet(key, fallbackValue) {
        try {
            if (typeof GM_getValue === "function") {
                return GM_getValue(key, fallbackValue);
            }
        } catch (error) {
            console.warn("[vimms-cheevos] GM_getValue failed:", error);
        }

        try {
            const raw = localStorage.getItem(key);
            if (raw === null) {
                return fallbackValue;
            }
            return JSON.parse(raw);
        } catch {
            return fallbackValue;
        }
    }

    function storageSet(key, value) {
        try {
            if (typeof GM_setValue === "function") {
                GM_setValue(key, value);
                return;
            }
        } catch (error) {
            console.warn("[vimms-cheevos] GM_setValue failed:", error);
        }

        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // ignored
        }
    }

    function gmHttpRequest(options) {
        return new Promise(function (resolve, reject) {
            if (typeof GM_xmlhttpRequest === "function") {
                GM_xmlhttpRequest({
                    ...options,
                    onload: function (response) {
                        resolve(response);
                    },
                    onerror: function (error) {
                        reject(error);
                    },
                    ontimeout: function () {
                        reject(new Error("Request timed out"));
                    },
                });
                return;
            }

            fetch(options.url, { method: options.method || "GET", headers: options.headers })
                .then(function (res) {
                    return res.text().then(function (responseText) {
                        resolve({ status: res.status, responseText: responseText });
                    });
                })
                .catch(function (error) {
                    reject(error);
                });
        });
    }

    async function requestJson(url) {
        const response = await gmHttpRequest({
            method: "GET",
            url: url,
            headers: { Accept: "application/json" },
        });

        if (!response || response.status < 200 || response.status >= 300) {
            throw new Error("HTTP error while requesting " + url + ": " + (response ? response.status : "unknown"));
        }

        return JSON.parse(response.responseText);
    }

    function decodeDataV(el) {
        const encoded = el.getAttribute("data-v");
        if (!encoded) {
            return null;
        }
        try {
            return atob(encoded);
        } catch {
            return null;
        }
    }

    function observeAttribute(target, attrName, cb) {
        const observer = new MutationObserver(function (mutations) {
            for (const mutation of mutations) {
                if (mutation.type === "attributes" && mutation.attributeName === attrName) {
                    cb(target.getAttribute(attrName));
                }
            }
        });

        observer.observe(target, {
            attributes: true,
            attributeFilter: [attrName],
        });

        return function () {
            observer.disconnect();
        };
    }

    function getRASystem(systemName) {
        return VimmRASystemMap[systemName] || null;
    }

    function normalizeFileName(systemName, fileName) {
        const transform = titleTransforms[systemName];
        return typeof transform === "function" ? transform(fileName) : fileName;
    }

    async function searchTitle(query, systemId) {
        const url =
            "https://retroachievements.org/internal-api/search?q=" +
            encodeURIComponent(query) +
            "&scope=games&page=1&perPage=50";

        const payload = await requestJson(url);
        const games = (payload && payload.results && Array.isArray(payload.results.games))
            ? payload.results.games.slice()
            : [];

        const normalizedQuery = query.trim().toLowerCase();

        // Prioritize exact title matches before popularity ordering.
        games.sort(function (a, b) {
            const aExact = String(a.title || "").trim().toLowerCase() === normalizedQuery ? 1 : 0;
            const bExact = String(b.title || "").trim().toLowerCase() === normalizedQuery ? 1 : 0;
            return bExact - aExact;
        });

        for (const game of games) {
            if (game && game.system && game.system.id === systemId) {
                return game.id;
            }
        }

        return null;
    }

    async function getGameHashes(webApiKey, gameId) {
        const url =
            "https://retroachievements.org/API/API_GetGameHashes.php?y=" +
            encodeURIComponent(webApiKey) +
            "&i=" +
            encodeURIComponent(String(gameId));

        return requestJson(url);
    }

    async function isGameFileSupported(webApiKey, gameId, fileName, md5) {
        const payload = await getGameHashes(webApiKey, gameId);
        const results = Array.isArray(payload && payload.Results)
            ? payload.Results
            : Array.isArray(payload && payload.results)
                ? payload.results
                : [];

        const normalizedFileName = String(fileName || "").trim().toLowerCase();
        const normalizedMd5 = typeof md5 === "string" ? md5.trim().toLowerCase() : "";

        for (const result of results) {
            const resultMd5 = String(result && result.MD5 ? result.MD5 : result && result.md5 ? result.md5 : "").trim().toLowerCase();
            const resultName = String(result && result.Name ? result.Name : result && result.name ? result.name : "").trim().toLowerCase();

            if ((normalizedMd5 && resultMd5 === normalizedMd5) || resultName === normalizedFileName) {
                return true;
            }
        }

        return false;
    }

    function getAuthConfig() {
        return {
            raUsername: String(storageGet(STORAGE_KEYS.raUsername, "") || "").trim(),
            raWebApiKey: String(storageGet(STORAGE_KEYS.raWebApiKey, "") || "").trim(),
        };
    }

    // Extrai o valor de "// @version   X.Y.Z" do cabeçalho do userscript.
    function parseVersionFromUserscriptHeader(sourceText) {
        const match = /@version\s+([^\s]+)/i.exec(String(sourceText || ""));
        return match ? match[1].trim() : null;
    }

    function compareVersions(leftVersion, rightVersion) {
        const leftParts = String(leftVersion || "")
            .trim()
            .split(".")
            .map(function (part) {
                return Number(part) || 0;
            });
        const rightParts = String(rightVersion || "")
            .trim()
            .split(".")
            .map(function (part) {
                return Number(part) || 0;
            });

        const partCount = Math.max(leftParts.length, rightParts.length);
        for (let index = 0; index < partCount; index += 1) {
            const leftPart = leftParts[index] || 0;
            const rightPart = rightParts[index] || 0;

            if (leftPart !== rightPart) {
                return leftPart - rightPart;
            }
        }

        return 0;
    }

    async function requestText(url) {
        const response = await gmHttpRequest({
            method: "GET",
            url: url,
            headers: { Accept: "text/plain" },
        });

        if (!response || response.status < 200 || response.status >= 300) {
            throw new Error("HTTP error while requesting " + url + ": " + (response ? response.status : "unknown"));
        }

        return response.responseText;
    }

    async function checkForUpdate() {
        const now = Date.now();
        const lastCheckAt = Number(storageGet(STORAGE_KEYS.lastUpdateCheckAt, 0) || 0);

        if (now - lastCheckAt < UPDATE_CHECK_INTERVAL_MS) {
            return;
        }

        storageSet(STORAGE_KEYS.lastUpdateCheckAt, now);

        try {
            const sourceText = await requestText(RAW_FILE_URL + "?_=" + now);
            const latestVersion = parseVersionFromUserscriptHeader(sourceText);

            if (latestVersion) {
                storageSet(STORAGE_KEYS.latestVersion, latestVersion);
            }
        } catch {
            // ignored; retried on the next cycle
        }
    }

    function buildRaRow() {
        const raRow = document.createElement("tr");
        raRow.id = "vimms-cheevos-ra-row";

        raRow.innerHTML =
            "<td>RA</td>" +
            "<td></td>" +
            "<td>" +
            '<span style="color: silver">Checking...</span>' +
            '<div style="float: right; font-size: 90%; padding-top: 2px">' +
            '<a href="#" class="external" style="display: none">Open RA</a>' +
            "</div>" +
            "</td>";

        return {
            raRow: raRow,
            raStatus: raRow.querySelector("span"),
            raLink: raRow.querySelector("a"),
        };
    }

    function showDialog(dialog) {
        if (typeof dialog.showModal === "function") {
            dialog.showModal();
            return;
        }
        dialog.setAttribute("open", "open");
    }

    function closeDialog(dialog) {
        if (typeof dialog.close === "function") {
            dialog.close();
            return;
        }
        dialog.removeAttribute("open");
    }

    function buildUpdateBanner(latestVersion) {
        if (!latestVersion || compareVersions(latestVersion, SCRIPT_VERSION) <= 0) {
            return null;
        }

        const wrapper = document.createElement("div");
        wrapper.id = "updateVersionText";
        wrapper.style.cssText = "font-size: 90%; color: var(--title-color); margin-bottom: 8px";

        const textNode = document.createTextNode("New version v" + latestVersion + " available! ");
        wrapper.appendChild(textNode);

        const link = document.createElement("a");

        link.href = RAW_FILE_URL;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.className = "external";
        link.textContent = "Download";
        wrapper.appendChild(link);

        return wrapper;
    }

    function buildVimmDialog() {
        const latestVersion = String(storageGet(STORAGE_KEYS.latestVersion, "") || "").trim();

        const dialog = document.createElement("dialog");
        dialog.id = "raDialog";
        dialog.style.cssText =
            "border: 0px; padding: 0px; background-color: transparent; cursor: auto;";

        dialog.innerHTML =
            '<div style="text-align: center; font-size: 14pt">' +
            SCRIPT_NAME +
            "</div>" +
            '<div class="rounded" style="min-width: 420px; min-height: 50px; padding: 10px">' +
            '<div style="min-width:320px; max-width:640px; overflow:auto">' +
            '<div style="max-height: 80vh">' +
            '<h3 style="color: var(--title-color); margin-bottom: 8px; margin-top: 0px">Configuration</h3>' +
            "<div>" +
            "This script needs your personal Web API key to work. You can find it on your " +
            '<a href="https://retroachievements.org/settings?tab=applications" target="_blank" rel="noreferrer" class="external">RetroAchievements settings page</a>, under the \"Applications\" section.' +
            "</div>" +
            '<p style="font-size: 90%; color: silver; margin-top: 8px; margin-bottom: 12px">' +
            "Your key is stored locally and is never sent anywhere except RetroAchievements." +
            "</p>" +
            '<h4 style="margin-bottom: 4px; margin-top: 4px">Username</h4>' +
            '<input type="text" id="raUsernameInput" placeholder="Enter your username" style="width: 100%; box-sizing: border-box; flex: 1" />' +
            '<h4 style="margin-bottom: 4px; margin-top: 12px">Web API Key</h4>' +
            '<div style="display: flex; gap: 4px">' +
            '<input type="password" id="raWebApiKeyInput" placeholder="Enter your API key" autocomplete="off" style="width: 100%; box-sizing: border-box; flex: 1" />' +
            '<button type="button" id="raWebApiKeyToggleButton" title="Show/hide API key">👁</button>' +
            "</div>" +
            "</div>" +
            '<h3 style="color: var(--title-color); margin-bottom: 6px; margin-top: 16px">About</h3>' +
            '<div id="aboutSection">' +
            "<div>Current version: v" +
            SCRIPT_VERSION +
            "</div>" +
            '<div style="font-size: 80%; color: silver">Unofficial script, not affiliated with Vimm\'s Lair or RetroAchievements.</div>' +
            '<div style="font-size: 90%; margin-top: 8px">Source code: <a href="https://github.com/' +
            REPO_SLUG +
            "/blob/" +
            REPO_BRANCH +
            "/" +
            SCRIPT_FILE_PATH +
            '" target="_blank" rel="noreferrer" class="external">GitHub</a></div>' +
            '<div style="font-size: 90%">Email me: <a href="mailto:hi@mano.sh">hi@mano.sh</a></div>' +
            "</div>" +
            "</div>" +
            "</div>" +
            '<div style="text-align: center; margin-top: 4px"><button id="raDialogCloseButton" type="button">Close</button></div>';

        const updateBanner = buildUpdateBanner(latestVersion);
        if (updateBanner) {
            const aboutSection = dialog.querySelector("#aboutSection");
            aboutSection.insertBefore(updateBanner, aboutSection.children[1] || null);
        }

        const raUsernameInput = dialog.querySelector("#raUsernameInput");
        const raWebApiKeyInput = dialog.querySelector("#raWebApiKeyInput");
        const raWebApiKeyToggleButton = dialog.querySelector("#raWebApiKeyToggleButton");
        const closeButton = dialog.querySelector("#raDialogCloseButton");

        const currentUsername = storageGet(STORAGE_KEYS.raUsername, "");
        const currentApiKey = storageGet(STORAGE_KEYS.raWebApiKey, "");

        if (typeof currentUsername === "string") {
            raUsernameInput.value = currentUsername;
        }
        if (typeof currentApiKey === "string") {
            raWebApiKeyInput.value = currentApiKey;
        }

        raUsernameInput.addEventListener("change", function () {
            storageSet(STORAGE_KEYS.raUsername, raUsernameInput.value);
        });

        raWebApiKeyInput.addEventListener("change", function () {
            storageSet(STORAGE_KEYS.raWebApiKey, raWebApiKeyInput.value);
        });

        raWebApiKeyToggleButton.addEventListener("click", function () {
            const isHidden = raWebApiKeyInput.type === "password";
            raWebApiKeyInput.type = isHidden ? "text" : "password";
        });

        closeButton.addEventListener("click", function () {
            closeDialog(dialog);
        });

        return dialog;
    }

    async function matchGame(systemName, game) {
        const auth = getAuthConfig();

        if (!auth.raUsername || !auth.raWebApiKey) {
            return { type: "missingAuth" };
        }

        const system = getRASystem(systemName);
        if (system === null || system.id === null) {
            return { type: "unsupportedSystem" };
        }

        if (!system.active) {
            return { type: "inactiveSystem" };
        }

        const normalizedFileName = normalizeFileName(systemName, game.fileName);
        const gameId = await searchTitle(game.title, system.id);

        if (!gameId) {
            return { type: "notFound" };
        }

        const supported = await isGameFileSupported(
            auth.raWebApiKey,
            gameId,
            normalizedFileName,
            game.md5
        );

        return { type: "success", gameId: gameId, isSupported: supported };
    }

    async function initSidebar() {
        const sidebar = document.getElementById("mainMenu");
        if (!sidebar) {
            return;
        }

        if (document.getElementById("vimms-cheevos-sidebar-link")) {
            return;
        }

        await checkForUpdate();

        const latestVersion = String(storageGet(STORAGE_KEYS.latestVersion, "") || "");
        const sidebarTitle =
            latestVersion === SCRIPT_VERSION
                ? SCRIPT_NAME
                : SCRIPT_NAME + " (Update available!)";

        const hr = document.createElement("div");
        hr.innerHTML = "<hr>";
        sidebar.appendChild(hr);

        const anchor = document.createElement("a");
        anchor.id = "vimms-cheevos-sidebar-link";
        anchor.href = "javascript:void(0)";
        anchor.textContent = sidebarTitle;
        sidebar.appendChild(anchor);

        const dialog = buildVimmDialog();
        document.body.appendChild(dialog);

        anchor.addEventListener("click", function () {
            showDialog(dialog);
        });
    }

    async function initGamePage() {
        const header = document.querySelector("main h2 canvas");
        if (!header) {
            return;
        }

        if (document.getElementById("vimms-cheevos-ra-row")) {
            return;
        }

        const fileNameEl = document.querySelector("#data-good-title > #canvas2");
        if (!fileNameEl) {
            return;
        }

        const systemName = document.querySelector("main .sectionTitle");
        if (!systemName || !systemName.textContent) {
            return;
        }

        const detailsContainer = document.querySelector(".mainContent tr#row-date");
        if (!detailsContainer) {
            return;
        }

        const rowParts = buildRaRow();
        detailsContainer.after(rowParts.raRow);

        const gameTitle = decodeDataV(header);
        if (!gameTitle) {
            rowParts.raStatus.textContent = "Unsupported";
            return;
        }

        const md5El = document.getElementById("data-md5");
        const md5 = md5El ? md5El.textContent : undefined;
        let requestToken = 0;

        async function checkFileNameMatch(fileName) {
            const myToken = ++requestToken;

            rowParts.raStatus.textContent = "Checking...";
            rowParts.raStatus.style.cssText = "color: silver";

            try {
                const response = await matchGame(systemName.textContent, {
                    title: gameTitle,
                    fileName: fileName,
                    md5: md5,
                });

                if (myToken !== requestToken) {
                    // Uma checagem mais recente já foi disparada; descarta esta resposta.
                    return;
                }

                if (response.type === "missingAuth") {
                    rowParts.raStatus.textContent = "Missing RA config!";
                    return;
                }
                if (response.type === "notFound") {
                    rowParts.raStatus.textContent = "Not found";
                    return;
                }
                if (response.type === "unsupportedSystem" || response.type === "inactiveSystem") {
                    rowParts.raStatus.textContent = "Unsupported system";
                    return;
                }

                rowParts.raStatus.textContent = response.isSupported ? "Supported" : "Unsupported";
                rowParts.raStatus.style.cssText = response.isSupported
                    ? "color: var(--title-color)"
                    : "color: silver";

                rowParts.raLink.style.display = "";
                rowParts.raLink.href =
                    "https://retroachievements.org/game/" +
                    encodeURIComponent(String(response.gameId)) +
                    "/hashes";
            } catch (error) {
                if (myToken !== requestToken) {
                    return;
                }
                rowParts.raStatus.textContent = "Error";
                console.error("[vimms-cheevos] RA match check failed:", error);
            }
        }

        const initialRawFileName = fileNameEl.getAttribute("data-v");
        if (initialRawFileName) {
            try {
                checkFileNameMatch(atob(initialRawFileName));
            } catch {
                // malformed data-v, ignoring...
            }
        }

        observeAttribute(fileNameEl, "data-v", function (rawValue) {
            if (!rawValue) {
                return;
            }

            try {
                checkFileNameMatch(atob(rawValue));
            } catch {
                // malformed data-v, ignoring...
            }
        });
    }

    initSidebar();
    initGamePage();
})();