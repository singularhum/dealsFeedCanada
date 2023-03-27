# Deals Feed Canada

Sends notifications for new deals posted on popular Canadian communities:
- [/r/bapcsalescanada](https://www.reddit.com/r/bapcsalescanada/new/) - All sales PC-related in Canada
- [/r/GameDeals](https://www.reddit.com/r/GameDeals/new/) - Although not Canadian specific, many deals can be bought in CAD
- [RedFlagDeals](https://forums.redflagdeals.com/hot-deals-f9/?rfd_sk=tt) - A popular deals forum in Canada
- [/r/VideoGameDealsCanada](https://www.reddit.com/r/VideoGameDealsCanada/new/) - Canadian specific deals for Video Games

Deals Feed Canada runs as a scheduled cloud function (Firebase/Google Cloud) that uses Discord as the notification service.

## Discord Server

You can join the [Deals Feed Canada Discord server](https://discord.gg/wFVvfR4mGf) to start getting notifications.

Each source has two channels (all and hot) so you can customize which ones you want to be notified by. The "All" channels will post every deal while the "Hot" channels will only post deals that reach a certain score in a given amount of time.

**Important**: All deals posted are linked to their originating source (Reddit/RFD). No deals are linked directly to any products/services. Always be aware of scams, some posts might be detected before they are deleted by moderators. 

## About

### How frequent do deals get checked?
It is configured to run every 10 minutes.

### When are deals considered Hot?
A deal turns hot once a deal reaches a minimum score within a time range. These are my own personal preferences which may change. This was done to highlight rising deals I may have ignored or missed. This isn't perfect so price errors or low stock items might not be alive long enough to hit the hot status.
- /r/bapcsalescanada - 20+ score within 2 hours
- /r/GameDeals - 100+ score within 2 hours
- RedFlagDeals - 20+ score within 2 hours
- /r/VideoGameDealsCanada - 20+ score within 2 hours

### Why was this created?
I wanted a way to view and get notified of deals from various Canadian sources in a single location. I've used services like IFTTT and Feedly but they can be slow (if not paying) and I cannot customize enough to my own liking. I also wanted to learn a bit about Firebase Cloud Messaging (FCM) but although it works well, I ended up using Discord so I don't have to create web, desktop and mobile apps.

### Which services/tools are used to run Deals Feed Canada?
- Firebase / Google Cloud
    - [Cloud Firestore](https://firebase.google.com/docs/firestore) - A NoSQL database to keep track of the deals
    - [Cloud Scheduler](https://firebase.google.com/docs/functions/schedule-functions) - For running a scheduled cloud function in the background using Node.js
- [Discord.js](https://discord.js.org) - For using the Discord API to send and edit messages

### Cost
There is currently no cost so far in running Deals Feed Canada. Firebase / Google Cloud has a free tier as long as you do not exceed any quotas. The scheduled function has various limits in place to try to reduce excessive use which does introduce some limitations.

### Limitations
 - Deals are checked only every 10 minutes. This is to reduce API hits. Since scheduled functions can be run in shared environments, there is more potential for IP bans.
 - Only the first page of each source is loaded which is also done to reduce API load. This in general is fine for detecting new deals (>30 deals posted within 10 mins would be rare) but this does impact editing of messages. Each deal posted in the Discord contains the score and number of comments. Deals that fall off into the second page will no longer be tracked. Not a huge issue as the score/comments is just to give a general idea of activity and not to be exact.
 - The scheduled job instance isn't guaranteed to stay alive even when idle. This means any globals can be reset and would cause the database to be fetched to get the previous deals to compare against. To reduce database size, only a limited number of deals are kept. This is to reduce read costs (each item in the DB counts as 1 hit when fetching all) and time it takes to fetch and load them (time is a resource cost, even if nothing is happening).
 - The Discord API has dynamic rate limits in place and it is not generous for editing of messages. Editing just 20 messages a time can cause the function to timeout (currently set to 40 seconds). Discord.js queues and waits on API calls once it detects rate limit has been reached. Editing of messages isn't too important so there is logic in place to only update deals when the score or number of comments have changed a larger amount.

### Usage
This repository is provided to show how the Discord server works and is not set up in a way to be an easy way clone and run it right away. Some useful resources in case you need them:

- [Firebase Pricing](https://firebase.google.com/pricing) (Blaze Plan is used for Cloud Functions)
- [Firebase Projects](https://firebase.google.com/docs/projects/learn-more)
- [Firebase Admin](https://firebase.google.com/docs/admin/setup)
- [Firebase Cloud Firestore](https://firebase.google.com/docs/firestore/quickstart)
- [Firebase Cloud Functions](https://firebase.google.com/docs/functions)
- [Discord Bot Setup](https://discordjs.guide/preparations/setting-up-a-bot-application.html)
- [Discord.js Guide](https://discordjs.guide/)