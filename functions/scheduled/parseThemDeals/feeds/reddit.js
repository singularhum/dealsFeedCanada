const functions = require('firebase-functions/v1');
const helpers = require('./../helpers');
const util = require('util');

module.exports.IDs = Object.freeze({
    BAPCSALESCANADA: 'bapcsalescanada',
    GAMEDEALS: 'gamedeals',
    VIDEOGAMEDEALSCANADA: 'videogamedealscanada',
});

/**
 * Retrieve an access token for using the Reddit API.
 * @return {string} The access token.
 */
module.exports.getRedditAccessToken = async function() {
    functions.logger.log('Retrieving access token for Reddit API');
    let accessToken = '';

    try {
        const response = await fetch(`${process.env.REDDIT_TOKEN_URL}`, {
            method: 'post',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': `${process.env.REDDIT_USER_AGENT}`,
                'Authorization': `${process.env.REDDIT_AUTH_HEADER}`,
            },
            body: 'grant_type=client_credentials',
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const json = await response.json();
            accessToken = json.access_token;
        } else {
            functions.logger.error('Error retrieving access token for Reddit API failed', response);
        }
    } catch (e) {
        functions.logger.error('Error retrieving access token for Reddit API failed', e);
    }

    return accessToken;
};

/**
 * Revokes an access token used for the Reddit API.
 * @param {string} accessToken The Reddit API access token.
 */
module.exports.revokeRedditAccessToken = async function(accessToken) {
    functions.logger.log('Revoking access token for Reddit API');

    try {
        const response = await fetch(`${process.env.REDDIT_REVOKE_TOKEN_URL}`, {
            method: 'post',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': `${process.env.REDDIT_USER_AGENT}`,
                'Authorization': `${process.env.REDDIT_AUTH_HEADER}`,
            },
            body: 'token=' + accessToken + '&token_type_hint=access_token',
            signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
            functions.logger.error('Error revoking access token for Reddit API failed', response);
        }
    } catch (e) {
        functions.logger.error('Error revoking access token for Reddit API failed', e);
    }

    return accessToken;
};

/**
 * Parse supplied subreddit.
 * @param {string} subredditName The name of the subreddit to parse.
 * @return {Array} An array of the deals parsed.
 */
module.exports.parseSubreddit = async function(subredditName) {
    functions.logger.log('Parsing ' + subredditName);
    const deals = [];

    try {
        const sixHoursAgo = helpers.getHoursAgo(6);

        // Uses .json in the path to return json and is sorted by new.
        const response = await fetch(util.format(`${process.env.SUBREDDIT_API_URL}`, subredditName), {
            method: 'get',
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const dealsJson = await response.json();

            dealsJson.data.children.forEach((dealJson) => {
                const deal = {};

                // Get the flair css class and text for setting the tag and to filter out certain posts.
                const flairCssClass = dealJson.data.link_flair_css_class;
                const flairText = dealJson.data.link_flair_text;

                // Exclude certain flaired posts.
                if (flairText !== 'Question' && flairCssClass !== 'WeeklyDiscussion' && flairCssClass !== 'Review') {
                    if (flairText) {
                        deal.tag = flairText;
                    } else if (flairCssClass) {
                        deal.tag = flairCssClass;
                    } else {
                        deal.tag = null;
                    }

                    // reddit returns the date in unix epoch in seconds so multiple by 1000 for milliseconds.
                    deal.created = new Date(dealJson.data.created_utc * 1000);

                    deal.id = dealJson.data.id;
                    deal.source = subredditName;
                    deal.title = dealJson.data.title;
                    deal.score = parseInt(dealJson.data.score);
                    deal.num_comments = parseInt(dealJson.data.num_comments);
                    deal.is_hot = false;
                    if (subredditName == module.exports.IDs.BAPCSALESCANADA) {
                        deal.is_hot = deal.created > sixHoursAgo && deal.score >= 20;
                    } else if (subredditName == module.exports.IDs.GAMEDEALS) {
                        deal.is_hot = deal.created > sixHoursAgo && deal.score >= 100;
                    } else if (subredditName == module.exports.IDs.VIDEOGAMEDEALSCANADA) {
                        deal.is_hot = deal.created > sixHoursAgo && deal.score >= 20;
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
};
