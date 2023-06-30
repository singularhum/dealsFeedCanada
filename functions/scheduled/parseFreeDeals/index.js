const EPIC = 'Epic';
const FANATICAL = 'Fanatical';
const GOG = 'GOG';
const INDIEGALA = 'IndieGala';
const PRIME_GAMING = 'Prime Gaming';
const RFD_FREEBIES = 'RedFlagDeals-Freebies';
const STEAM = 'Steam';
const UBISOFT = 'Ubisoft';
const UE_MARKETPLACE = 'UE Marketplace';
const DB_COLLECTION = 'free-deals';
const functions = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { setTimeout } = require('timers/promises');
const { Client, Events, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const cheerio = require('cheerio');
const util = require('util');

// Initialize firebase
initializeApp();

// Globals that should persist until the instance is restarted which is done randomly by Google.
const db = getFirestore();
let _dbFreeDeals;
const discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });

/**
 * Parses free deals and send notifications.
 * This function is scheduled to run every 30 minutes and has a timeout of 60 seconds.
 * A max of 1 instance is set since it is a scheduled job and to prevent desync of globals if there are multiple instances.
 */
exports.parseFreeDeals = functions.runWith({ maxInstances: 1, timeoutSeconds: 60 }).pubsub.schedule('every 30 minutes').onRun(async (context) => {
    functions.logger.info('Scheduled Job Start');

    // Retrieve all deals from the DB to be able to determine what will be new or updated.
    // This is lazy loaded to prevent high DB read hits (each document counts as a read).
    if (!_dbFreeDeals) _dbFreeDeals = await fetchDB();

    const freeDeals = [];
    const currentDate = new Date();

    await parseSteam(_dbFreeDeals, freeDeals);
    await parseGOG(_dbFreeDeals, freeDeals);
    if (currentDate.getHours() !== 7) {
        // Free games tend to disappear and come back in this hour so ignore for now.
        await parseFanatical(_dbFreeDeals, freeDeals);
    }
    await parseEpic(_dbFreeDeals, freeDeals);
    await parseUbisoft(_dbFreeDeals, freeDeals);
    await parseUEMarketplace(_dbFreeDeals, freeDeals);
    await parsePrimeGaming(_dbFreeDeals, freeDeals);
    await parseIndieGala(_dbFreeDeals, freeDeals);
    await parseRfdFreebies(_dbFreeDeals, freeDeals);

    await sendNotifications(freeDeals);

    functions.logger.log('Scheduled Job Completed');

    return null;
});

/**
 * Fetch the deals in the database.
 * @return {Array} An array of the deals from the database.
 */
async function fetchDB() {
    functions.logger.log('Fetching free deals from db');

    const dbFreeDeals = [];
    const dbFreeDealsRef = db.collection(DB_COLLECTION);
    const dbFreeDealsSnapshot = await dbFreeDealsRef.get();
    dbFreeDealsSnapshot.forEach((doc) => {
        dbFreeDeals.push(doc.data());
    });

    // Firestore returns the dates as Timestamp so convert to date.
    dbFreeDeals.forEach((dbFreeDeal) => {
        dbFreeDeal.date = dbFreeDeal.date.toDate();

        if (dbFreeDeal.expiryDate) {
            dbFreeDeal.expiryDate = dbFreeDeal.expiryDate.toDate();
        }
    });

    return dbFreeDeals;
}

/**
 * Parse Steam store for free games.
 * @param {Array} dbFreeDeals An array of the free deals in the DB.
 * @param {Array} freeDeals An array of the free deals being parsed.
 */
