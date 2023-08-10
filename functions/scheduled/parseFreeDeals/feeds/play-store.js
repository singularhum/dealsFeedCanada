const functions = require('firebase-functions');
const cheerio = require('cheerio');
const database = require('../database');
const util = require('util');

module.exports.ID = 'Play Store';

/**
 * Parse Play Store for free deals.
 * @param {Array} dbFreeDeals An array of the free deals in the DB.
 * @param {Array} freeDeals An array of the free deals being parsed.
 */
module.exports.parse = async function(dbFreeDeals, freeDeals) {
    try {
        functions.logger.log('Parsing Play Store');

        const getGamesResponse = await fetch(`${process.env.PLAY_STORE_GAMES_URL}`, {
            method: 'get',
            signal: AbortSignal.timeout(5000),
        });

        if (getGamesResponse.ok) {
            const $ = cheerio.load(await getGamesResponse.text());

            const gameElements = $('.ULeU3b');
            gameElements.each((i, gameElement) => {
                const price = $(gameElement).find('.VfPpfd.VixbEe').text().trim();
                if (price === '$0.00') {
                    const freeDeal = {};
                    const id = $(gameElement).find('.Si6A0c.ZD8Cqc').attr('href').replace('/store/apps/details?id=', '');
                    freeDeal.id = module.exports.ID + '-' + id;
                    freeDeal.source = module.exports.ID;
                    freeDeal.date = new Date();
                    freeDeal.title = $(gameElement).find('.Epkrse').text().trim();
                    freeDeal.type = null;
                    freeDeal.link = util.format('https://play.google.com/store/apps/details?id=%s&gl=ca', id);
                    freeDeals.push(freeDeal);
                }
            });

            await database.save(dbFreeDeals, freeDeals, module.exports.ID);
        } else {
            functions.logger.error('Parsing Play Store failed', getGamesResponse);
        }
    } catch (e) {
        functions.logger.error('Parsing Play Store failed', e);
    }
};
