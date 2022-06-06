// ==UserScript==
// @name         MangaCollect prix total
// @namespace    https://www.mangacollec.com/
// @version      0.3
// @author       Kocal
// @match        https://www.mangacollec.com/user/*/collection
// @icon         https://www.google.com/s2/favicons?sz=64&domain=mangacollec.com
// @grant        none
// @run-at       document-end
// ==/UserScript==

(async function() {
    'use strict';

    class API {
        constructor(baseUrl, token) {
            this.baseUrl = baseUrl;
            this.token = token;
        }

        async getUserCollection(username) {
            const response = await this.request('GET', `v2/user/${username}/collection`, {});
            if (!response.ok) {
                throw new Error(`Impossible de récupérer la collection de l'utilisateur "${username}" via l'API.`);
            }

            return await response.json();
        }

        async getVolumeOffer(volume) {
            let offer = null;
            const errors = [];

            try {
                offer = await this.getVolumeOfferFromBDFugue(volume);
            } catch(e) {
                errors.push(e);
            }

            if (null === offer || offer.formatted_price === null) {
                try {
                    offer = await this.getVolumeOfferFromAmazon(volume);
                } catch(e) {
                    errors.push(e);
                }
            }

            if (null === offer) {
                throw new Error(`Impossible de récupérer l'offre pour le tome "${volume.id}", raisons : ${errors.map(error => ' - ' + error.message).join("\n")}`);
            }

            return {
                has_price: null !== offer.formatted_price,
                price: Number((offer.formatted_price || '').replace(',', '.').replace('€', '')) * 100,
            };
        }

        /** @private */
        async getVolumeOfferFromAmazon(volume) {
            const response = await this.request('GET', `v1/amazon_offer/${volume.asin}`, {});
            if (!response.ok) {
                throw new Error(`Impossible de récupérer l'offre Amazon pour le tome ASIN "${volume.asin}" via l'API.`);
            }

            return await response.json();
        }

        /** @private */
        async getVolumeOfferFromBDFugue(volume) {
            const response = await this.request('GET', `v1/bdfugue_offer/${volume.isbn}`, {});
            if (!response.ok) {
                throw new Error(`Impossible de récupérer l'offre BDfugue pour le tome ISBN "${volume.isbn}" via l'API.`);
            }

            return await response.json();
        }

        /** @private */
        async request(method, uri, options = {}) {
            const url = new URL(uri, this.baseUrl);
            options = {...options};
            options.method = method;
            options.headers = options.headers || {};
            options.headers.Authorization = `Bearer ${this.token.access_token}`

            return fetch(url.toString(), options);
        }
    }

    class CachedAPI {
        constructor(api) {
            this.api = api;
        }

        async getUserCollection(username) {
            return this.api.getUserCollection(username);
        }

        async getVolumeOffer(volume) {
            const cacheKey = `volume:${volume.id}:offer`;
            if (cacheKey in localStorage) {
                return JSON.parse(localStorage.getItem(cacheKey));
            }

            const result = await this.api.getVolumeOffer(volume);
            localStorage.setItem(cacheKey, JSON.stringify(result));

            return result;
        }
    }

    async function getApiToken() {
        let token = localStorage.getItem('mangacollec-token');
        // Si l'utilisateur arrive pour la première fois sur le site, il n'y a pas encore de token
        while (null === token) {
            await new Promise(l => setTimeout(l, 2000));
            token = localStorage.getItem('mangacollec-token')
        }

        return JSON.parse(token);
    }

    async function setupDom() {
        async function getElCounters() {
            let $elBullet = null;
            await (new Promise((resolve, reject) => {
                $elBullet = document.evaluate("//*[contains(text(), ' • ')]", document.body, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                if ($elBullet) {
                    return resolve($elBullet);
                }

                const mutationObserver = new MutationObserver((mutations) => {
                    // Si quelqu'un sait pourquoi mon lien n'est pas trouvable via "mutations.forEach(mutation => mutation.addedNodes.forEach(addedNode => ... ))" ...
                    // Du coup on fait à la zob, tant pis :D
                    $elBullet = document.evaluate("//*[contains(text(), ' • ')]", document.body, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                    if ($elBullet) {
                        mutationObserver.disconnect();
                        return resolve($elBullet);
                    }
                });
                mutationObserver.observe(document, {
                    childList: true,
                    subtree: true,
                });
            }));

            return $elBullet.parentNode;
        }

        const $elCounters = await getElCounters();

        const $elBullet = $elCounters.children[1].cloneNode(true);
        $elCounters.appendChild($elBullet);

        const $elPrice = $elCounters.children[0].cloneNode(true);
        $elPrice.textContent = 'Chargement du prix...';
        $elCounters.appendChild($elPrice);

        return { $elPrice };
    }

    async function run() {
        const { $elPrice } = await setupDom();
        const priceFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
        const counters = {
            price: 0,
            handledVolumesCount: 0,
            totalVolumesWithoutPrice: 0,
        }

        const api = new CachedAPI(new API('https://api.mangacollec.com', await getApiToken()));

        const username = window.location.pathname.match(/\/user\/(?<username>.+)\/collection/).groups.username;
        const userCollection = await api.getUserCollection(username);

        for (const [index, possession] of Object.entries(userCollection.possessions)) {
            const volume = userCollection.volumes.find(volume => volume.id === possession.volume_id);
            const offer = await api.getVolumeOffer(volume);

            counters.price += offer.price;
            counters.handledVolumesCount = Number(index) + 1;
            if(offer.has_price === false) {
                counters.totalVolumesWithoutPrice += 1;
            }

            render();
        }

        function render() {
            $elPrice.innerHTML = `<span style="font-weight: bold">${priceFormatter.format(counters.price / 100)}</span>
              (<span title="Tomes traités" style="text-decoration: underline dotted">C: ${counters.handledVolumesCount}</span>
              / <span title="Tomes ignorés (le prix n'a pas pu être récupéré)" style="text-decoration: underline dotted">I: ${counters.totalVolumesWithoutPrice}</span>)
            `;
        }
    }

    await run();
})();
