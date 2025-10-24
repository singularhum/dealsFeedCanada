const functions = require('firebase-functions/v1');
const database = require('../database');
const util = require('util');

module.exports.ID = 'Fanatical';

/**
 * Parse Fanatical store for free games.
 * @param {Array} dbFreeDeals An array of the free deals in the DB.
 * @param {Array} freeDeals An array of the free deals being parsed.
 */
module.exports.parse = async function(dbFreeDeals, freeDeals) {
    try {
        functions.logger.log('Parsing Fanatical');

        const keyResponse = await fetch(`${process.env.FANATICAL_KEY_URL}`, {
            method: 'get',
            signal: AbortSignal.timeout(5000),
        });

        if (keyResponse.ok) {
            const textResponse = await keyResponse.text();

            const keyMatches = textResponse.match(new RegExp(`${process.env.FANATICAL_KEY_MATCH}`));
            if (keyMatches) {
                const key = keyMatches[0].replace(`${process.env.FANATICAL_KEY_REPLACE}`.replace('\\', ''), '').replace('\'', '');

                const response = await fetch(util.format(`${process.env.FANATICAL_SEARCH_URL}`, key), {
                    method: 'post',
                    headers: { 'Content-Type': 'application/json' },
                    body: `${process.env.FANATICAL_SEARCH_BODY}`,
                    signal: AbortSignal.timeout(5000),
                });

                if (response.ok) {
                    const json = await response.json();

                    if (json.results[0].hits.length > 0) {
                        json.results[0].hits.forEach((gameJson) => {
                            if (gameJson.giveaway === true || gameJson.price.CAD === 0) {
                                const freeDeal = {};
                                const id = gameJson.slug;
                                freeDeal.id = module.exports.ID + '-' + id;
                                freeDeal.source = module.exports.ID;
                                freeDeal.date = new Date();
                                freeDeal.title = gameJson.name;
                                freeDeal.type = gameJson.type;
                                freeDeal.link = util.format('https://www.fanatical.com/en/%s/%s', freeDeal.type, id);

                                freeDeals.push(freeDeal);
                            }
                        });

                        await database.save(dbFreeDeals, freeDeals, module.exports.ID);
                    }
                } else {
                    functions.logger.error('Parsing Fanatical failed', response);
                }
            }
        } else {
            functions.logger.error('Parsing Fanatical failed', keyResponse);
        }
    } catch (e) {
        functions.logger.error('Parsing Fanatical failed', e);
    }
};
