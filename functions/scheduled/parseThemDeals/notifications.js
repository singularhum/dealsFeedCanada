const functions = require('firebase-functions');
const { Client, Events, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { setTimeout } = require('timers/promises');
const util = require('util');
const constants = require('./constants');
const database = require('./database');
const reddit = require('./feeds/reddit');
const redflagdeals = require('./feeds/redflagdeals');
const helpers = require('./helpers');

const discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });

/**
 * Sends notifications for new, hot and updated deals. Currently is only for Discord.
 * @param {Array} newDeals An array with all the new deals.
 * @param {Array} newlyHotDeals An array with all the newly hot deals.
 * @param {Array} updatedDeals An array with all the updated deals.
 * @param {Array} dbAlerts An array of alerts in the database.
 */
module.exports.send = async function(newDeals, newlyHotDeals, updatedDeals, dbAlerts) {
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
            for (const updatedDeal of updatedDeals) {
                promises.push(sendToDiscord(updatedDeal, false, false));
            }
            await Promise.all(promises);

            // Send out any alerts.
            for (let i = newDeals.length - 1; i >= 0; i--) {
                try {
                    const newDeal = newDeals[i];
                    await sendDiscordAlert(newDeal, dbAlerts);
                } catch (error) {
                    functions.logger.error('Error sending alert notification for ' + newDeals[i].id, error);
                }
            }
        }
    }
};

/**
 * Sends the deal to Discord to a specific channel based on the source and state.
 * @param {Object} deal The deal to send.
 * @param {boolean} isNew Whether the deal is new or not.
 * @param {boolean} sendToHot Whether to send to the Hot channels or not.
 */
async function sendToDiscord(deal, isNew, sendToHot) {
    try {
        let allChannelId;
        let hotChannelId;

        if (deal.source === reddit.IDs.BAPCSALESCANADA) {
            allChannelId = `${process.env.DISCORD_CHANNEL_BAPCSALESCANADA}`;
            hotChannelId = `${process.env.DISCORD_CHANNEL_HOT_BAPCSALESCANADA}`;
        } else if (deal.source === reddit.IDs.GAMEDEALS) {
            allChannelId = `${process.env.DISCORD_CHANNEL_GAMEDEALS}`;
            hotChannelId = `${process.env.DISCORD_CHANNEL_HOT_GAMEDEALS}`;
        } else if (deal.source === reddit.IDs.REDFLAGDEALS) {
            allChannelId = `${process.env.DISCORD_CHANNEL_REDFLAGDEALS}`;
            hotChannelId = `${process.env.DISCORD_CHANNEL_HOT_REDFLAGDEALS}`;
        } else if (deal.source === reddit.IDs.VIDEOGAMEDEALSCANADA) {
            allChannelId = `${process.env.DISCORD_CHANNEL_VIDEOGAMEDEALSCANADA}`;
            hotChannelId = `${process.env.DISCORD_CHANNEL_HOT_VIDEOGAMEDEALSCANADA}`;
        } else {
            throw new Error('Source of "' + deal.source + '" is unhandled');
        }

        await sendDiscordApi(deal, allChannelId, hotChannelId, isNew, sendToHot);
    } catch (error) {
        functions.logger.error('Discord - Error sending ' + deal.id, error);
    }
}

/**
 * Sends the deal to Discord with the supplied channel using the API.
 * @param {Object} deal The deal to send.
 * @param {string} allChannelId The id of the All channel to use.
 * @param {string} hotChannelId The id of the Hot channel to use.
 * @param {boolean} isNew Whether to send as new or update existing message.
 * @param {boolean} sendToHot Whether to send to the Hot channels or not.
 */
async function sendDiscordApi(deal, allChannelId, hotChannelId, isNew, sendToHot) {
    try {
        const link = buildLink(deal);

        // Embed title has a limit of 256 so trim it if it exceeds.
        let title = helpers.trimString(deal.title, 250);
        if (deal.is_hot) title = '🔥 ' + title;
        if (deal.tag === constants.EXPIRED_STATE || deal.tag === constants.SOLD_OUT_STATE ||
            deal.tag === constants.DELETED_STATE || deal.tag === constants.MOVED_STATE) {
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
            tag = '  ·  ' + tag;
        } else {
            tag = '';
        }

        // Use the embed to have the deal title be hyperlinked (cannot be done in content field).
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setURL(link)
            .setFooter({ text: util.format('%s score  ·  %s%s', score, numComments, tag) })
            .setColor(2829617);

        const allChannel = discordClient.channels.cache.get(allChannelId);
        const hotChannel = discordClient.channels.cache.get(hotChannelId);

        if (isNew) {
            functions.logger.log('Discord - Sending ' + deal.id + ' to ' + allChannelId);

            const message = await allChannel.send({ embeds: [embed] });
            deal.discord_message_id = message.id;
            await database.setDeal(deal.id, { discord_message_id: deal.discord_message_id }, true);

            functions.logger.log('Discord - ' + deal.id + ' has been sent to ' + allChannelId);
        } else if (sendToHot) {
            functions.logger.log('Discord - Sending ' + deal.id + ' to ' + hotChannelId);

            const message = await hotChannel.send({ embeds: [embed] });
            deal.discord_hot_message_id = message.id;
            await database.setDeal(deal.id, { discord_hot_message_id: deal.discord_hot_message_id }, true);

            functions.logger.log('Discord - ' + deal.id + ' has been sent to ' + hotChannelId);
        } else if (deal.discord_message_id) {
            functions.logger.log('Discord - Sending ' + deal.id + ' to ' + allChannelId);
            await sendDiscordUpdate(deal.id, allChannel, deal.discord_message_id, embed);

            // Also update the message in the hot channel if it exists.
            if (deal.discord_hot_message_id) {
                await sendDiscordUpdate(deal.id, hotChannel, deal.discord_hot_message_id, embed);
            }
        }
    } catch (error) {
        functions.logger.error('Discord - Error sending/updating ' + deal.id + ' to ' + allChannelId + ' or ' + hotChannelId, error);
    }
}

