// ==UserScript==
// @name         YouTube - Download Thumbnail
// @namespace    https://greasyfork.org/en/scripts/537130-youtube-download-thumbnail
// @version      1.4
// @license MIT
// @description  YouTube Thumbnail Downloader
// @author       vncsmnl
// @homepage     https://github.com/vncsmnl/userscripts
// @supportURL   https://github.com/vncsmnl/userscripts/issues
// @match        https://www.youtube.com/watch*
// @grant        GM_registerMenuCommand
// @updateURL    https://raw.githubusercontent.com/vncsmnl/userscripts/main/youtube/youtube.thumbnail.user.js
// @downloadURL  https://raw.githubusercontent.com/vncsmnl/userscripts/main/youtube/youtube.thumbnail.user.js
// ==/UserScript==

(function () {
    'use strict';

    function getVideoId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('v');
    }

    function downloadThumbnail() {
        const videoId = getVideoId();
        if (videoId) {
            const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
            window.open(thumbnailUrl, '_blank');
        } else {
            alert('Não foi possível obter o ID do vídeo.');
        }
    }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('Download Thumbnail', downloadThumbnail);
    } else {
        console.warn('GM_registerMenuCommand não está disponível.');
    }
})();
