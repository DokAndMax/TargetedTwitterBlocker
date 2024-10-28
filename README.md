# TargetedTwitterBlocker

This repository contains a JavaScript script designed to help you block users responding to a specific tweet based on configurable criteria, such as the accounts they follow. The script should be run directly in the browser's console on the tweet page.

---

## Table of Contents
- [Overview](#overview)
- [Usage Instructions](#usage-instructions)
- [Parameters](#parameters)
- [Example Filter](#example-filter)

---

## Overview

The `twitter-blocker` script automates the process of blocking users who respond to a specific tweet, based on whether they follow certain accounts or meet other specified conditions. The script avoids blocking users already ignored or blocked.

## Usage Instructions

1. **Navigate to the tweet** you wish to monitor on Twitter (or X.com).
2. **Open the Developer Console**:
   - Right-click on the page, select **Inspect** (or use `Ctrl+Shift+I` / `Cmd+Option+I`).
   - Go to the **Console** tab.
3. **Paste the [script](https://raw.githubusercontent.com/DokAndMax/TargetedTwitterBlocker/refs/heads/main/script.js)** from the repository directly into the console and press `Enter`.
4. The script will automatically start fetching users and apply your filtering conditions to block the targeted accounts.
5. **Monitor the console output** for progress and a summary of blocked users.


## Parameters

The script utilizes the following parameters to determine whether to block users:

### `followingUsers`
An array of user objects representing the accounts that a user follows. Each object includes:
```json
[
    {
        "screenName": "x",
        "isBlocked": false
    },
    {
        "screenName": "elonmusk",
        "isBlocked": false
    },
    ...
]
```

### `profile`
An object containing details about the user who responded to the tweet. It includes fields like:
```json
{
    "following": false,
    "can_dm": false,
    "can_media_tag": false,
    "created_at": "Tue Jun 02 20:12:29 +0000 2009",
    "default_profile": false,
    "default_profile_image": false,
    "description": "Read @America to understand why I’m supporting Trump for President",
    "entities": {
        "description": {
            "urls": []
        },
        "url": {
            "urls": [
                {
                    "display_url": "TheAmericaPAC.org",
                    "expanded_url": "http://TheAmericaPAC.org",
                    "url": "https://t.co/DjyKIO6ePx",
                    "indices": [
                        0,
                        23
                    ]
                }
            ]
        }
    },
    "fast_followers_count": 0,
    "favourites_count": 84338,
    "followers_count": 202578364,
    "friends_count": 796,
    "has_custom_timelines": true,
    "is_translator": false,
    "listed_count": 152654,
    "location": "",
    "media_count": 2653,
    "name": "Elon Musk",
    "normal_followers_count": 202578364,
    "pinned_tweet_ids_str": [
        "1850663360355844099"
    ],
    "possibly_sensitive": false,
    "profile_banner_url": "https://pbs.twimg.com/profile_banners/44196397/1726163678",
    "profile_image_url_https": "https://pbs.twimg.com/profile_images/1849727333617573888/HBgPUrjG_normal.jpg",
    "profile_interstitial_type": "",
    "screen_name": "elonmusk",
    "statuses_count": 55768,
    "translator_type": "none",
    "url": "https://t.co/DjyKIO6ePx",
    "verified": false,
    "want_retweets": false,
    "withheld_in_countries": []
}
```

### `tweet`
An object representing the tweet that was replied to, including:
```json
{
    "bookmark_count": 32,
    "bookmarked": false,
    "created_at": "Mon Oct 28 14:15:01 +0000 2024",
    "conversation_id_str": "1850858902348267946",
    "display_text_range": [
        5,
        94
    ],
    "entities": {
        ...
    },
    "favorite_count": 1793,
    "favorited": false,
    "full_text": "@alx Not just capacity, there were over 70k people in the streets outside MSG to show support!",
    "in_reply_to_screen_name": "alx",
    "in_reply_to_status_id_str": "1850858902348267946",
    "in_reply_to_user_id_str": "534023",
    "is_quote_status": false,
    "lang": "en",
    "quote_count": 10,
    "reply_count": 178,
    "retweet_count": 291,
    "retweeted": false,
    "user_id_str": "44196397",
    "id_str": "1850904105117692152"
}
```

## Example Filter

You can modify the `shouldBlockUser` function to define conditions for blocking. Here’s a sample filter that:
- Blocks users who follow both `@exampleaccount1` and `@exampleaccount2`
- Blocks users if 50% or more of their followed accounts are already blocked accounts
- Blocks users who follow `@exampleaccount3`

Here is the code for the custom filter:

```javascript
function shouldBlockUser({ profile, tweet, followingUsers }) {
    // Condition 1: Block if the user follows both exampleaccount1 and exampleaccount2
    if (followingUsers.some(user => user.screenName === 'exampleaccount1') &&
        followingUsers.some(user => user.screenName === 'exampleaccount2')) {
        return true;
    }

    // Condition 2: Block if 50% or more of the followed accounts are blocked
    const blockedFollowingCount = followingUsers.filter(user => user.isBlocked).length;
    if (blockedFollowingCount / followingUsers.length >= 0.5) {
        return true;
    }

    // Condition 3: Block if the user follows exampleaccount3
    if (followingUsers.some(user => user.screenName === 'exampleaccount3')) {
        return true;
    }

    // No conditions met, do not block
    return false;
}
```

Modify the conditions as needed to suit your blocking criteria.
