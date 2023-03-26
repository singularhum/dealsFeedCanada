const BAPCSALESCANADA = 'bapcsalescanada';
const GAMEDEALS = 'gamedeals';
const REDFLAGDEALS = 'redflagdeals';
const VIDEOGAMEDEALSCANADA = 'videogamedealscanada';
const DB_DEALS_COLLECTION = 'deals';
const EXPIRED_STATE = 'Expired';
const SOLD_OUT_STATE = 'Sold Out';
const UNTRACKED_STATE = 'Untracked';
const functions = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { setTimeout } = require('timers/promises');
const { Client, Events, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const util = require('util');

// Initialize firebase
initializeApp();

// Globals that should persist until the instance is restarted which is done randomly by Google.
const db = getFirestore();
let dbDeals;
const discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });

/**
 * Parses deals from sources and send notifications (currently only for Discord through a bot).
 * This function is scheduled to run every 10 minutes and has a timeout of 40 seconds.
 * A max of 1 instance is set since it is a scheduled job and to prevent desync of globals if there are multiple instances.
 */
exports.parseThemDeals = functions.runWith({ maxInstances: 1, timeoutSeconds: 40 }).pubsub.schedule('every 10 minutes').onRun(async (context) => {
    functions.logger.info('Scheduled Job Start');

    // Retrieve all deals from the DB to be able to determine what will be new or updated.
    // This is lazy loaded to prevent high DB read hits (each document counts as a read).
    if (!dbDeals) dbDeals = await fetchDbDeals();

    const deals = [];
    const newDeals = [];
    const newlyHotDeals = [];
    const updatedDeals = [];

    // Go get those deals sir!
    deals.push(...await parseRedFlagDeals());
    deals.push(...await parseSubreddit(BAPCSALESCANADA));
    deals.push(...await parseSubreddit(GAMEDEALS));
    deals.push(...await parseSubreddit(VIDEOGAMEDEALSCANADA));

    await cleanDB(deals, updatedDeals);
    await saveDeals(deals, newDeals, newlyHotDeals, updatedDeals);
    await sendNotifications(newDeals, newlyHotDeals, updatedDeals);

    functions.logger.log('Scheduled Job Completed');

    return null;
});

/**
 * Fetch the deals in the database.
 * @return {Array} An array of the deals from the database.
 */
async function fetchDbDeals() {
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
}

/**
 * For parsing the Hot Deals forum on RedFlagDeals.
 * @return {Array} An array of the deals parsed.
 */
async function parseRedFlagDeals() {
    functions.logger.log('Parsing RedFlagDeals');
    const deals = [];

    try {
        const twoHoursAgo = getHoursAgo(2);

        // Use forum 9 (hot deals) with the date sorted descending. 30 per page is the max (sometimes less with stickied sponsored posts).
        const response = await fetch(`${process.env.RFD_API_URL}`, {
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
                deal.source = REDFLAGDEALS;
                deal.title = dealJson.title;

                if (dealJson.offer && dealJson.offer.dealer_name) {
                    // Retailer is not part of the title so we must add it in.
                    deal.title = '[' + dealJson.offer.dealer_name + '] ' + deal.title;
                }

                if (dealJson.votes) {
                    deal.score = parseInt(dealJson.votes.total_up) - parseInt(dealJson.votes.total_down);
                } else {
                    deal.score = 0;
                }

                if (dealJson.status === 2) {
                    deal.tag = EXPIRED_STATE;
                } else {
                    deal.tag = null;
                }

                deal.is_hot = deal.created > twoHoursAgo && deal.score >= 20;
                deal.num_comments = dealJson.total_replies;

                deals.push(deal);
            });
        } else {
            functions.logger.error('Parsing RedFlagDeals failed', response);
        }
    } catch (e) {
        functions.logger.error('Parsing RedFlagDeals failed', e);
    }

    return deals;
}

/**
 * Parse supplied subreddit.
 * @param {string} subredditName The name of the subreddit to parse.
 * @return {Array} An array of the deals parsed.
 */
