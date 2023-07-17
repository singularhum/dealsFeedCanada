const functions = require('firebase-functions');
const { setTimeout } = require('timers/promises');
const { Client, Events, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const database = require('./database.js');
const helpers = require('./helpers.js');
const util = require('util');

const discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });

/**
 * Sends notifications for the new articles.
 * @param {Array} dbFeeds An array of the feeds in the DB.
 * @param {Array} newArticles An array of the new articles being parsed.
 * @param {Array} updateArticles An array of the articles to be update being parsed.
 */
module.exports.send = async function(dbFeeds, newArticles, updateArticles) {
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
          await sendNewToDiscord(dbFeeds, newArticles[i]);

          // Wait a bit after each call for rate limit prevention.
          await setTimeout(1000);
        } catch (error) {
          functions.logger.error('Error sending new notification for ' + newArticles[i].id, error);
        }
      }

      // Send out the updated notifications. Use Promise.all and let Discord.js handle rate limits with the updates.
      const promises = [];
      for (const updateArticle of updateArticles) {
        promises.push(sendUpdateToDiscord(dbFeeds, updateArticle));
      }
      await Promise.all(promises);
    }
  }
};

/**
 * Sends the new article to Discord using the API.
 * @param {Array} dbFeeds An array of the feeds in the DB.
 * @param {Object} article The article to send.
 */
async function sendNewToDiscord(dbFeeds, article) {
  try {
    functions.logger.log('Discord - Sending ' + article.id);

    const embed = createEmbed(article);
    const channelId = getDiscordChannelId(dbFeeds, article.source);
    const channel = discordClient.channels.cache.get(channelId);

    const message = await channel.send({ embeds: [embed] });
    article.discord_message_id = message.id;
    await database.setArticle(article.id, { discord_message_id: article.discord_message_id }, true);

    functions.logger.log('Discord - ' + article.id + ' has been sent');
  } catch (error) {
    functions.logger.error('Discord - Error sending ' + article.id, error);
  }
}

/**
 * Updates the article message in Discord using the API.
 * @param {Array} dbFeeds An array of the feeds in the DB.
 * @param {Object} article The article to update.
 */
async function sendUpdateToDiscord(dbFeeds, article) {
  try {
    if (article.discord_message_id) {
      functions.logger.log('Discord - Updating ' + article.id);

      const embed = createEmbed(article);
      const channelId = getDiscordChannelId(dbFeeds, article.source);
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
    .setTitle(helpers.trimString(article.title, 250))
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
 * @param {Array} dbFeeds An array of the feeds in the DB.
 * @param {string} source The source of the article.
 * @return {string} A Discord channel id.
 */
function getDiscordChannelId(dbFeeds, source) {
  let channelId = null;

  dbFeeds.forEach((feed) => {
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
