/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import * as DataStore from "@api/DataStore";
import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { updateMessage } from "@api/MessageUpdater";
import { definePluginSettings } from "@api/Settings";
import { BaseText } from "@components/BaseText";
import { DeleteIcon, PencilIcon } from "@components/Icons";
import { SupercordDevs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";
import { Message, RenderModalProps } from "@vencord/discord-types";
import { Button, FluxDispatcher, Menu, Modal, moment, openModal, React, SnowflakeUtils, TextArea, TextInput } from "@webpack/common";

interface LocalAttachment {
    id: string;
    filename: string;
    url: string;
    proxy_url: string;
    content_type?: string;
    size: number;
    width?: number;
    height?: number;
    spoiler?: boolean;
}

interface MessageOverride {
    messageId: string;
    channelId: string;
    content?: string;
    timestampMs?: number;
    attachments?: LocalAttachment[];
    deleted?: boolean;
}

const DATA_KEY = "Supercord_LocalMessageEditor_Overrides";
const cl = classNameFactory("vc-local-message-editor-");

const data = {
    overrides: {} as Record<string, MessageOverride>
};

const settings = definePluginSettings({
    showContextMenuButtons: {
        type: OptionType.BOOLEAN,
        description: "Show the local edit/delete buttons in message right-click menus.",
        default: true
    }
});

function getOverride(messageId?: string | null) {
    return messageId ? data.overrides[messageId] : undefined;
}

function hasEdit(o?: MessageOverride) {
    return Boolean(o && (o.content != null || o.timestampMs != null || o.attachments != null || o.deleted));
}

async function saveData() {
    await DataStore.set(DATA_KEY, data.overrides);
}

const CONTENT_TYPES: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
    mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", flac: "audio/flac",
    pdf: "application/pdf", txt: "text/plain", zip: "application/zip"
};

function filenameFromUrl(url: string) {
    try {
        const path = new URL(url).pathname;
        const name = decodeURIComponent(path.split("/").filter(Boolean).pop() || "");
        return name || "attachment";
    } catch {
        return "attachment";
    }
}

function makeAttachment(url: string): LocalAttachment {
    const filename = filenameFromUrl(url);
    const ext = (filename.split(".").pop() || "").toLowerCase();
    return {
        id: String(SnowflakeUtils.fromTimestamp(Date.now())),
        filename,
        url,
        proxy_url: url,
        content_type: CONTENT_TYPES[ext],
        size: 0
    };
}

// Apply a single override to the message store (if the message is currently loaded).
function applyOverride(o?: MessageOverride) {
    if (!o) return;
    try {
        if (o.deleted) {
            FluxDispatcher.dispatch({ type: "MESSAGE_DELETE", id: o.messageId, channelId: o.channelId, mlDeleted: true });
            return;
        }

        const fields: Partial<Message & Record<string, any>> = {};
        if (o.content != null) fields.content = o.content;
        if (o.timestampMs != null) fields.timestamp = moment(new Date(o.timestampMs));
        if (o.attachments != null) fields.attachments = o.attachments as any;

        if (Object.keys(fields).length) updateMessage(o.channelId, o.messageId, fields);
    } catch (e) {
        console.error("[LocalMessageEditor] Failed to apply override:", e);
    }
}

// Re-apply every override for a given channel (used after messages (re)load).
function applyOverridesForChannel(channelId?: string) {
    if (!channelId) return;
    for (const o of Object.values(data.overrides)) {
        if (o.channelId === channelId) applyOverride(o);
    }
}

function applyAllOverrides() {
    for (const o of Object.values(data.overrides)) applyOverride(o);
}

async function setOverride(o: MessageOverride) {
    if (!hasEdit(o)) {
        delete data.overrides[o.messageId];
    } else {
        data.overrides[o.messageId] = o;
    }
    await saveData();
    applyOverride(o);
}

async function resetOverride(messageId: string, channelId: string) {
    delete data.overrides[messageId];
    await saveData();
    // Re-render from the store's current state (will refresh on next channel reload/fetch).
    try {
        updateMessage(channelId, messageId);
    } catch { /* ignore */ }
}

