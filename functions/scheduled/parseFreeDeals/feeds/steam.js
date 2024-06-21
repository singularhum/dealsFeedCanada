const functions = require('firebase-functions');
const cheerio = require('cheerio');
const database = require('../database');
const util = require('util');
const SteamUser = require('steam-user');

module.exports.ID = 'Steam';

/**
 * Parse Steam store for free games.
 * @param {Array} dbFreeDeals An array of the free deals in the DB.
 * @param {Array} freeDeals An array of the free deals being parsed.
 */
module.exports.parse = async function(dbFreeDeals, freeDeals) {
    try {
        functions.logger.log('Parsing Steam');

        const response = await fetch(`${process.env.STEAM_SEARCH_URL}`, {
            method: 'get',
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const json = await response.json();

            json.items.forEach((gameJson) => {
                const freeDeal = {};
                const match = gameJson.logo.match(new RegExp(/\/steam\/\w+\/\d+\//));

                if (match) {
                    const logoParts = match[0].split('/');
                    const id = logoParts[3];
                    freeDeal.id = module.exports.ID + '-' + id;
                    freeDeal.source = module.exports.ID;
                    freeDeal.date = new Date();
                    freeDeal.title = gameJson.name;
                    freeDeal.type = logoParts[2].slice(0, -1); // type is plural in the logo url so remove it
                    freeDeal.link = util.format('https://store.steampowered.com/%s/%s/', freeDeal.type, id);

                    freeDeals.push(freeDeal);
                }
            });

            await database.save(dbFreeDeals, freeDeals, module.exports.ID);
        } else {
            functions.logger.error('Parsing Steam failed', response);
        }
    } catch (e) {
        functions.logger.error('Parsing Steam failed', e);
    }
};

/**
 * Get additional info for the deal.
 * @param {Object} freeDeal The free deal.
 * @return {Object} The updated free deal.
 */
module.exports.getAdditionalInfo = async function(freeDeal) {
    try {
        const response = await fetch(freeDeal.link, {
            method: 'get',
            headers: { 'Cookie': 'wants_mature_content=1; birthtime=0; lastagecheckage=1-0-1900;' },
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const $ = cheerio.load(await response.text());
            const discountExpiryElement = $('.game_purchase_discount_quantity');
            const parentElementId = $(discountExpiryElement).parent().attr('id');

            if (parentElementId) {
                // The expiry date is contained in the free promo package so need to retrieve it.
                const packageIdMatchResult = parentElementId.match(/\d+/);
                const freePackageId = packageIdMatchResult[0];
                functions.logger.log('Steam - Getting expiry date for package id: ' + freePackageId);

                const steamClient = new SteamUser();
                await new Promise((resolve, reject) => {
                    steamClient.on('loggedOn', () => {
                        resolve();
                    });

                    steamClient.logOn({ anonymous: true });
                });

                const productInfo = await steamClient.getProductInfo([], [parseInt(freePackageId)], true);
                const expiryDate = new Date(productInfo.packages[freePackageId].packageinfo.extended.expirytime * 1000);
                freeDeal.expiry_date = expiryDate;

                steamClient.logOff();
            } else {
                functions.logger.error('Getting expiry date failed for ' + freeDeal.id + '. Missing parent ID for package.');
            }
        } else {
            functions.logger.error('Getting expiry date failed for ' + freeDeal.id, response);
        }
    } catch (e) {
        functions.logger.error('Parsing Steam additional info failed', e);
    }

    return freeDeal;
};
