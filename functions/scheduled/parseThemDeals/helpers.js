const functions = require('firebase-functions');

/**
 * Logs the IP address being used for the function.
 */
module.exports.logIP = async function() {
    try {
        const response = await fetch(`${process.env.IP_API_URL}`, {
            method: 'get',
            signal: AbortSignal.timeout(3000),
        });

        if (response.ok) {
            functions.logger.log('IP: ' + await response.text());
        } else {
            functions.logger.log('IP: - ');
        }
    } catch (e) {
        functions.logger.log('IP: - ', e);
    }
};

/**
 * Gets a date x number of days ago.
 * @param {int} i The number of days.
 * @return {Date} Returns a date based on the number of days supplied.
 */
module.exports.getDaysAgo = function(i) {
    return new Date(Date.now() - (i * 24 * 60 * 60 * 1000));
};

/**
 * Gets a date x number of hours ago.
 * @param {int} i The number of hours.
 * @return {Date} Returns a date based on the number of hours supplied.
 */
module.exports.getHoursAgo = function(i) {
    return new Date(Date.now() - (i * 60 * 60 * 1000));
};

/**
 * Trims a string if it exceeds the length and adds ellipsis.
 * @param {string} text The text to trim.
 * @param {int} length The max length.
 * @return {string} Returns a string that is trimmed if it exceeds the length.
 */
module.exports.trimString = function(text, length) {
    return text.length > length ? text.substring(0, length - 3) + '...' : text;
};
