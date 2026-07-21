// ==UserScript==
// @name         Amazon → Z-Lib & Anna Archive Menu Search
// @namespace    vncsmnl.books
// @version      1.2
// @description  Adds a menu to search the Amazon book title on Z-Lib and Anna’s Archive
// @author       vncsmnl
// @homepage     https://github.com/vncsmnl/userscripts
// @supportURL   https://github.com/vncsmnl/userscripts/issues
// @match        https://www.amazon.com/*
// @match        https://www.amazon.com.br/*
// @match        https://www.amazon.tld/*
// @grant        GM_registerMenuCommand
// @updateURL    https://raw.githubusercontent.com/vncsmnl/userscripts/main/amazon/amazon.user.js
// @downloadURL  https://raw.githubusercontent.com/vncsmnl/userscripts/main/amazon/amazon.user.js
// ==/UserScript==

(function () {
    'use strict';

    function getBookTitle() {
        const selectors = [
            "#productTitle",
            "#ebooksProductTitle",
            "span#title",
            "h1.a-size-large.a-spacing-none"
        ];

        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) return el.innerText.trim();
        }

        alert("Could not find the book title on this page.");
        return null;
    }

    function searchZLib() {
        const title = getBookTitle();
        if (!title) return;

        const url = `https://z-lib.fm/s/${encodeURIComponent(title)}`;
        window.open(url, "_blank");
    }

    function searchAnnas() {
        const title = getBookTitle();
        if (!title) return;

        const url = `https://annas-archive.gd/search?q=${encodeURIComponent(title)}`;
        window.open(url, "_blank");
    }

    if (typeof GM_registerMenuCommand === "function") {
        GM_registerMenuCommand("Search on Z-Lib", searchZLib);
        GM_registerMenuCommand("Search on Anna’s Archive", searchAnnas);
    }
})();