function localDelete(message: Message) {
    void setOverride({
        ...(getOverride(message.id) ?? { messageId: message.id, channelId: message.channel_id }),
        messageId: message.id,
        channelId: message.channel_id,
        deleted: true
    });
}

function toLocalInput(date: Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function messageTimestampMs(message: Message): number {
    const ts: any = message.timestamp;
    if (ts == null) return Date.now();
    if (typeof ts.toDate === "function") return ts.toDate().getTime();
    const d = new Date(ts);
    return isNaN(d.getTime()) ? Date.now() : d.getTime();
}

function openEditor(message: Message) {
    openModal(modalProps => <LocalMessageEditorModal modalProps={modalProps} message={message} />);
}

export default definePlugin({
    name: "LocalMessageEditor",
    description: "Locally edit a message's content, timestamp and attachments, or delete it - all client-side only, nothing is sent to Discord.",
    tags: ["Chat", "Utility"],
    authors: [SupercordDevs.yash],
    dependencies: ["MessageUpdaterAPI"],
    settings,
    data,
    contextMenus: {
        "message": messageCtxPatch
    },
    async start() {
        data.overrides = await DataStore.get<Record<string, MessageOverride>>(DATA_KEY) ?? {};

        FluxDispatcher.subscribe("LOAD_MESSAGES_SUCCESS", onMessagesLoaded);
        FluxDispatcher.subscribe("CHANNEL_SELECT", onChannelSelect);
        FluxDispatcher.subscribe("MESSAGE_CREATE", onMessageCreate);

        // Apply to whatever is already loaded.
        setTimeout(applyAllOverrides, 500);
    },
    stop() {
        FluxDispatcher.unsubscribe("LOAD_MESSAGES_SUCCESS", onMessagesLoaded);
        FluxDispatcher.unsubscribe("CHANNEL_SELECT", onChannelSelect);
        FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessageCreate);
    }
});

function onMessagesLoaded(e: any) {
    setTimeout(() => applyOverridesForChannel(e?.channelId), 50);
}

function onChannelSelect(e: any) {
    setTimeout(() => applyOverridesForChannel(e?.channelId), 250);
}

function onMessageCreate(e: any) {
    // If a re-sent/edited copy of an overridden message arrives, re-apply.
    if (e?.message?.id && data.overrides[e.message.id]) {
        setTimeout(() => applyOverride(data.overrides[e.message.id]), 50);
    }
}

const messageCtxPatch: NavContextMenuPatchCallback = (children, { message }: { message: Message; }) => {
    if (!message?.id || !settings.store.showContextMenuButtons) return;

    const override = getOverride(message.id);
    const group = findGroupChildrenByChildId("copy-text", children) ?? children;

    const items = (
        <>
            <Menu.MenuItem
                id="vc-local-message-editor-edit"
                label="Edit Message Locally"
                icon={PencilIcon}
                action={() => openEditor(message)}
            />
            <Menu.MenuItem
                id="vc-local-message-editor-delete"
                label="Delete Message Locally"
                color="danger"
                icon={DeleteIcon}
                action={() => localDelete(message)}
            />
            {hasEdit(override) && (
                <Menu.MenuItem
                    id="vc-local-message-editor-reset"
                    label="Reset Local Edits"
                    action={() => resetOverride(message.id, message.channel_id)}
                />
            )}
        </>
    );

    const idx = group.findIndex(c => c?.props?.id === "copy-text");
    if (idx !== -1) group.splice(idx + 1, 0, items);
    else group.push(items);
};

