const functions = require('firebase-functions');
const cheerio = require('cheerio');
const database = require('../database');
const util = require('util');

module.exports.ID = 'IndieGala';

/**
 * Parse IndieGala freebies for free games.
 * @param {Array} dbFreeDeals An array of the free deals in the DB.
 * @param {Array} freeDeals An array of the free deals being parsed.
 */
module.exports.parse = async function(dbFreeDeals, freeDeals) {
    try {
        functions.logger.log('Parsing IndieGala');

        const response = await fetch(`${process.env.INDIEGALA_FREEBIES_RSS_URL}`, {
            method: 'get',
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const $ = cheerio.load(await response.text());
            const feedElements = $('item');

            feedElements.each((i, feedElement) => {
                const description = $(feedElement).find('description').text();

                if (description.includes(`${process.env.INDIEGALA_FREEBIES_FIND_URL}`)) {
                    const $i = cheerio.load(description);

                    const linkElements = $i('a');
                    let freebieLinkElement = null;

                    linkElements.each((i, linkElement) => {
                        if ($i(linkElement).attr('href').includes(`${process.env.INDIEGALA_FREEBIES_FIND_URL}`)) {
                            freebieLinkElement = linkElement;
                            return false;
                        }
                    });

                    if (freebieLinkElement) {
                        const freeDeal = {};
                        const id = $i(freebieLinkElement).attr('href').replace(`${process.env.INDIEGALA_FREEBIES_STEAM_BASEURL}`, '');
                        freeDeal.id = module.exports.ID + '-' + id;
                        freeDeal.source = module.exports.ID;
                        freeDeal.date = new Date();
                        freeDeal.title = $i($i('.bb_h1')[0]).text().replace(/^freebie:*/ig, '').trim();
                        freeDeal.type = null;
                        freeDeal.link = util.format(`${process.env.INDIEGALA_FREEBIES_URL}` + '%s', id);

                        freeDeals.push(freeDeal);
                    }
                }
            });

            await database.save(dbFreeDeals, freeDeals, module.exports.ID);
        } else {
            functions.logger.error('Parsing IndieGala failed', response);
        }
    } catch (e) {
        functions.logger.error('Parsing IndieGala failed', e);
    }
};
