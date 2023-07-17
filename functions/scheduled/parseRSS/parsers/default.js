const functions = require('firebase-functions');
const database = require('./../database.js');
const cheerio = require('cheerio');
const slickdealsParser = require('./slickdeals.js');
const ozbargainParser = require('./ozbargain.js');
const helpers = require('./../helpers.js');

/**
 * Parse RSS Feeds.
 * @param {Object} feed The feed to retrieve.
 * @param {Array} dbArticles An array of the articles in the DB.
 * @param {Array} articles An array of the articles being parsed.
 * @param {Array} newArticles An array of the new articles being parsed.
 * @param {Array} updateArticles An array of the articles to be update being parsed.
 */
module.exports.parse = async function(feed, dbArticles, articles, newArticles, updateArticles) {
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
                        slickdealsParser.parse(feed, article, feedElement, $);
                    } else if (feed.source === 'ozbargain') {
                        ozbargainParser.parse(feed, article, feedElement, $);
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
};

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
                    await database.setArticle(article.id, article, false);
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
                        await database.setArticle(dbArticle.id, dbArticle, false);
                        updateArticles.push(dbArticle);
                        functions.logger.log('Updated article: ' + article.id);
                    }
                }
            }
        } catch (error) {
            functions.logger.error('Saving article ' + article.id + ' failed', error);
        }
    }

    const twoDaysAgo = helpers.getDaysAgo(2);
    for (let i = dbArticles.length - 1; i >= 0; i--) {
        try {
            const dbArticle = dbArticles[i];
            if (dbArticle.source === feed.id) {
                const foundArticle = articles.find((article) => article.id === dbArticle.id);

                if (!foundArticle && dbArticle.posted_date < twoDaysAgo) {
                    // Delete from DB if over two days old and remove from array.
                    await database.deleteArticle(dbArticle.id);
                    dbArticles.splice(i, 1);
                    functions.logger.info('Article ' + dbArticle.id + ' removed from DB');
                }
            }
        } catch (error) {
            functions.logger.error('Error removing article ' + dbArticles[i].id, error);
        }
    }
}