async function parseSteam(dbFreeDeals, freeDeals) {
    try {
        functions.logger.log('Parsing Steam');

        const response = await fetch(`${process.env.STEAM_SEARCH_URL}`, {
            method: 'get',
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const json = await response.json();

            json.items.forEach((gameJson) => {
                const freeDeal = {};
                const logoParts = gameJson.logo.split('/');

                freeDeal.id = logoParts[5];
                freeDeal.source = STEAM;
                freeDeal.date = new Date();
                freeDeal.title = gameJson.name;
                freeDeal.type = logoParts[4].slice(0, -1); // type is plural in the logo url so remove it

                freeDeals.push(freeDeal);
            });

            await saveDB(dbFreeDeals, freeDeals, STEAM);
        } else {
            functions.logger.error('Parsing Steam failed', response);
        }
    } catch (e) {
        functions.logger.error('Parsing Steam failed', e);
    }
}

/**
 * Parse GOG store for free games.
 * @param {Array} dbFreeDeals An array of the free deals in the DB.
 * @param {Array} freeDeals An array of the free deals being parsed.
 */
async function parseGOG(dbFreeDeals, freeDeals) {
    try {
        functions.logger.log('Parsing GOG');

        const response = await fetch(`${process.env.GOG_API_URL}`, {
            method: 'get',
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const json = await response.json();

            json.products.forEach((gameJson) => {
                const freeDeal = {};
                freeDeal.id = gameJson.slug.replace('-', '_');
                freeDeal.source = GOG;
                freeDeal.date = new Date();
                freeDeal.title = gameJson.title;
                freeDeal.type = null;
                freeDeal.expiryDate = null;
                freeDeals.push(freeDeal);
            });

            await saveDB(dbFreeDeals, freeDeals, GOG);
        } else {
            functions.logger.error('Parsing GOG failed', response);
        }
    } catch (e) {
        functions.logger.error('Parsing GOG failed', e);
    }
}

/**
 * Parse Fanatical store for free games.
 * @param {Array} dbFreeDeals An array of the free deals in the DB.
 * @param {Array} freeDeals An array of the free deals being parsed.
 */
async function parseFanatical(dbFreeDeals, freeDeals) {
    try {
        functions.logger.log('Parsing Fanatical');

        const keyResponse = await fetch(`${process.env.FANATICAL_KEY_URL}`, {
            method: 'get',
            signal: AbortSignal.timeout(5000),
        });

        if (keyResponse.ok) {
            const textResponse = await keyResponse.text();

            const keyMatches = textResponse.match(new RegExp(`${process.env.FANATICAL_KEY_MATCH}`));
            if (keyMatches) {
                const key = keyMatches[0].replace(`${process.env.FANATICAL_KEY_REPLACE}`.replace('\\', ''), '').replace('\'', '');

                const response = await fetch(util.format(`${process.env.FANATICAL_SEARCH_URL}`, key), {
                    method: 'post',
                    headers: { 'Content-Type': 'application/json' },
                    body: `${process.env.FANATICAL_SEARCH_BODY}`,
                    signal: AbortSignal.timeout(5000),
                });

                if (response.ok) {
                    const json = await response.json();

                    if (json.results[0].hits.length > 0) {
                        json.results[0].hits.forEach((gameJson) => {
                            if (gameJson.giveaway === true || gameJson.price.CAD === 0) {
                                const freeDeal = {};
                                freeDeal.id = gameJson.slug;
                                freeDeal.source = FANATICAL;
                                freeDeal.date = new Date();
                                freeDeal.title = gameJson.name;
                                freeDeal.type = gameJson.type;

                                freeDeals.push(freeDeal);
                            }
                        });

                        await saveDB(dbFreeDeals, freeDeals, FANATICAL);
                    }
                } else {
                    functions.logger.error('Parsing Fanatical failed', response);
                }
            }
        } else {
            functions.logger.error('Parsing Fanatical failed', keyResponse);
        }
    } catch (e) {
        functions.logger.error('Parsing Fanatical failed', e);
    }
}

/**
 * Parse Epic store for free games.
 * @param {Array} dbFreeDeals An array of the free deals in the DB.
 * @param {Array} freeDeals An array of the free deals being parsed.
 */
async function parseEpic(dbFreeDeals, freeDeals) {
    try {
        functions.logger.log('Parsing Epic');

        const response = await fetch(`${process.env.EPIC_SEARCH_URL}`, {
            method: 'get',
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const json = await response.json();

            json.data.Catalog.searchStore.elements.forEach((gameJson) => {
                if (gameJson.price.totalPrice.discountPrice === 0 && gameJson.promotions && gameJson.promotions.promotionalOffers && gameJson.promotions.promotionalOffers.length > 0) {
                    const freeDeal = {};

                    if (gameJson.catalogNs.mappings.length > 0) {
                        freeDeal.id = gameJson.catalogNs.mappings[0].pageSlug;
                    } else {
                        freeDeal.id = gameJson.productSlug;
                    }

                    freeDeal.source = EPIC;
                    freeDeal.date = new Date();
                    freeDeal.title = gameJson.title;
                    freeDeal.type = gameJson.offerType;

                    try {
                        freeDeal.expiryDate = new Date(gameJson.promotions.promotionalOffers[0].promotionalOffers[0].endDate);
                    } catch (e) {
                        functions.logger.error('Parsing Epic expiry date failed', e);
                    }

                    freeDeals.push(freeDeal);
                }
            });

            await saveDB(dbFreeDeals, freeDeals, EPIC);
        } else {
            functions.logger.error('Parsing Epic failed', response);
        }
    } catch (e) {
        functions.logger.error('Parsing Epic failed', e);
    }
}

/**
 * Parse Ubisoft store for free games.
 * @param {Array} dbFreeDeals An array of the free deals in the DB.
 * @param {Array} freeDeals An array of the free deals being parsed.
 */
async function parseUbisoft(dbFreeDeals, freeDeals) {
    try {
        functions.logger.log('Parsing Ubisoft');

        const response = await fetch(`${process.env.UBISOFT_SEARCH_URL}`, {
            method: 'get',
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const $ = cheerio.load(await response.text());

            const freeDealElements = $('.product-tile.card');
            freeDealElements.each((i, gameElement) => {
                const freeDeal = {};
                freeDeal.id = $(gameElement).attr('data-itemid');
                freeDeal.source = UBISOFT;
                freeDeal.date = new Date();
                freeDeal.title = $(gameElement).find('.prod-title').text().trim() + ' - ' + $(gameElement).find('.card-subtitle').text().trim();
                freeDeal.type = $(gameElement).find('.label').text();

                freeDeals.push(freeDeal);
            });

            await saveDB(dbFreeDeals, freeDeals, UBISOFT);
        } else {
            functions.logger.error('Parsing Ubisoft failed', response);
        }
    } catch (e) {
        functions.logger.error('Parsing Ubisoft failed', e);
    }
}

/**
 * Parse Unreal Engine Marketplace store for free assets.
 * @param {Array} dbFreeDeals An array of the free deals in the DB.
 * @param {Array} freeDeals An array of the free deals being parsed.
 */
async function parseUEMarketplace(dbFreeDeals, freeDeals) {
    try {
        functions.logger.log('Parsing Epic');

        const response = await fetch(`${process.env.UE_MARKETPLACE_SEARCH_URL}`, {
            method: 'get',
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const json = await response.json();

            json.data.elements.forEach((gameJson) => {
                const freeDeal = {};
                freeDeal.id = gameJson.urlSlug;
                freeDeal.source = UE_MARKETPLACE;
                freeDeal.date = new Date();
                freeDeal.title = gameJson.title;

                if (gameJson.categories && gameJson.categories.length > 0) {
                    freeDeal.type = gameJson.categories[0].name;
                } else {
                    freeDeal.type = null;
                }

                try {
                    const currentDate = new Date();
                    const nextMonthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
                    const firstWeekdayInMonth = nextMonthDate.getDay();
                    const firstTuesdayDay = 2 + ((8 - firstWeekdayInMonth) % 7);
                    const firstTuesdayOfNextMonth = new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth(), firstTuesdayDay);
                    freeDeal.expiryDate = firstTuesdayOfNextMonth;
                } catch (e) {
                    functions.logger.error('Parsing UE Marketplace expiry date failed', e);
                }

                freeDeals.push(freeDeal);
            });

            await saveDB(dbFreeDeals, freeDeals, UE_MARKETPLACE);
        } else {
            functions.logger.error('Parsing UE Marketplace failed', response);
        }
    } catch (e) {
        functions.logger.error('Parsing UE Marketplace failed', e);
    }
}

/**
 * Parse Epic store for free games.
 * @param {Array} dbFreeDeals An array of the free deals in the DB.
 * @param {Array} freeDeals An array of the free deals being parsed.
 */
async function parsePrimeGaming(dbFreeDeals, freeDeals) {
    try {
        functions.logger.log('Parsing Prime Gaming');

        // Need to fetch page to get csrf-token to be able to use API.
        const getResponse = await fetch(`${process.env.PRIME_GAMING_URL}`, {
            method: 'get',
            headers: {
                'User-Agent': `${process.env.PRIME_GAMING_USER_AGENT}`,
            },
            signal: AbortSignal.timeout(5000),
        });

        if (getResponse.ok) {
            // Get the csrf-token.
            const $ = cheerio.load(await getResponse.text());
            const csrfToken = $('input[name=csrf-key]').attr('value');

            // Now use the API with the csrf and cookie.
            const response = await fetch(`${process.env.PRIME_GAMING_SEARCH_URL}`, {
                method: 'post',
                headers: {
                    'Content-Type': 'application/json',
                    'csrf-token': csrfToken,
                    'User-Agent': `${process.env.PRIME_GAMING_USER_AGENT}`,
                    'Cookie': getResponse.headers.get('set-cookie'),
                },
                body: `${process.env.PRIME_GAMING_SEARCH_BODY}`,
                signal: AbortSignal.timeout(5000),
            });

            if (response.ok) {
                const json = await response.json();

                json.data.items.items.forEach((gameJson) => {
                    if (gameJson.isFGWP) {
                        const freeDeal = {};
                        freeDeal.id = gameJson.id;
                        freeDeal.source = PRIME_GAMING;
                        freeDeal.date = new Date();
                        freeDeal.title = gameJson.assets.title;
                        freeDeal.type = null;
                        freeDeal.externalClaimLink = gameJson.assets.externalClaimLink;

                        try {
                            freeDeal.expiryDate = new Date(gameJson.offers[0].endTime);
                        } catch (e) {
                            functions.logger.error('Parsing Prime Gaming expiry date failed', e);
                        }

                        freeDeals.push(freeDeal);
                    }
                });

                await saveDB(dbFreeDeals, freeDeals, PRIME_GAMING);
            } else {
                functions.logger.error('Parsing Prime Gaming failed', response);
            }
        } else {
            functions.logger.error('Parsing Prime Gaming failed', getResponse);
        }
    } catch (e) {
        functions.logger.error('Parsing Prime Gaming failed', e);
    }
}

/**
 * Parse IndieGala freebies for free games.
 * @param {Array} dbFreeDeals An array of the free deals in the DB.
 * @param {Array} freeDeals An array of the free deals being parsed.
 */
async function parseIndieGala(dbFreeDeals, freeDeals) {
    try {
        functions.logger.log('Parsing IndieGala');

        const response = await fetch(`${process.env.INDIEGALA_FREEBIES_RSS_URL}`, {
            method: 'get',
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const $ = cheerio.load(await response.text());
            const feedElements = $('item');

            feedElements.each((i, feedElement) => {
                const description = $(feedElement).find('description').text();

                if (description.includes(`${process.env.INDIEGALA_FREEBIES_URL}`)) {
                    const $i = cheerio.load(description);

                    const linkElements = $i('a');
                    let freebieLinkElement = null;

                    linkElements.each((i, linkElement) => {
                        if ($i(linkElement).attr('href').includes(`${process.env.INDIEGALA_FREEBIES_URL}`)) {
                            freebieLinkElement = linkElement;
                            return false;
                        }
                    });

                    if (freebieLinkElement) {
                        const freeDeal = {};
                        freeDeal.id = $i(freebieLinkElement).attr('href').replace('https://steamcommunity.com/linkfilter/?url=' + `${process.env.INDIEGALA_FREEBIES_URL}`, '');
                        freeDeal.source = INDIEGALA;
                        freeDeal.date = new Date();
                        freeDeal.title = $i($i('.bb_h1')[0]).text().replace('FREEbie', '').trim();
                        freeDeal.type = null;

                        freeDeals.push(freeDeal);
                    }
                }
            });

            await saveDB(dbFreeDeals, freeDeals, INDIEGALA);
        } else {
            functions.logger.error('Parsing IndieGala failed', response);
        }
    } catch (e) {
        functions.logger.error('Parsing IndieGala failed', e);
    }
}

/**
 * Parse RFD freebies forum for free deals.
 * @param {Array} dbFreeDeals An array of the free deals in the DB.
 * @param {Array} freeDeals An array of the free deals being parsed.
 */
async function parseRfdFreebies(dbFreeDeals, freeDeals) {
    try {
        functions.logger.log('Parsing RFD Freebies');

        const response = await fetch(`${process.env.RFD_FREEBIES_API_URL}`, {
            method: 'get',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const freebiesJson = await response.json();

            freebiesJson.topics.forEach((freebieJson) => {
                const freeDeal = {};

                const postTime = new Date(freebieJson.post_time);
                const oneDayAgo = new Date(Date.now() - (24 * 60 * 60 * 1000));

                // Only include today's posts
                if (postTime > oneDayAgo) {
                    freeDeal.id = freebieJson.topic_id.toString();
                    freeDeal.source = RFD_FREEBIES;
                    freeDeal.date = new Date();
                    freeDeal.title = freebieJson.title;
                    if (freebieJson.offer && freebieJson.offer.dealer_name) {
                        // Retailer is not part of the title so we must add it in.
                        freeDeal.title = '[' + freebieJson.offer.dealer_name + '] ' + freeDeal.title;
                    }
                    freeDeal.type = null;

                    freeDeals.push(freeDeal);
                }
            });

            await saveDB(dbFreeDeals, freeDeals, RFD_FREEBIES);
        } else {
            functions.logger.error('Parsing RFD Freebies failed', response);
        }
    } catch (e) {
        functions.logger.error('Parsing RFD Freebies failed', e);
    }
}

/**
 * Go through the free deals and update DB if new or expired.
 * @param {Array} dbFreeDeals An array of the free deals in the DB.
 * @param {Array} freeDeals The free deals parsed.
 * @param {string} source The source of the deals.
 */
async function saveDB(dbFreeDeals, freeDeals, source) {
    // Checking for new deals.
    for (const freeDeal of freeDeals) {
        try {
            if (freeDeal.source === source) {
                const dbfreeDeal = dbFreeDeals.find((dbfreeDeal) => dbfreeDeal.id === freeDeal.id);

                if (!dbfreeDeal) {
                    functions.logger.log('New free deal: ' + freeDeal.id);

                    const expiryDate = await getExpiryDate(freeDeal);
                    if (expiryDate) {
                        freeDeal.expiryDate = expiryDate;
                    }

                    dbFreeDeals.push(freeDeal);

                    // Save to DB and set as isNew for notifications.
                    await db.collection(DB_COLLECTION).doc(freeDeal.id).set(freeDeal);
                    freeDeal.isNew = true;
                }
            }
        } catch (error) {
            functions.logger.error('Saving free deal ' + freeDeal.id + ' failed', error);
        }
    }

    // Check for expired free deals
    for (let i = dbFreeDeals.length - 1; i >= 0; i--) {
        try {
            const dbFreeDeal = dbFreeDeals[i];
            if (dbFreeDeal.source === source) {
                const foundFreeDeal = freeDeals.find((freeDeal) => freeDeal.id === dbFreeDeal.id);

                if (!foundFreeDeal && (!dbFreeDeal.expiryDate || new Date() > dbFreeDeal.expiryDate)) {
                    // Delete from DB and remove from array.
                    await db.collection(DB_COLLECTION).doc(dbFreeDeal.id).delete();
                    dbFreeDeals.splice(i, 1);

                    if (source === RFD_FREEBIES || source === INDIEGALA) {
                        functions.logger.info('Free deal ' + dbFreeDeal.id + ' removed from DB');
                    } else {
                        // Set as expired and add to array to send udpate notifications.
                        dbFreeDeal.isExpired = true;
                        freeDeals.push(dbFreeDeal);
                        functions.logger.info('Free deal ' + dbFreeDeal.id + ' has expired');
                    }
                }
            }
        } catch (error) {
            functions.logger.error('Error removing free deal ' + dbFreeDeals[i].id, error);
        }
    }
}

/**
 * Get expiry dates for sources where the original API/search does not include them.
 * @param {Object} freeDeal The free deal to get the expiry from.
 * @return {Date} The expiry date.
 */
async function getExpiryDate(freeDeal) {
    let expiryDate = null;

    try {
        if (freeDeal.source === STEAM) {
            const link = buildLink(freeDeal);

            const response = await fetch(link, {
                method: 'get',
                headers: { 'Cookie': 'wants_mature_content=1; birthtime=0; lastagecheckage=1-0-1900;' },
                signal: AbortSignal.timeout(5000),
            });

            if (response.ok) {
                const $ = cheerio.load(await response.text());
                const discountExpiryText = $('.game_purchase_discount_quantity').text();

                const dayMonthResult = discountExpiryText.match(/\d{1,2}\s\w{3}/); // dd mmm
                const dayMonth2Result = discountExpiryText.match(/\w{3}\s\d{1,2}/); // mmm dd
                const timeResult = discountExpiryText.match(/\d{1,2}:\d{2}/);
                const amPmResult = discountExpiryText.match(/[ap]m/);

                if ((dayMonthResult || dayMonth2Result) && timeResult && amPmResult) {
                    // Depending on locale it can be in either format on the page.
                    let dayMonth = null;
                    if (dayMonthResult) {
                        dayMonth = dayMonthResult[0];
                    } else {
                        dayMonth = dayMonth2Result[0];
                    }

                    // Need to find better way to determine the expiry for steam. Fetch seems to default to GMT-7 so will need to offset for UTC.
                    expiryDate = new Date(Date.parse(util.format('%s, %s %s %s -07:00', dayMonth, new Date().getFullYear(), timeResult[0], amPmResult[0])));
                } else {
                    functions.logger.error('Getting expiry date failed for ' + freeDeal.id + '. Text: ' + discountExpiryText);
                }
            } else {
                functions.logger.error('Getting expiry date failed for ' + freeDeal.id, response);
            }
        } else if (freeDeal.source === GOG) {
            const response = await fetch(`${process.env.GOG_URL}`, {
                method: 'get',
                signal: AbortSignal.timeout(5000),
            });

            if (response.ok) {
                const $ = cheerio.load(await response.text());

                const giveawayElement = $('#giveaway');
                if (giveawayElement.length === 1) {
                    expiryDate = new Date(parseInt($('.giveaway-banner__countdown-timer').attr('end-date')));
                } else {
                    const countdownTimer = $('a[href=/en/game/' + freeDeal.id + '].big-spot gog-countdown-timer');
                    if (countdownTimer.length === 1) {
                        expiryDate = new Date($(countdownTimer).attr('end-date'));
                    }
                }
            } else {
                functions.logger.error('Getting expiry date failed for ' + freeDeal.id, response);
            }
        }
    } catch (e) {
        functions.logger.error('Getting expiry date failed for ' + freeDeal.id, e);
    }

    return expiryDate;
}

/**
 * Sends notifications for the free deals.
 * @param {Array} freeDeals An array with the current free deals.
 */
async function sendNotifications(freeDeals) {
    const newFreeDeals = [];
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

    if (newFreeDeals.length > 0 || expiredFreeDeals.length > 0) {
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
    }
}

/**
 * Sends the new free deals to Discord using the API.
 * @param {Object} freeDeal The free deal to send.
 */
async function sendNewToDiscord(freeDeal) {
    try {
        functions.logger.log('Discord - Sending ' + freeDeal.id);

        const link = buildLink(freeDeal);
        const title = buildTitle(freeDeal);
        const channelId = getDiscordChannelId(freeDeal.source);
        const channel = discordClient.channels.cache.get(channelId);

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setURL(link)
            .setColor(2303786);
        setMessageDescriptionTimestamp(embed, freeDeal);

        const message = await channel.send({ embeds: [embed] });
        freeDeal.discord_message_id = message.id;
        await db.collection(DB_COLLECTION).doc(freeDeal.id).set({ discord_message_id: freeDeal.discord_message_id }, { merge: true });

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

        const link = buildLink(freeDeal);
        const title = '~~' + buildTitle(freeDeal) + '~~';
        const channelId = getDiscordChannelId(freeDeal.source);
        const channel = discordClient.channels.cache.get(channelId);

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setURL(link)
            .setColor(2303786);
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
 * Builds a link based on the source and the id of the free deal.
 * @param {Object} freeDeal The free deal to build the link from.
 * @return {string} A full URL for the free deal.
 */
function buildLink(freeDeal) {
    let link = '';

    if (freeDeal.source === EPIC) {
        link = util.format('https://store.epicgames.com/en-US/p/%s', freeDeal.id);
    } else if (freeDeal.source === FANATICAL) {
        link = util.format('https://www.fanatical.com/en/%s/%s', freeDeal.type, freeDeal.id);
    } else if (freeDeal.source === GOG) {
        link = util.format('https://www.gog.com/en/game/%s', freeDeal.id);
    } else if (freeDeal.source === INDIEGALA) {
        link = util.format(`${process.env.INDIEGALA_FREEBIES_URL}` + '%s', freeDeal.id);
    } else if (freeDeal.source === PRIME_GAMING) {
        if (freeDeal.externalClaimLink) {
            link = freeDeal.externalClaimLink;
        } else {
            link = 'https://gaming.amazon.com/home';
        }
    } else if (freeDeal.source === RFD_FREEBIES) {
        link = util.format('https://forums.redflagdeals.com/viewtopic.php?t=%s', freeDeal.id);
    } else if (freeDeal.source === STEAM) {
        link = util.format('https://store.steampowered.com/%s/%s/', freeDeal.type, freeDeal.id);
    } else if (freeDeal.source === UBISOFT) {
        link = util.format('https://store.ubisoft.com/ca/%s.html', freeDeal.id);
    } else if (freeDeal.source === UE_MARKETPLACE) {
        link = util.format('https://www.unrealengine.com/marketplace/en-US/product/%s', freeDeal.id);
    } else {
        throw new Error('Source of "' + freeDeal.source + '" is unhandled');
    }

    return link;
}

/**
 * Builds a title based on the source and the title of the free deal.
 * @param {Object} freeDeal The free deal to build the link from.
 * @return {string} A full URL for the free deal.
 */
function buildTitle(freeDeal) {
    if (freeDeal.source === RFD_FREEBIES) {
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
        if (freeDeal.expiryDate) {
            const unixTimestamp = Math.floor(freeDeal.expiryDate.getTime() / 1000);
            let formatType = 'f';

            if (freeDeal.source === UE_MARKETPLACE) {
                formatType = 'D';
            }

            let expireText;
            if (freeDeal.isExpired) {
                expireText = 'Expired';
            } else {
                expireText = 'Expires';
            }

            embed.setDescription(util.format('%s <t:%s:%s>', expireText, unixTimestamp, formatType));
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

    if (source === EPIC) {
        channelId = `${process.env.EPIC_DISCORD_CHANNEL}`;
    } else if (source === FANATICAL) {
        channelId = `${process.env.FANATICAL_DISCORD_CHANNEL}`;
    } else if (source === GOG) {
        channelId = `${process.env.GOG_DISCORD_CHANNEL}`;
    } else if (source === INDIEGALA) {
        channelId = `${process.env.INDIEGALA_DISCORD_CHANNEL}`;
    } else if (source === PRIME_GAMING) {
        channelId = `${process.env.PRIME_GAMING_DISCORD_CHANNEL}`;
    } else if (source === RFD_FREEBIES) {
        channelId = `${process.env.RFD_FREEBIES_DISCORD_CHANNEL}`;
    } else if (source === STEAM) {
        channelId = `${process.env.STEAM_DISCORD_CHANNEL}`;
    } else if (source === UBISOFT) {
        channelId = `${process.env.UBISOFT_DISCORD_CHANNEL}`;
    } else if (source === UE_MARKETPLACE) {
        channelId = `${process.env.UE_MARKETPLACE_DISCORD_CHANNEL}`;
    } else {
        throw new Error('Source of "' + source + '" is unhandled');
    }

    return channelId;
}
