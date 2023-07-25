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
                const logoParts = gameJson.logo.split('/');

                const id = logoParts[5];
                freeDeal.id = module.exports.ID + '-' + id;
                freeDeal.source = module.exports.ID;
                freeDeal.date = new Date();
                freeDeal.title = gameJson.name;
                freeDeal.type = logoParts[4].slice(0, -1); // type is plural in the logo url so remove it
                freeDeal.link = util.format('https://store.steampowered.com/%s/%s/', freeDeal.type, id);

                freeDeals.push(freeDeal);
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
 * Get expiry date of the deal.
 * @param {Object} freeDeal The free deal to get the expiry from.
 * @return {Date} The expiry date.
 */
module.exports.getExpiryDate = async function(freeDeal) {
    let expiryDate = null;

    const response = await fetch(freeDeal.link, {
        method: 'get',
        headers: { 'Cookie': 'wants_mature_content=1; birthtime=0; lastagecheckage=1-0-1900;' },
        signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
        const $ = cheerio.load(await response.text());
        const discountExpiryElement = $('.game_purchase_discount_quantity');
        const discountExpiryText = $(discountExpiryElement).text();

        const dayMonthResult = discountExpiryText.match(/\d{1,2}\s\w{3}/); // dd mmm
        const dayMonth2Result = discountExpiryText.match(/\w{3}\s\d{1,2}/); // mmm dd
        const timeResult = discountExpiryText.match(/\d{1,2}:\d{2}/);
        const amPmResult = discountExpiryText.match(/[ap]m/);

        if ((dayMonthResult || dayMonth2Result) && timeResult && amPmResult) {
            // Depending on locale it can be in either format on the page.
            let dayMonth = null;
            if (dayMonthResult) {
                dayMonth = dayMonthResult[0];
            } else {
                dayMonth = dayMonth2Result[0];
            }

            // Need to find better way to determine the expiry for steam. Fetch seems to default to GMT-7 so will need to offset for UTC.
            expiryDate = new Date(Date.parse(util.format('%s, %s %s %s -07:00', dayMonth, new Date().getFullYear(), timeResult[0], amPmResult[0])));
        } else {
            // The date is not shown for whatever reason so use steam API to get the expiry date.
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
                expiryDate = new Date(productInfo.packages[freePackageId].packageinfo.extended.expirytime * 1000);

                steamClient.logOff();
            } else {
                functions.logger.error('Getting expiry date failed for ' + freeDeal.id + '. Missing parent ID for package.');
            }
        }
    } else {
        functions.logger.error('Getting expiry date failed for ' + freeDeal.id, response);
    }

    return expiryDate;
};
