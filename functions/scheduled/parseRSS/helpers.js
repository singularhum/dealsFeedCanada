
/**
 * Gets a date x number of days ago.
 * @param {int} i The number of days.
 * @return {Date} Returns a date based on the number of days supplied.
 */
module.exports.getDaysAgo = function(i) {
    return new Date(Date.now() - (i * 24 * 60 * 60 * 1000));
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
