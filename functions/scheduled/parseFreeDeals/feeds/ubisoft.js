const functions = require('firebase-functions');
const cheerio = require('cheerio');
const database = require('../database');
const util = require('util');

module.exports.ID = 'Ubisoft';

/**
 * Parse Ubisoft store for free games.
 * @param {Array} dbFreeDeals An array of the free deals in the DB.
 * @param {Array} freeDeals An array of the free deals being parsed.
 */
module.exports.parse = async function(dbFreeDeals, freeDeals) {
    try {
        functions.logger.log('Parsing Ubisoft');

        const response = await fetch(`${process.env.UBISOFT_SEARCH_URL}`, {
            method: 'get',
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const $ = cheerio.load(await response.text());

            const freeDealElements = $('.product-tile.card');
            freeDealElements.each((i, gameElement) => {
                const freeDeal = {};
                const id = $(gameElement).attr('data-itemid');
                freeDeal.id = module.exports.ID + '-' + id;
                freeDeal.source = module.exports.ID;
                freeDeal.date = new Date();
                freeDeal.title = $(gameElement).find('.prod-title').text().trim() + ' - ' + $(gameElement).find('.card-subtitle').text().trim();
                freeDeal.type = $(gameElement).find('.label').text();
                freeDeal.link = util.format('https://store.ubisoft.com/ca/%s.html', id);
                freeDeals.push(freeDeal);
            });

            await database.save(dbFreeDeals, freeDeals, module.exports.ID);
        } else {
            functions.logger.error('Parsing Ubisoft failed', response);
        }
    } catch (e) {
        functions.logger.error('Parsing Ubisoft failed', e);
    }
};
