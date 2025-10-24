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

    const notificationsAvailable = await notifications.login();

    if (notificationsAvailable) {
        // Retrieve all deals from the DB to be able to determine what will be new or updated.
        // This is lazy loaded to prevent high DB read hits (each document counts as a read).
        if (!_dbDeals) _dbDeals = await database.fetchDeals();

        const requiresAlertssRefresh = await database.requireAlertsRefresh();
        if (!_dbAlerts || requiresAlertssRefresh) _dbAlerts = await database.fetchAlerts();

        const deals = [];
        const newDeals = [];
        const newlyHotDeals = [];
        const updatedDeals = [];

        // Resend any that were missed.
        for (const deal of _dbDeals) {
            if (deal.discord_message_id === undefined) {
                newDeals.push(deal);
            }
        }

        // Only do RFD on every 5 minutes in the hour.
        if ((new Date).getMinutes() % 5 === 0) {
            helpers.logIP();
            deals.push(...await redflagdeals.parse());
        }

        if ((new Date).getMinutes() % 2 === 0) {
            deals.push(...await reddit.parseSubreddit(reddit.IDs.BAPCSALESCANADA));
            deals.push(...await reddit.parseSubreddit(reddit.IDs.GAMEDEALS));
            deals.push(...await reddit.parseSubreddit(reddit.IDs.VIDEOGAMEDEALSCANADA));
        }

        await database.clean(_dbDeals, deals, updatedDeals);
        await database.saveDeals(_dbDeals, deals, newDeals, newlyHotDeals, updatedDeals);
        await notifications.send(newDeals, newlyHotDeals, updatedDeals, _dbAlerts);
    }

    functions.logger.log('Scheduled Job Completed');

    return null;
});
