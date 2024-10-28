(async function() {
	// Configuration object with features, field toggles, and API endpoints
	const config = {
		features: {
			rweb_tipjar_consumption_enabled: true,
			responsive_web_graphql_exclude_directive_enabled: true,
			verified_phone_label_enabled: false,
			creator_subscriptions_tweet_preview_api_enabled: true,
			responsive_web_graphql_timeline_navigation_enabled: true,
			responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
			communities_web_enable_tweet_community_results_fetch: true,
			c9s_tweet_anatomy_moderator_badge_enabled: true,
			articles_preview_enabled: true,
			responsive_web_edit_tweet_api_enabled: true,
			graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
			view_counts_everywhere_api_enabled: true,
			longform_notetweets_consumption_enabled: true,
			responsive_web_twitter_article_tweet_consumption_enabled: true,
			tweet_awards_web_tipping_enabled: false,
			creator_subscriptions_quote_tweet_preview_enabled: false,
			freedom_of_speech_not_reach_fetch_enabled: true,
			standardized_nudges_misinfo: true,
			tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
			rweb_video_timestamps_enabled: true,
			longform_notetweets_rich_text_read_enabled: true,
			longform_notetweets_inline_media_enabled: true,
			responsive_web_enhance_cards_enabled: false,
		},
		fieldToggles: {
			withArticleRichContentState: true,
			withArticlePlainText: false,
			withGrokAnalyze: false,
			withDisallowedReplyControls: false,
		},
		apiEndpoints: {
			tweetDetail: "https://x.com/i/api/graphql/nBS-WpgA6ZG0CyNHD517JQ/TweetDetail",
			following: "https://x.com/i/api/graphql/eWTmcJY3EMh-dxIR7CYTKw/Following",
			blockUser: "https://x.com/i/api/1.1/blocks/create.json",
		}
	};

	// Helper functions to retrieve key information
	const tweetId = getTweetId();
	const authToken = getAuthToken();
	const csrfToken = getCsrfToken();

	// Retrieves the Tweet ID from the current URL
	function getTweetId() {
		return window.location.href.split('/').pop();
	}

	// Retrieves the authentication token from session storage
	function getAuthToken() {
		const sessionData = sessionStorage.getItem('bis_data');
		return sessionData ? JSON.parse(sessionData).config.twitterConfig.LOAD_USER_DATA.AUTH_BEARER : null;
	}

	// Retrieves the CSRF token from the cookies
	function getCsrfToken() {
		const token = document.cookie.split('; ').find(row => row.startsWith('ct0'));
		return token ? token.split('=')[1] : null;
	}

	// Creates request headers for API calls
	function createRequestHeaders() {
		return {
			authorization: authToken,
			'x-csrf-token': csrfToken,
		};
	}

	// Universal API request function for making requests
	async function apiRequest(url, method = 'GET', body = null) {
		const options = {
			headers: createRequestHeaders(),
			method,
			credentials: 'include',
		};
		if (body) {
			options.body = body;
			options.headers["Content-Type"] = "application/x-www-form-urlencoded";
		}

		try {
			const response = await fetch(url, options);
			return await response.json();
		} catch (error) {
			console.error(`Error in API request to ${url}:`, error);
			return null;
		}
	}

	// Fetches responses for a tweet, with optional pagination cursor
	async function fetchTweetResponses(cursor = null) {
		const variables = {
			focalTweetId: tweetId,
			with_rux_injections: false,
			rankingMode: "Relevance",
			includePromotedContent: true,
			withCommunity: true,
			withQuickPromoteEligibilityTweetFields: true,
			withBirdwatchNotes: true,
			withVoice: true,
			cursor,
		};

		const url = `${config.apiEndpoints.tweetDetail}?variables=${encodeURIComponent(JSON.stringify(variables))}&features=${encodeURIComponent(JSON.stringify(config.features))}&fieldToggles=${encodeURIComponent(JSON.stringify(config.fieldToggles))}`;

		return apiRequest(url);
	}

	// Fetches the list of users a given user is following
	async function fetchUserFollowing(userId) {
		const variables = {
			userId,
			count: 20,
			includePromotedContent: false,
		};

		const url = `${config.apiEndpoints.following}?variables=${encodeURIComponent(JSON.stringify(variables))}&features=${encodeURIComponent(JSON.stringify(config.features))}`;

		const data = await apiRequest(url);

		return extractFollowingScreenNames(data);
	}

	// Extracts screen names of the users from the following list response data
	function extractFollowingScreenNames(data) {
		return data?.data?.user?.result?.timeline?.timeline?.instructions
			.flatMap(instr => instr.entries || [])
			.filter(entry => entry.content.entryType === "TimelineTimelineItem" && entry.content.itemContent.user_results.result)
			.map(entry => ({
				screenName: entry.content.itemContent.user_results.result.legacy?.screen_name,
				isBlocked: entry.content.itemContent.user_results.result.legacy.blocking ?? false,
			})) || [];
	}

	// Blocks a user with the given user ID
	async function blockUser(userId) {
		await apiRequest(config.apiEndpoints.blockUser, 'POST', `user_id=${userId}`);
		console.log(`Blocked user with ID: ${userId}`);
	}

	// Processes tweet responses, extracting user IDs and blocking users based on conditions
	async function processTweetResponses() {
		let cursorQueue = [];
		const processedUserIds = new Set();
		let blockedCount = 0;

		do {
			const data = await fetchTweetResponses(cursorQueue.shift());
			const entries = data.data.threaded_conversation_with_injections_v2.instructions.flatMap(instr => instr.entries || []);

			for (const entry of entries) {
			const itemContents = extractItemContents(entry);
			
				for (const itemContent of itemContents) {
					let userId;
					if (isTweetEntry(itemContent)) {
						userId = itemContent.tweet_results.result.legacy.user_id_str;
					} else if (isCursorEntry(itemContent)) {
						cursorQueue.push(itemContent.value);
						continue;
					} else {
						continue;
					}

					if (processedUserIds.has(userId)) continue;

					const profile = itemContent.tweet_results.result.core.user_results.result.legacy;
					const tweet = itemContent.tweet_results.result.legacy;
					const followingUsers = await fetchUserFollowing(userId);

					if (shouldBlockUser({ profile, tweet, followingUsers })) {
						await blockUser(userId);
						logBlockedUser(profile, tweet);
						blockedCount += 1;
					}

					processedUserIds.add(userId);
				}
			}
		} while (cursorQueue.length > 0);

		console.log(`Processing complete. Total blocked users: ${blockedCount}.`);
	}

	// Extracts item content from timeline entries (tweets and cursors)
	function extractItemContents(entry) {
		if (entry.content.entryType === "TimelineTimelineItem")
			return [entry.content.itemContent];
		if (entry.content.entryType === "TimelineTimelineModule")
			return entry.content.items.map(item => item.item.itemContent);
		return [];
	}

	function isTweetEntry(itemContent) {
		return itemContent.itemType === "TimelineTweet" && itemContent.tweet_results.result.__typename !== "TweetWithVisibilityResults";
	}

	function isCursorEntry(itemContent) {
		return itemContent.itemType === "TimelineTimelineCursor";
	}
	
	function logBlockedUser(profile, tweet) {
		console.log(`Blocked user ${profile.screen_name}`);
		console.log(`Profile: ${profile.name} (@${profile.screen_name})`);
		console.log(`Tweet: ${tweet.full_text}`);
		console.log(`Link: https://x.com/${profile.screen_name}/status/${tweet.id_str}`);
	}

	// Predicate function to check if a user should be blocked based on conditions
	function shouldBlockUser({ profile, tweet, followingUsers }) {
		
		return false;
	}

	// Start processing the tweet responses
	await processTweetResponses();
})();
