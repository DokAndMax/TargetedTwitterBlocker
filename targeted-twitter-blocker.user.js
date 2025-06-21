// ==UserScript==
// @name         Targeted Twitter Blocker
// @namespace    https://github.com/DokAndMax/TargetedTwitterBlocker
// @version      1.3
// @description  Block users based on custom conditions with validation
// @author       DokAndMax
// @match        https://twitter.com/*
// @match        https://x.com/*
// @grant        GM_addElement
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/DokAndMax/TargetedTwitterBlocker/refs/heads/main/targeted-twitter-blocker.user.js
// @downloadURL  https://raw.githubusercontent.com/DokAndMax/TargetedTwitterBlocker/refs/heads/main/targeted-twitter-blocker.user.js
// @require      https://raw.githubusercontent.com/DokAndMax/TargetedTwitterBlocker/refs/heads/main/x-client-transaction-id-generator.js
// ==/UserScript==

(function() {
    'use strict';

    // ----------------------
    // Styles for buttons and UI elements
    const buttonStyles = {
        // Styles for the main activation button
        mainButton: {
            base: {
                position: 'fixed',
                bottom: '20px',
                right: '20px',
                zIndex: '9999',
                padding: '10px 15px',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontWeight: 'bold',
                transition: '0.3s'
            },
            states: {
                normal: {
                    background: '#1da1f2',
                    color: 'rgb(231, 233, 234)',
                    text: 'Activate Blocker'
                },
                processing: {
                    background: '#1da1f2',
                    color: 'rgb(231, 233, 234)',
                    text: 'Processing... Click to cancel'
                },
                cancelling: {
                    background: '#ff9800',
                    color: 'rgb(231, 233, 234)',
                    text: 'Cancelling...'
                },
                success: {
                    background: '#4CAF50',
                    color: 'rgb(231, 233, 234)',
                    text: 'Completed: '
                },
                error: {
                    background: '#f44336',
                    color: 'rgb(231, 233, 234)',
                    text: 'Error! Click to retry'
                },
                disabled: {
                    background: '#cccccc',
                    color: '#666666',
                    text: 'Not on tweet page'
                }
            }
        },

        // Styles for the settings button
        settingsButton: {
            base: {
                position: 'fixed',
                bottom: '70px',
                right: '20px',
                zIndex: '9999',
                padding: '10px 15px',
                border: 'none',
                borderRadius: '5px',
                background: '#1da1f2',
                color: 'rgb(231, 233, 234)',
                cursor: 'pointer',
                fontWeight: 'bold',
                transition: '0.3s'
            },
            text: 'Settings'
        },

        // Styles for the modal window for custom conditions
        modal: {
            container: {
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'black',
                padding: '20px',
                borderRadius: '8px',
                boxShadow: '0 0 15px rgba(231,233,234,0.3)',
                zIndex: '10000',
                minWidth: '500px',
                fontFamily: 'Arial, sans-serif'
            },
            title: {
                marginTop: '0',
                color: 'rgb(231, 233, 234)'
            },
            textarea: {
                width: '100%',
                height: '300px',
                margin: '15px 0',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontFamily: 'monospace',
                whiteSpace: 'pre',
                overflowWrap: 'normal',
                overflowX: 'auto',
                boxSizing: 'border-box'
            },
            buttonRow: {
                display: 'flex',
                gap: '10px',
                justifyContent: 'flex-end'
            },
            saveButton: {
                padding: '8px 20px',
                background: '#4CAF50',
                color: 'rgb(231, 233, 234)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
            },
            cancelButton: {
                padding: '8px 20px',
                background: '#f44336',
                color: 'rgb(231, 233, 234)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
            },
            errorContainer: {
                color: '#f44336',
                margin: '10px 0',
                display: 'none'
            }
        },

        // Styles for the overlay behind the modal
        overlay: {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.5)',
            zIndex: '9999'
        }
    };

    // Global variables to track state
    let totalBlocked = 0;
    let errorState = false;
    let btn = null;
    let urlCheckInterval = null;
    let isProcessing = false;
    let isCancelling = false;
    let abortController = null;
    let isCompleted = false;

    // Add additional CSS for the disabled button state
    GM_addStyle(`
        #blocker-activator:disabled {
            cursor: not-allowed !important;
            opacity: 0.7;
        }
    `);

    // ----------------------
    // Determines if the current page is a tweet page by checking URL pathname
    function isTweetPage() {
        return window.location.pathname.includes('/status/');
    }

    // ----------------------
    // Updates the activation button state based on the current page and processing state
    function updateButtonState() {
        if (!btn) return;

        const isTweet = isTweetPage();
        btn.disabled = !isTweet && !isProcessing;

        let stateKey;

        if (!isTweet) {
            isCompleted = false;
            if (isProcessing) cancelProcessing();
            stateKey = 'disabled';
        } else if (isCompleted) {
            stateKey = 'success';
        } else if (errorState) {
            stateKey = 'error';
        } else if (isCancelling) {
            stateKey = 'cancelling';
        } else if (isProcessing) {
            stateKey = 'processing';
        } else {
            stateKey = 'normal';
        }

        const state = buttonStyles.mainButton.states[stateKey];
        btn.textContent = state.text + (stateKey === 'success' ? ` ${totalBlocked} users` : '');
        btn.style.backgroundColor = state.background;
        btn.style.color = state.color;

        if (stateKey === 'disabled') btn.disabled = true;
    }

    // ----------------------
    // Monitors URL changes and updates the button state accordingly at regular intervals
    function handleUrlChange() {
        clearInterval(urlCheckInterval);
        urlCheckInterval = setInterval(() => {
            updateButtonState();
        }, 1000);
    }

    // ----------------------
    // Cancels the current processing by aborting the ongoing API requests
    function cancelProcessing() {
        if (isProcessing && abortController) {
            abortController.abort();
            isProcessing = false;
            abortController = null;
            isCancelling = true;
            updateButtonState();
            setTimeout(() => {
                isCancelling = false;
                updateButtonState();
            }, 2000);
        }
    }

    // ----------------------
    // Validates the custom user code by attempting to compile it within a temporary function
    // Returns a promise that resolves with the validation result (isValid and error if any)
    function validateUserCode(code) {
        return new Promise((resolve) => {
            const validationScript = `
                try {
                    window.__tempValidationFunction = (params) => {
                        ${code}
                    };
                    window.__validationSuccess = true;
                } catch(e) {
                    window.__validationError = e;
                    window.__validationSuccess = false;
                }
            `;

            const script = GM_addElement(document.head, 'script', {
                type: 'text/javascript',
                textContent: validationScript
            });

            // Wait briefly to allow the script to run and then check validation results
            setTimeout(() => {
                const isValid = unsafeWindow.__validationSuccess === true;
                const error = unsafeWindow.__validationError;

                // Cleanup temporary variables and script element
                script.remove();
                delete unsafeWindow.__tempValidationFunction;
                delete unsafeWindow.__validationSuccess;
                delete unsafeWindow.__validationError;

                resolve({ isValid, error });
            }, 100);
        });
    }

    // ----------------------
    // Adds a "Settings" button to the page for entering custom blocking conditions
    function addSettingsButton() {
        if (document.getElementById('blocker-settings')) return;

        const settingsBtn = GM_addElement(document.body, 'button', {
            id: 'blocker-settings',
            style: getStyleString(buttonStyles.settingsButton.base),
            textContent: buttonStyles.settingsButton.text
        });

        // When clicked, show the settings modal
        settingsBtn.addEventListener('click', showSettingsModal);
    }

    // ----------------------
    // Displays a modal window to allow the user to input custom blocking conditions
    function showSettingsModal() {
        const existingModal = document.getElementById('blocker-settings-modal');
        if (existingModal) return;

        // Create modal container
        const modal = GM_addElement(document.body, 'div', {
            id: 'blocker-settings-modal',
            style: getStyleString(buttonStyles.modal.container)
        });

        // Create modal title
        const title = GM_addElement(modal, 'h3', {
            textContent: 'Custom Blocking Conditions',
            style: getStyleString(buttonStyles.modal.title)
        });

        // Create textarea for custom condition input
        const textarea = GM_addElement(modal, 'textarea', {
            id: 'blocker-condition-input',
            style: getStyleString(buttonStyles.modal.textarea),
            placeholder: '// Return true to block the user\n' +
            '// Available parameters: profile, tweet, followingUsers\n\n' +
            '// Example 1: Block accounts with low followers\n' +
            '// return profile.followers_count < 100;\n\n' +
            '// Example 2: Block users following specific accounts\n' +
            '// const followingNames = followingUsers.map(u => u.screenName.toLowerCase());\n' +
            '// return followingNames.includes("bot123");'
        });
        textarea.value = GM_getValue('userCondition', '');

        // Create a container for the Save and Cancel buttons
        const buttonRow = GM_addElement(modal, 'div', {
            style: getStyleString(buttonStyles.modal.buttonRow)
        });

        // Create Save button
        const saveBtn = GM_addElement(buttonRow, 'button', {
            textContent: 'Save',
            style: getStyleString(buttonStyles.modal.saveButton)
        });

        // Create Cancel button
        const cancelBtn = GM_addElement(buttonRow, 'button', {
            textContent: 'Cancel',
            style: getStyleString(buttonStyles.modal.cancelButton)
        });

        // Container for displaying validation errors
        const errorContainer = GM_addElement(modal, 'div', {
            style: getStyleString(buttonStyles.modal.errorContainer),
            id: 'blocker-error-container'
        });

        // When Save is clicked, validate the code and save if valid
        saveBtn.onclick = async () => {
            const code = textarea.value.trim();
            const { isValid, error } = await validateUserCode(code);

            if (!isValid) {
                errorContainer.textContent = `Validation Error: ${error?.message || 'Invalid function syntax'}`;
                errorContainer.style.display = 'block';
                return;
            }

            errorContainer.style.display = 'none';
            GM_setValue('userCondition', code);
            modal.remove();
            overlay.remove();
        };

        // When Cancel is clicked, remove the modal and overlay
        cancelBtn.onclick = () => {
            modal.remove();
            overlay.remove();
        };

        // Create overlay behind the modal
        const overlay = GM_addElement(document.body, 'div', {
            style: getStyleString(buttonStyles.overlay)
        });
        overlay.onclick = cancelBtn.onclick;
    }

    // ----------------------
    // Determines whether a user should be blocked by executing the custom user condition function
    // The function is passed the user profile, tweet, and following users data
    function shouldBlockUser({ profile, tweet, followingUsers }) {
        if (typeof unsafeWindow.userConditionFunction === 'function') {
            try {
                return unsafeWindow.userConditionFunction({
                    profile: profile,
                    tweet: tweet,
                    followingUsers: followingUsers
                });
            } catch (error) {
                console.error('User condition error:', error);
            }
        }
        return false;
    }

    // ----------------------
    // Converts a JavaScript style object to a CSS string
    function getStyleString(styleObject) {
        return Object.entries(styleObject)
            .map(([prop, value]) => {
            // Convert camelCase property names to kebab-case
            const cssProp = prop.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
            return `${cssProp}:${value}`;
        })
            .join(';');
    }

    // ----------------------
    // Main function that performs the core blocking logic.
    // It integrates the user custom code and processes tweet responses.
    async function main(signal) {
        // Inject user custom code if saved, wrapping it into a function
        const userCode = GM_getValue('userCondition', '');
        if (userCode) {
            const scriptContent = `window.userConditionFunction = ({ profile, tweet, followingUsers }) => {
                try {
                    ${userCode}
                } catch(e) {
                    console.error('Custom Condition Error:', e);
                    return false;
                }
            };`;

            const script = GM_addElement(document.head, 'script', {
                type: 'text/javascript',
                textContent: scriptContent
            });
            // Remove the temporary script element after injecting the function
            script.remove();
        }

        // ----------------------
        // Configuration settings and helper functions for API endpoints and parameters
        const config = {
            features: {
                rweb_video_screen_enabled: false,
                payments_enabled: false,
                profile_label_improvements_pcf_label_in_post_enabled: true,
                rweb_tipjar_consumption_enabled: true,
                verified_phone_label_enabled: false,
                creator_subscriptions_tweet_preview_api_enabled: true,
                responsive_web_graphql_timeline_navigation_enabled: true,
                responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
                premium_content_api_read_enabled: false,
                communities_web_enable_tweet_community_results_fetch: true,
                c9s_tweet_anatomy_moderator_badge_enabled: true,
                responsive_web_grok_analyze_button_fetch_trends_enabled: false,
                responsive_web_grok_analyze_post_followups_enabled: true,
                responsive_web_jetfuel_frame: false,
                responsive_web_grok_share_attachment_enabled: true,
                articles_preview_enabled: true,
                responsive_web_edit_tweet_api_enabled: true,
                graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
                view_counts_everywhere_api_enabled: true,
                longform_notetweets_consumption_enabled: true,
                responsive_web_twitter_article_tweet_consumption_enabled: true,
                tweet_awards_web_tipping_enabled: false,
                responsive_web_grok_show_grok_translated_post: false,
                responsive_web_grok_analysis_button_from_backend: false,
                creator_subscriptions_quote_tweet_preview_enabled: false,
                freedom_of_speech_not_reach_fetch_enabled: true,
                standardized_nudges_misinfo: true,
                tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
                longform_notetweets_rich_text_read_enabled: true,
                longform_notetweets_inline_media_enabled: true,
                responsive_web_grok_image_annotation_enabled: true,
                responsive_web_enhance_cards_enabled: false,
            },
            fieldToggles: {
                withArticleRichContentState: true,
                withArticlePlainText: false,
                withGrokAnalyze: false,
                withDisallowedReplyControls: false,
            },
            apiEndpoints: {
                tweetDetail: "https://x.com/i/api/graphql/c9RRUtQyVCoDVtyu4CXG0g/TweetDetail",
                following: "https://x.com/i/api/graphql/0HRVUaBSRLwHSp3nc4HdYg/Following",
                blockUser: "https://x.com/i/api/1.1/blocks/create.json",
            }
        };

        // ----------------------
        // Helper function: Extracts the tweet ID from the current URL
        function getTweetId() {
            return window.location.href.split('/').pop();
        }

        // ----------------------
        // Helper function: Retrieves the auth token from session storage
        function getAuthToken() {
            const sessionData = sessionStorage.getItem('bis_data');
            return sessionData ? JSON.parse(sessionData).config.twitterConfig.LOAD_USER_DATA.AUTH_BEARER : null;
        }

        // ----------------------
        // Helper function: Retrieves the CSRF token from cookies
        function getCsrfToken() {
            const token = document.cookie.split('; ').find(row => row.startsWith('ct0'));
            return token ? token.split('=')[1] : null;
        }

        // ----------------------
        // Creates request headers required for the API calls
        async function createRequestHeaders(httpMethod, urlPathname) {
        const xTID = await generateTID();
            return {
                authorization: authToken,
                'x-csrf-token': csrfToken,
                'x-client-transaction-id': xTID,
            };
        }

        // ----------------------
        // Generic function to perform API requests with support for aborting via signal
        async function apiRequest(url, method = 'GET', body = null) {
            const options = {
                headers: await createRequestHeaders(method, new URL(url).pathname),
                method,
                credentials: 'include',
                signal // Add abort signal to the request
            };
            if (body) {
                options.body = body;
                options.headers["Content-Type"] = "application/x-www-form-urlencoded";
            }

            try {
                const response = await fetch(url, options);
                if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
                return await response.json();
            } catch (error) {
                if (error.name === 'AbortError') throw error;
                console.error(`Error in API request to ${url}:`, error);
                return null;
            }
        }

        // ----------------------
        // Fetches tweet responses (replies, threads) using the Twitter API endpoint
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
                ...(cursor !== null ? { cursor } : {}),
            };

            const url = `${config.apiEndpoints.tweetDetail}?variables=${encodeURIComponent(JSON.stringify(variables))}&features=${encodeURIComponent(JSON.stringify(config.features))}&fieldToggles=${encodeURIComponent(JSON.stringify(config.fieldToggles))}`;

            return apiRequest(url);
        }

        // ----------------------
        // Fetches the list of users that a given user is following
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

        // ----------------------
        // Extracts screen names and block status from the following users data
        function extractFollowingScreenNames(data) {
            return data?.data?.user?.result?.timeline?.timeline?.instructions
                .flatMap(instr => instr.entries || [])
                .filter(entry => entry.content.entryType === "TimelineTimelineItem"
                        && entry.content.itemContent.user_results.result
                        && entry.content.itemContent.user_results.result.__typename !== "UserUnavailable")
                .map(entry => ({
                screenName: entry.content.itemContent.user_results.result.core?.screen_name,
                isBlocked: entry.content.itemContent.user_results.result.relationship_perspectives.blocking ?? false,
            })) || [];
        }

        // ----------------------
        // Sends a request to block a user using the Twitter API endpoint
        async function blockUser(userId) {
            await apiRequest(config.apiEndpoints.blockUser, 'POST', `user_id=${userId}`);
        }

        // ----------------------
        // Processes tweet responses by iterating through tweet threads and applying the block condition
        // Returns the number of users blocked during the process
        async function processTweetResponses(signal) {
            let cursorQueue = [];
            const processedUserIds = new Set();
            let blockedCount = 0;

            do {
                const data = await fetchTweetResponses(cursorQueue.shift());
                if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
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
            } while (cursorQueue.length > 0 && !signal.aborted);

            if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
            return blockedCount;
        }

        // ----------------------
        // Extracts individual item contents from a timeline entry.
        // Handles both single tweet items and modules containing multiple items.
        function extractItemContents(entry) {
            if (entry.content.entryType === "TimelineTimelineItem")
                return [entry.content.itemContent];
            if (entry.content.entryType === "TimelineTimelineModule")
                return entry.content.items.map(item => item.item.itemContent);
            return [];
        }

        // ----------------------
        // Checks if the given item content represents a tweet entry (not a tombstone or special tweet)
        function isTweetEntry(itemContent) {
            return itemContent.itemType === "TimelineTweet"
            && itemContent.tweet_results.result.__typename !== "TweetWithVisibilityResults"
            && itemContent.tweet_results.result.__typename !== "TweetTombstone";
        }

        // ----------------------
        // Checks if the given item content is a cursor entry (used for pagination)
        function isCursorEntry(itemContent) {
            return itemContent.itemType === "TimelineTimelineCursor";
        }

        // ----------------------
        // Logs information about the blocked user to the console for debugging purposes
        function logBlockedUser(profile, tweet) {
            console.log([
                `Blocked user ${profile.name} (@${profile.screen_name})`,
                `Link: https://x.com/${profile.screen_name}/status/${tweet.id_str}`,
                `Tweet: ${tweet.full_text}`
            ].join('\n'));
        }

        // Retrieve key parameters for API calls
        const tweetId = getTweetId();
        const authToken = getAuthToken();
        const csrfToken = getCsrfToken();

        // Execute the processing of tweet responses and return the count of blocked users
        return await processTweetResponses(signal);
    }

    // ----------------------
    // Initializes and adds the activation button to the page,
    // sets up its event listeners, and adds the settings button.
    function addActivationButton() {
        if (document.getElementById('blocker-activator')) return;

        btn = GM_addElement(document.body, 'button', {
            id: 'blocker-activator',
            style: getStyleString(buttonStyles.mainButton.base)
        });

        updateButtonState();

        btn.addEventListener('click', async () => {
            if (btn.disabled || !isTweetPage()) return;

            if (isProcessing) {
                cancelProcessing();
                return;
            }

            if (errorState) {
                errorState = false;
                updateButtonState();
            }

            isProcessing = true;
            isCompleted = false;
            isCancelling = false;
            abortController = new AbortController();
            updateButtonState();

            try {
                const blockedCount = await main(abortController.signal);
                totalBlocked += blockedCount;
                isCompleted = true;
                updateButtonState();

                setTimeout(() => {
                    isCompleted = false;
                    updateButtonState();
                }, 6000);
            } catch (error) {
                if (error.name === 'AbortError') {
                    console.log('Processing cancelled');
                } else {
                    console.error('Error:', error);
                    errorState = true;
                    updateButtonState();
                }
            } finally {
                isProcessing = false;
                abortController = null;
                updateButtonState();
            }
        });

        addSettingsButton();
        handleUrlChange();
    }

    // ----------------------
    // Initializes the script once the page has fully loaded,
    // and sets up a MutationObserver to monitor DOM changes for adding the activation button.
    if (document.readyState === 'complete') {
        addActivationButton();
    } else {
        window.addEventListener('load', addActivationButton);
    }

    const observer = new MutationObserver((mutations) => {
        if (!document.getElementById('blocker-activator')) {
            addActivationButton();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
