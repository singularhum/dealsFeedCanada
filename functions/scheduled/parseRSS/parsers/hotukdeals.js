
/**
 * Sets custom properties and values for OzBargain.
 * @param {Object} feed The feed to retrieve.
 * @param {Object} article The current article to set.
 * @param {Object} feedElement The feed element being parsed.
 * @param {cheerio.CheerioAPI} $ Cheerio object.
 */
module.exports.parse = function(feed, article, feedElement, $) {
    const idMatch = article.id.match(/\d{7,}$/);
    article.id = feed.id + '-' + idMatch[0];

    const thumbnail = $(feedElement).find('media\\:content').attr('url');
    if (thumbnail) {
        article.thumbnail = thumbnail;
    }

    const tempTitleMatch = article.title.match(/^\d+°\s-\s/);
    if (tempTitleMatch) {
        article.title = article.title.replace(tempTitleMatch[0], '');

        const scoreMatch = tempTitleMatch[0].match(/^\d+/);
        if (scoreMatch) {
            article.score = scoreMatch[0];
        }
    }

    const merchantElement = $(feedElement).find('pepper\\:merchant');
    if (merchantElement) {
        article.external_source = $(merchantElement).attr('name');

        const price = $(merchantElement).attr('price');
        if (price) {
            article.title = article.title + ' - ' + price;
        }
    }
};
