const functions = require('firebase-functions');
const cheerio = require('cheerio');
const database = require('../database');
const util = require('util');

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

            const giveawayElement = $('#giveaway');
            if (giveawayElement.length === 1) {
                const freeDeal = {};
                const id = $(giveawayElement).attr('ng-href').replace('/en/game/', '');
                freeDeal.id = module.exports.ID + '-' + id;
                freeDeal.source = module.exports.ID;
                freeDeal.date = new Date();
                freeDeal.title = $('div[ng-if=!giveaway.wasMarketingConsentGiven] .giveaway-banner__title').text().trim().replace('Claim ', '');
                freeDeal.type = null;
                freeDeal.link = util.format('https://www.gog.com/en/game/%s', id);
                freeDeals.push(freeDeal);
                console.log(freeDeal);
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
 * Get expiry date of the deal.
 * @param {Object} freeDeal The free deal to get the expiry from.
 * @return {Date} The expiry date.
 */
module.exports.getExpiryDate = async function(freeDeal) {
    let expiryDate = null;

    const response = await fetch(`${process.env.GOG_URL}`, {
        method: 'get',
        signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
        const $ = cheerio.load(await response.text());

        const giveawayElement = $('#giveaway');
        if (giveawayElement.length === 1) {
            expiryDate = new Date(parseInt($('.giveaway-banner__countdown-timer').attr('end-date')));
        } else {
            const countdownTimer = $('a[href=/en/game/' + freeDeal.id + '].big-spot gog-countdown-timer');
            if (countdownTimer.length === 1) {
                expiryDate = new Date($(countdownTimer).attr('end-date'));
            }
        }
    } else {
        functions.logger.error('Getting expiry date failed for ' + freeDeal.id, response);
    }

    return expiryDate;
};
