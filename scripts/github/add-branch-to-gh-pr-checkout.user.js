// ==UserScript==
// @name         GitHub Add Branch to "gh pr checkout"
// @description  Add "-b author/<branch name>" to "gh pr checkout ..." command
// @namespace    http://tampermonkey.net/
// @version      2026-01-04
// @author       Hugo Alliaume
// @match        https://github.com/*/*/pull/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @grant        none
// ==/UserScript==

/**
 * When developing an open-source project, relying on `gh pr checkout ...` command could
 * become a mess if the PR's branch name is pretty basic like "patch-1", which can conflicts
 * with already existing branches.
 */

const me = 'kocal';

(function() {
    'use strict';

    const $headRef = document.querySelector('.commit-ref.head-ref');
    const headRef = $headRef.textContent;

    if (!headRef || headRef.startsWith(`${me}:`)) {
        console.log(`Missing head ref, or starting with "${me}:", ignoring`);
        return;
    }

    const headRefSanitized = headRef.replace(':', '/');
    const $getRepoDetails = document.querySelector('get-repo details-menu');
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type !== 'childList') {
                return;
            }

            const $getRepo = $getRepoDetails.querySelector('[data-target="get-repo.modal"]');
            if (!$getRepo) {
                return;
            }

            const $inputCheckoutGhCli = $getRepo.querySelector('input[value^="gh pr checkout "]');
            const $buttonCopyCheckoutGhCli = $getRepo.querySelector('clipboard-copy[value^="gh pr checkout "]');
            const commandGhPrCheckout = $inputCheckoutGhCli.value + ' -b ' + headRefSanitized;

            $inputCheckoutGhCli.setAttribute('value', commandGhPrCheckout);
            $inputCheckoutGhCli.setAttribute('aria-label', commandGhPrCheckout);
            $buttonCopyCheckoutGhCli.setAttribute('value', commandGhPrCheckout);

            observer.disconnect();
        });
    });
    observer.observe($getRepoDetails, {
        subtree: true,
        childList: true,
    });
})();
