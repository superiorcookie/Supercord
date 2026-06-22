/*
 * Spam Plugin - core spamming logic with rate limit handling
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { sendMessage } from "@utils/discord";
import { CloudUploadPlatform } from "@vencord/discord-types/enums";
import { ChannelStore, CloudUploader, Constants, RestAPI, SelectedChannelStore, SnowflakeUtils, Toasts } from "@webpack/common";

// Discord's hard limit for a single message send burst we want to respect.
const MAX_MESSAGES = 100;

let spamming = false;
let cancelRequested = false;

export function isSpamming() {
    return spamming;
}

export function stopSpamming() {
    if (spamming) cancelRequested = true;
}

function sleep(ms: number) {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
}

function toast(message: string, type: number) {
    Toasts.show({
        message,
        id: Toasts.genId(),
        type,
    });
}

interface UploadedAttachment {
    id: string;
    filename: string;
    uploaded_filename: string;
}

/**
 * Upload a single file to the given channel and return the attachment metadata.
 * Each message send consumes the uploaded file, so this must be called once per message.
 */
function uploadAttachment(channelId: string, file: File): Promise<UploadedAttachment | null> {
    return new Promise(resolve => {
        try {
            const upload = new CloudUploader({ file, platform: CloudUploadPlatform.WEB }, channelId);
            upload.on("complete", () => resolve({ id: "0", filename: upload.filename, uploaded_filename: upload.uploadedFilename }));
            upload.on("error", () => resolve(null));
            upload.upload();
        } catch (err) {
            console.error("[SpamPlugin] Upload failed:", err);
            resolve(null);
        }
    });
}

/**
 * Send a single message, optionally with an attachment.
 * Throws on failure so the caller can handle rate limits.
 */
async function sendOne(channelId: string, content: string, file?: File | null) {
    if (!file) {
        return sendMessage(channelId, { content });
    }

    const attachment = await uploadAttachment(channelId, file);
    if (!attachment) {
        throw new Error("attachment upload failed");
    }

    return RestAPI.post({
        url: Constants.Endpoints.MESSAGES(channelId),
        body: {
            content,
            nonce: SnowflakeUtils.fromTimestamp(Date.now()),
            channel_id: channelId,
            sticker_ids: [],
            type: 0,
            attachments: [attachment],
        },
    });
}

export interface SpamOptions {
    content: string;
    count: number;
    delayMs: number;
    file?: File | null;
    onProgress?: (sent: number, total: number) => void;
    onDone?: (sent: number, failed: number) => void;
}

/**
 * Spam messages into the currently selected channel (group, DM or guild text channel).
 * Handles 429 rate limits by waiting for the retry_after period and resuming.
 * Optionally attaches a file to every message.
 */
export async function startSpamming(opts: SpamOptions) {
    if (spamming) {
        toast("Already spamming. Stop the current run first.", Toasts.Type.FAILURE);
        return;
    }

    const channelId = SelectedChannelStore.getChannelId();
    if (!channelId) {
        toast("No channel selected.", Toasts.Type.FAILURE);
        return;
    }

    const channel = ChannelStore.getChannel(channelId);
    if (!channel) {
        toast("Could not resolve the current channel.", Toasts.Type.FAILURE);
        return;
    }

    const file = opts.file ?? null;
    // An attachment-only message is allowed to have empty content.
    const content = opts.content || (file ? "" : "h");
    const count = Math.min(Math.max(1, Math.floor(opts.count)), MAX_MESSAGES);
    // Never go below a small floor to avoid hammering the API and getting banned.
    // Uploads are slower, so give attachment sends a little more breathing room.
    const minDelay = file ? 400 : 150;
    const delayMs = Math.max(minDelay, Math.floor(opts.delayMs));

    spamming = true;
    cancelRequested = false;

    let sent = 0;
    let failed = 0;

    try {
        for (let i = 0; i < count; i++) {
            if (cancelRequested) break;

            try {
                await sendOne(channelId, content, file);
                sent++;
                opts.onProgress?.(sent, count);
            } catch (err: any) {
                // Handle Discord rate limits (HTTP 429)
                const status = err?.status ?? err?.body?.code;
                const retryAfter = err?.body?.retry_after ?? err?.retry_after;

                if (status === 429 && typeof retryAfter === "number") {
                    const waitMs = Math.ceil(retryAfter * 1000) + 250;
                    toast(`Rate limited. Waiting ${(waitMs / 1000).toFixed(1)}s...`, Toasts.Type.MESSAGE);
                    await sleep(waitMs);
                    // Retry this same index
                    i--;
                    continue;
                }

                failed++;
                console.error("[SpamPlugin] Failed to send message:", err);

                // Stop on hard failures like missing permissions / blocked
                if (status === 403 || status === 401) {
                    toast("Missing permission to send messages here. Stopping.", Toasts.Type.FAILURE);
                    break;
                }
            }

            if (i < count - 1 && !cancelRequested) {
                await sleep(delayMs);
            }
        }
    } finally {
        spamming = false;
        cancelRequested = false;
        opts.onDone?.(sent, failed);

        if (sent > 0) {
            toast(`Done. Sent ${sent}${failed ? `, ${failed} failed` : ""}.`, Toasts.Type.SUCCESS);
        } else {
            toast("No messages were sent.", Toasts.Type.FAILURE);
        }
    }
}

export { MAX_MESSAGES };
