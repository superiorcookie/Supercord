/*
 * Set01Everything — a Vencord plugin
 * Turns every avatar, server icon, banner, emoji and sticker in Discord into the
 * Fortnite "Set_01_OA" (Geoff Keighley) outfit, and rewrites names + profile bios
 * to "Set_01_OA". Purely for fun.
 *
 * The effect is OFF by default. A toggle button (using the Set_01_OA icon) is
 * added to the channel header toolbar, right next to the inbox button. Click it
 * to flip everything on/off live — no reload needed. Everything is reversible.
 *
 * ── INSTALL (requires a from-source Vencord/Equicord dev install) ────────────
 *  1. Have Vencord cloned and set up (https://docs.vencord.dev/installing/custom-plugins/).
 *  2. Copy this folder (Set01Everything) into:  <Vencord>/src/userplugins/
 *  3. From the Vencord folder run:  pnpm build  &&  pnpm inject
 *  4. Restart Discord, then enable "Set01Everything" in Settings → Plugins.
 *  (This canNOT be loaded as a standalone file the way a .theme.css can.)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { findByProps } from "@webpack";

const GEOFF_IMAGE =
    "https://static.wikia.nocookie.net/fortnite/images/6/6d/Geoff_Keighley_-_Outfit_-_Fortnite.png/revision/latest?cb=20240520202727";
const SET_NAME = "Set_01_OA";          // internal cosmetic id / default text
const BUTTON_ID = "set01-toggle";

const settings = definePluginSettings({
    imageUrl: {
        type: OptionType.STRING,
        description: "Image URL that everything visual gets replaced with (also used as the toggle icon).",
        default: GEOFF_IMAGE,
    },
    displayName: {
        type: OptionType.STRING,
        description: "Name to rename everyone to.",
        default: SET_NAME,
    },
    bioText: {
        type: OptionType.STRING,
        description: "Text to overwrite every profile bio / About Me with.",
        default: SET_NAME,
    },
    replaceAvatars: { type: OptionType.BOOLEAN, description: "Replace all user & group-DM avatars.", default: true },
    replaceServerIcons: { type: OptionType.BOOLEAN, description: "Replace all server / channel / app icons.", default: true },
    replaceBanners: { type: OptionType.BOOLEAN, description: "Replace all user & server banners.", default: true },
    replaceEmojis: { type: OptionType.BOOLEAN, description: "Replace all custom emojis & reactions.", default: true },
    replaceStickers: { type: OptionType.BOOLEAN, description: "Replace all stickers.", default: true },
    replaceNames: { type: OptionType.BOOLEAN, description: "Rename everyone (usernames, nicknames, display names).", default: true },
    replaceBios: { type: OptionType.BOOLEAN, description: "Overwrite every profile bio / About Me.", default: true },
    replaceAllText: { type: OptionType.BOOLEAN, description: "NUCLEAR: replace EVERY piece of visible text in the app (messages, buttons, labels...). Skips text boxes so you can still type.", default: true },
    cssFallback: { type: OptionType.BOOLEAN, description: "Inject CSS so background-image avatars, role icons & reactions also get replaced.", default: true },
    infectEmbeds: { type: OptionType.BOOLEAN, description: "Infect embeds, attachments, link previews, GIFs and ALL other images.", default: true },
    infectSvgs: { type: OptionType.BOOLEAN, description: "Infect SVG icons & SVG <image> elements (avatar masks, button icons).", default: true },

    // ── CHAOS ────────────────────────────────────────────────────────────────
    jumpscares: { type: OptionType.BOOLEAN, description: "CHAOS: random full-screen Set_01_OA jumpscares.", default: true },
    jumpscareSound: { type: OptionType.STRING, description: "Optional sound URL to play on jumpscare (leave blank for silent).", default: "" },
    jumpscareMinSec: { type: OptionType.NUMBER, description: "Minimum seconds between jumpscares.", default: 20 },
    jumpscareMaxSec: { type: OptionType.NUMBER, description: "Maximum seconds between jumpscares.", default: 70 },
    floatingImages: { type: OptionType.BOOLEAN, description: "CHAOS: a constant rain of floating Set_01_OA images.", default: true },
    screenShake: { type: OptionType.BOOLEAN, description: "CHAOS: random screen-shake bursts.", default: true },
    spinningImages: { type: OptionType.BOOLEAN, description: "CHAOS: make every replaced image wobble/spin.", default: true },
});

// ── Runtime state ────────────────────────────────────────────────────────────
let active = false;                       // master switch — OFF by default
const restorers: Array<() => void> = [];  // undo callbacks for every applied patch

// Discord internal modules.
let IconUtils: Record<string, any> | undefined;
let EmojiUtils: Record<string, any> | undefined;
let StickerUtils: Record<string, any> | undefined;
let NameUtils: Record<string, any> | undefined;
let ProfileStore: Record<string, any> | undefined;

const AVATAR_FNS = ["getUserAvatarURL", "getGroupDMAvatarURL"];
const ICON_FNS = ["getGuildIconURL", "getChannelIconURL", "getApplicationIconURL"];
const BANNER_FNS = ["getGuildBannerURL", "getUserBannerURL"];

const url = () => settings.store.imageUrl || GEOFF_IMAGE;
const name = () => settings.store.displayName || SET_NAME;
const bio = () => settings.store.bioText || SET_NAME;

function safeFind(...props: string[]): Record<string, any> | undefined {
    try { return findByProps(...props); } catch { return undefined; }
}

function patchToImage(obj: Record<string, any> | undefined, fn: string) {
    if (!obj || typeof obj[fn] !== "function") return;
    const original = obj[fn];
    obj[fn] = () => url();
    restorers.push(() => (obj[fn] = original));
}

// ── CSS fallback ───────────────────────────────────────────────────────────--
let styleEl: HTMLStyleElement | undefined;
function injectCss() {
    const u = url();
    styleEl = document.createElement("style");
    styleEl.id = "set01-everything-css";
    styleEl.textContent = `
img[class*="emoji"], [class*="emojiContainer"] img, [class*="reaction"] img, [class*="emojiItem"] img {
    content: url("${u}") !important; object-fit: contain !important;
}
img[class*="sticker"], [class*="sticker"] img, [class*="stickerInspectBody"] img, [class*="stickerNode"] img {
    content: url("${u}") !important; object-fit: contain !important;
}
[class*="roleIcon"] img, img[class*="roleIcon"] { content: url("${u}") !important; }

/* Avatars — instant swap via content (covers the <img> inside the SVG mask) */
img[class*="avatar"],
img[src*="/avatars/"],
img[src*="/users/"][src*="/avatars/"],
foreignObject img[class*="avatar"] {
    content: url("${u}") !important; object-fit: cover !important; object-position: center top !important;
}

