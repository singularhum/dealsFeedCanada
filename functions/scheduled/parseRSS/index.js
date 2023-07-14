const RSS_ARTICLES_DB_COLLECTION = 'rss-articles';
const RSS_FEEDS_DB_COLLECTION = 'rss-feeds';
const functions = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { setTimeout } = require('timers/promises');
const { Client, Events, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const cheerio = require('cheerio');
const util = require('util');
const { URL } = require('url');

// Initialize firebase
initializeApp();

// Globals that should persist until the instance is restarted which is done randomly by Google.
const db = getFirestore();
let _dbFeeds;
let _dbArticles;
const discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });

/**
 * Parses RSS feeds.
 * This function is scheduled to run every 5 minutes and has a timeout of 60 seconds.
 * A max of 1 instance is set since it is a scheduled job and to prevent desync of globals if there are multiple instances.
 */
exports.parseRSS = functions.runWith({ maxInstances: 1, timeoutSeconds: 60 }).pubsub.schedule('every 5 minutes').onRun(async (context) => {
    functions.logger.info('Scheduled Job Start');

    _dbFeeds = await fetchDB(RSS_FEEDS_DB_COLLECTION);
    if (!_dbArticles) _dbArticles = await fetchDB(RSS_ARTICLES_DB_COLLECTION);

    const articles = [];
    const newArticles = [];
    const updateArticles = [];

    for (const feed of _dbFeeds) {
        if (feed.enabled) {
            await parseFeed(feed, _dbArticles, articles, newArticles, updateArticles);
        }
    }

    await sendNotifications(newArticles, updateArticles);

    functions.logger.log('Scheduled Job Completed');

    return null;
});

/**
 * Fetch items in the database.
 * @param {string} name The name of the collection to retrieve.
 * @return {Array} An array of the items from the database.
 */
async function fetchDB(name) {
    functions.logger.log('Fetching ' + name + ' from db');

    const dbItems = [];
    const dbFItemsRef = db.collection(name);
    const dbItemsSnapshot = await dbFItemsRef.get();
    dbItemsSnapshot.forEach((doc) => {
        dbItems.push(doc.data());
    });

    // Firestore returns the dates as Timestamp so convert to date.
    dbItems.forEach((dbItem) => {
        if (dbItem.date) {
            dbItem.date = dbItem.date.toDate();
        }

        if (dbItem.posted_date) {
            dbItem.posted_date = dbItem.posted_date.toDate();
        }
    });

    return dbItems;
}

/**
 * Parse RSS Feeds.
 * @param {Object} feed The feed to retrieve.
 * @param {Array} dbArticles An array of the articles in the DB.
 * @param {Array} articles An array of the articles being parsed.
 * @param {Array} newArticles An array of the new articles being parsed.
 * @param {Array} updateArticles An array of the articles to be update being parsed.
 */
