const functions = require('firebase-functions');
const database = require('./database');
const helpers = require('./helpers');
const notifications = require('./notifications');
const reddit = require('./feeds/reddit');
const redflagdeals = require('./feeds/redflagdeals');

const scheduledRuntimeOptions = {
    maxInstances: 1,
    timeoutSeconds: 40,
};

// Globals that should persist until the instance is restarted which is done randomly by Google.
let _dbDeals;
let _dbAlerts;

/**
 * Parses deals from sources and send notifications (currently only for Discord through a bot).
 * This function is scheduled to run every minute and has a timeout of 40 seconds.
 * A max of 1 instance is set since it is a scheduled job and to prevent desync of globals if there are multiple instances.
 */
exports.parseThemDeals = functions.runWith(scheduledRuntimeOptions).pubsub.schedule('every 1 minutes').onRun(async (context) => {
    functions.logger.info('Scheduled Job Start');

    // Retrieve all deals from the DB to be able to determine what will be new or updated.
    // This is lazy loaded to prevent high DB read hits (each document counts as a read).
    if (!_dbDeals) _dbDeals = await database.fetchDeals();

    const requiresAlertssRefresh = await database.requireAlertsRefresh();
    if (!_dbAlerts || requiresAlertssRefresh) _dbAlerts = await database.fetchAlerts();

    const deals = [];
    const newDeals = [];
    const newlyHotDeals = [];
    const updatedDeals = [];

    // Only do RFD on every 5 minutes in the hour.
    if ((new Date).getMinutes() % 5 === 0) {
        helpers.logIP();
        deals.push(...await redflagdeals.parse());
    }

    const redditAccessToken = await reddit.getRedditAccessToken();
    if (redditAccessToken) {
        deals.push(...await reddit.parseSubreddit(reddit.IDs.BAPCSALESCANADA, redditAccessToken));
        deals.push(...await reddit.parseSubreddit(reddit.IDs.GAMEDEALS, redditAccessToken));
        deals.push(...await reddit.parseSubreddit(reddit.IDs.VIDEOGAMEDEALSCANADA, redditAccessToken));

        reddit.revokeRedditAccessToken(redditAccessToken);
    }

    await database.clean(_dbDeals, deals, updatedDeals);
    await database.saveDeals(_dbDeals, deals, newDeals, newlyHotDeals, updatedDeals);
    await notifications.send(newDeals, newlyHotDeals, updatedDeals, _dbAlerts);

    functions.logger.log('Scheduled Job Completed');

    return null;
});
