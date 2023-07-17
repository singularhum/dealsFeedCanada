const functions = require('firebase-functions');
const database = require('../database');
const util = require('util');

module.exports.ID = 'RedFlagDeals-Freebies';

/**
 * Parse RFD freebies forum for free deals.
 * @param {Array} dbFreeDeals An array of the free deals in the DB.
 * @param {Array} freeDeals An array of the free deals being parsed.
 */
module.exports.parse = async function(dbFreeDeals, freeDeals) {
    try {
        functions.logger.log('Parsing RFD Freebies');

        const response = await fetch(`${process.env.RFD_FREEBIES_API_URL}`, {
            method: 'get',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const freebiesJson = await response.json();

            freebiesJson.topics.forEach((freebieJson) => {
                const freeDeal = {};

                const postTime = new Date(freebieJson.post_time);
                const oneDayAgo = new Date(Date.now() - (24 * 60 * 60 * 1000));

                // Only include today's posts
                if (postTime > oneDayAgo) {
                    const id = freebieJson.topic_id.toString();
                    freeDeal.id = module.exports.ID + '-' + id;
                    freeDeal.source = module.exports.ID;
                    freeDeal.date = new Date();
                    freeDeal.title = freebieJson.title;
                    if (freebieJson.offer && freebieJson.offer.dealer_name) {
                        // Retailer is not part of the title so we must add it in.
                        freeDeal.title = '[' + freebieJson.offer.dealer_name + '] ' + freeDeal.title;
                    }
                    freeDeal.type = null;
                    freeDeal.link = util.format('https://forums.redflagdeals.com/viewtopic.php?t=%s', id);

                    freeDeals.push(freeDeal);
                }
            });

            await database.save(dbFreeDeals, freeDeals, module.exports.ID);
        } else {
            functions.logger.error('Parsing RFD Freebies failed', response);
        }
    } catch (e) {
        functions.logger.error('Parsing RFD Freebies failed', e);
    }
};
