const RSS_ARTICLES_DB_COLLECTION = 'rss-articles';
const RSS_FEEDS_DB_COLLECTION = 'rss-feeds';
const functions = require('firebase-functions/v1');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize firebase
initializeApp();
const db = getFirestore();

/**
 * Fetch feeds in the database.
 * @return {Array} An array of the feeds from the database.
 */
module.exports.fetchFeeds = async function() {
    return await fetch(RSS_FEEDS_DB_COLLECTION);
};

/**
 * Fetch articles in the database.
 * @return {Array} An array of the articles from the database.
 */
module.exports.fetchArticles = async function() {
    return await fetch(RSS_ARTICLES_DB_COLLECTION);
};

/**
 * Set a article to the database.
 * @param {string} id The id of the article to set.
 * @param {Array} obj The article to set.
 * @param {boolean} merge Whether to merge the article or not.
 */
module.exports.setArticle = async function(id, obj, merge) {
    return await db.collection(RSS_ARTICLES_DB_COLLECTION).doc(id).set(obj, { merge: merge });
};

/**
 * Deletes a document in the database.
 * @param {string} documentPath The id of the article to delete.
 */
module.exports.deleteArticle = async function(documentPath) {
    return await db.collection(RSS_ARTICLES_DB_COLLECTION).doc(documentPath).delete();
};

/**
 * Fetch items in the database.
 * @param {string} collectionPath The name of the collection to retrieve.
 * @return {Array} An array of the items from the database.
 */
async function fetch(collectionPath) {
    functions.logger.log('Fetching ' + collectionPath + ' from db');

    const dbItems = [];
    const dbFItemsRef = db.collection(collectionPath);
    const dbItemsSnapshot = await dbFItemsRef.get();
    dbItemsSnapshot.forEach((doc) => {
        dbItems.push(doc.data());
    });

    // Firestore returns the dates as Timestamp so convert to date.
    dbItems.forEach((dbItem) => {
        if (dbItem.date) {
            dbItem.date = dbItem.date.toDate();
        }

        if (dbItem.posted_date) {
            dbItem.posted_date = dbItem.posted_date.toDate();
        }
    });

    return dbItems;
}
