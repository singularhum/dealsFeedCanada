const DB_DEALS_COLLECTION = 'deals';
const DB_ALERTS_COLLECTION = 'alerts';
const DB_ALERTS_REFRESH_COLLECTION = 'alerts-refresh';
const functions = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const constants = require('./constants');
const helpers = require('./helpers');
const reddit = require('./feeds/reddit');
const redflagdeals = require('./feeds/redflagdeals');

// Initialize firebase
initializeApp();
const db = getFirestore();

/**
 * Fetch the deals in the database.
 * @return {Array} An array of the deals from the database.
 */
module.exports.fetchDeals = async function() {
    functions.logger.log('Fetching deals from db');

    const deals = [];
    const dbDealsRef = db.collection(DB_DEALS_COLLECTION);
    const dbDealsSnapshot = await dbDealsRef.get();
    dbDealsSnapshot.forEach((doc) => {
        deals.push(doc.data());
    });

    // Firestore returns the dates as Timestamp so convert to date.
    deals.forEach((deal) => {
        deal.created = deal.created.toDate();
        deal.date = deal.date.toDate();
    });

    return deals;
};

/**
 * Whether the alerts need to be refreshed or not.
 * @return {boolean} if refresh required.
 */
module.exports.requireAlertsRefresh = async function() {
    functions.logger.log('Fetching whether to refresh alerts from db');

    const dbRef = db.collection(DB_ALERTS_REFRESH_COLLECTION);
    const dbSnapshot = await dbRef.get();
    return dbSnapshot.docs[0].data().refresh;
};

/**
 * Fetch the alerts in the database.
 * @return {Array} An array of the alerts from the database.
 */
module.exports.fetchAlerts = async function() {
    const alerts = [];
    functions.logger.log('Fetching alerts from db');

    const dbRef = db.collection(DB_ALERTS_COLLECTION);
    const dbSnapshot = await dbRef.get();
    dbSnapshot.forEach((doc) => {
        alerts.push(doc.data());
    });

    return alerts;
};

/**
 * Set a deal to the database.
 * @param {string} id The id of the deal to set.
 * @param {Array} obj The deal to set.
 * @param {boolean} merge Whether to merge the deal or not.
 */
module.exports.setDeal = async function(id, obj, merge) {
    return await db.collection(DB_DEALS_COLLECTION).doc(id).set(obj, { merge: merge });
};

/**
 * Remove deals older than 2 days that are not in the current parsed deals.
 * This is done to reduce the DB read costs in loading dbDeals.
 * @param {Array} dbDeals The deals in the database.
 * @param {Array} deals The current parsed deals.
 * @param {Array} notificationUpdatedDeals The array to add the updated deals to.
 */
