const { URL } = require('url');

/**
 * Sets custom properties and values for OzBargain.
 * @param {Object} feed The feed to retrieve.
 * @param {Object} article The current article to set.
 * @param {Object} feedElement The feed element being parsed.
 * @param {cheerio.CheerioAPI} $ Cheerio object.
 */
module.exports.parse = function(feed, article, feedElement, $) {
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
};
