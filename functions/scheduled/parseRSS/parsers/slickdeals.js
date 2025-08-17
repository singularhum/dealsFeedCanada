const cheerio = require('cheerio');

/**
 * Sets custom properties and values for Slickdeals
 * @param {Object} feed The feed to retrieve.
 * @param {Object} article The current article to set.
 * @param {Object} feedElement The feed element being parsed.
 * @param {cheerio.CheerioAPI} $ Cheerio object.
 */
module.exports.parse = function(feed, article, feedElement, $) {
    const idMatch = article.id.match(/\d{8,}/);
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

    // Override the posted date to be when it is included in the feed to prevent dups more
    article.posted_date = new Date();
};
