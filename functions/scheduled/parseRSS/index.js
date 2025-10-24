const functions = require('firebase-functions/v1');
const database = require('./database');
const defaultParser = require('./parsers/default');
const notifications = require('./notifications');

// Globals that should persist until the instance is restarted which is done randomly by Google.
let _dbArticles;

/**
 * Parses RSS feeds.
 * This function is scheduled to run every 5 minutes and has a timeout of 60 seconds.
 * A max of 1 instance is set since it is a scheduled job and to prevent desync of globals if there are multiple instances.
 */
exports.parseRSS = functions.runWith({ maxInstances: 1, timeoutSeconds: 60 }).pubsub.schedule('every 5 minutes').onRun(async (context) => {
    functions.logger.info('Scheduled Job Start');

    const notificationsAvailable = await notifications.login();

    if (notificationsAvailable) {
        const dbFeeds = await database.fetchFeeds();
        if (!_dbArticles) _dbArticles = await database.fetchArticles();

        const articles = [];
        const newArticles = [];
        const updateArticles = [];

        // Resend any that were missed.
        for (const article of _dbArticles) {
            if (article.discord_message_id === undefined) {
                newArticles.push(article);
            }
        }

        for (const feed of dbFeeds) {
            if (feed.enabled) {
                await defaultParser.parse(feed, _dbArticles, articles, newArticles, updateArticles);
            }
        }
        await notifications.send(dbFeeds, newArticles, updateArticles);
    }

    functions.logger.log('Scheduled Job Completed');

    return null;
});