/* Server / channel / app icons */
img[src*="/icons/"],
img[src*="/app-icons/"],
[class*="guildIcon"] img,
[class*="circleIconButton"] img {
    content: url("${u}") !important; object-fit: cover !important;
}

/* Banners */
img[class*="banner"], [class*="banner"] img, img[src*="/banners/"] {
    content: url("${u}") !important; object-fit: cover !important;
}

[class*="avatarStack"] [style*="background-image"],
[class*="roleIcon"][style*="background-image"],
[class*="banner"][style*="background-image"],
[class*="bannerImage"][style*="background-image"] {
    background-image: url("${u}") !important; background-size: cover !important; background-position: center !important;
}
${settings.store.infectEmbeds ? `
/* Embeds, attachments, link previews, GIFs, media — and ANY other <img> */
[class*="embed"] img, [class*="imageContent"] img, [class*="originalLink"] img,
[class*="lazyImg"], img[class*="lazyImg"], [class*="attachment"] img,
img[src*="media.discordapp.net"], img[src*="cdn.discordapp.com/attachments"],
video[poster], img {
    content: url("${u}") !important; object-fit: contain !important;
}
/* GIFs/clips render as <video> — mask them with the image */
[class*="imageWrapper"] video, [class*="embedVideo"] video, video[class*="embedMedia"] {
    visibility: hidden !important;
}
[class*="imageWrapper"]:has(video), [class*="embedVideo"]:has(video) {
    background: url("${u}") center / contain no-repeat !important;
}` : ""}
${settings.store.infectSvgs ? `
/* Inline SVG icons → hide their guts and show Set_01_OA behind them */
svg:not([data-set01-keep]) > * { opacity: 0 !important; }
svg:not([data-set01-keep]) {
    background: url("${u}") center / contain no-repeat !important;
    border-radius: 4px;
}` : ""}
`;
    document.head.appendChild(styleEl);
    restorers.push(() => { styleEl?.remove(); styleEl = undefined; });
}

// ── SVG <image> href infector (avatar masks, etc. — CSS can't set href) ───────
const imageHrefOriginals = new Map<Element, { href: string | null; xlink: string | null }>();
let svgImageObserver: MutationObserver | undefined;
const XLINK = "http://www.w3.org/1999/xlink";

function infectImageEl(el: Element) {
    const u = url();
    if (el.getAttribute("href") === u) return; // already done — avoids loops
    if (!imageHrefOriginals.has(el)) {
        imageHrefOriginals.set(el, {
            href: el.getAttribute("href"),
            xlink: el.getAttributeNS(XLINK, "href"),
        });
    }
    el.setAttribute("href", u);
    try { el.setAttributeNS(XLINK, "xlink:href", u); } catch { /* not all support it */ }
}

function infectImageEls(root: ParentNode) {
    root.querySelectorAll?.("image").forEach(infectImageEl);
}

function startImageElementInfector() {
    infectImageEls(document.body);

    const queue: Node[] = [];
    let scheduled = false;
    svgImageObserver = new MutationObserver(muts => {
        for (const m of muts) {
            if (m.type === "attributes") queue.push(m.target);
            else m.addedNodes.forEach(n => queue.push(n));
        }
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            for (const node of queue.splice(0)) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                const el = node as Element;
                if (el.tagName.toLowerCase() === "image") infectImageEl(el);
                else infectImageEls(el);
            }
        });
    });
    svgImageObserver.observe(document.body, {
        childList: true, subtree: true, attributes: true, attributeFilter: ["href", "xlink:href"],
    });

    restorers.push(() => {
        svgImageObserver?.disconnect();
        svgImageObserver = undefined;
        imageHrefOriginals.forEach((orig, el) => {
            try {
                if (orig.href === null) el.removeAttribute("href");
                else el.setAttribute("href", orig.href);
                if (orig.xlink === null) el.removeAttributeNS(XLINK, "href");
                else el.setAttributeNS(XLINK, "xlink:href", orig.xlink);
            } catch { /* element gone */ }
        });
        imageHrefOriginals.clear();
    });
}

function patchNames() {
    if (!NameUtils || typeof NameUtils.getName !== "function") return;
    const orig = NameUtils.getName;
    NameUtils.getName = (...a: any[]) => {
        const r = orig.apply(NameUtils, a);
        return typeof r === "string" && r.length ? name() : r;
    };
    restorers.push(() => (NameUtils!.getName = orig));

    if (typeof NameUtils.getNickname === "function") {
        const origNick = NameUtils.getNickname;
        NameUtils.getNickname = (...a: any[]) => {
            const r = origNick.apply(NameUtils, a);
            return typeof r === "string" && r.length ? name() : r;
        };
        restorers.push(() => (NameUtils!.getNickname = origNick));
    }
}

function patchBios() {
    if (!ProfileStore || typeof ProfileStore.getUserProfile !== "function") return;
    const orig = ProfileStore.getUserProfile;
    ProfileStore.getUserProfile = (...a: any[]) => {
        const p = orig.apply(ProfileStore, a);
        return p && typeof p === "object" ? { ...p, bio: bio(), pronouns: name() } : p;
    };
    restorers.push(() => (ProfileStore!.getUserProfile = orig));
}

// ── Nuclear: replace EVERY visible text node ──────────────────────────────────
const textOriginals = new Map<Text, string>();
let textObserver: MutationObserver | undefined;

function shouldSkipText(node: Text): boolean {
    const data = node.data;
    if (!data || !data.trim()) return true;          // whitespace only
    if (data === name()) return true;                 // already replaced
    let el: HTMLElement | null = node.parentElement;
    while (el) {
        const tag = el.tagName;
        // Don't touch editable areas (so typing still works), code, or our button.
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || tag === "INPUT") return true;
        if (el.isContentEditable) return true;
        if (el.id === BUTTON_ID) return true;
        el = el.parentElement;
    }
    return false;
}

function replaceTextNode(node: Text) {
    if (shouldSkipText(node)) return;
    if (!textOriginals.has(node)) textOriginals.set(node, node.data);
    node.data = name();
}

function replaceTextUnder(root: Node) {
    if (root.nodeType === Node.TEXT_NODE) { replaceTextNode(root as Text); return; }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const found: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) found.push(n as Text);
    found.forEach(replaceTextNode);
}

function startTextReplacer() {
    replaceTextUnder(document.body);

    const queue: Node[] = [];
    let scheduled = false;
    textObserver = new MutationObserver(muts => {
        for (const m of muts) {
            if (m.type === "characterData") queue.push(m.target);
            else m.addedNodes.forEach(node => queue.push(node));
        }
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            const batch = queue.splice(0);
            for (const node of batch) replaceTextUnder(node);
        });
    });
    textObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

    restorers.push(() => {
        textObserver?.disconnect();
        textObserver = undefined;
        textOriginals.forEach((orig, node) => {
            try { if (node.isConnected) node.data = orig; } catch { /* gone */ }
        });
        textOriginals.clear();
    });
}

// ── CHAOS engine: jumpscares, floaters, shakes, wobble ────────────────────────
const timers: number[] = [];
const intervals: number[] = [];
let crazyStyleEl: HTMLStyleElement | undefined;

function injectCrazyCss() {
    if (crazyStyleEl) return;
    crazyStyleEl = document.createElement("style");
    crazyStyleEl.id = "set01-crazy-css";
    crazyStyleEl.textContent = `
