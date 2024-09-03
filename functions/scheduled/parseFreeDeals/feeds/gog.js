const functions = require('firebase-functions');
const cheerio = require('cheerio');
const database = require('../database');

module.exports.ID = 'GOG';

/**
 * Parse GOG store for free games.
 * @param {Array} dbFreeDeals An array of the free deals in the DB.
 * @param {Array} freeDeals An array of the free deals being parsed.
 */
module.exports.parse = async function(dbFreeDeals, freeDeals) {
    try {
        functions.logger.log('Parsing GOG');

        const response = await fetch(`${process.env.GOG_URL}`, {
            method: 'get',
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const $ = cheerio.load(await response.text());

            const giveawayElement = $('.giveaway__overlay-link');
            if (giveawayElement.length === 1) {
                const freeDeal = {};
                const link = $(giveawayElement).attr('href');
                const id = link.replace('https://www.gog.com/en/game/', '');
                freeDeal.id = module.exports.ID + '-' + id;
                freeDeal.source = module.exports.ID;
                freeDeal.date = new Date();
                freeDeal.type = null;
                freeDeal.link = link;

                freeDeals.push(freeDeal);
            }

            await database.save(dbFreeDeals, freeDeals, module.exports.ID);
        } else {
            functions.logger.error('Parsing GOG failed', response);
        }
    } catch (e) {
        functions.logger.error('Parsing GOG failed', e);
    }
};

/**
 * Gets the title and expiry date of the deal.
 * @param {Object} freeDeal The free deal.
 * @return {Object} The updated free deal.
 */
module.exports.getAdditionalInfo = async function(freeDeal) {
    try {
        const response = await fetch(freeDeal.link, {
            method: 'get',
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const $ = cheerio.load(await response.text());

            const titleElment = $('.productcard-basics__title');
            if (titleElment.length === 1) {
                freeDeal.title = titleElment.text().trim();
            } else {
                functions.logger.error('Getting title failed for ' + freeDeal.id, response);
            }

            const endDateElement = $('.product-actions__time');
            if (endDateElement.length >= 1) {
                const endDateText = endDateElement.first().text().trim();
                const regexp = /(\d{2})\/(\d{2})\/(\d{4}) (\d{1,}:\d{1,})/g;
                const matches = [...endDateText.matchAll(regexp)];
                let endDate = null;

                if (matches.length === 1) {
                    const match = matches[0];
                    if (match.length > 0) {
                        // 06/24/2024 15:59 = ["06/24/2024 15:59", "06", "24", "2024", "15:59"]
                        endDate = new Date(match[3] + '-' + match[1] + '-' + match[2] + 'T' + match[4] + ':00.000Z');
                        endDate.setHours(endDate.getHours() - 3);
                    }
                }

                freeDeal.expiry_date = endDate;
            } else {
                functions.logger.error('Getting expiry date failed for ' + freeDeal.id);
            }
        } else {
            functions.logger.error('Getting title and expiry date failed for ' + freeDeal.id, response);
        }
    } catch (e) {
        functions.logger.error('Parsing GOG additional info failed', e);
    }

    return freeDeal;
};