module.exports.clean = async function(dbDeals, deals, notificationUpdatedDeals) {
    functions.logger.info('Cleaning DB');
    const twoDaysAgo = helpers.getDaysAgo(2);
    const oneHourAgo = helpers.getHoursAgo(1);

    // Loop is done backwards since we are removing deals from the array.
    for (let i = dbDeals.length - 1; i >= 0; i--) {
        try {
            const dbDeal = dbDeals[i];
            const foundDeal = deals.find((deal) => deal.id === dbDeal.id);

            // This dbDeal is not in the current deals list so remove/update it.
            // Also make sure there is a least one with the same source (can be empty if parsing failed).
            if (!foundDeal && deals.find((deal) => deal.source === dbDeal.source)) {
                if (dbDeal.created < twoDaysAgo) {
                    // This deal is older than two days so delete it.
                    await db.collection(DB_DEALS_COLLECTION).doc(dbDeal.id).delete();
                    dbDeals.splice(i, 1);
                    functions.logger.info('Deal ' + dbDeal.id + ' successfully deleted');

                    if (dbDeal.tag !== constants.UNTRACKED_STATE && dbDeal.tag !== constants.DELETED_STATE &&
                        dbDeal.tag !== constants.EXPIRED_STATE && dbDeal.tag !== constants.SOLD_OUT_STATE &&
                        dbDeal.tag !== constants.MOVED_STATE) {
                        // Also send update notification that it is no longer tracked.
                        dbDeal.tag = constants.UNTRACKED_STATE;
                        notificationUpdatedDeals.push(dbDeal);
                    }
                } else if (dbDeal.tag !== constants.UNTRACKED_STATE && dbDeal.tag !== constants.DELETED_STATE &&
                    dbDeal.tag !== constants.EXPIRED_STATE &&
                    dbDeal.tag !== constants.SOLD_OUT_STATE &&
                    dbDeal.tag !== constants.MOVED_STATE) {
                    // Most likely the deal was deleted or could be in the next page.
                    dbDeal.date = new Date();

                    // If the deal is less than an hour old, most likely it got deleted.
                    if (dbDeal.created > oneHourAgo) {
                        dbDeal.tag = constants.DELETED_STATE;
                    } else {
                        dbDeal.tag = constants.UNTRACKED_STATE;
                    }

                    await db.collection(DB_DEALS_COLLECTION).doc(dbDeal.id).set(dbDeal);
                    notificationUpdatedDeals.push(dbDeal);
                    functions.logger.log('Recent deal ' + dbDeal.id + ' was removed or is in another page so it has been updated');
                }
            }
        } catch (error) {
            functions.logger.error('Error removing deal ' + dbDeals[i].id, error);
        }
    }
};

/**
 * Go through the deals and save them to the DB depending on if they are new or updated.
 * @param {Array} dbDeals The deals in the database.
 * @param {Array} deals The deals parsed.
 * @param {Array} newDeals An array to add the new deals to.
 * @param {Array} newlyHotDeals An array to add the newly hot deals to.
 * @param {Array} updatedDeals An array to add updated deals.
 */
module.exports.saveDeals = async function(dbDeals, deals, newDeals, newlyHotDeals, updatedDeals) {
    let bapcUpdateCount = 0;
    let gameDealsUpdateCount = 0;
    let rfdUpdateCount = 0;
    let videoGamesUpdateCount = 0;
    const twoDaysAgo = helpers.getDaysAgo(2);

    for (const deal of deals) {
        try {
            const dbDeal = dbDeals.find((dbDeal) => dbDeal.id === deal.id);

            if (dbDeal) {
                // Deal was found so check if we should update it.
                let shouldUpdate;

                if (!dbDeal.is_hot && deal.is_hot) {
                    // Existing deal has turned hot so always update.
                    shouldUpdate = true;
                    dbDeal.is_hot = deal.is_hot;
                    newlyHotDeals.push(dbDeal);
                    functions.logger.log('Previous deal is now hot: ' + dbDeal.id);
                } else {
                    shouldUpdate = shouldUpdateDeal(dbDeal, deal);

                    // Limit the amount of updates by source.
                    if (shouldUpdate) {
                        if (dbDeal.source === reddit.IDs.BAPCSALESCANADA) {
                            bapcUpdateCount += 1;
                            shouldUpdate = bapcUpdateCount <= 3;
                        } else if (dbDeal.source === reddit.IDs.GAMEDEALS) {
                            gameDealsUpdateCount += 1;
                            shouldUpdate = gameDealsUpdateCount <= 3;
                        } else if (dbDeal.source === redflagdeals.ID) {
                            rfdUpdateCount += 1;
                            shouldUpdate = rfdUpdateCount <= 5;
                        } else if (dbDeal.source === reddit.IDs.VIDEOGAMEDEALSCANADA) {
                            videoGamesUpdateCount += 1;
                            shouldUpdate = videoGamesUpdateCount <= 3;
                        }
                    }
                }

                if (shouldUpdate) {
                    // Update fields that can change and save to db.
                    dbDeal.title = deal.title;
                    if (deal.dealer_name) {
                        dbDeal.dealer_name = deal.dealer_name;
                    }
                    dbDeal.tag = deal.tag;
                    dbDeal.num_comments = deal.num_comments;
                    dbDeal.date = new Date();

                    // When RFD deal is expired/moved, the score is returned as 0 so ignore that.
                    if (dbDeal.source !== constants.REDFLAGDEALS || (dbDeal.tag !== constants.EXPIRED_STATE && dbDeal.tag !== constants.MOVED_STATE)) {
                        dbDeal.score = deal.score;
                    }

                    await db.collection(DB_DEALS_COLLECTION).doc(dbDeal.id).set(dbDeal);
                    updatedDeals.push(dbDeal);
                }
            } else {
                // Sometimes old deals will come back in the list when newer deals are removed/deleted
                // so ignore them based on the cutoff when they are deleted from the db.
                if (deal.created > twoDaysAgo) {
                    functions.logger.log('New deal: ' + deal.id);

                    deal.date = new Date();
                    await db.collection(DB_DEALS_COLLECTION).doc(deal.id).set(deal);

                    dbDeals.push(deal);
                    newDeals.push(deal);
                }
            }
        } catch (error) {
            functions.logger.error('Saving deal ' + deal.id + ' failed', error);
        }
    }
};

