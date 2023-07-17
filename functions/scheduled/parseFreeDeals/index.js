const functions = require('firebase-functions');
const database = require('./database');
const notifications = require('./notifications');
const epic = require('./feeds/epic');
const fanatical = require('./feeds/fanatical');
const gog = require('./feeds/gog');
const indiegala = require('./feeds/indiegala');
const primeGaming = require('./feeds/prime-gaming');
const rfdFreebies = require('./feeds/rfd-freebies');
const steam = require('./feeds/steam');
const ubisoft = require('./feeds/ubisoft');
const ueMarketplace = require('./feeds/ue-marketplace');

let _dbFreeDeals;

/**
 * Parses free deals and send notifications.
 * This function is scheduled to run every 30 minutes and has a timeout of 60 seconds.
 * A max of 1 instance is set since it is a scheduled job and to prevent desync of globals if there are multiple instances.
 */
exports.parseFreeDeals = functions.runWith({ maxInstances: 1, timeoutSeconds: 60 }).pubsub.schedule('every 30 minutes').onRun(async (context) => {
    functions.logger.info('Scheduled Job Start');

    // Retrieve all deals from the DB to be able to determine what will be new or updated.
    // This is lazy loaded to prevent high DB read hits (each document counts as a read).
    if (!_dbFreeDeals) _dbFreeDeals = await database.fetch();

    const freeDeals = [];
    const currentDate = new Date();

    await steam.parse(_dbFreeDeals, freeDeals);
    await gog.parse(_dbFreeDeals, freeDeals);
    if (currentDate.getHours() !== 7) {
        // Free games tend to disappear and come back in this hour so ignore for now.
        await fanatical.parse(_dbFreeDeals, freeDeals);
    }
    await epic.parse(_dbFreeDeals, freeDeals);
    await ueMarketplace.parse(_dbFreeDeals, freeDeals);
    await primeGaming.parse(_dbFreeDeals, freeDeals);
    await indiegala.parse(_dbFreeDeals, freeDeals);
    await rfdFreebies.parse(_dbFreeDeals, freeDeals);
    await ubisoft.parse(_dbFreeDeals, freeDeals);

    await notifications.send(freeDeals);

    functions.logger.log('Scheduled Job Completed');

    return null;
});