function LocalMessageEditorModal({ modalProps, message }: { modalProps: RenderModalProps; message: Message; }) {
    const existing = getOverride(message.id);

    const [content, setContent] = React.useState(existing?.content ?? message.content ?? "");
    const [when, setWhen] = React.useState(() => toLocalInput(new Date(existing?.timestampMs ?? messageTimestampMs(message))));
    const [attachments, setAttachments] = React.useState<LocalAttachment[]>(
        () => (existing?.attachments ?? (message.attachments as any[] ?? []).map(a => ({
            id: String(a.id ?? SnowflakeUtils.fromTimestamp(Date.now())),
            filename: a.filename ?? filenameFromUrl(a.url ?? ""),
            url: a.url,
            proxy_url: a.proxy_url ?? a.url,
            content_type: a.content_type,
            size: a.size ?? 0,
            width: a.width,
            height: a.height,
            spoiler: a.spoiler
        }))) as LocalAttachment[]
    );
    const [newUrl, setNewUrl] = React.useState("");

    const originalContent = message.content ?? "";
    const originalTimestamp = toLocalInput(new Date(messageTimestampMs(message)));

    function addAttachment() {
        const url = newUrl.trim();
        if (!url) return;
        setAttachments([...attachments, makeAttachment(url)]);
        setNewUrl("");
    }

    function removeAttachment(id: string) {
        setAttachments(attachments.filter(a => a.id !== id));
    }

    async function save() {
        const parsed = new Date(when);
        const timestampMs = isNaN(parsed.getTime()) ? undefined : parsed.getTime();

        const next: MessageOverride = {
            messageId: message.id,
            channelId: message.channel_id,
            content: content !== originalContent ? content : undefined,
            timestampMs: timestampMs != null && when !== originalTimestamp ? timestampMs : undefined,
            attachments: attachmentsChanged(attachments, message) ? attachments : undefined,
            deleted: existing?.deleted
        };

        await setOverride(next);
        modalProps.onClose();
    }

    async function deleteLocally() {
        localDelete(message);
        modalProps.onClose();
    }

    async function resetAll() {
        await resetOverride(message.id, message.channel_id);
        modalProps.onClose();
    }

    const actions: any[] = [
        { text: "Save", variant: "primary", onClick: save },
        { text: "Cancel", variant: "secondary", onClick: modalProps.onClose }
    ];
    if (hasEdit(existing)) {
        actions.unshift({ text: "Reset", variant: "secondary", onClick: resetAll });
    }

    return (
        <Modal {...modalProps} size="md" title="Edit Message Locally" actions={actions}>
            <div className={cl("modal")}>
                <BaseText size="sm" color="text-muted">
                    Changes are client-side only. They are re-applied when the channel reloads and persist until you reset them.
                </BaseText>

                <Field label="Content">
                    <TextArea value={content} onChange={setContent} rows={4} placeholder="Message content" />
                </Field>

                <Field label="Date & time">
                    <input
                        type="datetime-local"
                        step={1}
                        className={cl("datetime")}
                        value={when}
                        onChange={e => setWhen(e.currentTarget.value)}
                    />
                </Field>

                <Field label={`Attachments (${attachments.length})`}>
                    <div className={cl("attachments")}>
                        {attachments.map(a => (
                            <div className={cl("attachment")} key={a.id}>
                                <span className={cl("attachment-name")} title={a.url}>{a.filename}</span>
                                <Button size={Button.Sizes.SMALL} color={Button.Colors.RED} look={Button.Looks.LINK} onClick={() => removeAttachment(a.id)}>
                                    Remove
                                </Button>
                            </div>
                        ))}
                        {!attachments.length && <BaseText size="sm" color="text-muted">No attachments.</BaseText>}
                    </div>
                    <div className={cl("attachment-add")}>
                        <TextInput value={newUrl} onChange={setNewUrl} placeholder="https://example.com/image.png" />
                        <Button size={Button.Sizes.SMALL} color={Button.Colors.PRIMARY} onClick={addAttachment} disabled={!newUrl.trim()}>
                            Add
                        </Button>
                    </div>
                </Field>

                <Button color={Button.Colors.RED} onClick={deleteLocally}>
                    Delete Message Locally
                </Button>
            </div>
        </Modal>
    );
}

function attachmentsChanged(attachments: LocalAttachment[], message: Message) {
    const original = (message.attachments as any[]) ?? [];
    if (attachments.length !== original.length) return true;
    return attachments.some((a, i) => a.url !== original[i]?.url);
}

function Field({ label, children }: { label: string; children: React.ReactNode; }) {
    return (
        <label className={cl("field")}>
            <BaseText size="sm" color="text-muted">{label}</BaseText>
            {children}
        </label>
    );
}
