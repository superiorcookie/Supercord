import definePlugin from "@utils/types";

export default definePlugin({
    name: "NoAnimations",
    description: "Forces Discord to disable all animations and transitions (makes everything instant).",
    tags: ["UI", "Accessibility"],
    authors: [],
    
    start() {
        const style = document.createElement("style");
        style.id = "no-animations-style";
        style.textContent = `
            * {
                /* Set durations to 1ms instead of 0 or none to ensure transitionend events still fire */
                animation-duration: 0.001s !important;
                transition-duration: 0.001s !important;
                animation-delay: 0s !important;
                transition-delay: 0s !important;
            }
        `;
        document.head.appendChild(style);
    },
    
    stop() {
        const style = document.getElementById("no-animations-style");
        if (style) style.remove();
    }
});
