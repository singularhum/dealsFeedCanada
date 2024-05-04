const DB_COLLECTION = 'free-deals';
const functions = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const gog = require('./feeds/gog');
const rfdFreebies = require('./feeds/rfd-freebies');
const steam = require('./feeds/steam');

// Initialize firebase
initializeApp();
const db = getFirestore();

/**
 * Fetch the deals in the database.
 * @return {Array} An array of the deals from the database.
 */
module.exports.fetch = async function() {
    functions.logger.log('Fetching free deals from db');

    const dbFreeDeals = [];
    const dbFreeDealsRef = db.collection(DB_COLLECTION);
    const dbFreeDealsSnapshot = await dbFreeDealsRef.get();
    dbFreeDealsSnapshot.forEach((doc) => {
        dbFreeDeals.push(doc.data());
    });

    // Firestore returns the dates as Timestamp so convert to date.
    dbFreeDeals.forEach((dbFreeDeal) => {
        dbFreeDeal.date = dbFreeDeal.date.toDate();

        if (dbFreeDeal.expiry_date) {
            dbFreeDeal.expiry_date = dbFreeDeal.expiry_date.toDate();
        }
    });

    return dbFreeDeals;
};

/**
 * Set a free deal to the database.
 * @param {string} id The id of the free deal to set.
 * @param {Array} obj The free deal to set.
 * @param {boolean} merge Whether to merge the free deal or not.
 */
module.exports.setFreeDeal = async function(id, obj, merge) {
    return await db.collection(DB_COLLECTION).doc(id).set(obj, { merge: merge });
};

/**
 * Go through the free deals and update DB if new or expired.
 * @param {Array} dbFreeDeals An array of the free deals in the DB.
 * @param {Array} freeDeals The free deals parsed.
 * @param {string} source The source of the deals.
 */
module.exports.save = async function(dbFreeDeals, freeDeals, source) {
    // Checking for new deals.
    for (const freeDeal of freeDeals) {
        try {
            if (freeDeal.source === source) {
                const dbfreeDeal = dbFreeDeals.find((dbfreeDeal) => dbfreeDeal.id === freeDeal.id);

                if (!dbfreeDeal) {
                    functions.logger.log('New free deal: ' + freeDeal.id);

                    const expiryDate = await getExpiryDate(freeDeal);
                    if (expiryDate) {
                        freeDeal.expiry_date = expiryDate;
                    }

                    dbFreeDeals.push(freeDeal);

                    // Save to DB and set as isNew for notifications.
                    await db.collection(DB_COLLECTION).doc(freeDeal.id).set(freeDeal);
                    freeDeal.isNew = true;
                }
            }
        } catch (error) {
            functions.logger.error('Saving free deal ' + freeDeal.id + ' failed', error);
        }
    }

    // Check for expired free deals
    for (let i = dbFreeDeals.length - 1; i >= 0; i--) {
        try {
            const dbFreeDeal = dbFreeDeals[i];
            if (dbFreeDeal.source === source) {
                const foundFreeDeal = freeDeals.find((freeDeal) => freeDeal.id === dbFreeDeal.id);

                if (!foundFreeDeal && (!dbFreeDeal.expiry_date || new Date() > dbFreeDeal.expiry_date)) {
                    // Delete from DB and remove from array.
                    await db.collection(DB_COLLECTION).doc(dbFreeDeal.id).delete();
                    dbFreeDeals.splice(i, 1);

                    if (source === rfdFreebies.ID) {
                        functions.logger.info('Free deal ' + dbFreeDeal.id + ' removed from DB');
                    } else {
                        // Set as expired and add to array to send udpate notifications.
                        dbFreeDeal.isExpired = true;
                        freeDeals.push(dbFreeDeal);
                        functions.logger.info('Free deal ' + dbFreeDeal.id + ' has expired');
                    }
                }
            }
        } catch (error) {
            functions.logger.error('Error removing free deal ' + dbFreeDeals[i].id, error);
        }
    }
};

/**
 * Get expiry dates for sources where the original API/search does not include them.
 * @param {Object} freeDeal The free deal to get the expiry from.
 * @return {Date} The expiry date.
 */
async function getExpiryDate(freeDeal) {
    let expiryDate = null;

    try {
        if (freeDeal.source === steam.ID) {
            expiryDate = steam.getExpiryDate(freeDeal);
        } else if (freeDeal.source === gog.ID) {
            expiryDate = gog.getExpiryDate(freeDeal);
        }
    } catch (e) {
        functions.logger.error('Getting expiry date failed for ' + freeDeal.id, e);
    }

    return expiryDate;
}