async function parseSubreddit(subredditName) {
    functions.logger.log('Parsing ' + subredditName);
    const deals = [];

    try {
        const twoHoursAgo = getHoursAgo(2);

        // Uses .json in the path to return json and is sorted by new.
        const response = await fetch(util.format(`${process.env.SUBREDDIT_API_URL}`, subredditName), {
            method: 'get',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const dealsJson = await response.json();

            dealsJson.data.children.forEach((dealJson) => {
                const deal = {};

                // Get the tag/flair that can come from different properties.
                if (dealJson.data.link_flair_richtext && dealJson.data.link_flair_richtext.length >= 1) {
                    deal.tag = dealJson.data.link_flair_richtext[0].t;
                } else if (dealJson.data.link_flair_css_class) {
                    deal.tag = dealJson.data.link_flair_css_class;
                } else {
                    deal.tag = null;
                }

                // The CSS flair can be lower case so replace it with our constant.
                if (deal.tag === 'expired') {
                    deal.tag = EXPIRED_STATE;
                }

                // reddit returns the date in unix epoch in seconds so multiple by 1000 for milliseconds.
                deal.created = new Date(dealJson.data.created_utc * 1000);

                // Exclude certain posts.
                if (deal.tag !== 'Question' && deal.tag !== 'WeeklyDiscussion' && deal.tag !== 'Review') {
                    deal.id = dealJson.data.id;
                    deal.source = subredditName;
                    deal.title = dealJson.data.title;
                    deal.score = parseInt(dealJson.data.score);
                    deal.num_comments = parseInt(dealJson.data.num_comments);
                    deal.is_hot = false;
                    if (subredditName == BAPCSALESCANADA) {
                        deal.is_hot = deal.created > twoHoursAgo && deal.score >= 20;
                    } else if (subredditName == GAMEDEALS) {
                        deal.is_hot = deal.created > twoHoursAgo && deal.score >= 100;
                    } else if (subredditName == VIDEOGAMEDEALSCANADA) {
                        deal.is_hot = deal.created > twoHoursAgo && deal.score >= 20;
                    }

                    deals.push(deal);
                }
            });
        } else {
            functions.logger.error('Parsing Subreddit ' + subredditName + ' failed', response);
        }
    } catch (e) {
        functions.logger.error('Parsing Subreddit ' + subredditName + ' failed', e);
    }

    return deals;
}

/**
 * Remove deals older than 2 days that are not in the current parsed deals.
 * This is done to reduce the DB read costs in loading dbDeals.
 * @param {Array} deals The current parsed deals.
 * @param {Array} notificationUpdatedDeals The array to add the updated deals to.
 */
async function cleanDB(deals, notificationUpdatedDeals) {
    functions.logger.info('Cleaning DB');
    const twoDaysAgo = getDaysAgo(2);

    // Loop is done backwards since we are removing deals from the array.
    for (let i = dbDeals.length - 1; i >= 0; i--) {
        try {
            const dbDeal = dbDeals[i];
            const foundDeal = deals.find((deal) => deal.id === dbDeal.id);

            // This dbDeal is not in the current deals list so remove/update it.
            // Also makes there is a least one with the same source (can be empty if parsing failed).
            if (!foundDeal && deals.find((deal) => deal.source === dbDeal.source)) {
                if (dbDeal.created < twoDaysAgo) {
                    // This deal is older than two days so delete it.
                    await db.collection(DB_DEALS_COLLECTION).doc(dbDeal.id).delete();
                    dbDeals.splice(i, 1);
                    functions.logger.info('Deal ' + dbDeal.id + ' successfully deleted');

                    // Also send update notification that it is no longer tracked.
                    dbDeal.tag = UNTRACKED_STATE;
                    notificationUpdatedDeals.push(dbDeal);
                } else if (dbDeal.tag !== UNTRACKED_STATE) {
                    // Most likely the deal was deleted or could be in the next page.
                    dbDeal.date = Timestamp.fromDate(new Date());
                    dbDeal.tag = UNTRACKED_STATE;
                    await db.collection(DB_DEALS_COLLECTION).doc(dbDeal.id).set(dbDeal);
                    notificationUpdatedDeals.push(dbDeal);
                    functions.logger.log('Recent deal ' + dbDeal.id + ' was removed or is in another page so it has been updated');
                }
            }
        } catch (error) {
            functions.logger.error('Error removing deal ' + dbDeals[i].id, error);
        }
    }
}

/**
 * Go through the deals and save them to the DB depending on if they are new or updated.
 * @param {Array} deals The deals parsed.
 * @param {Array} newDeals An array to add the new deals to.
 * @param {Array} newlyHotDeals An array to add the newly hot deals to.
 * @param {Array} updatedDeals An array to add updated deals.
 */
async function saveDeals(deals, newDeals, newlyHotDeals, updatedDeals) {
    for (const deal of deals) {
        try {
            const dbDeal = dbDeals.find((dbDeal) => dbDeal.id === deal.id);

            if (dbDeal) {
                // Deal was found so check if we should update it.
                const shouldUpdate = shouldUpdateDeal(dbDeal, deal);
                if (shouldUpdate) {
                    if (!dbDeal.is_hot && deal.is_hot) {
                        // Existing deal has turned hot.
                        newlyHotDeals.push(dbDeal);
                        functions.logger.log('Previous deal is now hot: ' + dbDeal.id);
                    }

                    // Update fields that can change and save to db.
                    dbDeal.title = deal.title;
                    dbDeal.tag = deal.tag;
                    dbDeal.num_comments = deal.num_comments;
                    dbDeal.is_hot = deal.is_hot;
                    dbDeal.date = Timestamp.fromDate(new Date());

                    // When RFD deal is expired/moved, the score is returned as 0 so ignore that.
                    if (dbDeal.source !== REDFLAGDEALS || dbDeal.tag !== EXPIRED_STATE) {
                        dbDeal.score = deal.score;
                    }

                    await db.collection(DB_DEALS_COLLECTION).doc(dbDeal.id).set(dbDeal);
                    updatedDeals.push(dbDeal);
                } else if (!dbDeal.is_hot && deal.is_hot) {
                    // If there isn't anything to update but has turned hot, still update.
                    functions.logger.log('Previous deal is now hot: ' + dbDeal.id);
                    await db.collection(DB_DEALS_COLLECTION).doc(dbDeal.id).set(dbDeal);
                    newlyHotDeals.push(dbDeal);
                }
            } else {
                // Sometimes deals will come back in the list when deals are removed/deleted
                // so ignore them if they are over an hour older.
                const oneHourAgo = getHoursAgo(1);
                if (deal.created > oneHourAgo) {
                    functions.logger.log('New deal: ' + deal.id);

                    deal.date = Timestamp.fromDate(new Date());
                    await db.collection(DB_DEALS_COLLECTION).doc(deal.id).set(deal);

                    dbDeals.push(deal);
                    newDeals.push(deal);
                }
            }
        } catch (error) {
            functions.logger.error('Saving deal ' + deal.id + ' failed', error);
        }
    }
}

/**
 * Reduce the update calls to the DB and update notifications by checking certain conditions.
 * @param {Array} dbDeal The deal from the DB.
 * @param {Array} deal The current deal parsed.
 * @return {boolean} Whether the deal should be updated or not.
 */
function shouldUpdateDeal(dbDeal, deal) {
    let shouldUpdate = false;

    if (deal.title !== dbDeal.title || deal.tag != dbDeal.tag) {
        // Always update when title and/or tag changes.
        shouldUpdate = true;
        functions.logger.log('Previous deal update to title/tag: ' + dbDeal.id);
    } else {
        if (deal.score !== dbDeal.score) {
            const difference = Math.abs(dbDeal.score - deal.score);
            shouldUpdate = shouldUpdateScoreComment(difference, deal.score);
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
 * @param {Array} difference The difference of the score/comment.
 * @param {Array} num The score or number of comments.
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
        shouldUpdate = true;
    }

    return shouldUpdate;
}

/**
 * Sends notifications for new, hot and updated deals. Currently is only for Discord.
 * @param {Object} newDeals An array with all the new deals.
 * @param {Object} newlyHotDeals An array with all the newly hot deals.
 * @param {Object} updatedDeals An array with all the updated deals.
 */
async function sendNotifications(newDeals, newlyHotDeals, updatedDeals) {
    if (newDeals.length > 0 || newlyHotDeals.length > 0 || updatedDeals.length > 0) {
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

        // Send the new and hot deals in sequential order, and do the updates in any order.
        if (discordAvailable) {
            // Send out the new notifications first (go backwards as the deals were sorted new from top to bottom).
            for (let i = newDeals.length - 1; i >= 0; i--) {
                try {
                    const newDeal = newDeals[i];
                    await sendToDiscord(newDeal, true, false);

                    // If deal is both new and hot, also send to hot channel.
                    if (newDeal.is_hot) await sendToDiscord(newDeal, false, true);

                    await setTimeout(300); // Wait a bit after each call for rate limit prevention.
                } catch (error) {
                    functions.logger.error('Error sending new notification for ' + newDeals[i].id, error);
                }
            }

            // Send out the newly hot notifications.
            for (let i = newlyHotDeals.length - 1; i >= 0; i--) {
                try {
                    await sendToDiscord(newlyHotDeals[i], false, true);
                    await setTimeout(300);
                } catch (error) {
                    functions.logger.error('Error sending newly hot notification for ' + newlyHotDeals[i].id, error);
                }
            }

            // Send out the updated notifications. Use Promise.all and let Discord.js handle rate limits with the updates.
            const promises = [];
            for (let i = updatedDeals.length - 1; i >= 0; i--) {
                promises.push(sendToDiscord(updatedDeals[i], false, false));
            }
            await Promise.all(promises);
        }
    }
}

/**
 * Sends the deal to Discord to a specific channel based on the source and state.
 * @param {Object} deal The deal to send.
 * @param {Object} isNew Whether the deal is new or not.
 * @param {Object} sendToHot Whether to send to the Hot channels or not.
 */
async function sendToDiscord(deal, isNew, sendToHot) {
    try {
        let channelId;
        if (sendToHot) {
            if (deal.source === BAPCSALESCANADA) {
                channelId = `${process.env.DISCORD_CHANNEL_HOT_BAPCSALESCANADA}`;
            } else if (deal.source === GAMEDEALS) {
                channelId = `${process.env.DISCORD_CHANNEL_HOT_GAMEDEALS}`;
            } else if (deal.source === REDFLAGDEALS) {
                channelId = `${process.env.DISCORD_CHANNEL_HOT_REDFLAGDEALS}`;
            } else if (deal.source === VIDEOGAMEDEALSCANADA) {
                channelId = `${process.env.DISCORD_CHANNEL_HOT_VIDEOGAMEDEALSCANADA}`;
            } else {
                throw new Error('Source of "' + deal.source + '" is unhandled');
            }
        } else {
            if (deal.source === BAPCSALESCANADA) {
                channelId = `${process.env.DISCORD_CHANNEL_BAPCSALESCANADA}`;
            } else if (deal.source === GAMEDEALS) {
                channelId = `${process.env.DISCORD_CHANNEL_GAMEDEALS}`;
            } else if (deal.source === REDFLAGDEALS) {
                channelId = `${process.env.DISCORD_CHANNEL_REDFLAGDEALS}`;
            } else if (deal.source === VIDEOGAMEDEALSCANADA) {
                channelId = `${process.env.DISCORD_CHANNEL_VIDEOGAMEDEALSCANADA}`;
            } else {
                throw new Error('Source of "' + deal.source + '" is unhandled');
            }
        }

        await sendDiscordApi(deal, channelId, isNew, sendToHot);
    } catch (error) {
        functions.logger.error('Discord - Error sending ' + deal.id, error);
    }
}

/**
 * Sends the deal to Discord with the supplied channel using the API.
 * @param {Object} deal The deal to send.
 * @param {string} channelId The id of the channel to use.
 * @param {string} isNew Whether to send as new or update existing message.
 * @param {Object} sendToHot Whether to send to the Hot channels or not.
 */
async function sendDiscordApi(deal, channelId, isNew, sendToHot) {
    functions.logger.log('Discord - Sending ' + deal.id + ' to ' + channelId);

    try {
        const link = buildLink(deal);

        // Embed title has a limit of 256 so trim it if it exceeds.
        let title = trimString(deal.title, 250);
        if (deal.is_hot) title = '🔥 ' + deal.title;
        if (deal.tag === EXPIRED_STATE || deal.tag === SOLD_OUT_STATE) {
            // Strike out the title text
            title = '~~' + title + '~~';
        }

        let score = deal.score;
        if (score >= 0) {
            score = '+' + score;
        }

        let numComments = deal.num_comments;
        if (numComments === 1) {
            numComments = numComments + ' comment';
        } else {
            numComments = numComments + ' comments';
        }

        let tag = deal.tag;
        if (tag) {
            tag = ' | ' + tag;
        } else {
            tag = '';
        }

        // Use the embed to have the deal title be hyperlinked (cannot be done in content field).
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setURL(link)
            .setFooter({ text: util.format('%s score | %s%s', score, numComments, tag) })
            .setColor(2303786);

        const channel = discordClient.channels.cache.get(channelId);

        if (isNew) {
            const message = await channel.send({ embeds: [embed] });
            deal.discord_message_id = message.id;
            functions.logger.log('Discord - ' + deal.id + ' has been sent to ' + channelId);
            await db.collection(DB_DEALS_COLLECTION).doc(deal.id).set({ discord_message_id: deal.discord_message_id }, { merge: true });
        } else if (sendToHot) {
            const message = await channel.send({ embeds: [embed] });
            deal.discord_hot_message_id = message.id;
            functions.logger.log('Discord - ' + deal.id + ' has been sent to ' + channelId);
            await db.collection(DB_DEALS_COLLECTION).doc(deal.id).set({ discord_hot_message_id: deal.discord_message_id }, { merge: true });
        } else if (deal.discord_message_id) {
            await sendDiscordUpdate(deal.id, channel, deal.discord_message_id, embed);

            // Also update the message in the hot channel if it exists.
            if (deal.discord_hot_message_id) {
                await sendDiscordUpdate(deal.id, channel, deal.discord_hot_message_id, embed);
            }
        }
    } catch (error) {
        functions.logger.error('Discord - Error sending/updating ' + deal.id + ' to ' + channelId, error);
    }
}

/**
 * Sends an update to Discord to edit a previous message.
 * @param {Object} dealId The id of the deal.
 * @param {string} channel The channel to use.
 * @param {string} messageId The id of the message.
 * @param {string} embed The embed to edit the message with.
 */
async function sendDiscordUpdate(dealId, channel, messageId, embed) {
    let message = await channel.messages.fetch(messageId);

    if (message) {
        message = await message.edit({ embeds: [embed] });
        functions.logger.log('Discord - ' + dealId + ' has been updated in ' + channel.id);
    } else {
        functions.logger.warn('Discord - ' + dealId + ' was not found in ' + channel.id);
    }
}

/**
 * Builds a link based on the source and the id of the deal.
 * @param {Object} deal The deal to build the link from.
 * @return {string} A full URL for the deal.
 */
function buildLink(deal) {
    let link = '';

    if (deal.source === REDFLAGDEALS) {
        link = util.format(`${process.env.RFD_DEAL_URL}`, deal.id);
    } else if (deal.source === BAPCSALESCANADA || deal.source === GAMEDEALS || deal.source === VIDEOGAMEDEALSCANADA) {
        link = util.format(`${process.env.SUBREDDIT_DEAL_URL}`, deal.source, deal.id);
    } else {
        throw new Error('Source of "' + deal.source + '" is unhandled');
    }

    return link;
}

/**
 * Gets a date x number of days ago.
 * @param {int} i The number of days.
 * @return {Date} Returns a date based on the number of days supplied.
 */
function getDaysAgo(i) {
    return new Date(Date.now() - (i * 24 * 60 * 60 * 1000));
}

/**
 * Gets a date x number of hours ago.
 * @param {int} i The number of hours.
 * @return {Date} Returns a date based on the number of hours supplied.
 */
function getHoursAgo(i) {
    return new Date(Date.now() - (i * 60 * 60 * 1000));
}

/**
 * Trims a string if it exceeds the length and adds ellipsis.
 * @param {string} text The text to trim.
 * @param {int} length The max length.
 * @return {string} Returns a string that is trimmed if it exceeds the length.
 */
function trimString(text, length) {
    return text.length > length ? text.substring(0, length - 3) + '...' : text;
}
