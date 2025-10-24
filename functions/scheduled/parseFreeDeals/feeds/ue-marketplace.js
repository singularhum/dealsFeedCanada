const functions = require('firebase-functions/v1');
const database = require('../database');
const util = require('util');

module.exports.ID = 'UE Marketplace';

/**
 * Parse Unreal Engine Marketplace store for free assets.
 * @param {Array} dbFreeDeals An array of the free deals in the DB.
 * @param {Array} freeDeals An array of the free deals being parsed.
 */
 module.exports.parse = async function(dbFreeDeals, freeDeals) {
    try {
        functions.logger.log('Parsing UE Marketplace');

        const response = await fetch(`${process.env.UE_MARKETPLACE_SEARCH_URL}`, {
            method: 'get',
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const json = await response.json();

            json.data.elements.forEach((gameJson) => {
                const freeDeal = {};
                const id = gameJson.urlSlug;
                freeDeal.id = module.exports.ID + '-' + id;
                freeDeal.source = module.exports.ID;
                freeDeal.date = new Date();
                freeDeal.title = gameJson.title;

                if (gameJson.categories && gameJson.categories.length > 0) {
                    freeDeal.type = gameJson.categories[0].name;
                } else {
                    freeDeal.type = null;
                }

                freeDeal.link = util.format('https://www.unrealengine.com/marketplace/en-US/product/%s', id);

                try {
                    const currentDate = new Date();
                    const nextMonthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
                    const firstWeekdayInMonth = nextMonthDate.getDay();
                    const firstTuesdayDay = 1 + ((2 - firstWeekdayInMonth + 7) % 7);
                    const firstTuesdayOfNextMonth = new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth(), firstTuesdayDay);
                    firstTuesdayOfNextMonth.setUTCHours(14);
                    freeDeal.expiry_date = firstTuesdayOfNextMonth;
                } catch (e) {
                    functions.logger.error('Parsing UE Marketplace expiry date failed', e);
                }

                freeDeals.push(freeDeal);
            });

            await database.save(dbFreeDeals, freeDeals, module.exports.ID);
        } else {
            functions.logger.error('Parsing UE Marketplace failed', response);
        }
    } catch (e) {
        functions.logger.error('Parsing UE Marketplace failed', e);
    }
};
