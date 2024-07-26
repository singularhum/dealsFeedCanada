const functions = require('firebase-functions');
const database = require('../database');
const util = require('util');

module.exports.ID = 'Epic';

/**
 * Parse Epic store for free games.
 * @param {Array} dbFreeDeals An array of the free deals in the DB.
 * @param {Array} freeDeals An array of the free deals being parsed.
 */
module.exports.parse = async function(dbFreeDeals, freeDeals) {
    try {
        functions.logger.log('Parsing Epic');

        const response = await fetch(`${process.env.EPIC_SEARCH_URL}`, {
            method: 'get',
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const json = await response.json();

            json.data.Catalog.searchStore.elements.forEach((gameJson) => {
                if (gameJson.price.totalPrice.discountPrice === 0 && gameJson.promotions && gameJson.promotions.promotionalOffers && gameJson.promotions.promotionalOffers.length > 0) {
                    const freeDeal = {};

                    let id;
                    if (gameJson.offerMappings && gameJson.offerMappings.length > 0) {
                        id = gameJson.offerMappings[0].pageSlug;
                    } else if (gameJson.catalogNs.mappings && gameJson.catalogNs.mappings.length > 0) {
                        id = gameJson.catalogNs.mappings[0].pageSlug;
                    } else {
                        id = gameJson.productSlug;
                    }

                    freeDeal.id = module.exports.ID + '-' + id;
                    freeDeal.source = module.exports.ID;
                    freeDeal.date = new Date();
                    freeDeal.title = gameJson.title;
                    freeDeal.type = gameJson.offerType;
                    freeDeal.link = util.format('https://store.epicgames.com/en-US/p/%s', id);

                    try {
                        freeDeal.expiry_date = new Date(gameJson.promotions.promotionalOffers[0].promotionalOffers[0].endDate);
                    } catch (e) {
                        functions.logger.error('Parsing Epic expiry date failed', e);
                    }

                    freeDeals.push(freeDeal);
                }
            });

            await database.save(dbFreeDeals, freeDeals, module.exports.ID);
        } else {
            functions.logger.error('Parsing Epic failed', response);
        }
    } catch (e) {
        functions.logger.error('Parsing Epic failed', e);
    }
};
