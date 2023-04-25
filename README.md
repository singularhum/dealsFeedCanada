# free-deals branch

Currently testing having channels for limited time free deals. It is currently being run on the server but the channels are hidden until they are fully tested and ready.

The channels will be:
- Epic
- Fanatical
- GOG
- Prime Gaming
- Steam
- Ubisoft
- Unreal Engine Marketplace

# dealsFeed Canada

A bot that sends Discord notifications for new deals posted on popular Canadian-based communities:
- [/r/bapcsalescanada](https://www.reddit.com/r/bapcsalescanada/new/) - All PC-related sales in Canada
- [/r/GameDeals](https://www.reddit.com/r/GameDeals/new/) - Although not Canadian specific, many deals can be bought in CAD
- [RedFlagDeals](https://forums.redflagdeals.com/hot-deals-f9/?rfd_sk=tt) - A popular deals forum in Canada
- [/r/VideoGameDealsCanada](https://www.reddit.com/r/VideoGameDealsCanada/new/) - Canadian specific deals for Video Games

dealsFeed runs as a scheduled cloud function (Firebase / Google Cloud) that currently uses Discord as the notification service.

## Discord Server

Although this is for my own personal use, you can join my [dealsFeed Canada Discord server](https://discord.gg/wFVvfR4mGf) if you would like to also receive these kind of notifications. The Discord server is only for the bot to post deals. There are no open channels for anyone else to post messages.

[![Discord Banner 2](https://discordapp.com/api/guilds/1083821268652015726/widget.png?style=banner2)](https://discord.gg/wFVvfR4mGf)

### Features
- Sends notifications when new deals are detected every 5 minutes
- Displays and occassionaly updates the score, number of comments and flair (reddit) or status for each deal
- Sends seperate notifications when deals turn hot
- Will mark deals as Expired / Sold Out when properly identified (ex. specific flairs from reddit)
- Will ignore certain posts like daily/review discussion threads in /r/bapcsalescanada

### Channels
Each source has two channels (All and Hot) so you can customize which ones you want to be notified by. The "All" channels will post every deal while the "Hot" channels will only post deals that reach a certain score in a given amount of time.

![Screenshot of the Discord channels and sample of deals posted](https://i.imgur.com/lGcqWVN.png)

### When are deals considered hot?
A deal turns hot once a deal reaches a minimum score within a time range. These are my own personal preferences which may change as I test it. This was done to highlight rising deals I may have ignored or missed. This isn't perfect so price errors or low stock items might not be alive long enough to hit the hot status.
- /r/bapcsalescanada - 20+ score within 2 hours
- /r/GameDeals - 100+ score within 2 hours
- RedFlagDeals - 20+ score within 2 hours
- /r/VideoGameDealsCanada - 20+ score within 2 hours

### Update of deals

The bot displays the score, number of comments and a flair for each deal which need to be updated as time moves forward. However, due to rate limits with the Discord API the bot may only update certain deals occassionally based on various conditions. The updates should still happen frequently enough that it will give a good idea of the current state of the deal.

- A deal will be updated when:
    - turning hot
    - the title, flair or status (expired/deleted) changes
    - the score changes a certain amount
    - the number of comments changes a certain amount
- A deal will not be updated when:
    - it is not in the current list of the latest deals (only the first page of each source is checked, so around 25-30 deals) and will be identified as "Untracked"
    - an update limit has been reached

### Deal Links
All deals posted are linked to their originating source (reddit & RFD). No deals are linked directly to any products/services. This means dealsFeed is not responsible for any content. Always be aware of scams as some posts might be detected before they are deleted by moderators. 

## About

### Why was this created?
I wanted a way to view and get notified of deals from various Canadian sources in a single location. I've used services like IFTTT, Feedly and various Discord servers. They can have inconsistent delays in notifying and I cannot customize them enough to my own liking.

I also wanted to learn about Firebase Cloud Messaging (FCM) but although it works well, I ended up using Discord so I don't have to create web, desktop and mobile apps to receive the notifications.

### Which services and tools are used to run dealsFeed Canada?
- Firebase / Google Cloud
    - [Cloud Firestore](https://firebase.google.com/docs/firestore) - A NoSQL database to keep track of the deals to determine which ones are new or need to be updated
    - [Cloud Scheduler](https://firebase.google.com/docs/functions/schedule-functions) - For running a scheduled cloud function in the background using Node.js
- [Discord.js](https://discord.js.org) - For using the Discord API to send and edit messages
- APIs from the sources (reddit & RFD) that return JSON

### Cost
dealsFeed Canada Discord server is provided for free. There are no ads, affiliate links or any Discord features enabled that would generate money to me.

There is also no cost so far in running the service. Firebase / Google Cloud has a free tier in the Blaze plan as long as you do not exceed any quotas. The scheduled function has various limits in place to try to reduce excessive use which does introduce some limitations.

### Limitations
 - The bot cannot guarantee that every deal is sent a notification and on time. Use of the various APIs may cause deals to be delayed or missed. The bot currently does not attempt to resend any that are missed.
 - There isn't much in terms of filtering specific deals you want to be notified for. For example, you can't choose to only get notified of deals with specific keywords.
 - Deals are checked only every 5 minutes. This is to reduce API hits to start off as the rate limits are not documented for some APIs. Scheduled functions can also be run in shared environments which can cause a higher chance for IP bans if there are other apps doing the same thing.
 - Only the first page (25-30 deals) of each source is loaded which is also done to reduce API load and keep database size smaller. This in general is fine for detecting new deals (>30 deals posted within 5 mins would be rare) but this does impact editing of messages. Deals that fall off into the second page will no longer be updated (score and number of comments). Not a huge issue as these numbers are just to give a general idea of activity and not to be exact.
 - The Discord API has dynamic rate limits in place and it is not generous for editing of messages. Editing just 15-20 messages at a time can cause the function to timeout (currently set to 40 seconds). Discord.js queues and waits on API calls once it detects the rate limit has been reached. Editing of messages isn't too important so there is logic in place to only update deals when the score or number of comments have changed a certain amount.

### Usage
This repository is provided to show how the Discord server works and is not set up in an easy way to clone and run it right away. You will need to setup a Firebase project on the Blaze plan and configure a Discord server if you want to run it yourself.

You are free to take and modify the code for your own uses. This was only a small side project that doesn't do anything too special.

### Resources
- [Firebase Pricing](https://firebase.google.com/pricing) (Blaze Plan is used for Cloud Functions)
- [Firebase Projects](https://firebase.google.com/docs/projects/learn-more)
- [Firebase Admin](https://firebase.google.com/docs/admin/setup)
- [Firebase Cloud Firestore](https://firebase.google.com/docs/firestore/quickstart)
- [Firebase Cloud Functions](https://firebase.google.com/docs/functions)
- [Discord Bot Setup](https://discordjs.guide/preparations/setting-up-a-bot-application.html)
- [Discord.js Guide](https://discordjs.guide/)