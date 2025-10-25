# dealsFeed Canada

dealsFeed Canada is a Discord server where you can get notified for new deals posted on popular Canadian-based communities and as well as limited-time free deals.

This was created for my own personal use and preferences but you can [join the server](https://discord.gg/wFVvfR4mGf)  if you would like to receive these kind of notifications too. The server is only for the bot to post deals so there are no open channels for anyone else to post messages.

[![Discord Banner 2](https://discordapp.com/api/guilds/1083821268652015726/widget.png?style=banner2)](https://discord.gg/wFVvfR4mGf) 

## Features

- Posts new deals that are detected every 1-2 mins for Reddit sources, 5 mins for RFD and 30 mins for free deals
- Use Discord notifications to get notified of new deals and/or use the server as a consolidated feeds reader
- Subscribe to alerts when deals contain certain keywords (ex. Price Error) and/or request your own
- Displays and occasionally updates the score/upvotes, number of comments and flair/status of each deal when available
- Posts separate notifications when deals turn hot (reaches a minimum score in a given time frame)
- Marks deals as Expired / Sold Out when properly identified (ex. specific flairs from Reddit)
- Ignores certain non-deal posts like daily/review discussion threads in /r/bapcsalescanada

## Feeds

These are the main feeds the bot uses to look for deals and are located under the All Deals and Hot Deals categories of the server. 

The channels under All Deals will contain every deal from the source while the Hot Deals channels will only show deals that have reached a minimum score in a given time frame.

Only about the latest 25-30 deals (first page) are tracked for each feed for occasionally keeping them up-to-date.

| Name | Description | Refresh Rate | Hot Deals | Source |
| --- | --- | --- | --- | --- |
| [/r/bapcsalescanada](https://www.reddit.com/r/bapcsalescanada/new/) | PC-related sales in Canada | 1-2 mins | 20+ in 6 hrs | Reddit API |
| [/r/GameDeals](https://www.reddit.com/r/GameDeals/new/) | Deals for games, many which can be bought in CAD | 1-2 mins | 100+ in 6 hrs | Reddit API |
| [RedFlagDeals Hot Deals](https://forums.redflagdeals.com/hot-deals-f9/?rfd_sk=tt) | A popular deals forum in Canada | 5 mins | 20+ in 6 hrs | RFD API |
| [/r/VideoGameDealsCanada](https://www.reddit.com/r/VideoGameDealsCanada/new/) | Canadian specific deals for Video Games | 1-2 mins | 20+ in 6 hrs | Reddit API |

![Screenshot of the main Discord channels](https://i.imgur.com/zOekzH5.png)

### Free Deals

These are for limited-time free deals that I usually grab from personally.

| Name | Description | Refresh Rate | Expiry Date | Source |
| --- | --- | --- | --- | --- |
| [Epic](https://store.epicgames.com) | Free games every week | 30 mins | Yes | Epic Search |
| [Fanatical](https://www.fanatical.com) | Free games, usually Steam games | 30 mins | No | Fanatical Search |
| [GOG](https://www.gog.com/) | Giveaways for PC games | 30 mins | Yes | GOG Search |
| [Prime Gaming](https://gaming.amazon.com) | Free games for those with Amazon Prime | 30 mins | Yes | Prime Gaming Search |
| [RFD Freebies](https://forums.redflagdeals.com/freebies-f12/?sk=tt&rfd_sk=tt&sd=d) | Freebies forum on RFD | 30 mins | No | RFD API |
| [Steam](https://store.steampowered.com/) | Free to keep Steam games (does not include free-to-play or free weekend games) | 30 mins | Yes | Steam Search |

![Screenshot of the free deals Discord channels](https://i.imgur.com/WUCaWny.png)

### Other Feeds

This category in the server will contain feeds that are not related to Canada. This can be useful for those of you that visit or have friends/family in other countries.

These feeds are only visible if you opt-in. Head over to the #roles channel to get access.

Only about the latest 25-30 deals (first page) are tracked for each feed for occasionally keeping them up-to-date.

 Name | Location | Description | Refresh Rate | Source |
| --- | --- | --- | --- | --- |
| [OzBargain](https://www.ozbargain.com.au/deals) | Australia | A popular community driven website in Australia for deals. All deals are posted. | 5 mins | OzBargain RSS |
| [Slickdeals Rising](https://slickdeals.net/forums/forumdisplay.php?f=9) | US | A hot deals forum for the US. Since many deals are posted, this feed will only post deals that have reached a minimum of 5 upvotes. | 5 mins | Slickdeals RSS |
| [Slickdeals Hot](https://slickdeals.net/forums/forumdisplay.php?f=9) | US | The same as Slickdeals Rising but will only post deals with a minimum of 15 upvotes. | 5 mins | Slickdeals RSS |

## Alerts

Alerts will ping you when new deals are posted that contain certain keywords. This feature is useful for those that may only want to be notified for specific deals instead of all deals.

Alerts can be enabled by subscribing to a predefined list of keywords or requesting your own custom ones. When subscribing to an alert, you will be assigned the appropriate role by a bot which will be pinged when a matching deal is found.

If you want to access it, head on over to the #⁠roles channel and react to the 🔔.

The Alerts category contains three channels:
- alerts - This will contain all the pinged alerts with a reference to the originating post in All Deals
- configure - This is where you can subscribe to predefined alerts (more to be added based on requests)
- requests - Instructions on how to request custom alerts

<h2 id="faq">
Frequently Asked Questions (FAQ)
</h2>

### General

<details>
<summary>How do I join the Discord server?</summary>

You can join the Discord server using the following [invite link](https://discord.gg/wFVvfR4mGf). You must have a Discord account with a verified email to join.
</details>

<details>
<summary>Do I have to pay anything to use the Discord server?</summary>

No, the server is provided for free. There are no ads, affiliate links or any Discord features enabled that would generate money to me.
</details>

<details>
<summary>How do I change my Discord notification settings?</summary>

Please refer to https://support.discord.com/hc/en-us/articles/215253258-Notifications-Settings-101
</details>

<details>
<summary>Why do I not see specific channels?</summary>

Some channels are hidden by default and you need to grant yourself access to it. Go to the #roles channel in the server to get access.
</details>

<details>
<summary>What are roles and how do I assign or unassign a role to myself?</summary>

Roles are used in this server to control which channels you have access to. You assign or unassign your roles in the #roles channel by reacting (assign) or unreacting (unassign) to a specific emoji. Role assignments are currently handled by the [YAGPDB.xyz](https://yagpdb.xyz/) bot.
</details>

<details>
<summary>The roles assignment is not working?</summary>

The roles assignment uses the YAGPDB.xyz bot so if it is offline it will not work. Otherwise, you can try reacting and unreacting or vice versa to reset your role.
</details>

<details>
<summary>Where do I report an issue or make a suggestion?</summary>

Since the server has no open channels, you can submit a report in the Issues section of this GitHub project or you can send me a direct message on Discord.

You can also make suggestions but please note that this free server is for my own preferences so I may not action them.
</details>

<details>
<summary>Why are there no open channels for things like discussions as a community?</summary>

The main reason is that this is for my own personal use and its purpose is just to be a consolidated feeds reader. Having open channels would require moderation which I'm not interested in nor finding people to do so. This could change in the future.
</details>

<details>
<summary>Why was this created?</summary>

I wanted a way to view and get notified of deals from various Canadian sources in a single location. I've used services like IFTTT, Feedly and various Discord servers. They can have inconsistent delays in notifying and I cannot customize them enough to my own liking.

I also wanted to learn about Firebase Cloud Messaging (FCM) but although it works well, I ended up using Discord so I don't have to create web, desktop and mobile apps to receive the notifications.
</details>

### Deals
<details>
<summary>What are the different statuses for deals?</summary>

Statuses are used to identify the state of deals and this only applies to All Deals and Hot Deals channels:
- (None) - When nothing is shown in the footer of the deal means the deal is still active according to its source post
- Expired - The deal has been marked as Expired in the source post. The title will also be striked out.
- Sold Out - Same as Expired. This is sometimes used by some posts in /r/bapcsalescanada.
- Untracked - This means the deal is no longer tracked and will not be updated anymore. The bot only keeps track of the first page of the latest deals.
- Deleted - The originating deal was deleted, either by the original poster or by moderators.
- Moved - This is specific to RedFlagDeals. Sometimes posts are moved to a different sub-forum when they don't belong in the Hot Deals forum.
- (Other) - When anything else is shown, this is the flair applied to the post on Reddit usually containing additional info about the deal.
</details>

<details>
<summary>When are deals considered hot?</summary>

A deal turns hot once a deal reaches a minimum score within a time range. These are my own personal preferences which may change as I test it. This was done to highlight rising deals I may have ignored or missed. This isn't perfect so price errors or low stock items might not be alive long enough to hit the hot status.
- /r/bapcsalescanada - 20+ score within 6 hours
- /r/GameDeals - 100+ score within 6 hours
- RedFlagDeals - 20+ score within 6 hours
- /r/VideoGameDealsCanada - 20+ score within 6 hours
</details>

<details>
<summary>When are deals updated?</summary>

The bot displays the score, number of comments and a flair for each deal which need to be updated as time moves forward. However, due to rate limits with the Discord API the bot may only update certain deals occasionally based on various conditions. The updates should still happen frequently enough that it will give a good idea of the current state of the deal.

- A deal will be updated when:
    - turning hot
    - the title, flair or status (expired/deleted) changes
    - the score changes a certain amount
    - the number of comments changes a certain amount
- A deal will not be updated when:
    - it is not in the current list of the latest deals (only the first page of each source is checked, so around 25-30 deals) and will be identified as "Untracked"
    - an update limit has been reached
</details>

<details>
<summary>How are deals linked?</summary>

Deals posted under All and Hot are linked to their originating source (Reddit & RFD) and not directly to any products/services. Always be aware of scams as some posts might be detected before they are deleted by moderators. 

Free deals are linked directly to their product pages (except for RFD freebies). No affiliate links are used.
</details>

<details>
<summary>Why was a deal not posted?</summary>

A deal may not be posted for various reasons either by design or an error:
- The post is not considered a deal and was ignored. This includes daily/review discussion threads in /r/bapcsalescanada and posts tagged as "Question" in /r/VideoGameDealsCanada.
- For free deals, only limited-time deals are posted. So if a game is permanently free, it will generally not be posted.
- The API might not have included the post within the refresh cycle so you might need to wait until the next refresh.
- There was an error with the Discord API. If a message fails to send, it will not be resent.
- There was an error with the source API.
- The deal was posted but removed by Admins. The deal could have been a scam or not deal related.
</details>

### Alerts

<details>
<summary>How do I get access to alerts?</summary>

Please go to the #roles channel and react to the Alerts emoji to get access to the Alerts category. Next head over to the #configure channel to select which alerts you want to subscribe to.
</details>

<details>
<summary>How are alerts pinged to me?</summary>

When you subscribe to an alert, you will be assigned to a corresponding role. Once a deal matches the alert, the role will be pinged in the #alerts channel.
</details>

<details>
<summary>What kind of matching is used for the keywords?</summary>

By default the matching is done by finding the entire phrase in the title/name of a deal post (case-insensitive). This means if there are multiple words being used like "Mountain Bike" then it will match any deals that contain the exact words of "Mountain Bike" in the title/name.

The search can be more complex if needed since it uses a regular expression for the matching. For example, an existing alert for "CPU" currently ignores a deal with "CPU Cooler".
</details>

<details>
<summary>Can I request custom alerts?</summary>

Yes, please go to the #requests channel for instructions to request your own alerts. These will be manually added by me when I get the chance.
</details>

<details>
<summary>Why are alerts posted in its own channel and not on the actual deal posted?</summary>

Currently, deals are posted using an embed due to nicer formatting available like hyperlinks so that the title/name of the deal contains the link. However, embeds do not allow pinging. By adding the ping above the embed, the text in notifications will only contain the ping and not the deal's title/name.

Another option is to not use embeds but hyperlinks are not allowed yet so the formatting wouldn't be as good.

So to not change the formatting for now, a separate post with the alert formatting will be made.
</details>

<details>
<summary>Why am I not getting alerts or getting notified for all alerts?</summary>

Please remember to set your notification settings for the #alerts channel to be "Only @mentions" and not "All Messages" so that you are only notified for the alerts you subscribed to.
</details>

### Technical

<details>
<summary>Which services and tools are used?</summary>

- Firebase / Google Cloud
    - [Cloud Firestore](https://firebase.google.com/docs/firestore) - A NoSQL database to keep track of the deals to determine which ones are new or need to be updated
    - [Cloud Scheduler](https://firebase.google.com/docs/functions/schedule-functions) - For running a scheduled cloud function in the background using Node.js
- [Discord.js](https://discord.js.org) - For using the Discord API to send and edit messages
- APIs from the sources that mostly return JSON
</details>

<details>
<summary>Is there any cost in running the bot/server?</summary>

There is no cost in running the service. Firebase / Google Cloud has a free tier in the Blaze plan as long as you do not exceed any quotas. The scheduled function has various limits in place to try to reduce excessive use which does introduce some limitations.
</details>

<details>
<summary>What are the limitations?</summary>

- The bot cannot guarantee that every deal is sent a notification and on time. Use of the various APIs may cause deals to be delayed or missed. The bot currently does not attempt to resend any that are missed.
- There isn't much in terms of filtering specific deals you want to be notified for. For example, you can't choose to only get notified of deals with specific keywords.
- Deals are checked at various frequencies depending on the source. This is to reduce API hits to start off as the rate limits are not documented for some APIs. Scheduled functions can also be run in shared environments which can cause a higher chance for IP bans if there are other apps doing the same thing.
- Only the first page (25-30 deals) of each source is loaded which is also done to reduce API load and keep database size smaller. This in general is fine for detecting new deals (>30 deals posted within 5 mins would be rare) but this does impact editing of messages. Deals that fall off into the second page will no longer be updated (score and number of comments). Not a huge issue as these numbers are just to give a general idea of activity and not to be exact.
- The Discord API has dynamic rate limits in place and it is not generous for editing of messages. Editing just 15-20 messages at a time can cause the function to timeout (currently set to 40 seconds). Discord.js queues and waits on API calls once it detects the rate limit has been reached. Editing of messages isn't too important so there is logic in place to only update deals when the score or number of comments have changed a certain amount.
</details>

<details>
<summary>How can I use the code for the bot?</summary>

This repository is provided to show how the Discord bot works and is not set up in an easy way to clone and run it right away. You will need to setup a Firebase project on the Blaze plan and configure a Discord server if you want to run it yourself.

The URLs of the API calls are also not included in the repository.

You are free to take and modify the code for your own uses. This was only a small side project that doesn't do anything too special.
</details>

## Resources
- [Firebase Pricing](https://firebase.google.com/pricing) (Blaze Plan is used for Cloud Functions)
- [Firebase Projects](https://firebase.google.com/docs/projects/learn-more)
- [Firebase Admin](https://firebase.google.com/docs/admin/setup)
- [Firebase Cloud Firestore](https://firebase.google.com/docs/firestore/quickstart)
- [Firebase Cloud Functions](https://firebase.google.com/docs/functions)
- [Discord Bot Setup](https://discordjs.guide/preparations/setting-up-a-bot-application.html)
- [Discord.js Guide](https://discordjs.guide/)