const functions = require('firebase-functions');
const constants = require('./../constants');
const helpers = require('./../helpers');

module.exports.ID = 'redflagdeals';

/**
 * For parsing the Hot Deals forum on RedFlagDeals.
 * @return {Array} An array of the deals parsed.
 */
module.exports.parse = async function() {
    functions.logger.log('Parsing RedFlagDeals');
    const deals = [];

    try {
        const sixHoursAgo = helpers.getHoursAgo(6);

        // Use forum 9 (hot deals) with the date sorted descending. 30 per page is the max (sometimes less with stickied sponsored posts).
        const response = await fetch(`${process.env.RFD_API_URL}&time=${new Date().getTime()}`, {
            method: 'get',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const dealsJson = await response.json();

            dealsJson.topics.forEach((dealJson) => {
                const deal = {};
                deal.created = new Date(dealJson.post_time);

                deal.id = dealJson.topic_id.toString();
                deal.source = module.exports.ID;
                deal.title = dealJson.title;

                if (dealJson.offer && dealJson.offer.dealer_name) {
                    // Retailer is not part of the title so we must add it in.
                    deal.title = '[' + dealJson.offer.dealer_name + '] ' + deal.title;
                    deal.dealer_name = dealJson.offer.dealer_name;
                }

                if (dealJson.votes) {
                    deal.score = parseInt(dealJson.votes.total_up) - parseInt(dealJson.votes.total_down);
                } else {
                    deal.score = 0;
                }

                if (dealJson.status === 2) {
                    if (dealJson.forum_id && dealJson.forum_id === 68) {
                        deal.tag = constants.EXPIRED_STATE;
                    } else {
                        deal.tag = constants.MOVED_STATE;
                    }
                } else {
                    deal.tag = null;
                }

                deal.is_hot = deal.created > sixHoursAgo && deal.score >= 20;
                deal.num_comments = dealJson.total_replies;

                deals.push(deal);
            });
        } else {
            functions.logger.error('Parsing RedFlagDeals failed', response);
        }

        // Unfortunately there can be duplicate IDs when merging of posts occur.
        // The API does not identify this so we must handle it ourselves.
        // Basically for duplicate IDs, remove any that have an expired status (2).
        const occurrences = {};
        const duplicateIds = [];
        for (const deal of deals) {
            if (occurrences[deal.id] && !duplicateIds.find((duplicateId) => duplicateId === deal.id)) {
                // An occurence was previously found so it is a duplicate. Add as duplicate if not already.
                duplicateIds.push(deal.id);
            } else {
                occurrences[deal.id] = true;
            }
        }

        // Now remove the duplicate expired ones.
        for (const duplicateId of duplicateIds) {
            for (let i = deals.length - 1; i >= 0; i--) {
                const deal = deals[i];
                if (deal.id === duplicateId && (deal.tag === constants.EXPIRED_STATE || deal.tag === constants.MOVED_STATE)) {
                    functions.logger.info('Removing duplicate deal ' + deal.id);
                    deals.splice(i, 1);
                }
            }
        }
    } catch (e) {
        functions.logger.error('Parsing RedFlagDeals failed', e);
    }

    return deals;
};