async function parseFeed(feed, dbArticles, articles, newArticles, updateArticles) {
    try {
        functions.logger.log('Parsing Feed ' + feed.id);

        const response = await fetch(feed.link, {
            method: 'get',
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const $ = cheerio.load(await response.text(), {
                xmlMode: true,
            });

            const feedElements = $('item');
            if (feedElements.length > 0) {
                feedElements.each((i, feedElement) => {
                    const article = {};
                    article.id = feed.id + '-' + $(feedElement).find('guid').text();
                    article.source = feed.id;
                    article.title = $(feedElement).find('title').text();
                    article.link = $(feedElement).find('link').text();
                    article.date = new Date();
                    article.posted_date = new Date($(feedElement).find('pubDate').text());
                    article.thumbnail = null;
                    article.score = null;
                    article.external_source = null;

                    if (feed.source === 'slickdeals') {
                        parseSlickDealsCustom(feed, article, feedElement, $);
                    } else if (feed.source === 'ozbargain') {
                        parseOzBargainCustom(feed, article, feedElement, $);
                    }

                    articles.push(article);
                });

                await saveDB(feed, dbArticles, articles, newArticles, updateArticles);
            }
        } else {
            functions.logger.error('Parsing Feed ' + feed.id + ' failed', response);
        }
    } catch (e) {
        functions.logger.error('Parsing Feed ' + feed.id + ' failed', e);
    }
}

/**
 * Sets custom properties and values for Slickdeals
 * @param {Object} feed The feed to retrieve.
 * @param {Object} article The current article to set.
 * @param {Object} feedElement The feed element being parsed.
 * @param {Object} $ Cheerio object.
 */
function parseSlickDealsCustom(feed, article, feedElement, $) {
    const mainMatch = article.id.match(/https:\/\/slickdeals.net\/f\/\d+/);
    const idMatch = mainMatch[0].match(/\d{8,}/);
    article.id = feed.id + '-' + idMatch[0];

    const content = $(feedElement).find('content\\:encoded').text();
    const $content = cheerio.load(content);

    const thumbnail = $content('img').first().attr('src');
    if (thumbnail) {
        article.thumbnail = thumbnail;
    }

    const divElements = $content('div');
    for (let i = 0; i < divElements.length; i++) {
        const thumbScoreText = $(divElements[i]).text();

        if (thumbScoreText.includes('Thumb Score')) {
            const thumbScoreMatch = thumbScoreText.match(/[+-]\d+/);
            if (thumbScoreMatch) {
                article.score = thumbScoreMatch[0].replace('+', '');
                break;
            }
        }
    }

    const anchorElements = $content('a');
    for (let i = 0; i < anchorElements.length; i++) {
        const storeId = $(anchorElements[i]).attr('data-store-id');
        if (storeId) {
            const externalSource = $(anchorElements[i]).attr('data-product-exitwebsite');
            if (externalSource) {
                article.external_source = externalSource;
                break;
            }
        }
    }
}

/**
 * Sets custom properties and values for OzBargain.
 * @param {Object} feed The feed to retrieve.
 * @param {Object} article The current article to set.
 * @param {Object} feedElement The feed element being parsed.
 * @param {Object} $ Cheerio object.
 */
function parseOzBargainCustom(feed, article, feedElement, $) {
    const idMatch = article.id.match(/\d{6,}/);
    article.id = feed.id + '-' + idMatch[0];

    const thumbnail = $(feedElement).find('media\\:thumbnail').attr('url');
    if (thumbnail) {
        article.thumbnail = thumbnail;
    }

    const metaElement = $(feedElement).find('ozb\\:meta');
    const upvotes = $(metaElement).attr('votes-pos');
    const downvotes = $(metaElement).attr('votes-neg');
    const url = $(metaElement).attr('url');

    if (upvotes && downvotes) {
        article.score = parseInt(upvotes) - parseInt(downvotes);
    }

    if (url) {
        const urlObject = new URL(url);
        article.external_source = urlObject.hostname.replace('www.', '');
    }
}

/**
 * Go through the articles and update DB if new.
 * @param {string} feed The originating feed.
 * @param {Array} dbArticles An array of the articles in the DB.
 * @param {Array} articles The articles parsed.
 * @param {Array} newArticles An array of the new articles being parsed.
 * @param {Array} updateArticles An array of the articles to be update being parsed.
 */
async function saveDB(feed, dbArticles, articles, newArticles, updateArticles) {
    for (const article of articles) {
        try {
            if (article.source === feed.id) {
                const dbArticle = dbArticles.find((dbArticle) => dbArticle.id === article.id);

                if (!dbArticle) {
                    functions.logger.log('New article: ' + article.id);
                    await db.collection(RSS_ARTICLES_DB_COLLECTION).doc(article.id).set(article);
                    dbArticles.push(article);
                    newArticles.push(article);
                } else if (updateArticles.length < 10) {
                    // Deal was found so check if we should update it.
                    let shouldUpdate = dbArticle.title != article.title || dbArticle.link != article.link || dbArticle.thumbnail != article.thumbnail ||
                        dbArticle.external_source != article.external_source;

                    if (!shouldUpdate && article.score) {
                        const difference = Math.abs(dbArticle.score - article.score);
                        if (article.score >= 200 || article.score <= -200) {
                            shouldUpdate = difference >= 50;
                        } else if (article.score >= 100 || article.score <= -100) {
                            shouldUpdate = difference >= 20;
                        } else if (article.score >= 20 || article.score <= -20) {
                            shouldUpdate = difference >= 10;
                        } else if (article.score >= 10 || article.score <= -10) {
                            shouldUpdate = difference >= 5;
                        } else if (article.score > 2 || article.score < -2) {
                            shouldUpdate = difference >= 3;
                        } else {
                            shouldUpdate = difference >= 2;
                        }
                    }

                    if (shouldUpdate) {
                        dbArticle.title = article.title;
                        dbArticle.link = article.link;
                        dbArticle.thumbnail = article.thumbnail;
                        dbArticle.external_source = article.external_source;
                        dbArticle.score = article.score;
                        await db.collection(RSS_ARTICLES_DB_COLLECTION).doc(dbArticle.id).set(dbArticle);
                        updateArticles.push(dbArticle);
                        functions.logger.log('Updated article: ' + article.id);
                    }
                }
            }
        } catch (error) {
            functions.logger.error('Saving article ' + article.id + ' failed', error);
        }
    }

    const twoDaysAgo = getDaysAgo(2);
    for (let i = dbArticles.length - 1; i >= 0; i--) {
        try {
            const dbArticle = dbArticles[i];
            if (dbArticle.source === feed.id) {
                const foundArticle = articles.find((article) => article.id === dbArticle.id);

                if (!foundArticle && dbArticle.posted_date < twoDaysAgo) {
                    // Delete from DB if over two days old and remove from array.
                    await db.collection(RSS_ARTICLES_DB_COLLECTION).doc(dbArticle.id).delete();
                    dbArticles.splice(i, 1);
                    functions.logger.info('Article ' + dbArticle.id + ' removed from DB');
                }
            }
        } catch (error) {
            functions.logger.error('Error removing article ' + dbArticles[i].id, error);
        }
    }
}

/**
 * Sends notifications for the new articles.
 * @param {Array} newArticles An array of the new articles being parsed.
 * @param {Array} updateArticles An array of the articles to be update being parsed.
 */
async function sendNotifications(newArticles, updateArticles) {
    if (newArticles.length > 0 || updateArticles.length > 0) {
        let discordAvailable = false;

        try {
            if (discordClient.isReady()) {
                functions.logger.log('Discord - Already logged in');
                discordAvailable = true;
            } else {
                // Wait for the client to be ready.
                await new Promise((resolve, reject) => {
                    // Register Discord events before logging in.
                    discordClient.once(Events.Error, reject);
                    discordClient.once(Events.ClientReady, (c) => {
                        functions.logger.log('Discord - Logged in as ' + c.user.tag);
                        discordAvailable = true;
                        resolve();
                    });

                    // Login to Discord with token.
                    functions.logger.log('Discord - Logging in');
                    discordClient.login(`${process.env.DISCORD_BOT_TOKEN}`);
                });
            }
        } catch (error) {
            functions.logger.error('Discord - Error logging in', error);
        }

        if (discordAvailable) {
            for (let i = newArticles.length - 1; i >= 0; i--) {
                try {
                    await sendNewToDiscord(newArticles[i]);

                    // Wait a bit after each call for rate limit prevention.
                    await setTimeout(1000);
                } catch (error) {
                    functions.logger.error('Error sending new notification for ' + newArticles[i].id, error);
                }
            }

            // Send out the updated notifications. Use Promise.all and let Discord.js handle rate limits with the updates.
            const promises = [];
            for (const updateArticle of updateArticles) {
                promises.push(sendUpdateToDiscord(updateArticle));
            }
            await Promise.all(promises);
        }
    }
}

/**
 * Sends the new article to Discord using the API.
 * @param {Object} article The article to send.
 */
async function sendNewToDiscord(article) {
    try {
        functions.logger.log('Discord - Sending ' + article.id);

        const embed = createEmbed(article);
        const channelId = getDiscordChannelId(article.source);
        const channel = discordClient.channels.cache.get(channelId);

        const message = await channel.send({ embeds: [embed] });
        article.discord_message_id = message.id;
        await db.collection(RSS_ARTICLES_DB_COLLECTION).doc(article.id).set({ discord_message_id: article.discord_message_id }, { merge: true });

        functions.logger.log('Discord - ' + article.id + ' has been sent');
    } catch (error) {
        functions.logger.error('Discord - Error sending ' + article.id, error);
    }
}

/**
 * Updates the article message in Discord using the API.
 * @param {Object} article The article to update.
 */
async function sendUpdateToDiscord(article) {
    try {
        if (article.discord_message_id) {
            functions.logger.log('Discord - Updating ' + article.id);

            const embed = createEmbed(article);
            const channelId = getDiscordChannelId(article.source);
            const channel = discordClient.channels.cache.get(channelId);

            let message = await channel.messages.fetch(article.discord_message_id);
            if (message) {
                message = await message.edit({ embeds: [embed] });
                functions.logger.log('Discord - ' + article.id + ' has been updated');
            } else {
                functions.logger.warn('Discord - ' + article.id + ' was not found');
            }
        } else {
            functions.logger.warn('Discord - ' + article.id + ' does not have a message id');
        }
    } catch (error) {
        functions.logger.error('Discord - Error sending ' + article.id, error);
    }
}

/**
 * Creates the embed to send to Discord.
 * @param {string} article The article to build the embed for.
 * @return {EmbedBuilder} The embed to send to Discord.
 */
function createEmbed(article) {
    const embed = new EmbedBuilder()
        .setTitle(article.title)
        .setURL(article.link)
        .setColor(2829617);

    if (article.thumbnail) {
        embed.setThumbnail(article.thumbnail);
    }

    try {
        let scoreFormat = null;
        if (article.score != null && article.score >= 0) {
            scoreFormat = '+' + article.score;
        }

        if (article.score != null && article.external_source) {
            embed.setDescription(util.format('%s score · %s', scoreFormat, article.external_source));
        } else if (article.score) {
            embed.setDescription(util.format('%s score', scoreFormat));
        } else if (article.external_source) {
            embed.setDescription(article.external_source);
        }
    } catch (error) {
        functions.logger.error('Error setting description for ' + article.id, error);
    }

    return embed;
}

/**
 * Gets the Discord channel id based on the source.
 * @param {string} source The source of the article.
 * @return {string} A Discord channel id.
 */
function getDiscordChannelId(source) {
    let channelId = null;

    _dbFeeds.forEach((feed) => {
        if (feed.id === source) {
            channelId = feed.channel_id;
        }
    });

    if (!channelId) {
        throw new Error('Source of "' + source + '" is unhandled');
    } else {
        return channelId;
    }
}

/**
 * Gets a date x number of days ago.
 * @param {int} i The number of days.
 * @return {Date} Returns a date based on the number of days supplied.
 */
function getDaysAgo(i) {
    return new Date(Date.now() - (i * 24 * 60 * 60 * 1000));
}