/**
 * Reduce the update calls to the DB and update notifications by checking certain conditions.
 * @param {Object} dbDeal The deal from the DB.
 * @param {Object} deal The current deal parsed.
 * @return {boolean} Whether the deal should be updated or not.
 */
function shouldUpdateDeal(dbDeal, deal) {
    let shouldUpdate = false;

    if (deal.source === redflagdeals.ID && (deal.tag === constants.EXPIRED_STATE || deal.tag === constants.MOVED_STATE) && dbDeal.dealer_name) {
        deal.title = '[' + dbDeal.dealer_name + '] ' + deal.title;
    }

    if (deal.title !== dbDeal.title || deal.tag != dbDeal.tag) {
        shouldUpdate = true;
        functions.logger.log('Previous deal update to title/tag: ' + dbDeal.id);
    } else {
        if (deal.score !== dbDeal.score) {
            if (deal.source === redflagdeals.ID && (deal.tag === constants.EXPIRED_STATE || deal.tag === constants.MOVED_STATE)) {
                // When RFD deal is expired/moved, the score is returned as 0 so ignore that.
                shouldUpdate = false;
            } else {
                const difference = Math.abs(dbDeal.score - deal.score);
                shouldUpdate = shouldUpdateScoreComment(difference, deal.score);
            }
        }

        if (!shouldUpdate && deal.num_comments !== dbDeal.num_comments) {
            const difference = Math.abs(dbDeal.num_comments - deal.num_comments);
            shouldUpdate = shouldUpdateScoreComment(difference, deal.num_comments);
        }

        if (shouldUpdate) {
            functions.logger.log('Previous deal update to score/comments: ' + dbDeal.id);
        }
    }

    return shouldUpdate;
}

/**
 * Check whether to update the score/comment if it changed a large enough amount.
 * @param {int} difference The difference of the score/comment.
 * @param {int} num The score or number of comments.
 * @return {boolean} Whether the deal should be updated or not.
 */
function shouldUpdateScoreComment(difference, num) {
    let shouldUpdate;

    if (num >= 500 || num <= -500) {
        shouldUpdate = difference >= 100;
    } else if (num >= 200 || num <= -200) {
        shouldUpdate = difference >= 50;
    } else if (num >= 100 || num <= -100) {
        shouldUpdate = difference >= 20;
    } else if (num >= 20 || num <= -20) {
        shouldUpdate = difference >= 10;
    } else if (num >= 10 || num <= -10) {
        shouldUpdate = difference >= 5;
    } else if (num > 2 || num < -2) {
        shouldUpdate = difference >= 3;
    } else {
        shouldUpdate = difference >= 2;
    }

    return shouldUpdate;
}