/**
 * Sends an update to Discord to edit a previous message.
 * @param {string} dealId The id of the deal.
 * @param {Channel} channel The channel to use.
 * @param {string} messageId The id of the message.
 * @param {Object} embed The embed to edit the message with.
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
 * Sends an alert for any matching keywords for the supplied deal.
 * @param {Object} newDeal The deal to check alerts against.
 * @param {Array} dbAlerts The array of alerts from the database.
 */
async function sendDiscordAlert(newDeal, dbAlerts) {
    try {
        const matchingRoleIds = [];

        dbAlerts.forEach((alert) => {
            if (newDeal.source === alert.source) {
                const regex = new RegExp(alert.keyword, 'i');
                if (regex.test(newDeal.title)) {
                    matchingRoleIds.push(alert.role_id);
                }
            }
        });

        if (matchingRoleIds.length > 0) {
            let pingRolesText = '';
            matchingRoleIds.forEach((matchingRoleId) => {
                pingRolesText = pingRolesText + ' <@&' + matchingRoleId + '>';
            });

            const title = helpers.trimString(newDeal.title, 250);
            const link = buildLink(newDeal);
            const messageLink = buildMessageLink(newDeal);
            const content = pingRolesText.trim() + '\n' + title;
            const embedDescription = link + '\n\n' + messageLink;

            const embed = new EmbedBuilder()
                .setDescription(embedDescription)
                .setColor(2829617);

            const channel = discordClient.channels.cache.get(`${process.env.DISCORD_CHANNEL_DEAL_ALERTS}`);
            functions.logger.log('Discord - Sending alert for ' + newDeal.id + ' to ' + channel.id);

            await channel.send({ content: content, embeds: [embed] });
            await setTimeout(300); // Wait a bit after each call for rate limit prevention.
        }
    } catch (error) {
        functions.logger.error('Discord - Error sending alert for ' + newDeal.id, error);
    }
}

/**
 * Builds the message link based on the supplied deal.
 * @param {Object} deal The deal to build the message link.
 * @return {string} A URL message link.
 */
function buildMessageLink(deal) {
    const baseUrl = 'https://discord.com/channels/%s/%s/%s';
    const serverId = `${process.env.DISCORD_SERVER_ID}`;
    let channelId;

    if (deal.source === reddit.IDs.BAPCSALESCANADA) {
        channelId = `${process.env.DISCORD_CHANNEL_BAPCSALESCANADA}`;
    } else if (deal.source === reddit.IDs.GAMEDEALS) {
        channelId = `${process.env.DISCORD_CHANNEL_GAMEDEALS}`;
    } else if (deal.source === redflagdeals.ID) {
        channelId = `${process.env.DISCORD_CHANNEL_REDFLAGDEALS}`;
    } else if (deal.source === reddit.IDs.VIDEOGAMEDEALSCANADA) {
        channelId = `${process.env.DISCORD_CHANNEL_VIDEOGAMEDEALSCANADA}`;
    } else {
        throw new Error('Source of "' + deal.source + '" is unhandled');
    }

    return util.format(baseUrl, serverId, channelId, deal.discord_message_id);
}

/**
 * Builds a link based on the source and the id of the deal.
 * @param {Object} deal The deal to build the link from.
 * @return {string} A full URL for the deal.
 */
function buildLink(deal) {
    let link = '';

    if (deal.source === redflagdeals.ID) {
        link = util.format(`${process.env.RFD_DEAL_URL}`, deal.id);
    } else if (deal.source === reddit.IDs.BAPCSALESCANADA || deal.source === reddit.IDs.GAMEDEALS || deal.source === reddit.IDs.VIDEOGAMEDEALSCANADA) {
        link = util.format(`${process.env.SUBREDDIT_DEAL_URL}`, deal.source, deal.id);
    } else {
        throw new Error('Source of "' + deal.source + '" is unhandled');
    }

    return link;
}
