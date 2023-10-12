const functions = require('firebase-functions');
const { setTimeout } = require('timers/promises');
const { Client, Events, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const util = require('util');
const database = require('./database');
const epic = require('./feeds/epic');
const fanatical = require('./feeds/fanatical');
const gog = require('./feeds/gog.js');
const indiegala = require('./feeds/indiegala');
const playStore = require('./feeds/play-store');
const primeGaming = require('./feeds/prime-gaming');
const rfdFreebies = require('./feeds/rfd-freebies');
const steam = require('./feeds/steam');
const ubisoft = require('./feeds/ubisoft');
const ueMarketplace = require('./feeds/ue-marketplace');

const discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });

/**
 * Logins to the notification service.
 * @return {boolean} Whether the login was successful or not.
 */
module.exports.login = async function() {
    let discordAvailable = false;

    if (discordClient.isReady()) {
        functions.logger.log('Discord - Already logged in');
        discordAvailable = true;
    } else {
        const promiseDiscordLogin = new Promise((resolve, reject) => {
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

        const promiseTimeout = new Promise((resolve, reject) => setTimeout(() => reject(new Error('Discord - Logging in timed out.')), 10000));
        await Promise.race([promiseTimeout, promiseDiscordLogin]);
    }

    if (!discordAvailable) {
        functions.logger.error('Discord - Error logging in');
    }

    return discordAvailable;
};

/**
 * Sends notifications for the free deals.
 * @param {Array} freeDeals An array with the current free deals.
 * @param {Array} missedFreeDeals An array of free deals that weren't sent.
 */
module.exports.send = async function(freeDeals, missedFreeDeals) {
    const newFreeDeals = missedFreeDeals;
    const expiredFreeDeals = [];

    for (let i = freeDeals.length - 1; i >= 0; i--) {
        try {
            const freeDeal = freeDeals[i];

            if (freeDeal.isNew) {
                newFreeDeals.push(freeDeal);
            } else if (freeDeal.isExpired) {
                expiredFreeDeals.push(freeDeal);
            }
        } catch (error) {
            functions.logger.error('Error loading notifications', error);
        }
    }

    if ((newFreeDeals.length > 0 || expiredFreeDeals.length > 0) && discordClient.isReady()) {
        for (const newFreeDeal of newFreeDeals) {
            try {
                await sendNewToDiscord(newFreeDeal, false);

                // Wait a bit after each call for rate limit prevention.
                await setTimeout(2000);
            } catch (error) {
                functions.logger.error('Error sending new notification for ' + newFreeDeal.id, error);
            }
        }

        for (const expiredFreeDeal of expiredFreeDeals) {
            try {
                await sendExpiredToDiscord(expiredFreeDeal);

                // Wait a bit after each call for rate limit prevention.
                await setTimeout(2000);
            } catch (error) {
                functions.logger.error('Error sending expired notification for ' + expiredFreeDeal.id, error);
            }
        }
    }
};

/**
 * Sends the new free deals to Discord using the API.
 * @param {Object} freeDeal The free deal to send.
 */
async function sendNewToDiscord(freeDeal) {
    try {
        functions.logger.log('Discord - Sending ' + freeDeal.id);

        let link = freeDeal.link;
        if (freeDeal.source === gog.ID) {
            link = 'https://www.gog.com/#giveaway';
        }

        const title = buildTitle(freeDeal);
        const channelId = getDiscordChannelId(freeDeal.source);
        const channel = discordClient.channels.cache.get(channelId);

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setURL(link)
            .setColor(2829617);
        setMessageDescriptionTimestamp(embed, freeDeal);

        const message = await channel.send({ embeds: [embed] });
        freeDeal.discord_message_id = message.id;
        await database.setFreeDeal(freeDeal.id, { discord_message_id: freeDeal.discord_message_id }, true);

        functions.logger.log('Discord - ' + freeDeal.id + ' has been sent');
    } catch (error) {
        functions.logger.error('Discord - Error sending ' + freeDeal.id, error);
    }
}

/**
 * Sends the expired free deals to Discord using the API.
 * @param {Object} freeDeal The free deal to expire.
 */
async function sendExpiredToDiscord(freeDeal) {
    try {
        functions.logger.log('Discord - Expiring ' + freeDeal.id);

        const link = freeDeal.link;
        const title = '~~' + buildTitle(freeDeal) + '~~';
        const channelId = getDiscordChannelId(freeDeal.source);
        const channel = discordClient.channels.cache.get(channelId);

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setURL(link)
            .setColor(2829617);
        setMessageDescriptionTimestamp(embed, freeDeal);

        let message = await channel.messages.fetch(freeDeal.discord_message_id);
        if (message) {
            message = await message.edit({ embeds: [embed] });
            functions.logger.log('Discord - ' + freeDeal.id + ' has been expired in ' + channel.id);
        } else {
            functions.logger.warn('Discord - ' + freeDeal.id + ' was not found in ' + channel.id);
        }
    } catch (error) {
        functions.logger.error('Discord - Error expiring ' + freeDeal.id, error);
    }
}

/**
 * Builds a title based on the source and the title of the free deal.
 * @param {Object} freeDeal The free deal to build the link from.
 * @return {string} A full URL for the free deal.
 */
function buildTitle(freeDeal) {
    if (freeDeal.source === rfdFreebies.ID) {
        return freeDeal.title;
    } else {
        return util.format('[%s] %s (Free / 100% Off)', freeDeal.source, freeDeal.title);
    }
}

/**
 * Builds a title based on the source and the title of the free deal.
 * @param {EmbedBuilder} embed The embed to add the footer.
 * @param {Object} freeDeal The free deal.
 * @return {EmbedBuilder} The updated embed.
 */
function setMessageDescriptionTimestamp(embed, freeDeal) {
    try {
        if (freeDeal.expiry_date) {
            const unixTimestamp = Math.floor(freeDeal.expiry_date.getTime() / 1000);

            let expireText;
            if (freeDeal.isExpired) {
                expireText = 'Expired';
            } else {
                expireText = 'Expires';
            }

            embed.setDescription(util.format('%s <t:%s:f>', expireText, unixTimestamp));
        }
    } catch (e) {
        functions.logger.error('Discord - Failed to set footer for ' + freeDeal.id, e);
    }

    return embed;
}

/**
 * Gets the Discord channel id based on the source.
 * @param {string} source The source of the free deal.
 * @return {string} A Discord channel id.
 */
function getDiscordChannelId(source) {
    let channelId = null;

    if (source === epic.ID) {
        channelId = `${process.env.EPIC_DISCORD_CHANNEL}`;
    } else if (source === fanatical.ID) {
        channelId = `${process.env.FANATICAL_DISCORD_CHANNEL}`;
    } else if (source === gog.ID) {
        channelId = `${process.env.GOG_DISCORD_CHANNEL}`;
    } else if (source === indiegala.ID) {
        channelId = `${process.env.INDIEGALA_DISCORD_CHANNEL}`;
    } else if (source === playStore.ID) {
        channelId = `${process.env.PLAY_STORE_DISCORD_CHANNEL}`;
    } else if (source === primeGaming.ID) {
        channelId = `${process.env.PRIME_GAMING_DISCORD_CHANNEL}`;
    } else if (source === rfdFreebies.ID) {
        channelId = `${process.env.RFD_FREEBIES_DISCORD_CHANNEL}`;
    } else if (source === steam.ID) {
        channelId = `${process.env.STEAM_DISCORD_CHANNEL}`;
    } else if (source === ubisoft.ID) {
        channelId = `${process.env.UBISOFT_DISCORD_CHANNEL}`;
    } else if (source === ueMarketplace.ID) {
        channelId = `${process.env.UE_MARKETPLACE_DISCORD_CHANNEL}`;
    } else {
        throw new Error('Source of "' + source + '" is unhandled');
    }

    return channelId;
}