@keyframes set01-js {
    0%   { opacity: 0; transform: scale(2.4) rotate(0deg); }
    8%   { opacity: 1; transform: scale(1) rotate(0deg); }
    20%  { transform: scale(1.04) translate(-10px, 6px) rotate(-2deg); }
    35%  { transform: scale(1) translate(10px, -6px) rotate(2deg); }
    50%  { transform: scale(1.06) translate(-8px, -6px) rotate(-1deg); }
    70%  { transform: scale(1) translate(6px, 8px) rotate(1deg); }
    100% { opacity: 0; transform: scale(1.3); }
}
@keyframes set01-float {
    from { transform: translateY(0) rotate(0deg); opacity: .9; }
    to   { transform: translateY(-130vh) rotate(540deg); opacity: 0; }
}
@keyframes set01-shake {
    0%,100% { transform: translate(0,0) rotate(0); }
    20% { transform: translate(-10px, 8px) rotate(-1.5deg); }
    40% { transform: translate(10px, -8px) rotate(1.5deg); }
    60% { transform: translate(-8px, -10px) rotate(-1deg); }
    80% { transform: translate(8px, 10px) rotate(1deg); }
}
@keyframes set01-wobble {
    0%,100% { transform: rotate(-8deg) scale(1); }
    50% { transform: rotate(8deg) scale(1.08); }
}
.set01-jumpscare {
    position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;
    background: #000 center / contain no-repeat; animation: set01-js 1.1s ease-in-out forwards;
}
.set01-floater {
    position: fixed; z-index: 2147483646; pointer-events: none; will-change: transform;
}
.set01-shaking { animation: set01-shake .65s cubic-bezier(.36,.07,.19,.97) both !important; }
${settings.store.spinningImages ? `
img[class*="avatar"], img[class*="emoji"], img[class*="sticker"], [class*="roleIcon"] img {
    animation: set01-wobble 2.4s ease-in-out infinite !important;
}` : ""}
`;
    document.head.appendChild(crazyStyleEl);
}

function jumpscare() {
    const overlay = document.createElement("div");
    overlay.className = "set01-jumpscare";
    overlay.style.backgroundImage = `url("${url()}")`;
    document.body.appendChild(overlay);

    const snd = settings.store.jumpscareSound;
    if (snd) {
        try {
            const audio = new Audio(snd);
            audio.volume = 1;
            audio.play().catch(() => { /* autoplay blocked */ });
        } catch { /* bad url */ }
    }
    const t = window.setTimeout(() => overlay.remove(), 1200);
    timers.push(t);
}

function scheduleJumpscare() {
    const min = Math.max(2, settings.store.jumpscareMinSec) * 1000;
    const max = Math.max(min + 1000, settings.store.jumpscareMaxSec * 1000);
    const delay = min + Math.random() * (max - min);
    const t = window.setTimeout(() => {
        if (!active) return;
        jumpscare();
        scheduleJumpscare();
    }, delay);
    timers.push(t);
}

function spawnFloater() {
    const img = document.createElement("img");
    img.className = "set01-floater";
    img.src = url();
    const size = 50 + Math.random() * 90;
    img.style.width = `${size}px`;
    img.style.left = `${Math.random() * 100}vw`;
    img.style.top = "110vh";
    img.style.animation = `set01-float ${6 + Math.random() * 7}s linear forwards`;
    document.body.appendChild(img);
    const t = window.setTimeout(() => img.remove(), 14000);
    timers.push(t);
}

function doShake() {
    const app = document.getElementById("app-mount") || document.body;
    app.classList.add("set01-shaking");
    const t = window.setTimeout(() => app.classList.remove("set01-shaking"), 700);
    timers.push(t);
}

function startChaos() {
    injectCrazyCss();
    if (settings.store.jumpscares) scheduleJumpscare();
    if (settings.store.floatingImages) intervals.push(window.setInterval(() => active && spawnFloater(), 1400));
    if (settings.store.screenShake) intervals.push(window.setInterval(() => active && doShake(), 9000));

    restorers.push(() => {
        timers.splice(0).forEach(clearTimeout);
        intervals.splice(0).forEach(clearInterval);
        document.querySelectorAll(".set01-jumpscare, .set01-floater").forEach(el => el.remove());
        document.getElementById("app-mount")?.classList.remove("set01-shaking");
        crazyStyleEl?.remove();
        crazyStyleEl = undefined;
    });
}

// ── Apply / revert the whole effect ───────────────────────────────────────────
function applyEffects() {
    IconUtils = safeFind("getUserAvatarURL", "getGuildIconURL");
    if (IconUtils) {
        if (settings.store.replaceAvatars) AVATAR_FNS.forEach(fn => patchToImage(IconUtils, fn));
        if (settings.store.replaceServerIcons) ICON_FNS.forEach(fn => patchToImage(IconUtils, fn));
        if (settings.store.replaceBanners) BANNER_FNS.forEach(fn => patchToImage(IconUtils, fn));
        if (settings.store.replaceEmojis && typeof IconUtils.getEmojiURL === "function") patchToImage(IconUtils, "getEmojiURL");
    }
    if (settings.store.replaceEmojis) {
        EmojiUtils = safeFind("getEmojiURL");
        if (EmojiUtils && EmojiUtils !== IconUtils) patchToImage(EmojiUtils, "getEmojiURL");
    }
    if (settings.store.replaceStickers) {
        StickerUtils = safeFind("getStickerAssetURL") ?? safeFind("getStickerURL");
        if (StickerUtils) ["getStickerAssetURL", "getStickerURL"].forEach(fn => patchToImage(StickerUtils, fn));
    }
    if (settings.store.replaceNames) {
        NameUtils = safeFind("getName", "getNickname") ?? safeFind("getName");
        patchNames();
    }
    if (settings.store.replaceBios) {
        ProfileStore = safeFind("getUserProfile");
        patchBios();
    }
    if (settings.store.replaceAllText) startTextReplacer();
    if (settings.store.cssFallback) injectCss();
    if (settings.store.infectSvgs) startImageElementInfector();
    startChaos();
}

function revertEffects() {
    while (restorers.length) restorers.pop()!();
    IconUtils = EmojiUtils = StickerUtils = NameUtils = ProfileStore = undefined;
}

function setActive(next: boolean) {
    if (next === active) return;
    active = next;
    if (active) applyEffects();
    else revertEffects();
    updateButtons();
}

// ── Toolbar toggle button (DOM-injected next to the inbox button) ──────────────
let observer: MutationObserver | undefined;

function styleButton(btn: HTMLElement) {
    Object.assign(btn.style, {
        width: "24px",
        height: "24px",
        margin: "0 8px",
        borderRadius: "50%",
        cursor: "pointer",
        backgroundImage: `url("${url()}")`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
        flex: "0 0 auto",
        alignSelf: "center",
        transition: "opacity .15s, box-shadow .15s, filter .15s",
    } as CSSStyleDeclaration);
}

function updateButtons() {
    document.querySelectorAll<HTMLElement>("#" + BUTTON_ID).forEach(btn => {
        btn.style.opacity = active ? "1" : "0.55";
        btn.style.filter = active ? "none" : "grayscale(0.6)";
        btn.style.boxShadow = active ? "0 0 8px 1px #ffd800" : "none";
        btn.title = `Set 01 Everything: ${active ? "ON" : "OFF"}`;
    });
}

function makeButton(): HTMLElement {
    const btn = document.createElement("div");
    btn.id = BUTTON_ID;
    btn.setAttribute("role", "button");
    btn.setAttribute("aria-label", "Toggle Set 01 Everything");
    styleButton(btn);
    btn.addEventListener("click", () => setActive(!active));
    return btn;
}

function ensureButton() {
    // Already present in the live DOM? Nothing to do.
    if (document.getElementById(BUTTON_ID)) return;
    // The channel-header toolbar that holds threads/pins/inbox/help.
    const toolbar =
        document.querySelector('[class*="title_"] [class*="toolbar_"]') ||
        document.querySelector('section[class*="title"] [class*="toolbar"]') ||
        document.querySelector('[class*="toolbar_"]');
    if (!toolbar) return;
    const btn = makeButton();
    toolbar.appendChild(btn); // sits at the end of the icon cluster, by inbox/help
    updateButtons();
}

export default definePlugin({
    name: "Set01Everything",
    description:
        "Adds a header toolbar toggle (next to the inbox button) that turns every avatar, icon, banner, emoji & sticker into Fortnite's Set_01_OA (Geoff Keighley) and renames everyone/their bios to Set_01_OA. Off by default. For fun.",
    authors: [{ name: "Custom", id: 0n }],
    settings,

    start() {
        active = false; // OFF by default on every load
        ensureButton();
        // Re-add the button when Discord re-renders the header / navigates.
        // Debounced with rAF so we never run work on every single mutation.
        let scheduled = false;
        observer = new MutationObserver(() => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                scheduled = false;
                ensureButton();
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    },

    stop() {
        observer?.disconnect();
        observer = undefined;
        document.querySelectorAll("#" + BUTTON_ID).forEach(b => b.remove());
        if (active) revertEffects();
        active = false;
    },
});
