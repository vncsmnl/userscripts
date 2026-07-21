// ==UserScript==
// @name         Bypass Paywall Skip
// @namespace    vncsmnl.paywallskip
// @version      1.0.1
// @description  Adds a context menu option to bypass an article's paywall.
// @author       vncsmnl
// @homepage     https://github.com/vncsmnl/userscripts
// @supportURL   https://github.com/vncsmnl/userscripts/issues
// @license      MIT
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @updateURL    https://raw.githubusercontent.com/vncsmnl/userscripts/main/paywall/paywall.user.js
// @downloadURL  https://raw.githubusercontent.com/vncsmnl/userscripts/main/paywall/paywall.user.js
// ==/UserScript==

(function () {
    'use strict';

    if (typeof GM_registerMenuCommand === "function") {
        GM_registerMenuCommand("Replace Current Tab", () => {
            window.location.href = 'https://www.paywallskip.com/article?url=' + encodeURIComponent(window.location.href);
        }, "u");

        GM_registerMenuCommand("New Tab", () => {
            GM_openInTab('https://www.paywallskip.com/article?url=' + encodeURIComponent(window.location.href), { active: true });
        });
    }
})();
