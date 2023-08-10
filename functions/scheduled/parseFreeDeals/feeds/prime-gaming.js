const functions = require('firebase-functions');
const cheerio = require('cheerio');
const database = require('../database');

module.exports.ID = 'Prime Gaming';

/**
 * Parse Prime Gaming store for free games.
 * @param {Array} dbFreeDeals An array of the free deals in the DB.
 * @param {Array} freeDeals An array of the free deals being parsed.
 */
module.exports.parse = async function(dbFreeDeals, freeDeals) {
    try {
        functions.logger.log('Parsing Prime Gaming');

        // Need to fetch page to get csrf-token to be able to use API.
        const getResponse = await fetch(`${process.env.PRIME_GAMING_URL}`, {
            method: 'get',
            headers: {
                'User-Agent': `${process.env.PRIME_GAMING_USER_AGENT}`,
            },
            signal: AbortSignal.timeout(5000),
        });

        if (getResponse.ok) {
            // Get the csrf-token.
            const $ = cheerio.load(await getResponse.text());
            const csrfToken = $('input[name=csrf-key]').attr('value');

            // Now use the API with the csrf and cookie.
            const response = await fetch(`${process.env.PRIME_GAMING_SEARCH_URL}`, {
                method: 'post',
                headers: {
                    'Content-Type': 'application/json',
                    'csrf-token': csrfToken,
                    'User-Agent': `${process.env.PRIME_GAMING_USER_AGENT}`,
                    'Cookie': getResponse.headers.get('set-cookie'),
                },
                body: `${process.env.PRIME_GAMING_SEARCH_BODY}`,
                signal: AbortSignal.timeout(5000),
            });

            if (response.ok) {
                const json = await response.json();

                json.data.items.items.forEach((gameJson) => {
                    if (gameJson.isFGWP) {
                        const freeDeal = {};
                        freeDeal.id = gameJson.id;
                        freeDeal.source = module.exports.ID;
                        freeDeal.date = new Date();
                        freeDeal.title = gameJson.assets.title;
                        freeDeal.type = null;

                        if (gameJson.assets.externalClaimLink) {
                            freeDeal.link = gameJson.assets.externalClaimLink;
                        } else {
                            freeDeal.link = 'https://gaming.amazon.com/home';
                        }

                        try {
                            freeDeal.expiry_date = new Date(gameJson.offers[0].endTime);
                        } catch (e) {
                            functions.logger.error('Parsing Prime Gaming expiry date failed', e);
                        }

                        freeDeals.push(freeDeal);
                    }
                });

                await database.save(dbFreeDeals, freeDeals, module.exports.ID);
            } else {
                functions.logger.error('Parsing Prime Gaming failed', response);
            }
        } else {
            functions.logger.error('Parsing Prime Gaming failed', getResponse);
        }
    } catch (e) {
        functions.logger.error('Parsing Prime Gaming failed', e);
    }
};
